/**
 * AnimeAPI — Multi-source anime metadata & streaming resolver
 *
 * Sources:
 *   Jikan v4    → https://api.jikan.moe/v4  (free, no key, rate-limit: 3 req/s)
 *   AniList     → https://graphql.anilist.co (free GraphQL, no key needed)
 *   Consumet    → https://consumet-api.app   (free anime streaming proxy)
 *   TMDB        → via existing key for MAL→TMDB ID cross-reference
 *
 * Strategy:
 *   - Metadata: Jikan primary, AniList secondary
 *   - Streaming: existing TMDB-based embed chain (superembed etc.) is
 *     primary; Consumet Gogoanime M3U8 added as background fallback
 *   - All functions always resolve — never throw to caller
 */

import { tmdbGet as _tmdbGet } from "@/lib/tmdb";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANILIST_BASE = "https://graphql.anilist.co";
const CONSUMET_BASE = "https://consumet-api.app";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnimeCard {
  id: string;
  malId: number;
  anilistId?: number;
  title: string;
  poster: { uri: string };
  hero?: { uri: string };
  synopsis: string;
  score: number;
  year: number;
  episodes?: number;
  status: "Airing" | "Completed" | "Upcoming" | "Unknown";
  genres: string[];
  type: "TV" | "Movie" | "OVA" | "Special" | "ONA" | "Music";
  isAnime: true;
  tmdbId?: number;
}

export interface AnimePage {
  cards: AnimeCard[];
  hasNext: boolean;
}

export interface AnimeEpisode {
  number: number;
  title?: string;
  aired?: string;
  score?: number;
  filler?: boolean;
  recap?: boolean;
}

export interface ConsumetStreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function jikanGet<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(`${JIKAN_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jikan ${res.status}: ${endpoint}`);
  return res.json() as T;
}

function mapJikanStatus(raw: string): AnimeCard["status"] {
  if (raw === "Currently Airing") return "Airing";
  if (raw === "Finished Airing") return "Completed";
  if (raw === "Not yet aired") return "Upcoming";
  return "Unknown";
}

function mapJikanType(raw: string): AnimeCard["type"] {
  const allowed = ["TV", "Movie", "OVA", "Special", "ONA", "Music"] as const;
  return (allowed as readonly string[]).includes(raw)
    ? (raw as AnimeCard["type"])
    : "TV";
}

function jikanToCard(item: any): AnimeCard | null {
  if (!item?.mal_id) return null;
  const englishTitle =
    item.titles?.find((t: any) => t.type === "English")?.title ??
    item.title_english ??
    null;
  const poster =
    item.images?.jpg?.large_image_url ??
    item.images?.jpg?.image_url ??
    item.images?.webp?.large_image_url ??
    "";
  const hero =
    item.trailer?.images?.maximum_image_url ??
    item.images?.jpg?.large_image_url ??
    null;
  return {
    id: `mal-${item.mal_id}`,
    malId: item.mal_id,
    title: englishTitle ?? item.title ?? "Unknown",
    poster: { uri: poster },
    hero: hero ? { uri: hero } : undefined,
    synopsis: item.synopsis ?? "",
    score: item.score ?? 0,
    year:
      item.year ??
      parseInt((item.aired?.from ?? item.published?.from ?? "2024").slice(0, 4)) ??
      2024,
    episodes: item.episodes ?? undefined,
    status: mapJikanStatus(item.status ?? ""),
    genres: ((item.genres ?? []) as any[]).map((g) => g.name as string).slice(0, 3),
    type: mapJikanType(item.type ?? "TV"),
    isAnime: true,
  };
}

// ─── Jikan API ────────────────────────────────────────────────────────────────

