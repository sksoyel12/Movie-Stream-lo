import { API_HOST } from "@/lib/apiBase";
import { detectContentRegion, getDeviceRegionCode } from "@/lib/region";
import { Platform } from "react-native";

// TMDB API calls are made directly from the app as requested. This key is
// bundled with the Expo client and is visible to anyone who extracts the app.
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "d2d572a7978924ec357fed057e68cef6";
const IMG_BASE = "https://image.tmdb.org/t/p";

const DIRECT_FETCH_TIMEOUT_MS = 4_000;
const PROXY_FETCH_TIMEOUT_MS = 10_000;

// ─── Concurrent request limiter ───────────────────────────────────────────────
// Caps simultaneous TMDB calls to 16 for faster parallel loading.
const QUEUE_LIMIT = 16;
let _qActive = 0;
const _qPending: Array<() => void> = [];

function _acquireSlot(): Promise<void> {
  if (_qActive < QUEUE_LIMIT) {
    _qActive++;
    return Promise.resolve();
  }
  return new Promise<void>((res) => _qPending.push(res));
}
function _releaseSlot(): void {
  if (_qPending.length > 0) {
    // hand the slot directly to the next waiter (active count unchanged)
    (_qPending.shift()!)();
  } else {
    _qActive--;
  }
}

/** Build a first-party image URL; TMDB artwork never loads directly in Expo. */
export function wrapProxy(directUrl: string): string {
  return API_HOST
    ? `${API_HOST}/api/image?url=${encodeURIComponent(directUrl)}`
    : directUrl;
}

/**
 * Build a reasonably sized TMDB image URL.
 *
 * Keep the size at the call site when the image has a known role:
 * - w342 for posters in cards, rows, and lists
 * - w500 for detail posters
 * - w1280 for detail hero/backdrop artwork
 *
 * The old default was w780, which made every small card download a much
 * larger image than it could display.
 */
export const tmdbImg = (path: string | null | undefined, size = "w342"): string | null => {
  if (!path) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return wrapProxy(`${IMG_BASE}/${size}${normalizedPath}`);
};

/**
 * Backwards-compatible name for older callers. It no longer requests TMDB's
 * original asset; callers should use tmdbImg directly when the role is known.
 */
export const tmdbOriginal = (
  path: string | null | undefined,
  size: "w342" | "w500" | "w780" | "w1280" = "w500",
): string | null => tmdbImg(path, size);

// ─── Clean poster selection and caching ────────────────────────────────────────
const POSTER_CACHE_TTL_MS = 25 * 60 * 60 * 1000;
// In-memory cache: "mediaType:tmdbId" → clean, ranked file_path strings.
const _posterCache = new Map<string, { paths: string[]; savedAt: number }>();
const _posterInFlight = new Map<string, Promise<string[]>>();
const _posterUriCache = new Map<string, string | null>();

/** Wipe the in-memory poster cache so the next fetch pulls fresh artwork. */
export function clearPosterCache(): void {
  _posterCache.clear();
  _posterInFlight.clear();
  _posterUriCache.clear();
}

/**
 * Rank TMDB posters so textless artwork always wins over title cards that may
 * contain release dates, countdowns, theatrical banners, or promo badges.
 * TMDB does not expose a reliable "promotional" flag, so image language,
 * community votes, and source resolution are the safest available signals.
 */
export function rankCleanPosters(
  posters: Array<{
    file_path: string;
    iso_639_1?: string | null;
    vote_average?: number;
    vote_count?: number;
    width?: number;
    height?: number;
  }>,
): string[] {
  const valid = posters.filter((poster) => poster.file_path?.startsWith("/"));
  const compareQuality = (a: (typeof valid)[number], b: (typeof valid)[number]) => {
    const aHighResolution = (a.width ?? 0) >= 1000 || (a.height ?? 0) >= 1500;
    const bHighResolution = (b.width ?? 0) >= 1000 || (b.height ?? 0) >= 1500;
    if (aHighResolution !== bHighResolution) return aHighResolution ? -1 : 1;
    const voteDifference = (b.vote_average ?? 0) - (a.vote_average ?? 0);
    if (voteDifference !== 0) return voteDifference;
    const countDifference = (b.vote_count ?? 0) - (a.vote_count ?? 0);
    if (countDifference !== 0) return countDifference;
    return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
  };

  const textless = valid
    .filter((poster) => poster.iso_639_1 == null)
    .sort(compareQuality);
  const languageSpecific = valid
    .filter((poster) => poster.iso_639_1 != null)
    .sort(compareQuality);

  return [...textless, ...languageSpecific]
    .map((poster) => poster.file_path)
    .filter((path, index, paths) => paths.indexOf(path) === index);
}

/**
 * Fetch available poster alternatives from the TMDB /images endpoint.
 *
 * A single `en,null` request is intentional: it gives the selector both
 * language-specific official posters and textless artwork, allowing clean
 * images to win before promotional title cards.
 */
export async function fetchMoviePosters(
  tmdbId: number,
  mediaType: "movie" | "tv" = "movie",
): Promise<string[]> {
  const cacheKey = `${mediaType}:${tmdbId}`;
  const cached = _posterCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < POSTER_CACHE_TTL_MS) {
    return cached.paths;
  }
  if (cached) _posterCache.delete(cacheKey);
  const inFlight = _posterInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
   try {
    const fetchImages = () =>
      get<{
        posters?: Array<{
          file_path: string;
          iso_639_1?: string | null;
          vote_average?: number;
          vote_count?: number;
          width?: number;
          height?: number;
        }>;
      }>(`/${mediaType}/${tmdbId}/images`, {
        include_image_language: "en,null",
      });

    const data = await fetchImages();
    // Keep up to 50 ranked entries for stable rotation without loading a huge pool.
    const paths = rankCleanPosters(data.posters ?? []).slice(0, 50);
    _posterCache.set(cacheKey, { paths, savedAt: Date.now() });
    return paths;
  } catch {
    _posterCache.set(cacheKey, { paths: [], savedAt: Date.now() });
    return [];
  }
  })();
  _posterInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    _posterInFlight.delete(cacheKey);
  }
}

/**
 * Return the cleanest cached poster at a detail/hero-friendly size.
 * The API key stays server-side; this helper only talks to the existing TMDB
 * proxy and falls back to the default poster path when /images is empty.
 */
export async function getCleanPosterUrl(
  tmdbId: number,
  mediaType: "movie" | "tv" = "movie",
  fallbackPath?: string | null,
): Promise<string | null> {
  const posters = await fetchMoviePosters(tmdbId, mediaType);
  return tmdbImg(posters[0] ?? fallbackPath, "w780");
}

/**
 * Netflix-style dynamic poster: picks from the top clean posters returned by
 * fetchMoviePosters (textless artwork is ranked before language-specific art).
 * Uses a 24-hour rotation_key so the same title shows different artwork across
 * visits without flickering mid-session. tmdbId provides per-title entropy so
 * concurrent titles don't all land on the same poster index.
 * Falls back to `fallbackPath` when no alternatives exist.
 * Returns a fully-proxied, card-sized image URI.
 */
export async function fetchRandomPosterUri(
  tmdbId: number,
  mediaType: "movie" | "tv",
  fallbackPath: string | null | undefined,
): Promise<string | null> {
  const posters = await fetchMoviePosters(tmdbId, mediaType);
  if (posters.length > 0) {
    // Use the same 25-hour window as data/poster fetching + tmdbId entropy
    // but varied selection — no Math.random() so the poster stays stable
    // throughout a browsing session and only rotates every 25 hours.
    const rotationKey = Math.floor(Date.now() / POSTER_CACHE_TTL_MS);
    const pool = posters.slice(0, Math.min(50, posters.length));
    const idx  = Math.abs(rotationKey * 31 + tmdbId) % pool.length;
    const cacheKey = `random:${mediaType}:${tmdbId}:${Math.floor(Date.now() / POSTER_CACHE_TTL_MS)}`;
    const cached = _posterUriCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const uri = tmdbImg(pool[idx], "w500");
    _posterUriCache.set(cacheKey, uri);
    return uri;
  }
  const fallback = tmdbImg(fallbackPath, "w500");
  _posterUriCache.set(`fallback:${mediaType}:${tmdbId}`, fallback);
  return fallback;
}

