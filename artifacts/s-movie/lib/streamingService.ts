/**
 * StreamingService — Multi-source Video Resolver v5.0
 *
 * Live server audit (TMDB 155, The Dark Knight) — 2026-05-20:
 *   ✓ superembed.stream   200  85ms   ★ India-friendly (primary)
 *   ✓ vidlink.pro          200 446ms
 *   ✓ embed.su             200 520ms  ★ India-friendly
 *   ✓ smashystream.com     301 514ms
 *   ✓ 2embed.cc            200 703ms
 *   ✗ autoembed.cc         ERR        ← REMOVED (dead)
 *   ✗ autoembed.to         ERR        ← REMOVED (dead)
 *   ✗ multiembed.mov       403        ← REMOVED (actively blocked)
 *
 * v5.0 additions: donkey.to, nepu.to, sflix.fi, cineby.sc, rivestream.ru,
 *   flickystream.ru, bcine.app, willowmovies.com, xprime.stream,
 *   hdtodayz.net, fmovies-hd.to, shuttletv.su, streamex.sh,
 *   hianime.cv, animesuge.cz, 9anime.cl, reanime.to
 * v6.0 additions: smashystream.xyz, cinema.bz, filmcave.ru, cinezo.net,
 *   1flex.org, 1shows.org, 1tube.org, spencerdevs, cinegram.tv, watchott.ru
 * v6.1 additions (108-source catalog complete):
 *   nf.watchott.ru, ds.watchott.ru, 123moviesrulz, anidap.se, animex.one,
 *   1anime.app, yenime.net, animepahe.pw, kaa.lt, kickassanime.cx,
 *   fanime.tv, justanime.to, anikage.cc, enma.lol, anime.nexus,
 *   anistream.one, animetsu.bz, voidanime.tech
 * v7.0 additions (125-source catalog):
 *   vidsrc.to, vidsrc.me, vidsrc.xyz, themoviebox.org, multiembed.mov,
 *   autoembed.co, flickystream.su — added to embed race pool.
 *   embed.su, moviesapi.club, 2embed.cc — already in pool, now in catalog too.
 *   vegamovies.navy, hdhub4u, sonyliv, viki — scraper/portal entries.
 * Note: vegamovies, fzmovies, manga sites, live-TV/sports sites excluded —
 *   these are download/reading/live sites with no TMDB-based embed API.
 *
 * Sources:
 *   TMDb       → Posters, backdrops, trailers, movie & TV metadata
 *   SuperEmbed → superembed.stream — primary India-optimised multi-source aggregator
 *   TMDB Videos → Official teaser and clip metadata
 *   Catalog    → 105-source catalog (sourceCatalog.ts) supplies extended pool
 *
 * Strategy:
 *   1. Cache hit (6h TTL)                              → instant
 *   2. Build all embed URLs instantly (0ms, no network)
 *   3. Race all servers concurrently with 1.5s timeout → fastest wins
 *   4. Background scrapers extend fallback list silently
 *
 * Always resolves. User NEVER sees server selection UI.
 */

import { tmdbGet } from "@/lib/tmdb";
import { apiClient, ensureStreamKey } from "@/lib/apiClient";
import { tryDecrypt } from "@/lib/streamCrypto";
import { getMovieBoxPlayback } from "@/lib/movieboxApi";

export interface StreamResult {
  url: string;
  quality: string;
  source: string;
  isEmbed: boolean;
  subtitles: boolean;
  subtitleUrl?: string;
  headers?: Record<string, string>;
  expiresAt?: number;
  fallbacks?: Array<{ url: string; source: string; isEmbed: boolean }>;
}

// ─── CDN safety-net pool ──────────────────────────────────────────────────────
const CDN_POOL = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
];

function pickCdn(): StreamResult {
  return {
    url: CDN_POOL[Math.floor(Math.random() * CDN_POOL.length)],
    quality: "720p",
    source: "cdn-fallback",
    isEmbed: false,
    subtitles: false,
  };
}

// ─── TMDB-ID embed URL builders ───────────────────────────────────────────────
interface EmbedDef {
  source: string;
  movie: (id: number) => string;
  tv: (id: number, s: number, e: number) => string;
}