export const jikan = {
  /** Currently airing / most popular airing anime */
  trending: async (page = 1): Promise<AnimePage> => {
    try {
      const data = await jikanGet<any>("/top/anime", {
        page,
        limit: 20,
        filter: "airing",
      });
      return {
        cards: ((data.data ?? []) as any[])
          .map(jikanToCard)
          .filter(Boolean) as AnimeCard[],
        hasNext: data.pagination?.has_next_page ?? false,
      };
    } catch {
      return { cards: [], hasNext: false };
    }
  },

  /** All-time top anime by score */
  topAll: async (page = 1): Promise<AnimePage> => {
    try {
      const data = await jikanGet<any>("/top/anime", { page, limit: 20 });
      return {
        cards: ((data.data ?? []) as any[])
          .map(jikanToCard)
          .filter(Boolean) as AnimeCard[],
        hasNext: data.pagination?.has_next_page ?? false,
      };
    } catch {
      return { cards: [], hasNext: false };
    }
  },

  /** Top anime movies */
  topMovies: async (page = 1): Promise<AnimePage> => {
    try {
      const data = await jikanGet<any>("/top/anime", {
        page,
        limit: 20,
        type: "movie",
      });
      return {
        cards: ((data.data ?? []) as any[])
          .map(jikanToCard)
          .filter(Boolean) as AnimeCard[],
        hasNext: data.pagination?.has_next_page ?? false,
      };
    } catch {
      return { cards: [], hasNext: false };
    }
  },

  /** Current season's new anime */
  seasonal: async (page = 1): Promise<AnimePage> => {
    try {
      const now = new Date();
      const month = now.getMonth();
      const season =
        month < 3 ? "winter" : month < 6 ? "spring" : month < 9 ? "summer" : "fall";
      const year = now.getFullYear();
      const data = await jikanGet<any>(`/seasons/${year}/${season}`, {
        page,
        limit: 20,
      });
      return {
        cards: ((data.data ?? []) as any[])
          .map(jikanToCard)
          .filter(Boolean) as AnimeCard[],
        hasNext: data.pagination?.has_next_page ?? false,
      };
    } catch {
      return { cards: [], hasNext: false };
    }
  },

  /** Search anime by title */
  search: async (query: string, page = 1): Promise<AnimePage> => {
    try {
      const data = await jikanGet<any>("/anime", {
        page,
        limit: 20,
        q: query,
        sfw: 1,
      });
      return {
        cards: ((data.data ?? []) as any[])
          .map(jikanToCard)
          .filter(Boolean) as AnimeCard[],
        hasNext: data.pagination?.has_next_page ?? false,
      };
    } catch {
      return { cards: [], hasNext: false };
    }
  },

  /** Full details for a single anime */
  detail: async (malId: number): Promise<AnimeCard | null> => {
    try {
      const data = await jikanGet<any>(`/anime/${malId}/full`);
      return jikanToCard(data.data);
    } catch {
      return null;
    }
  },

  /** Episode list for a series */
  episodes: async (
    malId: number,
    page = 1,
  ): Promise<{ episodes: AnimeEpisode[]; hasNext: boolean }> => {
    try {
      const data = await jikanGet<any>(`/anime/${malId}/episodes`, { page });
      const episodes: AnimeEpisode[] = ((data.data ?? []) as any[]).map((ep) => ({
        number: ep.mal_id,
        title: ep.title ?? ep.title_romanji ?? `Episode ${ep.mal_id}`,
        aired: ep.aired,
        score: ep.score,
        filler: ep.filler ?? false,
        recap: ep.recap ?? false,
      }));
      return { episodes, hasNext: data.pagination?.has_next_page ?? false };
    } catch {
      return { episodes: [], hasNext: false };
    }
  },
};

// ─── AniList GraphQL ──────────────────────────────────────────────────────────

const AL_TRENDING_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
        id
        title { romaji english }
        coverImage { extraLarge large }
        bannerImage
        description(asHtml: false)
        averageScore
        seasonYear
        episodes
        status
        genres
        format
      }
    }
  }
`;

const AL_SEASONAL_QUERY = `
  query ($page: Int, $perPage: Int, $season: MediaSeason, $year: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $year, isAdult: false, sort: POPULARITY_DESC) {
        id
        title { romaji english }
        coverImage { extraLarge large }
        bannerImage
        description(asHtml: false)
        averageScore
        seasonYear
        episodes
        status
        genres
        format
      }
    }
  }