type ContextualArtwork = {
  file_path: string;
  iso_639_1?: string | null;
  vote_average?: number;
  vote_count?: number;
  width?: number;
  height?: number;
};

const _contextualArtworkCache = new Map<string, string | null>();
const CONTEXTUAL_ARTWORK_TTL_MS = 86_400_000;

/**
 * Pick a contextual still/poster from TMDB's artwork pool.
 *
 * TMDB does not expose reliable semantic tags such as "romantic scene" on
 * every image. For Romance and Action/Thriller preferences, backdrops are the
 * best consistent proxy for scene frames and character close-ups; otherwise a
 * clean poster remains the safest default. Selection is deterministic for the
 * 24-hour feed window so personalization never causes mid-session flicker.
 */
export async function fetchContextualArtworkUri(
  tmdbId: number,
  mediaType: "movie" | "tv",
  fallbackPath: string | null | undefined,
  preferenceGenres: number[] = [],
): Promise<string | null> {
  const preferenceMode = preferenceGenres.includes(10749)
    ? "romance"
    : preferenceGenres.some((id) => [28, 12, 53, 80].includes(id))
      ? "intensity"
      : "default";
  const rotationKey = Math.floor(Date.now() / CONTEXTUAL_ARTWORK_TTL_MS);
  const cacheKey = `context:${mediaType}:${tmdbId}:${preferenceMode}:${rotationKey}`;
  if (_contextualArtworkCache.has(cacheKey)) {
    return _contextualArtworkCache.get(cacheKey) ?? null;
  }

  try {
    const data = await get<{
      posters?: ContextualArtwork[];
      backdrops?: ContextualArtwork[];
    }>(`/${mediaType}/${tmdbId}/images`, {
      include_image_language: "en,null",
    });
    const backdrops = (data.backdrops ?? [])
      .filter((image) => image.file_path?.startsWith("/"))
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
    const posters = (data.posters ?? [])
      .filter((image) => image.file_path?.startsWith("/"))
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
    const pool = preferenceMode === "default"
      ? posters
      : [...backdrops, ...posters];
    const selected = pool[Math.abs(tmdbId * 17 + rotationKey) % pool.length];
    const uri = tmdbImg(selected?.file_path ?? fallbackPath, preferenceMode === "default" ? "w500" : "w780");
    _contextualArtworkCache.set(cacheKey, uri);
    return uri;
  } catch {
    const fallback = tmdbImg(fallbackPath, "w500");
    _contextualArtworkCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Returns the detail-page poster path (images[1]) so the detail screen shows
 * different artwork than the home screen (which uses rotation_key-based index).
 * Falls back to images[0] when only one poster exists.
 */
export async function fetchDetailPosterUri(
  tmdbId: number,
  mediaType: "movie" | "tv",
  fallbackPath: string | null | undefined,
): Promise<string | null> {
  const cacheKey = `detail:${mediaType}:${tmdbId}`;
  if (_posterUriCache.has(cacheKey)) return _posterUriCache.get(cacheKey) ?? null;
  const posters = await fetchMoviePosters(tmdbId, mediaType);
  if (posters.length > 0) {
    const uri = tmdbImg(posters[0], "w500");
    _posterUriCache.set(cacheKey, uri);
    return uri;
  }
  const fallback = tmdbImg(fallbackPath, "w500");
  _posterUriCache.set(cacheKey, fallback);
  return fallback;
}

export const proxyUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (typeof url !== "string") return null;
  if (url.includes("/api/image?url=")) return url;
  if (url.includes("wsrv.nl") || url.includes("weserv.nl")) {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      try {
        return wrapProxy(decodeURIComponent(match[1]));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (url.startsWith("/")) return tmdbImg(url);
  if (url.includes("image.tmdb.org")) return wrapProxy(url.replace("/t/p/original/", "/t/p/w500/"));
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  return url;
};

function emptyPage(page: number): TMDBPage {
  return {
    page,
    results: [],
    total_pages: 0,
    total_results: 0,
  };
}

function isPagedEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith("/discover/") ||
    endpoint.startsWith("/trending/") ||
    endpoint.startsWith("/search/") ||
    endpoint.endsWith("/recommendations") ||
    endpoint.endsWith("/similar") ||
    /\/(upcoming|popular|now_playing|airing_today|on_the_air)$/.test(endpoint)
  );
}

function emptyResponse<T>(endpoint: string, page: number): T {
  if (isPagedEndpoint(endpoint)) return emptyPage(page) as T;
  if (endpoint.endsWith("/images")) {
    return { posters: [], backdrops: [], logos: [] } as T;
  }
  if (endpoint.endsWith("/videos")) return { results: [] } as T;
  if (endpoint.endsWith("/credits")) return { cast: [] } as T;
  if (/\/(release_dates|content_ratings|translations|watch\/providers)$/.test(endpoint)) {
    return { results: [] } as T;
  }
  if (/\/season\/\d+$/.test(endpoint)) return { episodes: [] } as T;
  return {} as T;
}

type TmdbAttempt = "direct" | "backend-proxy";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

async function fetchTmdbAttempt<T>(
  url: string,
  endpoint: string,
  attempt: TmdbAttempt,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<T | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...extraHeaders },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[TMDB] request attempt failed", {
        endpoint,
        attempt,
        status: response.status,
        statusText: response.statusText,
      });
      return undefined;
    }

    try {
      const data = (await response.json()) as T;
      if (isPagedEndpoint(endpoint)) {
        const results = (data as { results?: unknown } | null)?.results;
        if (!Array.isArray(results)) {
          console.warn("[TMDB] request attempt returned an invalid page", {
            endpoint,
            attempt,
            status: response.status,
            error: "Expected a results array",
          });
          return undefined;
        }
      }
      return data;
    } catch (error) {
      console.warn("[TMDB] request attempt returned invalid JSON", {
        endpoint,
        attempt,
        status: response.status,
        error: errorMessage(error),
      });
      return undefined;
    }
  } catch (error) {
    console.warn("[TMDB] request attempt failed", {
      endpoint,
      attempt,
      error: errorMessage(error),
    });
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function getOptionalPage(endpoint: string, page: number): Promise<TMDBPage> {
  return get<TMDBPage>(endpoint, { page });
}

async function get<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  await _acquireSlot();
  const page = typeof params.page === "number" ? params.page : 1;
  const fallback = () => emptyResponse<T>(endpoint, page);
  try {
    const proxyUrl = API_HOST
      ? new URL(`${API_HOST}/api/tmdb/${endpoint.replace(/^\/+/, "")}`)
      : null;
    if (proxyUrl) {
      for (const [key, value] of Object.entries(params)) {
        proxyUrl.searchParams.set(key, String(value));
      }
    }

    const requestProxy = () =>
      proxyUrl
        ? fetchTmdbAttempt<T>(
            proxyUrl.toString(),
            endpoint,
            "backend-proxy",
            PROXY_FETCH_TIMEOUT_MS,
            { "X-TMDB-API-Key": TMDB_API_KEY },
          )
        : Promise.resolve(undefined);

    // Browser requests are cross-origin and TMDB may reject them or stall at
    // CORS. Prefer the existing API proxy there; native Android remains direct-first.
    if (Platform.OS === "web" && proxyUrl) {
      const proxyData = await requestProxy();
      if (proxyData !== undefined) return proxyData;
    }

    const directUrl = new URL(`${TMDB_API_BASE}${endpoint}`);
    directUrl.searchParams.set("api_key", TMDB_API_KEY);
    for (const [key, value] of Object.entries(params)) {
      directUrl.searchParams.set(key, String(value));
    }

    const directData = await fetchTmdbAttempt<T>(
      directUrl.toString(),
      endpoint,
      "direct",
      DIRECT_FETCH_TIMEOUT_MS,
    );
    if (directData !== undefined) return directData;

    if (!API_HOST) {
      console.warn("[TMDB] backend-proxy attempt unavailable", {
        endpoint,
        attempt: "backend-proxy",
        error: "API_HOST is not configured",
      });
      return fallback();
    }

    const proxyData = await requestProxy();
    return proxyData !== undefined ? proxyData : fallback();
  } finally {
    _releaseSlot();
  }
}

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  vote_average: number;
  vote_count: number;
  /** Live engagement score returned by every TMDB list/trending endpoint. */
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  media_type?: string;
  /* HERO_LOCK_START: TMDB hero source type */
  hero_source?: "netflix" | "viki";
  /* HERO_LOCK_END: TMDB hero source type */
}