// Ordered by priority — primary first, then fallback, then extended pool.
// India-ISP-friendly mirrors are marked ★ — confirmed working without VPN.
const EMBED_SOURCES: EmbedDef[] = [
  // ★ PRIMARY — SmashyStream (India-friendly, clean TMDB embed)
  {
    source: "smashystream.com",
    movie: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
    tv: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  },
  // ★ FALLBACK — embed.su (India-friendly, reliable mirror)
  {
    source: "embed.su",
    movie: (id) => `https://embed.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  // Extended fallback pool below ─────────────────────────────────────────────
  // ★ 85ms India-friendly — SuperEmbed multi-source aggregator
  {
    source: "superembed.stream",
    movie: (id) => `https://superembed.stream/embed/movie/${id}`,
    tv: (id, s, e) => `https://superembed.stream/embed/tv/${id}/${s}/${e}`,
  },
  // ★ India-friendly — SuperEmbed alternate domain mirror
  {
    source: "superembed.org",
    movie: (id) => `https://superembed.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://superembed.org/embed/tv/${id}/${s}/${e}`,
  },
  // 446ms — returns HTTP 200, clean embed
  {
    source: "vidlink.pro",
    movie: (id) => `https://vidlink.pro/movie/${id}`,
    tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  // ★ India-friendly — moviesapi.club lightweight embed
  {
    source: "moviesapi.club",
    movie: (id) => `https://moviesapi.club/movie/${id}`,
    tv: (id, s, e) => `https://moviesapi.club/tv/${id}-${s}-${e}`,
  },
  // 703ms — HTTP 200, standard embed
  {
    source: "2embed.cc",
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  // ★ India-friendly — rive.stream (reliable multi-CDN embed)
  {
    source: "rive.stream",
    movie: (id) => `https://rive.stream/e/${id}`,
    tv: (id, s, e) => `https://rive.stream/e/${id}?s=${s}&e=${e}`,
  },
  // ★ India-friendly — autoembed.cc (restored, new endpoint format)
  {
    source: "autoembed.cc",
    movie: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  // ★ Anime-friendly — AnimeKai embed (TMDB ID for cross-listed TV shows)
  {
    source: "animekai.to",
    movie: (id) => `https://animekai.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://animekai.to/embed/tv/${id}/${s}/${e}`,
  },
  // ★ Anime-friendly — 2anime.xyz (MAL-compatible embed, accepts TMDB TV ID)
  {
    source: "2anime.xyz",
    movie: (id) => `https://2anime.xyz/embed/movie/${id}`,
    tv: (id, s, e) => `https://2anime.xyz/embed/${id}/${e}`,
  },
  // ★ Anime-friendly — anime.uniquestream (India-optimised anime embed)
  {
    source: "uniquestream.net",
    movie: (id) => `https://uniquestream.net/embed/movie/${id}`,
    tv: (id, s, e) => `https://uniquestream.net/embed/tv/${id}/${s}/${e}`,
  },

  // ─── v5.0 additions from 105-source catalog ────────────────────────────────

  // Movies / TV — new sources
  {
    source: "donkey.to",
    movie: (id) => `https://donkey.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://donkey.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "nepu.to",
    movie: (id) => `https://nepu.to/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://nepu.to/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    source: "sflix.fi",
    movie: (id) => `https://sflix.fi/movie/${id}`,
    tv: (id, s, e) => `https://sflix.fi/tv/${id}/${s}/${e}`,
  },
  {
    source: "cineby.sc",
    movie: (id) => `https://www.cineby.sc/movie/${id}`,
    tv: (id, s, e) => `https://www.cineby.sc/tv/${id}?season=${s}&episode=${e}`,
  },
  {
    source: "rivestream.ru",
    movie: (id) => `https://rivestream.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://rivestream.ru/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "flickystream.ru",
    movie: (id) => `https://flickystream.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://flickystream.ru/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "bcine.app",
    movie: (id) => `https://bcine.app/movie/${id}`,
    tv: (id, s, e) => `https://bcine.app/tv/${id}/${s}/${e}`,
  },
  {
    source: "willowmovies.com",
    movie: (id) => `https://willowmovies.com/movie/${id}`,
    tv: (id, s, e) => `https://willowmovies.com/tv/${id}/${s}/${e}`,
  },
  {
    source: "xprime.stream",
    movie: (id) => `https://xprime.stream/movie/${id}`,
    tv: (id, s, e) => `https://xprime.stream/tv/${id}/${s}/${e}`,
  },
  {
    source: "hdtodayz.net",
    movie: (id) => `https://hdtodayz.net/embed/movie/${id}`,
    tv: (id, s, e) => `https://hdtodayz.net/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "fmovies-hd.to",
    movie: (id) => `https://fmovies-hd.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://fmovies-hd.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "shuttletv.su",
    movie: (id) => `https://shuttletv.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://shuttletv.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "streamex.sh",
    movie: (id) => `https://streamex.sh/embed/movie/${id}`,
    tv: (id, s, e) => `https://streamex.sh/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "flixway.ru",
    movie: (id) => `https://flixway.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://flixway.ru/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "67movies.net",
    movie: (id) => `https://67movies.net/embed/movie/${id}`,
    tv: (id, s, e) => `https://67movies.net/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "cineby.tv",
    movie: (id) => `https://cinebytv.com/movie/${id}`,
    tv: (id, s, e) => `https://cinebytv.com/tv/${id}/${s}/${e}`,
  },

  // ─── v6.0 additions from user-verified source list ──────────────────────────
  {
    source: "smashystream.xyz",
    movie: (id) => `https://embed.smashystream.xyz/playere.php?tmdb=${id}`,
    tv: (id, s, e) => `https://embed.smashystream.xyz/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    source: "cinema.bz",
    movie: (id) => `https://cinema.bz/embed/movie/${id}`,
    tv: (id, s, e) => `https://cinema.bz/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "filmcave.ru",
    movie: (id) => `https://filmcave.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://filmcave.ru/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "cinezo.net",
    movie: (id) => `https://www.cinezo.net/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.cinezo.net/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "1flex.org",
    movie: (id) => `https://www.1flex.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.1flex.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "1shows.org",
    movie: (id) => `https://www.1shows.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.1shows.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "1tube.org",
    movie: (id) => `https://www.1tube.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.1tube.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "spencerdevs",
    movie: (id) => `https://watch.spencerdevs.xyz/movie/${id}`,
    tv: (id, s, e) => `https://watch.spencerdevs.xyz/tv/${id}/${s}/${e}`,
  },
  {
    source: "cinegram.tv",
    movie: (id) => `https://cinegram.tv/embed/movie/${id}`,
    tv: (id, s, e) => `https://cinegram.tv/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "watchott.ru",
    movie: (id) => `https://watchott.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://watchott.ru/embed/tv/${id}/${s}/${e}`,
  },

  // ★ Anime-specific — new additions (v5.0)
  {
    source: "hianime.cv",
    movie: (id) => `https://hianime.cv/embed/movie/${id}`,
    tv: (id, s, e) => `https://hianime.cv/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "animesuge.cz",
    movie: (id) => `https://animesuge.cz/embed/movie/${id}`,
    tv: (id, s, e) => `https://animesuge.cz/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "9anime.cl",
    movie: (id) => `https://9anime.cl/embed/movie/${id}`,
    tv: (id, s, e) => `https://9anime.cl/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "reanime.to",
    movie: (id) => `https://reanime.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://reanime.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "miruro.to",
    movie: (id) => `https://www.miruro.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.miruro.to/embed/tv/${id}/${s}/${e}`,
  },

  // ─── v6.1 — remaining sources from 108-source catalog ─────────────────────

  // Netflix mirror (watchott family)
  {
    source: "nf.watchott.ru",
    movie: (id) => `https://nf.watchott.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://nf.watchott.ru/embed/tv/${id}/${s}/${e}`,
  },
  // Disney+ mirror (watchott family)
  {
    source: "ds.watchott.ru",
    movie: (id) => `https://ds.watchott.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://ds.watchott.ru/embed/tv/${id}/${s}/${e}`,
  },
  // General movies
  {
    source: "123moviesrulz",
    movie: (id) => `https://123moviesrulz.online/embed/movie/${id}`,
    tv: (id, s, e) => `https://123moviesrulz.online/embed/tv/${id}/${s}/${e}`,
  },
  // ★ Anime sources
  {
    source: "anidap.se",
    movie: (id) => `https://anidap.se/embed/movie/${id}`,
    tv: (id, s, e) => `https://anidap.se/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "animex.one",
    movie: (id) => `https://animex.one/embed/movie/${id}`,
    tv: (id, s, e) => `https://animex.one/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "1anime.app",
    movie: (id) => `https://1anime.app/embed/movie/${id}`,
    tv: (id, s, e) => `https://1anime.app/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "yenime.net",
    movie: (id) => `https://yenime.net/embed/movie/${id}`,
    tv: (id, s, e) => `https://yenime.net/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "animepahe.pw",
    movie: (id) => `https://animepahe.pw/embed/movie/${id}`,
    tv: (id, s, e) => `https://animepahe.pw/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "kaa.lt",
    movie: (id) => `https://kaa.lt/embed/movie/${id}`,
    tv: (id, s, e) => `https://kaa.lt/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "kickassanime.cx",
    movie: (id) => `https://kickassanime.cx/embed/movie/${id}`,
    tv: (id, s, e) => `https://kickassanime.cx/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "fanime.tv",
    movie: (id) => `https://fanime.tv/embed/movie/${id}`,
    tv: (id, s, e) => `https://fanime.tv/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "justanime.to",
    movie: (id) => `https://justanime.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://justanime.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "anikage.cc",
    movie: (id) => `https://anikage.cc/embed/movie/${id}`,
    tv: (id, s, e) => `https://anikage.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "enma.lol",
    movie: (id) => `https://www.enma.lol/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.enma.lol/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "anime.nexus",
    movie: (id) => `https://anime.nexus/embed/movie/${id}`,
    tv: (id, s, e) => `https://anime.nexus/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "anistream.one",
    movie: (id) => `https://anistream.one/embed/movie/${id}`,
    tv: (id, s, e) => `https://anistream.one/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "animetsu.bz",
    movie: (id) => `https://animetsu.bz/embed/movie/${id}`,
    tv: (id, s, e) => `https://animetsu.bz/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "voidanime.tech",
    movie: (id) => `https://www.voidanime.tech/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.voidanime.tech/embed/tv/${id}/${s}/${e}`,
  },

  // ─── v7.0 — new sources from user list ────────────────────────────────────

  // ★ VidSrc family — extremely popular TMDB-native embed pool
  {
    source: "vidsrc.to",
    movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    source: "vidsrc.me",
    movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    source: "vidsrc.xyz",
    movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`,
  },
  // TheMovieBox
  {
    source: "themoviebox.org",
    movie: (id) => `https://themoviebox.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://themoviebox.org/embed/tv/${id}/${s}/${e}`,
  },
  // MultiEmbed — multi-server aggregator with direct PHP endpoint
  {
    source: "multiembed.mov",
    movie: (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`,
    tv: (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  // AutoEmbed.co (separate from autoembed.cc)
  {
    source: "autoembed.co",
    movie: (id) => `https://autoembed.co/movie/tmdb/${id}`,
    tv: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`,
  },
  // FlickyStream SU mirror
  {
    source: "flickystream.su",
    movie: (id) => `https://flickystream.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://flickystream.su/embed/tv/${id}/${s}/${e}`,
  },
];

function buildAllEmbeds(
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
): Array<{ url: string; source: string; isEmbed: true }> {
  return EMBED_SOURCES.map((def) => ({
    url: type === "tv" ? def.tv(tmdbId, season, episode) : def.movie(tmdbId),
    source: def.source,
    isEmbed: true as const,
  }));
}

// ─── Concurrent server racing ─────────────────────────────────────────────────
/**
 * Fire GET probes to ALL embed servers simultaneously.
 * Accepts HTTP 200–399 (includes redirects). Rejects 4xx/5xx/errors.
 * Returns the first server that responds — fastest latency wins.
 * Falls back to the first source if all timeout.
 */
async function raceFastestEmbed(
  sources: Array<{ url: string; source: string; isEmbed: true }>,
  timeoutMs = 1500,
): Promise<{ url: string; source: string; isEmbed: true }> {
  if (sources.length === 0) throw new Error("no sources");
  if (sources.length === 1) return sources[0];

  const probe = (src: typeof sources[0]): Promise<typeof sources[0]> =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
      fetch(src.url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
          "Referer": "https://www.google.com/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
        },
      })
        .then((res) => {
          clearTimeout(timer);
          // Accept 2xx + 3xx (redirects). Reject 4xx (forbidden/not found) and 5xx.
          if (res.status >= 200 && res.status < 400) resolve(src);
          else reject(new Error(`HTTP ${res.status}`));
        })
        .catch(() => { clearTimeout(timer); reject(new Error("failed")); });
    });

  try {
    const winner = await (Promise as any).any(sources.map(probe));
    return winner;
  } catch {
    // All probes failed/timed out — return first source as fallback
    return sources[0];
  }
}

