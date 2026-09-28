/**
 * StreamingRouter — Central content routing controller
 *
 * Decides which resolver to call based on content metadata, then returns a
 * unified StreamResult that the existing player consumes without modification.
 *
 * Routing logic:
 *   1. Anime genres / keywords                → animeService.fetchAnimeStream()
 *   2. Sports / live broadcast explicitly set → liveSportsService (embed URL)
 *   3. Everything else                        → streamingService.fetchStreamingLinks()
 *
 * All resolvers race their embed pool concurrently. The winner becomes the
 * primary URL; all others become fallbacks in `allSources` for the server
 * picker sheet already built in to the player.
 *
 * Usage (replace fetchStreamingLinks call in player.tsx):
 *
 *   import { routeStream } from "@/lib/streamingRouter";
 *
 *   const result = await routeStream({
 *     tmdbId,
 *     type: isTV ? "tv" : "movie",
 *     title: movie?.title,
 *     genres: movie?.genres,          // TMDB genre ids
 *     season: currentSeason,
 *     episode: currentEpisode,
 *   });
 */

import { fetchStreamingLinks, type StreamResult } from "./streamingService";
import { fetchAnimeStream } from "./animeService";
import { getLiveSportEmbeds } from "./liveSportsService";
import { buildEmbedUrls, ALL_SOURCES } from "./sourceCatalog";

// ─── TMDB genre IDs that indicate anime content ───────────────────────────────
// 16 = Animation,  10759 = Action & Adventure (used by many anime),
// 10765 = Sci-Fi & Fantasy.  We use these alongside keyword checking.
const ANIME_GENRE_IDS = new Set([16]);

// Keywords in titles/slugs that strongly imply anime
const ANIME_KEYWORDS_RE =
  /\b(anime|manga|shonen|seinen|shounen|isekai|mecha|kawaii|senpai|samurai|ninja|katana|jujutsu|demon slayer|one piece|naruto|bleach|attack on titan|dragon ball|pokemon|sword art|re:zero|fullmetal|steins|violet evergarden|my hero|chainsaw man|blue lock|tokyo revengers|spy.?x.?family)\b/i;

// ─── Routing parameters ───────────────────────────────────────────────────────
export interface RouteParams {
  tmdbId: number | null;
  type: "movie" | "tv";
  title?: string;
  genres?: number[];        // TMDB genre id array
  keywords?: string[];      // optional extra keyword hints (e.g. "anime", "sports")
  season?: number;
  episode?: number;
  isLiveSports?: boolean;   // explicit override for live sports
  hdhubUrl?: string;
}

type ContentCategory = "anime" | "live-sports" | "movie" | "tv";

function detectCategory(params: RouteParams): ContentCategory {
  // Explicit override wins
  if (params.isLiveSports) return "live-sports";

  const titleHit = params.title && ANIME_KEYWORDS_RE.test(params.title);
  const kwHit =
    params.keywords?.some((k) => ANIME_KEYWORDS_RE.test(k)) ?? false;
  const genreHit =
    params.genres?.some((g) => ANIME_GENRE_IDS.has(g)) ?? false;

  if (titleHit || kwHit || genreHit) return "anime";
  return params.type === "tv" ? "tv" : "movie";
}

// ─── CDN fallback ─────────────────────────────────────────────────────────────
const CDN_FALLBACK_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

function makeCdnResult(): StreamResult {
  return {
    url: CDN_FALLBACK_URL,
    quality: "720p",
    source: "cdn-fallback",
    isEmbed: false,
    subtitles: false,
    fallbacks: [],
  };
}

// ─── Build the full source list from catalog ──────────────────────────────────
/**
 * Returns all 40+ embed sources for a given TMDB ID as a flat list.
 * This is used to populate the "Select Server" sheet in the player.
 */
export function buildFullSourceList(
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
): Array<{ url: string; source: string; isEmbed: true }> {
  // Movies + anime embed sources combined
  return buildEmbedUrls(tmdbId, type, season, episode, "movies").concat(
    buildEmbedUrls(tmdbId, type, season, episode, "anime"),
  );
}

// ─── Main router ──────────────────────────────────────────────────────────────
/**
 * Central routing entry point.
 * Always resolves — never rejects.
 * Returns a StreamResult with:
 *   - .url         → primary source (fastest responder)
 *   - .isEmbed     → true (WebView player)
 *   - .fallbacks   → remaining sources for the server picker
 */
export async function routeStream(params: RouteParams): Promise<StreamResult> {
  const { tmdbId, type, season = 1, episode = 1, title, hdhubUrl } = params;

  if (!tmdbId) return makeCdnResult();

  const category = detectCategory(params);

  try {
    if (category === "live-sports") {
      // Return first available live sports embed
      const sportSources = getLiveSportEmbeds();
      if (sportSources.length === 0) return makeCdnResult();
      const [primary, ...rest] = sportSources;
      return {
        url: primary.url,
        quality: "HD",
        source: primary.name,
        isEmbed: true,
        subtitles: false,
        fallbacks: rest.map((s) => ({
          url: s.url,
          source: s.name,
          isEmbed: true as const,
        })),
      };
    }

    if (category === "anime") {
      // Use dedicated anime resolver first; it races anime embed pool
      const animeResult = await fetchAnimeStream(tmdbId, type, season, episode);
      // Supplement fallbacks with movie sources in case anime embeds are thin
      const movieFallbacks = buildEmbedUrls(tmdbId, type, season, episode, "movies");
      return {
        ...animeResult,
        fallbacks: [
          ...(animeResult.fallbacks ?? []),
          ...movieFallbacks.filter(
            (m) => m.url !== animeResult.url,
          ),
        ],
      };
    }

    // Default: full streaming service (movies + TV)
    const result = await fetchStreamingLinks(tmdbId, type, {
      title,
      season,
      episode,
      hdhubUrl,
    });

    // Supplement fallbacks with catalog sources not already in the list
    const catalogSources = buildEmbedUrls(tmdbId, type, season, episode);
    const existingUrls = new Set([
      result.url,
      ...(result.fallbacks ?? []).map((f) => f.url),
    ]);
    const extraFallbacks = catalogSources.filter(
      (s) => !existingUrls.has(s.url),
    );

    return {
      ...result,
      fallbacks: [...(result.fallbacks ?? []), ...extraFallbacks],
    };
  } catch {
    return makeCdnResult();
  }
}

/**
 * Returns a human-readable category label for display in the player UI.
 */
export function getCategoryLabel(params: RouteParams): string {
  const cat = detectCategory(params);
  if (cat === "anime") return "Anime";
  if (cat === "live-sports") return "Live Sports";
  if (cat === "tv") return "TV Series";
  return "Movie";
}

/**
 * Catalog stats — used in the "About" screen or debug overlays.
 */
export const CATALOG_STATS = {
  totalSources: ALL_SOURCES.length,
  embedSources: ALL_SOURCES.filter((s) => s.type === "embed").length,
  mangaSources: ALL_SOURCES.filter((s) => s.type === "reader").length,
  liveSportsSources: ALL_SOURCES.filter((s) => s.type === "live").length,
  scraperSources: ALL_SOURCES.filter((s) => s.type === "scraper").length,
};
