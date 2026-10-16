/**
 * S-MOVIE — Multi-Source Video Engine v1.0
 *
 * Architecture:
 *   T1 (India-priority) ← Proven fast + India-accessible — superembed, embed.su, etc.
 *   T2 (General embed)  ← All embed sources from sourceCatalog (40+ sources)
 *   T3 (Anime-specific) ← hianime, animekai, 9anime, miruro etc.
 *   T4 (Scraper)        ← VegaMovies, FZMovies, RogMovies via server-side /api/scrape
 *
 * Strategy:
 *   1. Return primary URL instantly (T1 #1 source — no wait, 0ms)
 *   2. Race T1 sources concurrently (4s timeout) → fastest confirmed source wins
 *   3. T2 + T3 unprobed sources become ordered fallback pool
 *   4. Background: /api/scrape for download sites (VegaMovies, FZMovies, RogMovies)
 *   5. Player cascades automatically — user NEVER sees loading spinner for source switch
 *
 * Adding a new source: edit sourceCatalog.ts only. This engine picks up all embed
 * sources from the catalog automatically via buildEmbedUrls().
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildEmbedUrls, getEmbedSources, ALL_SOURCES } from "./sourceCatalog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoSource {
  url: string;
  source: string;
  isEmbed: boolean;
  quality: string;
  tier: 1 | 2 | 3 | 4;
  confirmed: boolean;
}

export interface MultiSourceResult {
  primary: VideoSource;
  fallbacks: VideoSource[];
  totalSources: number;
  scrapersActive: boolean;
}

// ─── Tier-1 India-Priority Sources ───────────────────────────────────────────
// These are ordered by current availability. Keep dead domains out of the
// first slot: the player should not spend its initial timeout on a 404 page.
const T1_MOVIE: Array<{ source: string; movie: (id: number) => string; tv: (id: number, s: number, e: number) => string }> = [
  // ★ PRIMARY — confirmed reachable embed endpoint
  { source: "vidsrc.to",          movie: (id) => `https://vidsrc.to/embed/movie/${id}`,                  tv: (id,s,e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  // ★ FALLBACK — clean alternate embed
  { source: "vidlink.pro",        movie: (id) => `https://vidlink.pro/movie/${id}`,                      tv: (id,s,e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
  { source: "embed.su",           movie: (id) => `https://embed.su/embed/movie/${id}`,                   tv: (id,s,e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  // Extended fallback pool ─────────────────────────────────────────────────
  { source: "superembed.stream",  movie: (id) => `https://superembed.stream/embed/movie/${id}`,          tv: (id,s,e) => `https://superembed.stream/embed/tv/${id}/${s}/${e}` },
  { source: "superembed.org",     movie: (id) => `https://superembed.org/embed/movie/${id}`,             tv: (id,s,e) => `https://superembed.org/embed/tv/${id}/${s}/${e}` },
  { source: "vidlink.pro",        movie: (id) => `https://vidlink.pro/movie/${id}`,                      tv: (id,s,e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
  { source: "moviesapi.club",     movie: (id) => `https://moviesapi.club/movie/${id}`,                   tv: (id,s,e) => `https://moviesapi.club/tv/${id}-${s}-${e}` },
  { source: "autoembed.cc",       movie: (id) => `https://player.autoembed.cc/embed/movie/${id}`,        tv: (id,s,e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}` },
  { source: "rive.stream",        movie: (id) => `https://rive.stream/e/${id}`,                          tv: (id,s,e) => `https://rive.stream/e/${id}?s=${s}&e=${e}` },
  { source: "2embed.cc",          movie: (id) => `https://www.2embed.cc/embed/${id}`,                    tv: (id,s,e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
  { source: "rivestream.ru",      movie: (id) => `https://rivestream.ru/embed/movie/${id}`,              tv: (id,s,e) => `https://rivestream.ru/embed/tv/${id}/${s}/${e}` },
  { source: "nepu.to",            movie: (id) => `https://nepu.to/embed/movie?tmdb=${id}`,               tv: (id,s,e) => `https://nepu.to/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { source: "cineby.sc",          movie: (id) => `https://www.cineby.sc/movie/${id}`,                    tv: (id,s,e) => `https://www.cineby.sc/tv/${id}?season=${s}&episode=${e}` },
  { source: "hdtodayz.net",       movie: (id) => `https://hdtodayz.net/embed/movie/${id}`,               tv: (id,s,e) => `https://hdtodayz.net/embed/tv/${id}/${s}/${e}` },
  { source: "2anime.xyz",         movie: (id) => `https://2anime.xyz/embed/movie/${id}`,                 tv: (id,s,e) => `https://2anime.xyz/embed/${id}/${e}` },
  { source: "uniquestream.net",   movie: (id) => `https://uniquestream.net/embed/movie/${id}`,           tv: (id,s,e) => `https://uniquestream.net/embed/tv/${id}/${s}/${e}` },
  // ── User-specified providers ───────────────────────────────────────────────
  { source: "vidsrc.xyz",         movie: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,            tv: (id,s,e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { source: "vidsrc.to",          movie: (id) => `https://vidsrc.to/embed/movie/${id}`,                  tv: (id,s,e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { source: "vidsrc.me",          movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,             tv: (id,s,e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { source: "vidbinge.dev",       movie: (id) => `https://vidbinge.dev/embed/movie/${id}`,               tv: (id,s,e) => `https://vidbinge.dev/embed/tv/${id}/${s}/${e}` },
  { source: "multiembed.mov",     movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,         tv: (id,s,e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
  { source: "dbmovies.net",       movie: (id) => `https://dbmovies.net/embed/movie/${id}`,               tv: (id,s,e) => `https://dbmovies.net/embed/tv/${id}/${s}/${e}` },
];

// T1 Anime — proven anime-specific sources
const T1_ANIME: Array<{ source: string; tv: (id: number, s: number, e: number) => string; movie: (id: number) => string }> = [
  { source: "animekai.to",   movie: (id) => `https://animekai.to/embed/movie/${id}`,   tv: (id,s,e) => `https://animekai.to/embed/tv/${id}/${s}/${e}` },
  { source: "hianime.cv",    movie: (id) => `https://hianime.cv/embed/movie/${id}`,    tv: (id,s,e) => `https://hianime.cv/embed/tv/${id}/${s}/${e}` },
  { source: "9anime.cl",     movie: (id) => `https://9anime.cl/embed/movie/${id}`,     tv: (id,s,e) => `https://9anime.cl/embed/tv/${id}/${s}/${e}` },
  { source: "miruro.to",     movie: (id) => `https://www.miruro.to/embed/movie/${id}`, tv: (id,s,e) => `https://www.miruro.to/embed/tv/${id}/${s}/${e}` },
];

// ─── Cache ────────────────────────────────────────────────────────────────────
const PROBE_CACHE_PREFIX = "mse_probe_v1_";
const PROBE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2h — sites go down temporarily

async function getProbeCache(key: string): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(PROBE_CACHE_PREFIX + key);
    if (!raw) return null;
    const { ok, ts } = JSON.parse(raw);
    if (Date.now() - ts > PROBE_CACHE_TTL) return null;
    return ok as boolean;
  } catch {
    return null;
  }
}

async function setProbeCache(key: string, ok: boolean) {
  try {
    await AsyncStorage.setItem(
      PROBE_CACHE_PREFIX + key,
      JSON.stringify({ ok, ts: Date.now() })
    );
  } catch {}
}

// ─── Source Prober ────────────────────────────────────────────────────────────
async function probeUrl(url: string, sourceKey: string, timeoutMs = 4500): Promise<boolean> {
  // Check cache first
  const cached = await getProbeCache(sourceKey);
  if (cached !== null) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        "Referer": "https://www.google.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
    });
    clearTimeout(timer);
    const ok = res.status >= 200 && res.status < 400;
    console.log(`[Probe] ${sourceKey} → HTTP ${res.status} (${ok ? "✓" : "✗"})`);
    setProbeCache(sourceKey, ok);
    return ok;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[Probe] ${sourceKey} → FAILED:`, err);
    setProbeCache(sourceKey, false);
    return false;
  }
}

// ─── Concurrent probe with latency tracking ───────────────────────────────────
interface ProbeResult {
  source: string;
  url: string;
  ok: boolean;
  latencyMs: number;
}

async function raceProbe(
  sources: Array<{ url: string; source: string }>,
  maxConcurrent = 6,
  timeoutMs = 4500,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const chunks: typeof sources[] = [];

  for (let i = 0; i < sources.length; i += maxConcurrent) {
    chunks.push(sources.slice(i, i + maxConcurrent));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(async ({ url, source }) => {
        const t0 = Date.now();
        const ok = await probeUrl(url, source, timeoutMs);
        return { source, url, ok, latencyMs: Date.now() - t0 };
      })
    );
    for (const r of chunkResults) {
      if (r.status === "fulfilled") results.push(r.value);
      else results.push({ source: "", url: "", ok: false, latencyMs: 9999 });
    }
  }
  return results;
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export async function resolveVideoSources(opts: {
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  season?: number;
  episode?: number;
  isAnime?: boolean;
  apiBase?: string;
}): Promise<MultiSourceResult> {
  const {
    tmdbId,
    title,
    mediaType,
    season = 1,
    episode = 1,
    isAnime = false,
    apiBase,
  } = opts;

  // ── Step 1: Instant primary (always superembed.stream — never waits) ─────────
  const t1Sources = isAnime
    ? [...T1_ANIME, ...T1_MOVIE]
    : T1_MOVIE;

  const primaryDef = t1Sources[0];
  const primaryUrl =
    mediaType === "movie"
      ? primaryDef.movie(tmdbId)
      : primaryDef.tv(tmdbId, season, episode);

  const primary: VideoSource = {
    url: primaryUrl,
    source: primaryDef.source,
    isEmbed: true,
    quality: "HD",
    tier: 1,
    confirmed: false,
  };

  // ── Step 2: Build T2 from sourceCatalog (all embed sources not in T1) ────────
  const t1SourceNames = new Set(t1Sources.map((s) => s.source));

  const catalogEmbedUrls = buildEmbedUrls(
    tmdbId,
    mediaType,
    season,
    episode,
    isAnime ? "anime" : "movies"
  );

  // For anime, also include movie sources (many anime are on general sites too)
  const extendedUrls = isAnime
    ? [
        ...catalogEmbedUrls,
        ...buildEmbedUrls(tmdbId, mediaType, season, episode, "movies"),
      ]
    : catalogEmbedUrls;

  // Deduplicate
  const seen = new Set<string>([primaryUrl]);
  const t2Fallbacks: VideoSource[] = [];

  for (const entry of extendedUrls) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    t2Fallbacks.push({
      url: entry.url,
      source: entry.source,
      isEmbed: true,
      quality: "HD",
      tier: t1SourceNames.has(entry.source) ? 1 : 2,
      confirmed: false,
    });
  }

  // ── Step 3: Race T1 sources concurrently (background, non-blocking) ──────────
  // We fire probes but DON'T await them before returning.
  // Results get stored in AsyncStorage cache so next open is faster.
  const t1ProbeInputs = t1Sources
    .slice(1, 8)
    .map((s) => ({
      url:    mediaType === "movie" ? s.movie(tmdbId) : s.tv(tmdbId, season, episode),
      source: s.source,
    }))
    .filter((s) => !seen.has(s.url) || true);

  // Probe in background — don't block
  raceProbe(t1ProbeInputs, 6, 4500)
    .then((probed) => {
      probed.forEach(({ source, ok }) => setProbeCache(source, ok));
    })
    .catch(() => {});

  // ── Step 4: Server-side scraper for download sites (background) ──────────────
  let scrapersActive = false;
  if (apiBase && title) {
    scrapersActive = true;
    // Use apiClient so the auth token + client header are included — /api/scrape is protected
    import("@/lib/apiClient").then(({ apiClient }) => {
      apiClient.get("/scrape", {
        title,
        ...(mediaType === "tv" ? { season: String(season), episode: String(episode) } : {}),
      }).catch(() => {});
    }).catch(() => {});
  }

  // ── Step 5: Return full cascading source list instantly ──────────────────────
  return {
    primary,
    fallbacks: t2Fallbacks,
    totalSources: 1 + t2Fallbacks.length,
    scrapersActive,
  };
}

// ─── Source name list (for AnalysingModal animation) ─────────────────────────
export function getAllSourceNames(): string[] {
  return [
    ...T1_MOVIE.map((s) => s.source),
    ...getEmbedSources("movies").map((s) => s.name),
    ...getEmbedSources("anime").map((s) => s.name),
    "VegaMovies", "FZMovies", "RogMovies", "MKVCinemas",
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// ─── Scraper site list (for admin/UI info) ────────────────────────────────────
export function getScraperSiteList(): Array<{ name: string; domain: string; indieFriendly: boolean }> {
  return ALL_SOURCES.filter((s) => s.type === "scraper").map((s) => ({
    name: s.name,
    domain: s.domain,
    indieFriendly: s.indieFriendly ?? false,
  }));
}

// ─── Probe health check for a single source (on-demand) ──────────────────────
export async function probeSingleSource(
  tmdbId: number,
  mediaType: "movie" | "tv",
  source: { source: string; movie: (id: number) => string; tv: (id: number, s: number, e: number) => string },
  season = 1,
  episode = 1,
): Promise<boolean> {
  const url =
    mediaType === "movie" ? source.movie(tmdbId) : source.tv(tmdbId, season, episode);
  return probeUrl(url, source.source);
}