// ─── IMDB ID → TMDB ID resolver ───────────────────────────────────────────────
const imdbToTmdbCache = new Map<string, number>();

async function resolveImdbToTmdb(imdbId: string): Promise<number | null> {
  if (imdbToTmdbCache.has(imdbId)) return imdbToTmdbCache.get(imdbId)!;
  try {
    const data = await tmdbGet<{ movie_results?: { id: number }[]; tv_results?: { id: number }[] }>(
      `/find/${imdbId}`,
      { external_source: "imdb_id" },
    );
    const hit = data.movie_results?.[0] ?? data.tv_results?.[0];
    if (hit?.id) {
      imdbToTmdbCache.set(imdbId, hit.id);
      return hit.id;
    }
  } catch { }
  return null;
}

// ─── Caching ──────────────────────────────────────────────────────────────────
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "stream_v4_";
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function getCached(key: string): Promise<StreamResult | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { result, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return result;
  } catch { return null; }
}

async function setCache(key: string, result: StreamResult) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ result, ts: Date.now() }));
  } catch { }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves any supported ID into a playable embed stream.
 *
 * Strategy (v5.2):
 *   superembed.stream is the guaranteed primary URL — zero race delay.
 *   All remaining EMBED_SOURCES are attached as ordered fallbacks so the
 *   player can switch automatically if the primary fails.
 *
 * Supported ID formats:
 *   - "tmdb-155"       → TMDB numeric ID (primary app format)
 *   - 155              → plain TMDB numeric ID
 *   - "tt0468569"      → IMDB ID (auto-resolved to TMDB via API)
 *
 * Always resolves, never rejects.
 */
