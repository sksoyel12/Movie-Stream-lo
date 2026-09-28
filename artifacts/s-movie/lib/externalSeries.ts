/**
 * externalSeries.ts
 * ─────────────────
 * Data model, AsyncStorage persistence, and a placeholder scraper stub for
 * user-added external series sources.
 *
 * Schema:
 *   ExternalSeries  — top-level entry (one per series)
 *   SeriesSeason    — one per season
 *   EpisodeLink     — one per episode, with per-quality URL slots
 *
 * The scrapeSeriesFromUrl() function is intentionally left as a stub.
 * Replace its body with your own fetch + regex / HTML-parser logic later.
 */

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

// ─── Placeholder scraper ──────────────────────────────────────────────────────
/**
 * scrapeSeriesFromUrl
 * ───────────────────
 * STUB — returns empty metadata right now.
 *
 * TODO: Replace the body with your own logic, for example:
 *
 *   const html  = await fetch(url).then(r => r.text());
 *   const title = html.match(/<title>(.*?)<\/title>/i)?.[1] ?? "";
 *   const links = [...html.matchAll(/href="(.*?\.mp4[^"]*)"/gi)].map(m => m[1]);
 *   ...
 *
 * Return a partial ExternalSeries and the caller will merge it with whatever
 * the user typed manually.
 */
export async function scrapeSeriesFromUrl(url: string): Promise<{
  title?: string;
  poster?: string;
  year?: string;
  genre?: string;
}> {
  // ── Add your custom scraping / regex logic here ───────────────────────────
  // e.g. fetch the URL, parse HTML, extract title/poster/download links
  // ──────────────────────────────────────────────────────────────────────────
  console.log("[scraper] stub called for:", url);
  return {};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlaceholderUrl(quality: Quality): string {
  // Free, royalty-free sample MP4 used as a stand-in until real URLs are added
  const samples: Record<Quality, string> = {
    "480p":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "720p":  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "1080p": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
  };
  return samples[quality];
}

export function buildEpisode(epNum: number, title?: string): EpisodeLink {
  return {
    episode: epNum,
    title: title ?? `Episode ${epNum}`,
    urls: {
      "480p":  makePlaceholderUrl("480p"),
      "720p":  makePlaceholderUrl("720p"),
      "1080p": makePlaceholderUrl("1080p"),
    },
  };
}

export function buildSeason(seasonNum: number, episodeCount: number): SeriesSeason {
  return {
    season: seasonNum,
    episodes: Array.from({ length: episodeCount }, (_, i) => buildEpisode(i + 1)),
  };
}

// ─── Dummy seed data ──────────────────────────────────────────────────────────

export const DUMMY_SERIES: ExternalSeries[] = [
  {
    id: "ext-001",
    title: "Stellar Odyssey",
    sourceUrl: "https://example.com/stellar-odyssey",
    poster: "https://picsum.photos/seed/stellar/300/450",
    year: "2023",
    genre: "Sci-Fi",
    seasons: [
      buildSeason(1, 8),
      buildSeason(2, 10),
      buildSeason(3, 10),
      buildSeason(4, 6),
    ],
    addedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    id: "ext-002",
    title: "Dark Meridian",
    sourceUrl: "https://example.com/dark-meridian",
    poster: "https://picsum.photos/seed/dark/300/450",
    year: "2022",
    genre: "Thriller",
    seasons: [
      buildSeason(1, 6),
      buildSeason(2, 8),
      buildSeason(3, 8),
      buildSeason(4, 10),
    ],
    addedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: "ext-003",
    title: "Moonlit Empire",
    sourceUrl: "https://example.com/moonlit-empire",
    poster: "https://picsum.photos/seed/moonlit/300/450",
    year: "2024",
    genre: "Drama",
    seasons: [
      buildSeason(1, 12),
      buildSeason(2, 12),
    ],
    addedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
];

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

/** Returns all saved series, seeding dummy data on first launch. */
export async function getAllSeries(): Promise<ExternalSeries[]> {
  const stored = await readStore();
  if (stored.length > 0) return stored;
  // First launch — seed dummy data
  await writeStore(DUMMY_SERIES);
  return DUMMY_SERIES;
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
