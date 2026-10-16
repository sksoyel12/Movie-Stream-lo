/**
 * backgroundPrefetch — Zero-latency stream pre-fetching.
 *
 * When a user taps a poster on the home screen, we immediately start racing
 * 50+ stream sources in the background while they browse the detail page.
 * By the time they tap "Play", the stream URL is already resolved.
 *
 * Usage:
 *   // In MovieRow onPress (before router.push):
 *   prefetchStream(tmdbId, "movie");
 *
 *   // In player.tsx (consume the result):
 *   const cached = consumePrefetch(tmdbId, "movie");
 */

// ─── In-memory prefetch store ──────────────────────────────────────────────────
interface PrefetchEntry {
  url: string;
  source: string;
  fetchedAt: number;
}

const store = new Map<string, Promise<PrefetchEntry | null>>();
const results = new Map<string, PrefetchEntry | null>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function makeKey(tmdbId: number, type: "movie" | "tv", season?: number, episode?: number): string {
  if (type === "tv" && season != null && episode != null) {
    return `tv-${tmdbId}-s${season}-e${episode}`;
  }
  return `${type}-${tmdbId}`;
}

// ─── Tier-1 fastest embed sources ─────────────────────────────────────────────
const TIER1_MOVIE_URLS = (id: number): string[] => [
  `https://vidsrc.to/embed/movie/${id}`,
  `https://embed.su/embed/movie/${id}`,
  `https://vidsrc.me/embed/movie?tmdb=${id}`,
  `https://embed.smashystream.com/playere.php?tmdb=${id}`,
  `https://fmovies-hd.to/embed/movie/${id}`,
  `https://hdtodayz.net/embed/movie/${id}`,
  `https://moviesapi.club/movie/${id}`,
  `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  `https://autoembed.co/embed/movie/${id}`,
  `https://www.2embed.cc/embed/${id}`,
  `https://rivestream.ru/embed/movie/${id}`,
  `https://nepu.to/embed/movie?tmdb=${id}`,
  `https://vidlink.pro/movie/${id}`,
  `https://vidbinge.dev/embed/movie/${id}`,
  `https://superembed.stream/embed/movie/${id}`,
  `https://flickystream.su/embed/movie/${id}`,
  `https://cineby.sc/movie/${id}`,
  `https://willowmovies.com/embed/movie/${id}`,
  `https://xprime.stream/embed/movie/${id}`,
  `https://donkey.to/embed/movie/${id}`,
  `https://rogmovies.cv/embed/movie/${id}`,
  `https://sflix.fi/embed/movie/${id}`,
  `https://bcine.app/embed/movie/${id}`,
  `https://67movies.net/embed/movie/${id}`,
  `https://streamex.sh/embed/movie/${id}`,
  `https://shuttletv.su/embed/movie/${id}`,
];

const TIER1_TV_URLS = (id: number, s: number, e: number): string[] => [
  `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  `https://embed.su/embed/tv/${id}/${s}/${e}`,
  `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  `https://fmovies-hd.to/embed/tv/${id}/${s}/${e}`,
  `https://hdtodayz.net/embed/tv/${id}/${s}/${e}`,
  `https://moviesapi.club/tv/${id}-${s}-${e}`,
  `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  `https://autoembed.co/embed/tv/${id}/${s}/${e}`,
  `https://rivestream.ru/embed/tv/${id}/${s}/${e}`,
  `https://nepu.to/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  `https://vidlink.pro/tv/${id}/${s}/${e}`,
  `https://superembed.stream/embed/tv/${id}/${s}/${e}`,
];

const ANIME_URLS = (id: number, s: number, e: number): string[] => [
  `https://hianime.cv/embed/tv/${id}/${s}/${e}`,
  `https://animekai.to/embed/tv/${id}/${s}/${e}`,
  `https://9anime.cl/embed/tv/${id}/${s}/${e}`,
  `https://animepahe.pw/embed/tv/${id}/${s}/${e}`,
  `https://animesuge.cz/embed/tv/${id}/${s}/${e}`,
];

/** Probe a single URL with a 1500ms timeout. */
async function probe(url: string, timeoutMs = 1500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    if (res.ok || res.status === 200 || res.status === 302) return url;
    return null;
  } catch {
    return null;
  }
}

/**
 * Race all T1 sources with Promise.any — returns the fastest responding URL.
 * Falls back to the first URL in the list (optimistic — the embed will handle errors).
 */
async function raceT1(urls: string[]): Promise<PrefetchEntry> {
  const t0 = Date.now();
  try {
    const winner = await Promise.any(
      urls.map((url) => probe(url, 1500).then((r) => (r ? r : Promise.reject()))),
    );
    return { url: winner, source: "T1-race", fetchedAt: t0 };
  } catch {
    // All probes failed / timed out — return first URL optimistically
    return { url: urls[0], source: "T1-optimistic", fetchedAt: t0 };
  }
}

/**
 * Start pre-fetching stream sources for a given TMDB ID.
 * Safe to call multiple times — deduplicates by key.
 *
 * @param tmdbId   TMDB movie or TV show ID
 * @param type     "movie" | "tv"
 * @param isAnime  True → also race anime-specific sources
 * @param season   TV season (defaults to 1)
 * @param episode  TV episode (defaults to 1)
 */
export function prefetchStream(
  tmdbId: number,
  type: "movie" | "tv",
  {
    isAnime = false,
    season = 1,
    episode = 1,
  }: { isAnime?: boolean; season?: number; episode?: number } = {},
): void {
  if (!tmdbId) return;
  const key = makeKey(tmdbId, type, type === "tv" ? season : undefined, type === "tv" ? episode : undefined);

  // Already prefetching or cached
  if (store.has(key)) {
    const cached = results.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
  }

  const urls =
    type === "movie"
      ? TIER1_MOVIE_URLS(tmdbId)
      : [
          ...TIER1_TV_URLS(tmdbId, season, episode),
          ...(isAnime ? ANIME_URLS(tmdbId, season, episode) : []),
        ];

  const promise = raceT1(urls).then((entry) => {
    results.set(key, entry);
    return entry;
  }).catch(() => {
    results.set(key, null);
    return null;
  });

  store.set(key, promise);
}

/**
 * Consume a prefetched stream result.
 * Returns null if not yet resolved or not prefetched.
 * Clears the cache entry after consumption (one-shot).
 */
export function consumePrefetch(
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
): PrefetchEntry | null {
  const key = makeKey(tmdbId, type, type === "tv" ? season : undefined, type === "tv" ? episode : undefined);
  const entry = results.get(key) ?? null;
  if (entry) {
    // Expire after TTL
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      results.delete(key);
      store.delete(key);
      return null;
    }
    results.delete(key);
    store.delete(key);
  }
  return entry;
}

/**
 * Await a prefetched result.
 * Returns null if prefetch was never started.
 */
export async function awaitPrefetch(
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
): Promise<PrefetchEntry | null> {
  const key = makeKey(tmdbId, type, type === "tv" ? season : undefined, type === "tv" ? episode : undefined);
  const promise = store.get(key);
  if (!promise) return null;
  return promise;
}
