/**
 * homeCache — offline-first persistent cache for home screen data.
 *
 * Uses AsyncStorage to persist processed card arrays so the home screen
 * renders immediately from local storage when the device is offline or the
 * API is unreachable. Data is fetched only when the current 24-hour feed
 * window has expired and is then stored for the next window.
 *
 * Key scheme: `smovie_home_v4_feed_<region>_<24-hour-window>_<row-title>`
 * Every home row shares the same 24-hour feed window. This keeps content,
 * ordering, and artwork stable until the next feed window opens.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "smovie_home_v4_";
export const HOME_CACHE_TTL_MS = 86_400_000;
const HOME_REGION = "IN";

export function getHomeFeedKey(region = HOME_REGION, now = Date.now()): string {
  return `feed_${region}_${Math.floor(now / HOME_CACHE_TTL_MS)}`;
}

function storageKey(rowKey: string, region = HOME_REGION): string {
  return `${PREFIX}${getHomeFeedKey(region)}_${encodeURIComponent(rowKey)}`;
}

interface CacheEnvelope<T> {
  __ttlV: 2;
  data: T;
  savedAt: number;
  feedKey: string;
}

/** Stable key for the hero banner section. */
// Versioned and provider-specific so older/non-locked hero snapshots are never
// reused after the Hero Banner's Netflix-only rule changes.
export const HERO_CACHE_KEY = "__hero_netflix_tv_network_v3__";

/** Dedicated versioned namespace for the 102 locked home category rows. */
export const CATEGORY_CACHE_KEY_PREFIX = "__categories_locked_v1__";

export function getCategoryCacheKey(title: string): string {
  return `${CATEGORY_CACHE_KEY_PREFIX}:${title}`;
}

// ─── Plain cache (no TTL) ─────────────────────────────────────────────────────

/**
 * Persist any JSON-serialisable value for a given row key.
 * Silently swallows errors (e.g. storage full) so a failed save never
 * disrupts the UI.
 */
export async function saveHomeCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey(key),
      JSON.stringify({
        __ttlV: 2,
        data,
        savedAt: Date.now(),
        feedKey: getHomeFeedKey(),
      }),
    );
  } catch {
    // Storage full or quota exceeded — non-fatal
  }
}

/**
 * Load a previously cached value.  Returns `null` when nothing is stored
 * or the stored JSON is corrupt.
 */
export async function loadHomeCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return parsed.data as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

// ─── TTL-aware cache ──────────────────────────────────────────────────────────

/** Save data in the current region/date feed window. */
export async function saveHomeCacheTTL(key: string, data: unknown): Promise<void> {
  return saveHomeCache(key, data);
}

/**
 * Load a cached value ONLY if it was saved within the given TTL window.
 * Returns `null` when the cache is missing, corrupt, or has expired.
 */
export async function loadHomeCacheTTL<T>(key: string, ttlMs: number): Promise<T | null> {
  const snapshot = await loadHomeCacheSnapshot<T>(key, ttlMs);
  return snapshot.fresh ? snapshot.data : null;
}

export async function loadHomeCacheSnapshot<T>(
  key: string,
  ttlMs: number,
): Promise<{ data: T | null; fresh: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return { data: null, fresh: false };
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>> | T;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
      return { data: parsed as T, fresh: false };
    }
    const envelope = parsed as Partial<CacheEnvelope<T>>;
    const data = envelope.data as T;
    const savedAt = Number(envelope.savedAt);
    const fresh =
      envelope.feedKey === getHomeFeedKey() &&
      Number.isFinite(savedAt) &&
      Date.now() - savedAt < ttlMs;
    return { data, fresh };
  } catch {
    return { data: null, fresh: false };
  }
}