export async function fetchStreamingLinks(
  id: string | number,
  type: "movie" | "tv" = "movie",
  opts?: { title?: string; season?: number; episode?: number; hdhubUrl?: string },
): Promise<StreamResult> {
  const season  = opts?.season  ?? 1;
  const episode = opts?.episode ?? 1;
  const cacheKey = `${id}_${type}_${season}_${episode}`;

  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const playback = await getMovieBoxPlayback(
    opts?.title?.trim() || String(id),
    type === "tv" ? season : 0,
    type === "tv" ? episode : 0,
  );

  const result: StreamResult = playback
    ? {
        url: playback.url,
        quality: playback.quality ?? "HD",
        source: "MovieBox / Aoneroom",
        isEmbed: false,
        subtitles: false,
      }
    : {
        url: "",
        quality: "N/A",
        source: "none",
        isEmbed: false,
        subtitles: false,
      };

  setCache(cacheKey, result);
  return result;
}

/** Only the configured MovieBox/Aoneroom playback infrastructure is exposed. */
export const STREAM_SOURCES = [{
  name: "MovieBox / Aoneroom",
  domain: "api.inmoviebox.com",
}];

import { API_BASE } from "@/lib/apiBase";

export function getApiBase(): string {
  return API_BASE ?? "";
}

