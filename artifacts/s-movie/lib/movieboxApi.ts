/**
 * MovieBox API mirror client.
 *
 * The MovieBox service exposes the same API contract from several regional
 * hosts. Keep the mirror list in one place and fail over per request so a
 * stale DNS entry or regional outage does not break the rest of the catalog.
 *
 * This client only consumes the public search/playback metadata responses. It
 * does not bypass authentication, geo restrictions, or protected media URLs.
 */

const API_HOSTS = [
  "api.inmoviebox.com",
  "api.aoneroom.com",
  "api3.aoneroom.com",
  "api4.aoneroom.com",
  "api4sg.aoneroom.com",
  "api5.aoneroom.com",
  "api6.aoneroom.com",
  "api6sg.aoneroom.com",
  "api7.aoneroom.com",
  "api8.aoneroom.com",
] as const;

export const MOVIEBOX_WEB_DOMAIN = "moviebox.ng";
export const MOVIEBOX_CDN_DOMAIN = "pacdn.aoneroom.com";
export const MOVIEBOX_MEDIA_DOMAINS = [
  "v.aoneroom.com",
  "pacdn.aoneroom.com",
  "test-acdn.aoneroom.com",
] as const;
export const MOVIEBOX_API_DOMAINS = [...API_HOSTS];

const SEARCH_PATH = "/wefeed-h5-bff/web/subject/search";
const PLAYBACK_PATH = "/playvideo/detail";
const REQUEST_TIMEOUT_MS = 8_000;
const PLAYBACK_TIMEOUT_MS = 2_500;

export const MOVIEBOX_ENDPOINTS = {
  search: SEARCH_PATH,
  playback: PLAYBACK_PATH,
} as const;

export interface MovieBoxSearchItem {
  id: string;
  title: string;
  detailPath?: string;
  posterUrl?: string;
  resourceUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
}

export interface MovieBoxPlayback {
  videoResourceId?: string;
  playUrl?: string;
  resourceLink?: string;
  getVideoUrl?: string;
  quality?: string;
  sourceHost?: string;
}

interface MovieBoxResponse {
  items?: unknown;
  data?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeMediaUrl(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://${MOVIEBOX_CDN_DOMAIN}${raw}`;
  if (/^(?:media|video)\//i.test(raw)) {
    return `https://${MOVIEBOX_CDN_DOMAIN}/${raw}`;
  }
  return undefined;
}

function extractItems(payload: MovieBoxResponse): unknown[] {
  const root = asRecord(payload.data) ?? payload;
  const items = root.items ?? asRecord(root.data)?.items;
  return Array.isArray(items) ? items : [];
}

function normalizeItem(value: unknown): MovieBoxSearchItem | null {
  const item = asRecord(value);
  if (!item) return null;

  const id = asString(item.subjectId) ?? asString(item.id);
  const title = asString(item.title) ?? asString(item.name);
  if (!id || !title) return null;

  const image = asRecord(item.image);
  const cover = asRecord(item.cover);

  return {
    id,
    title,
    detailPath: asString(item.detailPath),
    posterUrl:
      normalizeMediaUrl(item.posterUrl) ??
      normalizeMediaUrl(image?.url) ??
      normalizeMediaUrl(cover?.url),
    resourceUrl:
      normalizeMediaUrl(item.resourceUrl) ??
      normalizeMediaUrl(item.playUrl) ??
      normalizeMediaUrl(item.url),
    streamUrl: normalizeMediaUrl(item.streamUrl),
    downloadUrl: normalizeMediaUrl(item.downloadUrl),
  };
}

async function requestMirror(path: string, body: unknown): Promise<unknown> {
  let lastError: unknown;

  for (const host of API_HOSTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`https://${host}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Client-Info": JSON.stringify({ timezone: "Asia/Calcutta" }),
          "User-Agent": "S-Movie/1.0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = new Error(`${host} returned HTTP ${response.status}`);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("MovieBox API mirrors are unavailable");
}

function findPlayback(value: unknown): MovieBoxPlayback | null {
  const record = asRecord(value);
  if (!record) return null;

  const candidate: MovieBoxPlayback = {
    videoResourceId: asString(record.videoResourceId),
    playUrl: normalizeMediaUrl(record.playUrl),
    resourceLink: normalizeMediaUrl(record.resourceLink),
    getVideoUrl: normalizeMediaUrl(record.getVideoUrl),
    quality: asString(record.quality),
  };

  if (candidate.playUrl || candidate.resourceLink || candidate.getVideoUrl) {
    return candidate;
  }

  for (const nested of Object.values(record)) {
    const found = findPlayback(nested);
    if (found) return found;
  }
  return null;
}

function usablePlaybackUrl(playback: MovieBoxPlayback): string | null {
  const url = playback.playUrl ?? playback.resourceLink ?? playback.getVideoUrl;
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Resolve the playable resource metadata for a MovieBox subject.
 *
 * The endpoint is intentionally called only with the subject identifier
 * returned by MovieBox search. No resource IDs or URLs are fabricated.
 */
export async function getMovieBoxPlayback(
  query: string,
  season = 0,
  episode = 0,
): Promise<(MovieBoxPlayback & { url: string }) | null> {
  const matches = await searchMovieBox(query);
  const subject = matches[0];
  if (!subject) return null;

  for (const host of API_HOSTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLAYBACK_TIMEOUT_MS);
    try {
      const response = await fetch(`https://${host}${PLAYBACK_PATH}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Client-Info": JSON.stringify({ timezone: "Asia/Calcutta" }),
          "User-Agent": "S-Movie/1.0",
        },
        body: JSON.stringify({
          subjectId: subject.id,
          id: subject.id,
          videoResourceId: subject.id,
          se: season,
          ep: episode,
          season,
          episode,
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const playback = findPlayback(await response.json());
      const url = playback ? usablePlaybackUrl(playback) : null;
      if (playback && url) {
        return { ...playback, url };
      }
    } catch {
      // Try the next mirror.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/**
 * Search the MovieBox catalog through the mirror pool.
 * A failed pool returns [] so other catalog providers remain usable.
 */
export async function searchMovieBox(
  query: string,
  page = 1,
): Promise<MovieBoxSearchItem[]> {
  if (!query.trim()) return [];

  try {
    const payload = (await requestMirror(SEARCH_PATH, {
      keyword: query.trim(),
      page,
      perPage: 24,
      subjectType: 0,
    })) as MovieBoxResponse;

    return extractItems(payload)
      .map(normalizeItem)
      .filter((item): item is MovieBoxSearchItem => item !== null);
  } catch {
    return [];
  }
}
