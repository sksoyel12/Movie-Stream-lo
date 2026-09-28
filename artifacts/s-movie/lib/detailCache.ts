import AsyncStorage from "@react-native-async-storage/async-storage";

const DETAIL_CACHE_PREFIX = "smovie_detail_cache_v1:";

export type DetailMediaType = "movie" | "tv";

export type CachedDetailPayload<T> = {
  data: T;
  savedAt: number;
};

export function getDetailCacheKey(
  mediaType: DetailMediaType,
  tmdbId: number,
  section = "detail",
): string {
  return `${DETAIL_CACHE_PREFIX}${mediaType}:${tmdbId}:${section}`;
}

/**
 * Detail data is retained without a short TTL so a previously opened title
 * remains browsable when the device has no connection. A successful network
 * response always replaces the cached snapshot.
 */
export async function saveDetailCache<T>(key: string, data: T): Promise<void> {
  try {
    const payload: CachedDetailPayload<T> = { data, savedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Cache failures must never block the detail page.
  }
}

export async function loadDetailCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedDetailPayload<T>> | T;
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return (parsed as CachedDetailPayload<T>).data ?? null;
    }
    // Accept the unwrapped shape for forward compatibility with early caches.
    return parsed as T;
  } catch {
    return null;
  }
}