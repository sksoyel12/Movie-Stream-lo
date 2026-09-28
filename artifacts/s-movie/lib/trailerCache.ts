/**
 * Trailer / Video metadata cache
 *
 * • Two-tier: in-memory LRU (instant) → AsyncStorage (24 h TTL).
 * • In-memory LRU cap: MAX_MEM_ENTRIES (prevents unbounded RAM growth).
 * • Provides prefetchVideos() to warm the cache for upcoming items in the feed.
 * • Responds to AppState "memoryWarning" via flushMemoryCache().
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

export interface VideoEntry {
  key: string;
  name: string;
  type: string;
  site: string;
  isHindi?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU in-memory cache
// ─────────────────────────────────────────────────────────────────────────────

const MAX_MEM_ENTRIES = 60; // max 60 items in RAM (~lightweight JSON, not video files)
const TTL  = 24 * 60 * 60 * 1000; // 24 h
const PREFIX = "@smovie_videos_";

/**
 * LRU map: most-recently-used entries stay at the front.
 * Using a plain Map is O(1) for get/set/delete on V8.
 */
const MEM: Map<string, { videos: VideoEntry[]; ts: number }> = new Map();

function mk(tmdbId: number, type: "movie" | "tv") {
  return `${PREFIX}${type}_${tmdbId}`;
}

/** Insert / update a key and promote it to MRU position. Evicts LRU if over cap. */
function memSet(k: string, entry: { videos: VideoEntry[]; ts: number }) {
  // Promote: delete first so re-inserted key goes to Map tail (MRU)
  MEM.delete(k);
  MEM.set(k, entry);
  // Evict oldest (Map iterator order = insertion order = LRU first)
  if (MEM.size > MAX_MEM_ENTRIES) {
    const lruKey = MEM.keys().next().value;
    if (lruKey) MEM.delete(lruKey);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-memory handler: flush in-memory cache on OS warning
// ─────────────────────────────────────────────────────────────────────────────

AppState.addEventListener("memoryWarning", () => {
  MEM.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function getCachedVideos(
  tmdbId: number,
  type: "movie" | "tv",
): Promise<VideoEntry[] | null> {
  const k = mk(tmdbId, type);
  const hit = MEM.get(k);
  if (hit && Date.now() - hit.ts < TTL) {
    // Promote to MRU
    memSet(k, hit);
    return hit.videos;
  }
  try {
    const raw = await AsyncStorage.getItem(k);
    if (!raw) return null;
    const parsed: { videos: VideoEntry[]; ts: number } = JSON.parse(raw);
    if (Date.now() - parsed.ts > TTL) {
      AsyncStorage.removeItem(k).catch(() => {});
      return null;
    }
    memSet(k, parsed);
    return parsed.videos;
  } catch {
    return null;
  }
}

export async function setCachedVideos(
  tmdbId: number,
  type: "movie" | "tv",
  videos: VideoEntry[],
): Promise<void> {
  const k = mk(tmdbId, type);
  const entry = { videos, ts: Date.now() };
  memSet(k, entry);
  try {
    await AsyncStorage.setItem(k, JSON.stringify(entry));
  } catch {}
}

/**
 * Explicitly flush the in-memory cache (e.g., on low-memory pressure).
 * AsyncStorage entries are retained so the data survives a RAM flush.
 */
export function flushMemoryCache(): void {
  MEM.clear();
}

/**
 * Prefetch video metadata for a list of upcoming feed items.
 * Runs silently in the background — safe to fire-and-forget.
 * Uses cache-first so it never duplicates a TMDB network call.
 */
export async function prefetchVideos(
  items: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>,
  fetcher: (type: "movie" | "tv", tmdbId: number) => Promise<{ results: VideoEntry[] }>,
): Promise<void> {
  for (const item of items) {
    try {
      const cached = await getCachedVideos(item.tmdbId, item.mediaType);
      if (cached) continue; // already warm — skip
      const res = await fetcher(item.mediaType, item.tmdbId);
      const tmdbVideos = (res.results ?? []).filter(
        (v: VideoEntry) =>
          v.site === "YouTube" &&
          (v.type === "Clip" || v.type === "Teaser"),
      );
      await setCachedVideos(item.tmdbId, item.mediaType, tmdbVideos);
    } catch {
      // Prefetch is best-effort — never block the UI
    }
  }
}
