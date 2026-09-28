/**
 * geminiScore.ts — Gemini AI recommendation scoring for home-screen rows
 *
 * Sends movie/show metadata (title, genres, synopsis) to Gemini Flash and
 * receives a personalised "engagement score" (0–100) for each title.
 * The Trending and "Because you liked" rows use this to re-sort content so
 * the most AI-recommended titles surface first.
 *
 * Design:
 *  • Fire-and-forget — called after a row's initial render so it never blocks display.
 *  • 6-hour AsyncStorage cache so Gemini is called at most once per session per row.
 *  • Graceful degradation — if Gemini is unavailable or unkeyed, original order is kept.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserPrefs } from "@/lib/userPreferences";

const GEMINI_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GEMINI_URL  =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
const CACHE_PREFIX = "smovie_gscore_v2_";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface ScoreEntry { tmdbId: number; score: number }

// ─── Cache helpers ─────────────────────────────────────────────────────────────

function buildCacheKey(rowId: string, ids: number[]): string {
  return CACHE_PREFIX + rowId + "_" + ids.slice(0, 5).join("-");
}

// ─── Scoring function ──────────────────────────────────────────────────────────

/**
 * Asks Gemini Flash to score each item (0–100) based on title, genre, and synopsis,
 * then returns the array sorted descending by score.
 *
 * Falls back to the original order on API failure or missing key.
 *
 * @param items   Array with `tmdbId`, `title`, `genres`, `synopsis` fields.
 * @param rowId   Stable label used for the cache key (e.g. "trending", "becauseYouLiked").
 */
export async function scoreAndSortByGemini<T extends {
  tmdbId?: number | string;
  title?:  string;
  genres?: string[];
  synopsis?: string;
}>(items: T[], rowId: string, prefs?: UserPrefs): Promise<T[]> {
  if (!GEMINI_KEY || items.length === 0) return items;

  const ids      = items.map((m) => Number(m.tmdbId ?? 0)).filter(Boolean);
  const cacheKey = buildCacheKey(rowId, ids);

  // Return cached sorted order if still within TTL
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const { scores, ts } = JSON.parse(raw) as { scores: ScoreEntry[]; ts: number };
      if (Date.now() - ts < CACHE_TTL_MS) return applyScores(items, scores);
    }
  } catch {}

  // Build a compact payload (max 20 items to stay within token budget)
  const payload = items.slice(0, 20).map((m) => ({
    id:     Number(m.tmdbId ?? 0),
    title:  (m.title ?? "").slice(0, 60),
    genres: (m.genres ?? []).slice(0, 3).join(", "),
    desc:   (m.synopsis ?? "").slice(0, 100),
  }));

  const profile = prefs
    ? `User genre weights: ${JSON.stringify(prefs.genreWeights)}. Recently viewed IDs: ${
        Object.entries(prefs.contentViews)
          .sort(([, a], [, b]) => b.lastViewed - a.lastViewed)
          .slice(0, 8)
          .map(([id]) => id)
          .join(", ")
      }.\n`
    : "No viewing history is available; use a balanced cold-start ranking.\n";
  const prompt =
    "You are a Netflix recommendation algorithm. Score each title for this specific " +
    "user (0-100), using genre affinity, recent viewing, completion behavior and " +
    "fresh discovery. Do not use public ratings as a visible output.\n" +
    profile +
    "Respond ONLY with a compact JSON array — no markdown, no explanation:\n" +
    '[{"id":<tmdbId>,"score":<0-100>}]\n\n' +
    "Titles:\n" + JSON.stringify(payload);

  try {
    const res = await fetch(GEMINI_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 512 },
      }),
    });
    if (!res.ok) return items;

    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return items;

    const scores: ScoreEntry[] = JSON.parse(match[0]);
    // Cache raw scores — not the sorted items — so re-sorts on refresh stay fresh
    AsyncStorage.setItem(cacheKey, JSON.stringify({ scores, ts: Date.now() })).catch(() => {});
    return applyScores(items, scores);
  } catch {
    return items;
  }
}

function applyScores<T extends { tmdbId?: number | string }>(
  items:  T[],
  scores: ScoreEntry[],
): T[] {
  const map = new Map<number, number>(scores.map((s) => [s.tmdbId, s.score]));
  return [...items].sort((a, b) => {
    const sa = map.get(Number(a.tmdbId ?? 0)) ?? 50;
    const sb = map.get(Number(b.tmdbId ?? 0)) ?? 50;
    return sb - sa;
  });
}
