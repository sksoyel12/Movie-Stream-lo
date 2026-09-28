/**
 * AnimeService — Dedicated anime stream resolver
 *
 * Strategy:
 *   1. Build embed URLs for all anime-category sources from the catalog
 *   2. Race them concurrently (1.8s timeout — slightly looser than movie race)
 *   3. Fall back to general streamingService embed pool if all anime sources fail
 *
 * All results feed the same <Video> / WebView player. No extra UI needed.
 */

import { buildEmbedUrls } from "./sourceCatalog";
import { fetchStreamingLinks, type StreamResult } from "./streamingService";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ANIME_CACHE_PREFIX = "anime_v1_";
const ANIME_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getAnimeCached(key: string): Promise<StreamResult | null> {
  try {
    const raw = await AsyncStorage.getItem(ANIME_CACHE_PREFIX + key);
    if (!raw) return null;
    const { result, ts } = JSON.parse(raw);
    if (Date.now() - ts > ANIME_CACHE_TTL) {
      await AsyncStorage.removeItem(ANIME_CACHE_PREFIX + key);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

async function setAnimeCache(key: string, result: StreamResult) {
  try {
    await AsyncStorage.setItem(
      ANIME_CACHE_PREFIX + key,
      JSON.stringify({ result, ts: Date.now() }),
    );
  } catch {}
}

async function raceAnimeSources(
  sources: Array<{ url: string; source: string; isEmbed: true }>,
  timeoutMs = 1800,
): Promise<{ url: string; source: string; isEmbed: true }> {
  if (sources.length === 0) throw new Error("no anime sources");
  if (sources.length === 1) return sources[0];

  const probe = (
    src: (typeof sources)[0],
  ): Promise<(typeof sources)[0]> =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, timeoutMs);
      fetch(src.url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
        },
      })
        .then((res) => {
          clearTimeout(timer);
          if (res.status >= 200 && res.status < 400) resolve(src);
          else reject(new Error(`HTTP ${res.status}`));
        })
        .catch(() => {
          clearTimeout(timer);
          reject(new Error("failed"));
        });
    });

  try {
    const winner = await (Promise as any).any(sources.map(probe));
    return winner;
  } catch {
    return sources[0];
  }
}

/**
 * Resolve an anime title stream.
 *
 * @param tmdbId   TMDB numeric ID
 * @param type     "movie" | "tv"
 * @param season   Season number (TV only, default 1)
 * @param episode  Episode number (TV only, default 1)
 *
 * Returns a StreamResult identical in shape to fetchStreamingLinks(),
 * so the existing player screen requires zero changes.
 */
export async function fetchAnimeStream(
  tmdbId: number,
  type: "movie" | "tv" = "tv",
  season = 1,
  episode = 1,
): Promise<StreamResult> {
  const cacheKey = `${tmdbId}_${type}_${season}_${episode}`;
  const cached = await getAnimeCached(cacheKey);
  if (cached) return cached;

  // Build embed URLs from anime-category sources only
  const animeSources = buildEmbedUrls(tmdbId, type, season, episode, "anime");

  if (animeSources.length === 0) {
    // Catalog empty — fall through to general service
    return fetchStreamingLinks(tmdbId, type, { season, episode });
  }

  let winner: { url: string; source: string; isEmbed: true };
  try {
    winner = await raceAnimeSources(animeSources, 1800);
  } catch {
    // All anime sources failed — delegate to general streaming pool
    return fetchStreamingLinks(tmdbId, type, { season, episode });
  }

  const remaining = animeSources.filter((s) => s.url !== winner.url);

  const result: StreamResult = {
    url: winner.url,
    quality: "HD",
    source: winner.source,
    isEmbed: true,
    subtitles: false,
    fallbacks: remaining,
  };

  await setAnimeCache(cacheKey, result);
  return result;
}

/**
 * Returns all anime embed URLs for a given title without racing —
 * useful for a "Sources" picker sheet where the user can manually switch.
 */
export function listAnimeSources(
  tmdbId: number,
  type: "movie" | "tv" = "tv",
  season = 1,
  episode = 1,
): Array<{ url: string; source: string; isEmbed: true }> {
  return buildEmbedUrls(tmdbId, type, season, episode, "anime");
}
