import AsyncStorage from "@react-native-async-storage/async-storage";
import { tmdb } from "./tmdb";

const CACHE_PREFIX = "smovie_htrl_v1_";
const CACHE_TTL = 72 * 60 * 60 * 1000; // 72 hours

// ─── Hindi availability (for the "Hindi" poster/card badge) ──────────────────
// IMPORTANT: this is intentionally separate from trailer-key selection above.
// A movie can have a Hindi-dubbed *trailer* on YouTube (fetchHindiTrailer)
// without the actual movie/show having a Hindi audio track — showing the
// badge based on trailer language was the bug that caused "Hindi" to appear
// on almost everything. The badge must only reflect real TMDB metadata:
//   1. /movie|tv/{id}/translations — does a "hi" translation/audio entry exist
//   2. spoken_languages on the detail endpoint, as a fallback signal
const AVAIL_CACHE_PREFIX = "smovie_hindi_avail_v1_";
const AVAIL_CACHE_TTL = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Returns true only if TMDB explicitly reports Hindi ("hi") as an available
 * audio/translation track for this title. Returns false (hides the badge)
 * for everything else, including on any lookup failure — never assume Hindi.
 */
export async function checkHindiAvailable(
  tmdbId: number | null | undefined,
  mediaType: "movie" | "tv" = "movie",
): Promise<boolean> {
  if (!tmdbId) return false;
  const cacheKey = `${AVAIL_CACHE_PREFIX}${mediaType}_${tmdbId}`;

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as { available: boolean; ts: number };
      if (Date.now() - cached.ts < AVAIL_CACHE_TTL) return cached.available;
    }
  } catch {}

  async function persist(available: boolean): Promise<boolean> {
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ available, ts: Date.now() }));
    } catch {}
    return available;
  }

  try {
    const [translationsRes, detailRes] = await Promise.allSettled([
      tmdb.translations(mediaType, tmdbId),
      tmdb.detail(mediaType, tmdbId),
    ]);

    const hasHindiTranslation =
      translationsRes.status === "fulfilled" &&
      (translationsRes.value.translations ?? []).some((t) => t.iso_639_1 === "hi");

    const hasHindiSpokenLanguage =
      detailRes.status === "fulfilled" &&
      (detailRes.value.spoken_languages ?? []).some((l) => l.iso_639_1 === "hi");

    return persist(hasHindiTranslation || hasHindiSpokenLanguage);
  } catch {
    return false;
  }
}

export interface TrailerResult {
  key: string | null;
  isHindi: boolean;
}

type TMDBVideo = {
  site: string;
  type: string;
  iso_639_1?: string | null;
  key: string;
  name: string;
};

// Score: higher = more preferred. Hindi trailers always beat English.
function scoreVideo(v: TMDBVideo): number {
  const hi = v.iso_639_1 === "hi";
  const t  = v.type;
  if (hi && t === "Trailer")   return 100;
  if (hi && t === "Teaser")    return 90;
  if (hi && t === "Clip")      return 80;
  if (hi)                      return 70;
  if (t === "Trailer")         return 50;
  if (t === "Teaser")          return 40;
  if (t === "Clip")            return 20;
  return 10;
}

/**
 * Synchronously pick the best trailer from an already-fetched TMDB videos array.
 * Returns null if the array is empty.
 */
export function pickHindiFromVideos(ytVideos: TMDBVideo[]): TrailerResult | null {
  if (ytVideos.length === 0) return null;
  const sorted = [...ytVideos].sort((a, b) => scoreVideo(b) - scoreVideo(a));
  const best = sorted[0];
  return { key: best.key, isHindi: best.iso_639_1 === "hi" };
}

/**
 * Full async fetch from TMDB video metadata only.
 *
 * Results are cached in AsyncStorage for 72 hours.
 */
export async function fetchHindiTrailer(
  tmdbId: number,
  isTV: boolean,
  _title: string,
  _year?: string | number | null,
): Promise<TrailerResult> {
  const cacheKey = `${CACHE_PREFIX}${isTV ? "tv" : "movie"}_${tmdbId}`;

  // Check cache first
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as { key: string | null; isHindi: boolean; ts: number };
      if (Date.now() - cached.ts < CACHE_TTL) {
        return { key: cached.key, isHindi: cached.isHindi };
      }
    }
  } catch {}

  async function persist(r: TrailerResult): Promise<TrailerResult> {
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ ...r, ts: Date.now() }));
    } catch {}
    return r;
  }

  const mt = isTV ? "tv" : "movie";

  try {
    const { results } = await tmdb.videos(mt, tmdbId);
    const tmdbVideos = (results as any[]).filter((v) => v.site === "YouTube");

    // Best pick from TMDB videos
    const fromTmdb = pickHindiFromVideos(tmdbVideos);

    // If TMDB has a Hindi video, use it immediately
    if (fromTmdb?.isHindi) {
      return persist(fromTmdb);
    }

    // Use best English/any from TMDB
    if (fromTmdb) return persist(fromTmdb);

    return persist({ key: null, isHindi: false });

  } catch {
    return { key: null, isHindi: false };
  }
}