export interface TMDBPage {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

type ProviderPageSource = {
  result: PromiseSettledResult<TMDBPage>;
  mediaType: "movie" | "tv";
  source: "netflix" | "viki";
};

function mergeProviderPages(
  sources: ProviderPageSource[],
  sortBy: "popularity" | "releaseDateAsc" | "releaseDateDesc",
): TMDBPage {
  const pages = sources
    .filter(
      (source): source is ProviderPageSource & {
        result: PromiseFulfilledResult<TMDBPage>;
      } => source.result.status === "fulfilled",
    )
    .map((source) => ({ ...source, page: source.result.value }));
  if (pages.length === 0) {
    throw new Error("All Netflix and Viki content requests failed.");
  }

  const seen = new Set<string>();
  const merged = pages.flatMap(({ page, mediaType, source }) =>
    (page.results ?? []).map((item) => ({
      ...item,
      media_type: mediaType,
      hero_source: source,
    })),
  ).filter((item) => {
    const key = `${item.media_type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (sortBy === "popularity") {
    merged.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  } else {
    merged.sort((a, b) => {
      const aDate = a.release_date ?? a.first_air_date ?? "";
      const bDate = b.release_date ?? b.first_air_date ?? "";
      return sortBy === "releaseDateAsc"
        ? aDate.localeCompare(bDate)
        : bDate.localeCompare(aDate);
    });
  }

  return {
    ...pages[0].page,
    results: merged,
    total_results: merged.length,
    total_pages: Math.max(...pages.map(({ page }) => page.total_pages ?? 1)),
  };
}

export interface TMDBSeason {
  season_number: number;
  name: string;
  episode_count: number;
  poster_path: string | null;
  air_date: string | null;
}

export interface TMDBDetail {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genres: { id: number; name: string }[];
  networks?: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  seasons?: TMDBSeason[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  spoken_languages?: { iso_639_1: string; english_name?: string; name?: string }[];
  type?: string;
  status?: string;
  next_episode_to_air?: {
    air_date?: string | null;
    episode_number?: number;
    season_number?: number;
  } | null;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
}

export interface TMDBTranslationsResponse {
  id: number;
  translations: { iso_639_1: string; iso_3166_1: string; english_name?: string; name?: string }[];
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  air_date: string | null;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TMDBSeasonDetail {
  episodes: TMDBEpisode[];
}

export const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

/** ISO date string for today — used as the upper ceiling on every discover query
 *  so unreleased / future-dated titles never appear in category rows.         */
const TODAY = new Date().toISOString().split("T")[0];

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
const NETFLIX_NETWORK_ID = 213;
const RAKUTEN_VIKI_PROVIDER_ID = 344;

// ─── Daily rotation helpers (Hero Banner) ─────────────────────────────────────
// The Hero Banner must swap its featured category/backdrop roughly every 24
// hours rather than reshuffling on every app open. These helpers derive a
// seed from today's calendar date (stable all day, changes at midnight local
// time) so rotation is deterministic within a day but moves forward daily.

/** Stable per-day integer seed — e.g. 2026-07-14 → 20260714. Same all day. */
export function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Cheap integer hash so sequential day-seeds spread out instead of clustering. */
function hashSeed(seed: number): number {
  return Math.abs(Math.imul(seed, 2654435761) ^ (seed >>> 13));
}

/**
 * Deterministic "random" index into a pool of size `poolSize`, stable for the
 * whole calendar day and shifting to a new value once every 24 hours.
 * `salt` lets multiple independent rotations (e.g. one per content pool) use
 * the same day without landing on the same index.
 */
export function dailyRotationIndex(poolSize: number, salt = 0): number {
  if (poolSize <= 0) return 0;
  return hashSeed(dailySeed() + salt * 97) % poolSize;
}

/** Rotates an array so it starts at `offset` — used to change which item
 *  leads the Hero Banner every day without discarding the rest of the pool. */
export function rotateArray<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const o = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(o), ...items.slice(0, o)];
}

export const tmdb = {
  trending: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/all/week", { page }),

  trendingMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/week", { page }),

  /** Daily trending feature movies — the correct source for the Hero Banner
   *  so the backdrop rotates across a fresh 24-hour engagement snapshot. */
  trendingMoviesDay: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/day", { page }),

  trendingTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/tv/week", { page }),

  /** Recent, highly rated Netflix movies — deliberately avoids all-time catalog rankings. */
  topRated: async (page = 1): Promise<TMDBPage> => {
    const region = (await detectContentRegion()).code;
    return get<TMDBPage>("/discover/movie", {
      with_watch_providers: 8,
      watch_region: region,
      sort_by: "vote_average.desc",
      "primary_release_date.gte": dateOffset(-365),
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    });
  },

  popularTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/tv/popular", { page }),

  nowPlaying: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/movie/now_playing", { page }),

  airingToday: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/tv/airing_today", { page }),

  upcoming: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/movie/upcoming", { page }),

  netflixUpcoming: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      page,
      with_networks: 213,
      sort_by: "primary_release_date.desc",
      "primary_release_date.gte": new Date().toISOString().split("T")[0],
    }),

  /** Netflix TV titles scheduled for a future release. */
  netflixComingSoonTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      page,
      with_networks: 213,
      sort_by: "first_air_date.asc",
      "first_air_date.gte": TODAY,
      "vote_count.gte": 1,
    }),

  /**
   * Fresh Netflix and Asian Viki releases for Trending and New & Hot.
   * TMDB's /trending endpoint cannot filter by provider, so every source uses
   * an explicit Netflix network/provider or a Viki provider + Asian language.
   */
  netflixTrending: async (
    page = 1,
    regionCode?: string,
  ): Promise<TMDBPage> => {
    const region = regionCode ?? (await detectContentRegion()).code;
    const today = new Date().toISOString().slice(0, 10);
    const recentStart = dateOffset(-365);
    const [tv, movies, vikiKo, vikiJa, vikiZh] = await Promise.allSettled([
      get<TMDBPage>("/discover/tv", {
        with_networks: NETFLIX_NETWORK_ID,
        sort_by: "popularity.desc",
        "first_air_date.gte": recentStart,
        "first_air_date.lte": today,
        "vote_count.gte": 5,
        page,
      }),
      get<TMDBPage>("/discover/movie", {
        with_watch_providers: 8,
        watch_region: region,
        sort_by: "popularity.desc",
        "primary_release_date.gte": recentStart,
        "primary_release_date.lte": today,
        "vote_count.gte": 5,
        page,
      }),
      ...(["ko", "ja", "zh"] as const).map((language) =>
        get<TMDBPage>("/discover/tv", {
          with_watch_providers: RAKUTEN_VIKI_PROVIDER_ID,
          watch_region: region,
          with_original_language: language,
          sort_by: "popularity.desc",
          "first_air_date.gte": recentStart,
          "first_air_date.lte": today,
          "vote_count.gte": 2,
          page,
        }),
      ),
    ]);
    return mergeProviderPages([
      { result: tv, mediaType: "tv", source: "netflix" },
      { result: movies, mediaType: "movie", source: "netflix" },
      { result: vikiKo, mediaType: "tv", source: "viki" },
      { result: vikiJa, mediaType: "tv", source: "viki" },
      { result: vikiZh, mediaType: "tv", source: "viki" },
    ], "popularity");
  },

  /** Upcoming Netflix movies/series and Korean, Japanese, or Chinese Viki TV. */
  newHotComingSoon: async (
    page = 1,
    regionCode?: string,
  ): Promise<TMDBPage> => {
    const region = regionCode ?? (await detectContentRegion()).code;
    const today = new Date().toISOString().slice(0, 10);
    const through = dateOffset(365);
    const [netflixTV, netflixMovies, vikiKo, vikiJa, vikiZh] =
      await Promise.allSettled([
        get<TMDBPage>("/discover/tv", {
          with_networks: NETFLIX_NETWORK_ID,
          sort_by: "first_air_date.asc",
          "first_air_date.gte": today,
          "first_air_date.lte": through,
          "vote_count.gte": 1,
          page,
        }),
        get<TMDBPage>("/discover/movie", {
          with_watch_providers: 8,
          watch_region: region,
          sort_by: "primary_release_date.asc",
          "primary_release_date.gte": today,
          "primary_release_date.lte": through,
          "vote_count.gte": 1,
          page,
        }),
        ...(["ko", "ja", "zh"] as const).map((language) =>
          get<TMDBPage>("/discover/tv", {
            with_watch_providers: RAKUTEN_VIKI_PROVIDER_ID,
            watch_region: region,
            with_original_language: language,
            sort_by: "first_air_date.asc",
            "first_air_date.gte": today,
            "first_air_date.lte": through,
            "vote_count.gte": 1,
            page,
          }),
        ),
      ]);
    return mergeProviderPages([
      { result: netflixTV, mediaType: "tv", source: "netflix" },
      { result: netflixMovies, mediaType: "movie", source: "netflix" },
      { result: vikiKo, mediaType: "tv", source: "viki" },
      { result: vikiJa, mediaType: "tv", source: "viki" },
      { result: vikiZh, mediaType: "tv", source: "viki" },
    ], "releaseDateAsc");
  },

  onTheAir: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/tv/on_the_air", { page }),

  videos: (type: "movie" | "tv", id: number): Promise<{ results: any[] }> =>
    get<{ results: any[] }>(`/${type}/${id}/videos`, {
      include_video_language: "en,null",
    }),

  discover: (type: "movie" | "tv", genre: number, page = 1): Promise<TMDBPage> =>
    get<TMDBPage>(`/discover/${type}`, { with_genres: genre, page }),

  detail: (type: "movie" | "tv", id: number): Promise<TMDBDetail> =>
    get<TMDBDetail>(`/${type}/${id}`),

  certifications: (
    type: "movie" | "tv",
    id: number,
  ): Promise<
    | { results?: Array<{ iso_3166_1?: string; release_dates?: Array<{ certification?: string }> }> }
    | { results?: Array<{ iso_3166_1?: string; rating?: string }> }
  > =>
    type === "movie"
      ? get(`/movie/${id}/release_dates`)
      : get(`/tv/${id}/content_ratings`),

  watchProviders: (
    type: "movie" | "tv",
    id: number,
  ): Promise<{
    results?: Record<string, {
      flatrate?: Array<{ provider_id: number; provider_name: string }>;
      buy?: Array<{ provider_id: number; provider_name: string }>;
      rent?: Array<{ provider_id: number; provider_name: string }>;
    }>;
  }> => get(`/${type}/${id}/watch/providers`),

  /** GET /movie|tv/{id}/translations — used to check which audio/text
   *  languages (e.g. "hi" for Hindi) actually exist for a title. */
  translations: (type: "movie" | "tv", id: number): Promise<TMDBTranslationsResponse> =>
    get<TMDBTranslationsResponse>(`/${type}/${id}/translations`),

  seasonDetail: (tvId: number, season: number): Promise<TMDBSeasonDetail> =>
    get<TMDBSeasonDetail>(`/tv/${tvId}/season/${season}`),

  search: (query: string, page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/search/multi", { query, page }),

  trendingToday: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/all/day", { page }),

  // Uses /trending/all/day so both movies AND TV shows trending in India
  // are included — matches what Netflix India's "Top 10" actually surfaces.
  trendingMoviesIN: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/all/day", { page, region: "IN" }),

  trendingTVIN: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/tv/day", { page, region: "IN" }),

  trendingMoviesUS: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/day", { page, region: "US" }),

  eastAsian: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR|JP|CN",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  awardWinningTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      "vote_average.gte": 8,
      "vote_count.gte": 200,
      sort_by: "vote_average.desc",
      page,
    }),

  usTVShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "US",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  popularKoreanTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  koreanDramas: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: NETFLIX_NETWORK_ID,
      with_original_language: "ko",
      with_genres: 18,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  koreanDramasIN: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      region: "IN",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  romanticKoreanComedies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: "10749,35",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  asianBinge: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR|JP|CN|TH",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  blockbusters: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      sort_by: "revenue.desc",
      "vote_count.gte": 500,
      "primary_release_date.lte": TODAY,
      page,
    }),

  koreanThrillers: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: "53,9648",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  scifiFantasyTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 10765,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  /** Horror TV Series — explicit horror genre (27) with sort and minimum vote
   *  threshold so the query always returns a dense, non-empty result set. */
  horrorTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 27,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Recent, highly rated Netflix series; no all-time TV ranking results. */
  topRatedTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: NETFLIX_NETWORK_ID,
      sort_by: "vote_average.desc",
      "first_air_date.gte": dateOffset(-365),
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  popularMix: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/all/week", { page }),

  allTimeBest: async (page = 1): Promise<TMDBPage> => {
    const region = (await detectContentRegion()).code;
    return get<TMDBPage>("/discover/movie", {
      with_watch_providers: 8,
      watch_region: region,
      sort_by: "vote_average.desc",
      "vote_average.gte": 7,
      "vote_count.gte": 50,
      "primary_release_date.gte": dateOffset(-365),
      "primary_release_date.lte": TODAY,
      page,
    });
  },

  netflixOriginals: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 213,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  amazonPrime: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 1024,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  disneyPlus: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 2739,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  appleTVPlus: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 2552,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  hotstar: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 3919,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  marvelMCU: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_companies: 420,
      sort_by: "primary_release_date.desc",
      "primary_release_date.lte": TODAY,
      page,
    }),

  credits: (type: "movie" | "tv", id: number): Promise<{ cast: TMDBCastMember[] }> =>
    get<{ cast: TMDBCastMember[] }>(`/${type}/${id}/credits`),

  recommendations: (type: "movie" | "tv", id: number, page = 1): Promise<TMDBPage> =>
    getOptionalPage(`/${type}/${id}/recommendations`, page),

  similar: (type: "movie" | "tv", id: number, page = 1): Promise<TMDBPage> =>
    getOptionalPage(`/${type}/${id}/similar`, page),

  mgmPlus: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 4181,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  sonyLIV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 1109,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  mxPlayer: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 3236,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  // ─── Anime (TMDB genre 16, Japanese origin) ─────────────────────────────────
  animeTrending: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 16,
      with_origin_country: "JP",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  animeMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: 16,
      with_origin_country: "JP",
      sort_by: "primary_release_date.desc",
      "primary_release_date.lte": TODAY,
      page,
    }),

  animeTopRated: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 16,
      with_origin_country: "JP",
      "vote_average.gte": 8,
      "vote_count.gte": 200,
      sort_by: "vote_average.desc",
      page,
    }),

  animeNewSeason: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 16,
      with_origin_country: "JP",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  animeAction: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "16,10759",
      with_origin_country: "JP",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  // ─── Hindi content ────────────────────────────────────────────────────────
  hindiMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "hi",
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  hindiShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_original_language: "hi",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  hindiThrillers: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "hi",
      with_genres: 53,
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  hindiTopRated: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "hi",
      "vote_average.gte": 7,
      "vote_count.gte": 500,
      sort_by: "vote_average.desc",
      page,
    }),

  // ─── Web Series ────────────────────────────────────────────────────────────
  webSeriesIndia: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_original_language: "hi", sort_by: "popularity.desc", "first_air_date.lte": TODAY, "vote_count.gte": 20, page }),

  crimeWebSeries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "80,18", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  thrillerWebSeries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "53,18", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  actionWebSeries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "10759,18", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  romanceWebSeries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "10749,18", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  // ─── Manga / Manhwa ────────────────────────────────────────────────────────
  mangaAdaptations: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 16, with_origin_country: "JP", "vote_count.gte": 300, sort_by: "vote_count.desc", page }),

  manhwaContent: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 16, with_origin_country: "KR", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  animeRomance: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "16,10749", with_origin_country: "JP", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  animeMystery: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "16,9648", with_origin_country: "JP", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  animeFantasy: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: "16,14", with_origin_country: "JP", sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  // ─── Sports & Live TV ──────────────────────────────────────────────────────
  sportsDocumentaries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", { with_genres: 99, "vote_count.gte": 100, sort_by: "primary_release_date.desc", "primary_release_date.lte": TODAY, page }),

  sportsDramas: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", { with_genres: 18, "vote_average.gte": 7, "vote_count.gte": 500, sort_by: "primary_release_date.desc", "primary_release_date.lte": TODAY, page }),

  realityTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 10764, sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  talkShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 10767, sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  newsTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 10763, sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  warPolitics: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_genres: 10768, sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  // ─── Kids / Family content ────────────────────────────────────────────────
  kidsAnimation: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: 16,
      "vote_count.gte": 50,
      sort_by: "primary_release_date.desc",
      "primary_release_date.lte": TODAY,
      page,
    }),

  familyMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: 10751,
      sort_by: "primary_release_date.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  kidsTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10762",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  animationTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 16,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  pixarAndDreamworks: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "16,10751",
      "vote_average.gte": 6.5,
      "vote_count.gte": 200,
      sort_by: "vote_average.desc",
      page,
    }),

  kidsFantasy: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "14,10751",
      sort_by: "primary_release_date.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  kidsTrending: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/week", {
      with_genres: "16,10751",
      page,
    }),

  /**
   * Generic discover with arbitrary TMDb params — used by genre browser.
   * Pass any valid TMDb discover query parameters.
   */
  discoverWithParams: (
    type: "movie" | "tv" | "all",
    params: Record<string, string | number>,
    page = 1,
  ): Promise<TMDBPage> => {
    if (type === "all") {
      return get<TMDBPage>("/trending/all/week", { ...params, page });
    }
    return get<TMDBPage>(`/discover/${type}`, { ...params, page });
  },

  // ─── Named category rows ─────────────────────────────────────────────────

  /** Asian Movie & TV — origin countries JP, KR, CN, TH, IN, HK, TW */
  asianMovieTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "JP|KR|CN|TH|IN|HK|TW",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Romantic International TV Shows — romance + drama genre */
  romanticInternational: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749,18",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Young Adult — coming-of-age drama & fantasy movies */
  youngAdult: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "18,14",
      "primary_release_date.gte": "2005-01-01",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 100,
      sort_by: "popularity.desc",
      page,
    }),

  /** Opposites-Attract TV Shows — romance OR comedy dramas with relationship keywords.
   *  Uses | (OR) instead of , (AND) so shows only need one matching genre,
   *  guaranteeing a dense result set. Keywords 9836 (love) | 236411 (enemies to lovers)
   *  bubble the most thematically relevant titles to the top. */
  oppositesAttract: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749|35",
      with_keywords: "9836|236411|818",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Action & Adventure TV — genre 10759 */
  actionAdventure: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 10759,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Familiar Favourite Series — highly rated, universally recognised nostalgic
   *  international TV with 1 000+ votes so only proven classics surface. */
  familiarFavourites: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 8,
      "vote_count.gte": 1000,
      page,
    }),

  /** Your Next Watch — this week's trending TV across all genres. */
  yourNextWatch: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/tv/week", { page }),

  /** More Like "Can This Love Be Translated?" — Korean melodrama/romance. */
  moreLikeKoreanMelodrama: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: "10749|18",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** Romantic International TV Comedies — romance OR comedy from non-US origins,
   *  lower threshold so newer international titles are included. */
  romanticIntlComedies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749|35",
      without_origin_country: "US",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Erase My Memory So I Can Watch Again — universally acclaimed twist-heavy
   *  dramas and thrillers with ≥ 8.0 rating and strong vote base. */
  eraseMyMemory: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "18|53|9648",
      sort_by: "vote_average.desc",
      "vote_average.gte": 8,
      "vote_count.gte": 500,
      page,
    }),

  /** Hollywood Movies — US-origin films sorted by popularity. */
  hollywoodMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_origin_country: "US",
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 100,
      page,
    }),

  /** Celebrating Pride — LGBTQ+ themed TV content via keyword filter. */
  celebratingPride: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_keywords: "5989|13062|21175",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Romantic East Asian TV Shows — KR/JP/CN romance or drama series. */
  romanticEastAsian: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR|JP|CN",
      with_genres: "10749|18",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** Meet Your Next Binge — high-popularity mystery & thriller TV series. */
  meetNextBinge: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "9648|53",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 100,
      page,
    }),

  /** First Love Romance — romance/drama TV with first-love keyword signals. */
  firstLoveRomance: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749|18",
      with_keywords: "9673|14318|818",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** So Completely Captivating — prestige award-winning TV, offset to page 2 for variety. */
  soCompletelyCaptivating: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 8.0,
      "vote_count.gte": 1500,
      page: page + 1,
    }),

  /** Romantic Asian TV Shows — broad East/SE Asian romance TV. */
  romanticAsianTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR|JP|CN|TH|IN",
      with_genres: 10749,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** Korean Movies & TV Dubbed in Hindi — Korean content with Hindi spoken language. */
  koreanHindiContent: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_spoken_languages: "hi",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  /** K-Dramas Dubbed in Hindi — Korean drama series with Hindi audio available. */
  koreanDramasHindi: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: 18,
      with_spoken_languages: "hi",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      page,
    }),

  /** US TV Comedies — US-origin comedy series. */
  usTVComedies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "US",
      with_genres: 35,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Suspenseful TV Shows — thriller or mystery genre episodic series. */
  suspensefulTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "53|9648",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Romantic Shows — TV series with Romance genre ID 10749. */
  romanticShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 10749,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** Latest Movies — newly released feature films sorted by release date. */
  latestMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/movie/now_playing", {
      sort_by: "primary_release_date.desc",
      page,
    }),

  /** From K-Pop to K-Dramas — South Korean shows featuring idol actors or music dramas. */
  fromKPopToKDramas: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: "10402|18|35",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Made in India — Hindi language and Indian-origin local content. */
  madeInIndia: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "IN",
      with_original_language: "hi",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /* SOURCE_LOCK_START: legacy region top 10 shows query */
  /** Region-filtered Top 10-style shows, using provider availability, not TMDB Trending. */
  top10TrendingShowsIndia: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_watch_providers: "8|344",
      watch_region: "IN",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    }),
  /* SOURCE_LOCK_END: legacy region top 10 shows query */

  /** Bingeworthy TV Shows — newest highly-rated series (recent releases, not all-time). */
  bingeworthyTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_average.gte": 7.5,
      "vote_count.gte": 200,
      page,
    }),

  /** We Think You'll Love These — all-time critically acclaimed TV (hidden gems). */
  weThinkYoullLove: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 8.2,
      "vote_count.gte": 800,
      page,
    }),

  /** Can This Love be Translated — international cross-language romance TV shows. */
  canThisLoveBeTranslated: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749",
      with_original_language: "ko|ja|zh|fr|es|de|it|hi",
      sort_by: "popularity.desc",
      "vote_count.gte": 30,
      page,
    }),

  /** Critically Acclaimed US TV Dramas — top-rated American drama series. */
  criticallyAcclaimedUSDramas: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "18",
      with_origin_country: "US",
      sort_by: "vote_average.desc",
      "vote_count.gte": 300,
      page,
    }),

  /** Romantic TV Shows — romance genre TV series sorted by popularity. */
  romanticTVShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749",
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      page,
    }),

  /** Movies & TV Shows Dubbed in Telugu — Telugu-language content. */
  teluguContent: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_original_language: "te",
      sort_by: "popularity.desc",
      page,
    }),

  /** Swoonworthy Romance — highly-rated romance shows that make you feel all the feels. */
  swoonworthyRomance: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749|35",
      sort_by: "vote_average.desc",
      "vote_count.gte": 80,
      page,
    }),

  /** WWE & Sports Entertainment — action-packed sports and entertainment shows. */
  wweSports: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10759|10764",
      sort_by: "popularity.desc",
      "vote_count.gte": 20,
      page,
    }),

  /** Japanese TV Shows — popular Japanese live-action and drama series. */
  japaneseTVShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_original_language: "ja",
      with_origin_country: "JP",
      without_genres: "16",
      sort_by: "popularity.desc",
      "vote_count.gte": 20,
      page,
    }),

  /** Crowd Pleasers — action, crime & thriller fan-favourites everyone is watching. */
  crowdPleasers: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      sort_by: "popularity.desc",
      with_genres: "10759|80|53",
      "vote_count.gte": 500,
      "vote_average.gte": 7.0,
      page,
    }),

  /** TV Sci-Fi & Horror — science fiction and horror TV series combined. */
  sciFiHorrorTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10765|27",
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      page,
    }),

  /** Get In on the Action — high-octane action and adventure TV series. */
  getInOnAction: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10759|28",
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      page,
    }),

  /* SOURCE_LOCK_START: regional top 10 provider queries */
  /** Recent country-specific movies available through Netflix or Viki. */
  top10MoviesByRegion: (regionCode: string, page = 1): Promise<TMDBPage> => {
    const recentStart = dateOffset(-365);
    return get<TMDBPage>("/discover/movie", {
      with_watch_providers: "8|344",
      watch_region: regionCode,
      sort_by: "popularity.desc",
      "primary_release_date.gte": recentStart,
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    });
  },

  top10ShowsByRegion: (regionCode: string, page = 1): Promise<TMDBPage> => {
    const recentStart = dateOffset(-365);
    return get<TMDBPage>("/discover/tv", {
      with_watch_providers: "8|344",
      watch_region: regionCode,
      sort_by: "popularity.desc",
      "first_air_date.gte": recentStart,
      "first_air_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    });
  },

  /** India compatibility alias for older callers. */
  top10MoviesIndia: (page = 1): Promise<TMDBPage> => {
    const recentStart = dateOffset(-365);
    return get<TMDBPage>("/discover/movie", {
      with_watch_providers: "8|344",
      watch_region: "IN",
      sort_by: "popularity.desc",
      "primary_release_date.gte": recentStart,
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    });
  },
  /* SOURCE_LOCK_END: regional top 10 provider queries */

  // ─── Home category map — additional named rows ──────────────────────────
  // Each fetcher documents its genre / keyword / origin-country mapping so the
  // category → TMDB-query relationship in lib/categoryMap.ts stays auditable.

  /** Emotional Movie — high-rated Drama (genre 18), proxy for "tearjerker" content. */
  emotionalMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: 18,
      sort_by: "vote_average.desc",
      "vote_average.gte": 7,
      "vote_count.gte": 300,
      page,
    }),

  /** Eye Candy — visually spectacular Sci-Fi (878) OR Fantasy (14) blockbusters. */
  eyeCandyMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "878|14",
      sort_by: "popularity.desc",
      "vote_count.gte": 300,
      page,
    }),

  /** Hidden Gems — high vote_average but low vote_count, so blockbusters are excluded
   *  and only lesser-known, well-reviewed movies surface. */
  hiddenGems: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.2,
      "vote_count.gte": 50,
      "vote_count.lte": 800,
      page,
    }),

  /** Popular on Stream — this week's most popular movies worldwide. */
  popularOnStream: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      page,
    }),

  /** Mind-Bending Stories — Sci-Fi (878) AND Mystery (9648), the classic "plot twist" combo. */
  mindBendingStories: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "878,9648",
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      page,
    }),

  /** Psychological Thrillers — Thriller (53) AND Mystery (9648), keyword "psychological" (10944). */
  psychologicalThrillers: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "53,9648",
      with_keywords: "10944",
      sort_by: "popularity.desc",
      "vote_count.gte": 30,
      page,
    }),

  /** Everyone's Watching — today's single most-watched movie snapshot, global. */
  everyonesWatching: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/day", { page }),

  /** Global Top Picks — this week's worldwide trending movies (broader window than "Everyone's Watching"). */
  globalTopPicks: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/movie/week", { page }),

  /** Kids & Family — Family (10751) OR Animation (16) genre movies. */
  kidsFamily: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "10751|16",
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      page,
    }),

  /** Late Night Watch — Horror (27) OR Thriller (53), the after-dark genre pairing. */
  lateNightWatch: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "27|53",
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      page,
    }),

  /** Recent top-rated Netflix movies, rather than the all-time TMDB catalog. */
  imdbTopRated: (page = 1): Promise<TMDBPage> => tmdb.topRated(page),

  /** Leaving Soon — TMDB has no real "expiring" flag, so this is an honest proxy:
   *  well-rated older catalog titles (5–15 years old) rather than brand-new releases,
   *  the closest legitimate signal for "library titles that might rotate out". */
  leavingSoon: (page = 1): Promise<TMDBPage> => {
    const now = new Date();
    const oldEnd = `${now.getFullYear() - 5}-12-31`;
    const oldStart = `${now.getFullYear() - 15}-01-01`;
    return get<TMDBPage>("/discover/movie", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 6.5,
      "vote_count.gte": 200,
      "primary_release_date.gte": oldStart,
      "primary_release_date.lte": oldEnd,
      page,
    });
  },

  /** Because you liked — Korean romance & melodrama, personalisation proxy. */
  becauseYouLiked: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR",
      with_genres: "10749|18|35",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 50,
      page,
    }),

  /** Because You Watched — this week's trending TV (personalisation proxy). */
  becauseYouWatched: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/trending/tv/week", { page: page + 1 }),

  /** Dreams to you — romantic + fantasy TV shows, ethereal & emotional. */
  dreamsToYou: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: "10749|14",
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.5,
      "vote_count.gte": 50,
      "first_air_date.lte": TODAY,
      page,
    }),

  /** Only On Netflix shows — content from Netflix network (TMDB network ID 213). */
  onlyOnNetflix: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 213,
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      page,
    }),

  /** Get In on the Action (movies) — action & adventure feature films. */
  actionAdventureMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "28|12",
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      "primary_release_date.lte": TODAY,
      page,
    }),

  /** Top 5 show by Netflix Korean — Korean originals on Netflix by popularity. */
  top5NetflixKorean: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 213,
      with_origin_country: "KR",
      sort_by: "popularity.desc",
      "vote_count.gte": 30,
      page,
    }),

  /**
   * Only On S-Movie Original — prestige titles curated exclusively for this
   * platform: high-rated, recent, award-quality films that feel "originals-tier".
   */
  onlyOnSMovie: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.8,
      "vote_count.gte": 500,
      "primary_release_date.gte": `${new Date().getFullYear() - 4}-01-01`,
      "primary_release_date.lte": TODAY,
      page,
    }),

  /**
   * Personalised fetcher — returns content matching the user's top genre IDs.
   * Call as: tmdb.personalizedByGenres([10749, 18], "tv")(page)
   * Used by the "Top Picks For You" / "Your [Genre] Picks" row.
   */
  personalizedByGenres: (
    genreIds:  number[],
    mediaType: "movie" | "tv" = "movie",
  ) => (page = 1): Promise<TMDBPage> => {
    if (genreIds.length === 0) {
      // Cold start — fall back to weekly trending
      return mediaType === "tv"
        ? get<TMDBPage>("/trending/tv/week", { page })
        : get<TMDBPage>("/trending/movie/week", { page });
    }
    const endpoint = mediaType === "tv" ? "/discover/tv" : "/discover/movie";
    const genreStr = genreIds.slice(0, 3).join("|"); // OR logic — any matching genre
    const dateKey  = mediaType === "tv" ? "first_air_date.lte" : "primary_release_date.lte";
    const params: Record<string, string | number> = {
      with_genres:        genreStr,
      sort_by:            "vote_average.desc",
      "vote_average.gte": 7.0,
      "vote_count.gte":   50,
      page,
    };
    params[dateKey] = TODAY;
    return get<TMDBPage>(endpoint, params);
  },

  /* SOURCE_LOCK_START: Netflix India top 10 query */
  /**
   * Top 10 Movie in India Today — STRICTLY Netflix content (network 213) in India.
   * Merges Netflix movies (via watch provider) and Netflix TV (via network) for variety,
   * sorted by popularity so the most-watched titles surface first.
   */
  top10NetflixIndia: async (page = 1): Promise<TMDBPage> => {
    const [movies, shows] = await Promise.all([
      get<TMDBPage>("/discover/movie", {
        with_watch_providers: 8,   // Netflix watch provider ID
        watch_region: "IN",
        sort_by: "popularity.desc",
        "primary_release_date.lte": TODAY,
        "vote_count.gte": 10,
        page,
      }),
      get<TMDBPage>("/discover/tv", {
        with_networks: 213,         // Netflix network ID
        sort_by: "popularity.desc",
        "first_air_date.lte": TODAY,
        "vote_count.gte": 20,
        page,
      }),
    ]);
    const seen = new Set<number>();
    const merged: typeof movies.results = [];
    for (const m of [...movies.results, ...shows.results]) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
    }
    merged.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return { ...movies, results: merged.slice(0, 20) };
  },
  /* SOURCE_LOCK_END: Netflix India top 10 query */

  // ─── New category fetchers (90-row expansion) ────────────────────────────────

  /** Made in Korea — Netflix Korean-origin TV, sorted by popularity. */
  madeInKorea: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: NETFLIX_NETWORK_ID,
      with_origin_country: "KR",
      with_original_language: "ko",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** New on Netflix — Netflix originals sorted by air date (most recent first). */
  newOnNetflix: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: 213,
      sort_by: "first_air_date.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    }),

  /** Asian TV Shows — broad East/SE Asian TV (KR, JP, CN, TH, HK, TW, IN). */
  asianTVShows: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_origin_country: "KR|JP|CN|TH|HK|TW|IN",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /** Korean TV Action & Adventure — KR-origin action/adventure series. */
  koreanActionTV: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: NETFLIX_NETWORK_ID,
      with_origin_country: "KR",
      with_original_language: "ko",
      with_genres: 10759,
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Anime Series — top-rated Japanese animation TV, separate pool from trending. */
  animeSeries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_genres: 16,
      with_original_language: "ja",
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.5,
      "vote_count.gte": 100,
      "first_air_date.lte": TODAY,
      page,
    }),

  /** Indian Movies — Hindi-language feature films sorted by popularity. */
  indianMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "hi",
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 20,
      page,
    }),

  /** Romantic Indian Movies — Hindi romance feature films. */
  romanticIndianMovies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "hi",
      with_genres: 10749,
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    }),

  /** Desi & Chill — relaxed Hindi-language TV drama for casual viewing. */
  desiAndChill: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_original_language: "hi",
      sort_by: "popularity.desc",
      "first_air_date.lte": TODAY,
      "vote_count.gte": 10,
      page,
    }),

  /** Romantic Comedies — romcom movies (romance + comedy genre pairing). */
  romanticComedies: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_genres: "10749,35",
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 100,
      page,
    }),

  /** US Movies dubbed in Hindi — English-language films with Hindi spoken audio. */
  usMoviesDubbedInHindi: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_original_language: "en",
      with_spoken_languages: "hi",
      sort_by: "popularity.desc",
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 30,
      page,
    }),

  /* SOURCE_LOCK_START: worldwide top 10 queries */
  /** Top 10 Shows in All Country Today — Netflix TV globally, sorted by popularity. */
  top10ShowsAllCountries: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", { with_networks: 213, sort_by: "popularity.desc", "first_air_date.lte": TODAY, page }),

  /** Recent Netflix movies available in the detected region, sorted by popularity. */
  top10MoviesWorldwide: async (page = 1): Promise<TMDBPage> => {
    const region = (await detectContentRegion()).code;
    return get<TMDBPage>("/discover/movie", {
      with_watch_providers: 8,
      watch_region: region,
      sort_by: "popularity.desc",
      "primary_release_date.gte": dateOffset(-365),
      "primary_release_date.lte": TODAY,
      "vote_count.gte": 5,
      page,
    });
  },
  /* SOURCE_LOCK_END: worldwide top 10 queries */

  // ─── Netflix-Only Generic Fetchers (with_networks=213 / watch_provider=8) ────
  // These replace the open-catalog fetchers in categoryMap.ts so every row
  // exclusively shows Netflix content, as specified by the permanent algorithm.

  /**
   * Generic Netflix TV discover — with_networks=213 plus any extra params.
   * Usage: tmdb.netflixTV({ with_genres: "10749,18" })(page)
   */
  netflixTV: (extra: Record<string, string | number> = {}) =>
    (page = 1): Promise<TMDBPage> =>
      get<TMDBPage>("/discover/tv", {
        with_networks: NETFLIX_NETWORK_ID,
        sort_by: "popularity.desc",
        "first_air_date.lte": TODAY,
        "vote_count.gte": 5,
        ...extra,
        page,
      }),

  /* SOURCE_LOCK_START: trending source query */
  /** Home Trending: recent Netflix/Viki titles, never an open-catalog ranking. */
  trendingNow: (page = 1): Promise<TMDBPage> => tmdb.netflixTrending(page),
  /* SOURCE_LOCK_END: trending source query */

  /**
   * Strict Hero Banner catalog: only Netflix TV originals, newest first.
   * Keep this separate from the generic Netflix row helper so the hero can
   * never drift to movies, trending, or provider-only results.
   */
  netflixHero: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/tv", {
      with_networks: NETFLIX_NETWORK_ID,
      sort_by: "first_air_date.desc",
      "vote_count.gte": 50,
      "air_date.lte": "2026-12-31",
      page,
    }),

  /**
   * Hero pool: current/recent Netflix and Korean/Japanese/Chinese Viki series
   * available in the detected region. Results are tagged at the source.
   */
  /* HERO_LOCK_START: tmdb hero source query */
  heroBanner: async (
    page = 1,
    regionCode = getDeviceRegionCode(),
  ): Promise<TMDBPage> => {
    const asOfDate = new Date().toISOString().slice(0, 10);
    const recentStartDate = dateOffset(-365);
    const [netflixShows, netflixMovies, vikiKo, vikiJa, vikiZh] =
      await Promise.allSettled([
      get<TMDBPage>("/discover/tv", {
        with_networks: NETFLIX_NETWORK_ID,
        sort_by: "first_air_date.desc",
        "first_air_date.gte": recentStartDate,
        "first_air_date.lte": asOfDate,
        "vote_count.gte": 2,
        page,
      }),
      get<TMDBPage>("/discover/movie", {
        with_watch_providers: 8,
        watch_region: regionCode,
        sort_by: "primary_release_date.desc",
        "primary_release_date.gte": recentStartDate,
        "primary_release_date.lte": asOfDate,
        "vote_count.gte": 2,
        page,
      }),
      ...(["ko", "ja", "zh"] as const).map((language) =>
        get<TMDBPage>("/discover/tv", {
          with_watch_providers: RAKUTEN_VIKI_PROVIDER_ID,
          watch_region: regionCode,
          with_original_language: language,
          sort_by: "first_air_date.desc",
          "first_air_date.gte": recentStartDate,
          "first_air_date.lte": asOfDate,
          "vote_count.gte": 2,
          page,
        }),
      ),
    ]);
    return mergeProviderPages([
      { result: netflixShows, mediaType: "tv", source: "netflix" },
      { result: netflixMovies, mediaType: "movie", source: "netflix" },
      { result: vikiKo, mediaType: "tv", source: "viki" },
      { result: vikiJa, mediaType: "tv", source: "viki" },
      { result: vikiZh, mediaType: "tv", source: "viki" },
    ], "releaseDateDesc");
  },
  /* HERO_LOCK_END: tmdb hero source query */

  /**
   * Generic Netflix Movie discover — with_watch_providers=8 (Netflix) plus extra params.
   * Usage: tmdb.netflixMovie({ with_genres: 28 })(page)
   */
  netflixMovie: (extra: Record<string, string | number> = {}) =>
    (page = 1): Promise<TMDBPage> =>
      get<TMDBPage>("/discover/movie", {
        with_watch_providers: 8,
        watch_region: "IN",
        sort_by: "popularity.desc",
        "primary_release_date.lte": TODAY,
        "vote_count.gte": 5,
        ...extra,
        page,
      }),

  /**
   * Netflix classics — replaces the deprecated curated list 31574.
   * Discover keeps the feed on a standard Netflix network filter and avoids
   * the list endpoint's unauthorised response.
   */
  netflixClassics: (page = 1): Promise<TMDBPage> =>
    get<TMDBPage>("/discover/movie", {
      with_networks: NETFLIX_NETWORK_ID,
      sort_by: "vote_average.desc",
      "vote_count.gte": 100,
      "primary_release_date.lte": TODAY,
      page,
    }),

  /**
   * Netflix New Releases — combines newest Netflix-network TV series + movies
   * sorted by release date descending. The hero intentionally uses
   * with_networks=213 for both media types instead of generic trending or
   * watch-provider availability.
   */
  netflixNewReleasesAll: async (page = 1): Promise<TMDBPage> => {
    const [tv, movies] = await Promise.all([
      get<TMDBPage>("/discover/tv", {
        with_networks: NETFLIX_NETWORK_ID,
        sort_by: "first_air_date.desc",
        "first_air_date.lte": TODAY,
        "vote_count.gte": 100,
        page,
      }),
      get<TMDBPage>("/discover/movie", {
        with_networks: NETFLIX_NETWORK_ID,
        sort_by: "primary_release_date.desc",
        "primary_release_date.lte": TODAY,
        "vote_count.gte": 100,
        page,
      }),
    ]);
    const tvR     = (tv.results    ?? []).map((m) => ({ ...m, media_type: "tv"    }));
    const movieR  = (movies.results ?? []).map((m) => ({ ...m, media_type: "movie" }));
    const merged  = [...tvR, ...movieR].sort((a, b) => {
      const aD = a.first_air_date ?? (a as any).release_date ?? "";
      const bD = b.first_air_date ?? (b as any).release_date ?? "";
      return bD.localeCompare(aD);
    });
    const seen = new Set<number>();
    const unique = merged.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    return { ...tv, results: unique.slice(0, 40) };
  },

  /**
   * TV Recommendations factory — returns a standard (page) fetcher bound to a
   * specific TMDB TV show ID's /recommendations endpoint. Used for "Because You
   * Watched …" and named show rows (Goblin, Sweet Home, Lovely Runner, etc.).
   * Falls back gracefully: if the title has no recommendations, the row collapses.
   */
  tvRecommendations: (tvId: number) => (page = 1): Promise<TMDBPage> =>
    getOptionalPage(`/tv/${tvId}/recommendations`, page),

  /**
   * TMDB curated list by list ID — /3/list/{id}
   * Wraps the list response into the standard TMDBPage shape.
   */
  list: async (listId: number, page = 1): Promise<TMDBPage> => {
    const data = await get<{ items?: TMDBMovie[]; results?: TMDBMovie[]; total_results?: number; total_pages?: number }>(
      `/list/${listId}`,
      { page },
    );
    const results = data.items ?? data.results ?? [];
    return {
      results,
      page,
      total_pages: data.total_pages ?? 1,
      total_results: data.total_results ?? results.length,
    };
  },
};

/**
 * Server-only TMDB fetch. Use this in any file that previously made its own
 * direct TMDB fetch call so all API calls stay behind the API server.
 */
export async function tmdbGet<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  return get<T>(path, params);
}

export function tmdbToCard(m: TMDBMovie): {
  id: string;
  title: string;
  poster: { uri: string } | null;
  hero: { uri: string } | null;
  rating: string;
  genres: string[];
  year: number;
  synopsis: string;
  tmdbRating: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  poster_path: string | null;
  backdrop_path: string | null;
  /* HERO_LOCK_START: TMDB hero card source type */
  heroSource?: TMDBMovie["hero_source"];
  /* HERO_LOCK_END: TMDB hero card source type */
} {
  const posterUrl = tmdbImg(m.poster_path, "w342");
  const heroUrl = tmdbImg(m.backdrop_path, "w780");
  const title = m.title ?? m.name ?? "Untitled";
  const genres = (m.genre_ids ?? [])
    .slice(0, 3)
    .map((id) => GENRE_MAP[id] ?? "")
    .filter(Boolean);
  const year = parseInt(
    (m.release_date ?? m.first_air_date ?? "2024").slice(0, 4),
  );
  const mediaType: "movie" | "tv" =
    m.media_type === "tv" || (m.media_type !== "movie" && m.name) ? "tv" : "movie";
  return {
    id: `tmdb-${m.id}`,
    title,
    poster: posterUrl ? { uri: posterUrl } : null,
    hero: heroUrl ? { uri: heroUrl } : null,
    rating: "TV-MA",
    genres,
    year,
    synopsis: m.overview,
    tmdbRating: Math.round(m.vote_average * 10) / 10,
    tmdbId: m.id,
    mediaType,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    heroSource: m.hero_source,
  };
}