`;

function anilistToCard(item: any): AnimeCard | null {
  if (!item?.id) return null;
  return {
    id: `anilist-${item.id}`,
    malId: 0,
    anilistId: item.id,
    title: item.title?.english ?? item.title?.romaji ?? "Unknown",
    poster: {
      uri: item.coverImage?.extraLarge ?? item.coverImage?.large ?? "",
    },
    hero: item.bannerImage ? { uri: item.bannerImage } : undefined,
    synopsis: (item.description ?? "").replace(/<[^>]*>/g, "").slice(0, 400),
    score: Math.round((item.averageScore ?? 0) / 10),
    year: item.seasonYear ?? 2024,
    episodes: item.episodes ?? undefined,
    status: (
      item.status === "RELEASING"
        ? "Airing"
        : item.status === "FINISHED"
          ? "Completed"
          : item.status === "NOT_YET_RELEASED"
            ? "Upcoming"
            : "Unknown"
    ) as AnimeCard["status"],
    genres: ((item.genres ?? []) as string[]).slice(0, 3),
    type: (
      item.format === "MOVIE"
        ? "Movie"
        : item.format === "OVA"
          ? "OVA"
          : item.format === "SPECIAL"
            ? "Special"
            : item.format === "ONA"
              ? "ONA"
              : "TV"
    ) as AnimeCard["type"],
    isAnime: true,
  };
}

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(ANILIST_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export const anilist = {
  /** Globally trending anime right now */
  trending: async (page = 1): Promise<AnimePage> => {
    const data = await anilistQuery<any>(AL_TRENDING_QUERY, {
      page,
      perPage: 20,
    });
    const items: any[] = data?.Page?.media ?? [];
    return {
      cards: items.map(anilistToCard).filter(Boolean) as AnimeCard[],
      hasNext: data?.Page?.pageInfo?.hasNextPage ?? false,
    };
  },

  /** Current season's anime (Spring/Summer/Fall/Winter) */
  seasonal: async (page = 1): Promise<AnimePage> => {
    const now = new Date();
    const month = now.getMonth();
    const seasonMap = ["WINTER", "WINTER", "WINTER", "SPRING", "SPRING", "SPRING", "SUMMER", "SUMMER", "SUMMER", "FALL", "FALL", "FALL"];
    const season = seasonMap[month];
    const year = now.getFullYear();
    const data = await anilistQuery<any>(AL_SEASONAL_QUERY, {
      page,
      perPage: 20,
      season,
      year,
    });
    const items: any[] = data?.Page?.media ?? [];
    return {
      cards: items.map(anilistToCard).filter(Boolean) as AnimeCard[],
      hasNext: data?.Page?.pageInfo?.hasNextPage ?? false,
    };
  },
};

// ─── MAL ID → TMDB ID resolver ────────────────────────────────────────────────

const malToTmdbCache = new Map<number, number | null>();

/**
 * Resolve a MyAnimeList ID to a TMDB TV ID.
 * Uses TMDB's /find endpoint with external_source=myanimelist_id.
 * Returns null if not found — caller should fall back to title search.
 */
export async function malIdToTmdbId(malId: number): Promise<number | null> {
  if (malToTmdbCache.has(malId)) return malToTmdbCache.get(malId)!;
  try {
    const data = await _tmdbGet<{ tv_results?: { id: number }[]; movie_results?: { id: number }[] }>(
      `/find/${malId}`,
      { external_source: "myanimelist_id" },
    );
    const hit = data.tv_results?.[0] ?? data.movie_results?.[0];
    const id: number | null = hit?.id ?? null;
    malToTmdbCache.set(malId, id);
    return id;
  } catch {
    malToTmdbCache.set(malId, null);
    return null;
  }
}

// ─── Consumet API — anime streaming ──────────────────────────────────────────

/**
 * Fetch a streamable M3U8 URL for an anime episode via Consumet (Gogoanime).
 * Returns null if unavailable — caller should fall back to embed sources.
 *
 * NOTE: Consumet is a community-run service. The public instance may be slow
 * or rate-limited. Always use this as a background/fallback source.
 */
export async function fetchConsumetStream(
  title: string,
  episode = 1,
  dubbed = false,
): Promise<ConsumetStreamSource | null> {
  try {
    const query = dubbed ? `${title} (Dub)` : title;
    const searchUrl = `${CONSUMET_BASE}/anime/gogoanime/${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results: any[] = searchData.results ?? [];
    if (results.length === 0) return null;

    const match = results.find((r) =>
      dubbed ? r.id?.includes("-dub") : !r.id?.includes("-dub"),
    ) ?? results[0];
    if (!match?.id) return null;

    const episodeId = `${match.id}-episode-${episode}`;
    const watchUrl = `${CONSUMET_BASE}/anime/gogoanime/watch/${episodeId}`;
    const watchRes = await fetch(watchUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!watchRes.ok) return null;
    const watchData = await watchRes.json();

    const sources: any[] = watchData.sources ?? [];
    const best =
      sources.find((s) => s.quality === "1080p") ??
      sources.find((s) => s.quality === "720p") ??
      sources.find((s) => s.isM3U8) ??
      sources[0];
    if (!best?.url) return null;

    return {
      url: best.url as string,
      quality: best.quality ?? "HD",
      isM3U8: Boolean(best.isM3U8),
    };
  } catch {
    return null;
  }
}

/**
 * Full anime stream resolution:
 * 1. Try to resolve MAL ID → TMDB ID (instant lookup)
 * 2. Try Consumet in background — result enriches fallback list
 * Returns TMDB ID (for use with existing embed chain) + optional Consumet URL.
 */
export async function resolveAnimeStream(
  malId: number,
  title: string,
  episode = 1,
  dubbed = false,
): Promise<{
  tmdbId: number | null;
  consumet: ConsumetStreamSource | null;
}> {
  const [tmdbId, consumet] = await Promise.allSettled([
    malIdToTmdbId(malId),
    fetchConsumetStream(title, episode, dubbed),
  ]);

  return {
    tmdbId: tmdbId.status === "fulfilled" ? tmdbId.value : null,
    consumet: consumet.status === "fulfilled" ? consumet.value : null,
  };
}
