import { API_HOST } from "@/lib/apiBase";

type PosterFallbackOptions = {
  title: string;
  mediaType?: "movie" | "tv";
  tmdbId?: number;
};

type PosterResponse = {
  posterUrl?: string;
  provider?: string;
};

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function normaliseResult(url: string): string {
  if (url.includes("image.tmdb.org") && API_HOST) {
    return `${API_HOST}/api/image?url=${encodeURIComponent(url)}`;
  }
  return url.startsWith("http://") ? url.replace(/^http:\/\//i, "https://") : url;
}

export async function resolvePosterFallback({
  title,
  mediaType = "movie",
  tmdbId,
}: PosterFallbackOptions): Promise<string | null> {
  if (!API_HOST || !title.trim()) return null;
  const key = `${mediaType}:${tmdbId ?? "none"}:${title.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = pending.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const url = new URL(`${API_HOST}/api/posters/resolve`);
      url.searchParams.set("title", title.trim());
      url.searchParams.set("mediaType", mediaType);
      if (tmdbId) url.searchParams.set("tmdbId", String(tmdbId));
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        cache.set(key, null);
        return null;
      }
      const data = (await response.json()) as PosterResponse;
      const result = data.posterUrl && /^https?:\/\//i.test(data.posterUrl)
        ? normaliseResult(data.posterUrl)
        : null;
      cache.set(key, result);
      return result;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, request);
  return request;
}