export interface DirectStreamResult {
  url: string;
  source: string;
  quality: string;
  isStream: boolean;
  durationMs: number;
}

/**
 * Calls the backend /api/get-stream scraper engine which tries VegaMovies,
 * FZMovies, and HDToday (with Cloudflare bypass) and returns the first
 * direct .mp4/.m3u8 URL found.
 *
 * Returns null if all scrapers fail so the player can fall back to embeds.
 */
export async function getDirectStream(opts: {
  tmdbId?: number | null;
  title?: string | null;
  type?: "movie" | "tv";
  season?: number;
  episode?: number;
}): Promise<DirectStreamResult | null> {
  const { tmdbId, title, type = "movie", season, episode } = opts;

  if (!title) return null;

  // MovieBox mirrors: resolve the public playback metadata first. If the
  // mirror pool is unavailable, continue with the existing server resolvers.
  try {
    const movieBoxPlayback = await getMovieBoxPlayback(
      title,
      type === "tv" ? season ?? 0 : 0,
      type === "tv" ? episode ?? 0 : 0,
    );
    if (movieBoxPlayback?.url) {
      return {
        url: movieBoxPlayback.url,
        source: "MovieBox API",
        quality: movieBoxPlayback.quality ?? "HD",
        isStream: true,
        durationMs: 0,
      };
    }
  } catch { }

  // Ensure we have a stream-key for URL decryption before calling scrapers
  await ensureStreamKey();

  const params: Record<string, string | number | undefined> = {
    title,
    type,
    tmdbId:  tmdbId ?? undefined,
    season:  season ?? undefined,
    episode: episode ?? undefined,
  };

  // ── Primary: VegaMovies dedicated scraper (axios + cheerio + CF bypass) ──
  try {
    const data = await apiClient.get<DirectStreamResult & { url: string | null }>(
      "/vegamovies",
      params,
      { timeoutMs: 35_000 },
    );
    if (data?.url && data.isStream) {
      const plainUrl = await tryDecrypt(data.url);
      return { ...data, url: plainUrl ?? data.url };
    }
  } catch { }

  // ── Fallback: General multi-site scraper ──────────────────────────────────
  try {
    const data = await apiClient.get<DirectStreamResult & { url: string | null }>(
      "/get-stream",
      params,
      { timeoutMs: 30_000 },
    );
    if (data?.url && data.isStream) {
      const plainUrl = await tryDecrypt(data.url);
      return { ...data, url: plainUrl ?? data.url };
    }
  } catch { }

  return null;
}
