import { getApiBase } from "./apiClient";

export interface ExtractionSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  contentType: "hls" | "progressive";
  headers?: Record<string, string>;
}

export interface ExtractionSubtitle {
  url: string;
  lang: string;
  label: string;
  format?: string;
}

export interface ExtractionEpisode {
  id: string;
  number: number;
  season: number;
  title: string;
  description?: string;
  image?: string;
  airDate?: string;
}

export interface ExtractionSeason {
  seasonNumber: number;
  title: string;
  episodeCount: number;
}

export interface ExtractionResponse {
  provider: string;
  media: {
    id: string;
    title: string;
    type: "movie" | "tv";
    tmdbId?: number;
    season?: number;
    episode?: number;
  };
  url: string;
  contentType: "hls" | "progressive";
  sources: ExtractionSource[];
  subtitles: ExtractionSubtitle[];
  seasons: ExtractionSeason[];
  episodes: ExtractionEpisode[];
  warnings: string[];
}

export async function fetchExtractionStream(params: {
  tmdbId?: number | null;
  title: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  provider?: string;
}): Promise<ExtractionResponse> {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/extraction/resolve`);
  url.searchParams.set("title", params.title);
  url.searchParams.set("type", params.type);
  if (params.tmdbId) url.searchParams.set("tmdbId", String(params.tmdbId));
  if (params.season) url.searchParams.set("season", String(params.season));
  if (params.episode) url.searchParams.set("episode", String(params.episode));
  if (params.provider) url.searchParams.set("provider", params.provider);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(body.error ?? `Extraction request failed (${response.status}).`);
    }
    return body as ExtractionResponse;
  } finally {
    clearTimeout(timeout);
  }
}