/** Local storage helpers for series and episode links added by the user. */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Quality = "480p" | "720p" | "1080p";
export const QUALITY_OPTIONS: Quality[] = ["480p", "720p", "1080p"];

export interface EpisodeLink {
  episode: number;
  title: string;
  thumbnail?: string;
  /** Keyed by quality — empty string = not yet resolved */
  urls: { [K in Quality]: string };
}

export interface SeriesSeason {
  season: number;
  episodes: EpisodeLink[];
}

export interface ExternalSeries {
  id: string;
  title: string;
  /** The raw page URL the user pasted */
  sourceUrl: string;
  poster?: string;
  year?: string;
  genre?: string;
  seasons: SeriesSeason[];
  addedAt: number;
}

export async function scrapeSeriesFromUrl(_url: string): Promise<{
  title?: string;
  poster?: string;
  year?: string;
  genre?: string;
}> {
  throw new Error("Automatic series scraping is unavailable. Enter the series details manually.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildEpisode(epNum: number, title?: string): EpisodeLink {
  return {
    episode: epNum,
    title: title ?? `Episode ${epNum}`,
    urls: {
      "480p": "",
      "720p": "",
      "1080p": "",
    },
  };
}

export function buildSeason(seasonNum: number, episodeCount: number): SeriesSeason {
  return {
    season: seasonNum,
    episodes: Array.from({ length: episodeCount }, (_, i) => buildEpisode(i + 1)),
  };
}

// ─── AsyncStorage persistence ─────────────────────────────────────────────────

const STORE_KEY = "@smovie_external_series_v1";

async function readStore(): Promise<ExternalSeries[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExternalSeries[];
  } catch {
    return [];
  }
}

async function writeStore(data: ExternalSeries[]): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(data));
}

/** Returns only series explicitly saved on this device. */
export async function getAllSeries(): Promise<ExternalSeries[]> {
  return readStore();
}

export async function addSeries(entry: ExternalSeries): Promise<void> {
  const all = await readStore();
  await writeStore([entry, ...all]);
}

export async function updateSeries(entry: ExternalSeries): Promise<void> {
  const all = await readStore();
  await writeStore(all.map((s) => (s.id === entry.id ? entry : s)));
}

export async function deleteSeries(id: string): Promise<void> {
  const all = await readStore();
  await writeStore(all.filter((s) => s.id !== id));
}

/** Update a single episode URL for a given quality inside an existing series. */
export async function setEpisodeUrl(
  seriesId: string,
  season: number,
  episode: number,
  quality: Quality,
  url: string,
): Promise<void> {
  const all = await readStore();
  const updated = all.map((s) => {
    if (s.id !== seriesId) return s;
    return {
      ...s,
      seasons: s.seasons.map((sn) => {
        if (sn.season !== season) return sn;
        return {
          ...sn,
          episodes: sn.episodes.map((ep) => {
            if (ep.episode !== episode) return ep;
            return { ...ep, urls: { ...ep.urls, [quality]: url } };
          }),
        };
      }),
    };
  });
  await writeStore(updated);
}
