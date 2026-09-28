/**
 * User Preferences — silent, on-device AI personalization.
 * All operations are async/fire-and-forget — never blocks the UI thread.
 * Data stored in AsyncStorage. No network calls. No loading spinners.
 *
 * TMDB Genre IDs reference:
 *  28=Action  12=Adventure  16=Animation  35=Comedy  80=Crime  99=Documentary
 *  18=Drama  10751=Family  14=Fantasy  36=History  27=Horror  10402=Music
 *  9648=Mystery  10749=Romance  878=Sci-Fi  10770=TV Movie  53=Thriller
 *  10752=War  37=Western  10759=Action&Adventure(TV)  10762=Kids(TV)
 *  10763=News(TV)  10764=Reality(TV)  10765=Sci-Fi&Fantasy(TV)
 *  10766=Soap(TV)  10767=Talk(TV)  10768=War&Politics(TV)
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFS_KEY    = "smovie_user_prefs_v2";
const VELOCITY_KEY = "smovie_velocity_v2";

export interface ContentVelocity {
  views:           number;
  totalCompletion: number; // sum of 0..1 completion fractions
  lastViewed:      number; // epoch ms
  genreIds:        number[];
}

export interface UserPrefs {
  // genre_id → accumulated weight
  // View = +1, completion>0.8 = +2 bonus
  genreWeights:  Record<number, number>;
  // tmdb content id → velocity data
  contentViews:  Record<string, ContentVelocity>;
  updatedAt:     number;
}

export type FeedbackKind = "down" | "up" | "love";

const DEFAULT_PREFS: UserPrefs = {
  genreWeights: {},
  contentViews: {},
  updatedAt:    0,
};

// In-memory cache so multiple consumers don't thrash AsyncStorage
let _cache: UserPrefs | null = null;
let _loadPromise: Promise<UserPrefs> | null = null;

export async function loadPrefs(): Promise<UserPrefs> {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      _cache = raw ? (JSON.parse(raw) as UserPrefs) : { ...DEFAULT_PREFS };
      return _cache;
    } catch {
      _cache = { ...DEFAULT_PREFS };
      return _cache;
    } finally {
      _loadPromise = null;
    }
  })();
  return _loadPromise;
}

async function savePrefs(prefs: UserPrefs): Promise<void> {
  _cache = prefs;
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

// ─── Tracking API ─────────────────────────────────────────────────────────────

/**
 * Track a content view (call when the detail page opens).
 * Fire-and-forget — await optional.
 */
export async function trackContentView(
  contentId:  string,
  genreIds:   number[],
): Promise<void> {
  try {
    const prefs = await loadPrefs();
    // Genre weight +1 per genre
    for (const g of genreIds) {
      prefs.genreWeights[g] = (prefs.genreWeights[g] ?? 0) + 1;
    }
    // Velocity: increment views, preserve completion
    const prev = prefs.contentViews[contentId] ?? {
      views: 0, totalCompletion: 0, lastViewed: 0, genreIds,
    };
    prefs.contentViews[contentId] = {
      views:           prev.views + 1,
      totalCompletion: prev.totalCompletion,
      lastViewed:      Date.now(),
      genreIds,
    };
    prefs.updatedAt = Date.now();
    await savePrefs(prefs);
  } catch {}
}

/**
 * Track watch completion fraction (0.0–1.0). Call from player on exit.
 * Completion > 0.8 earns extra genre weight (Netflix-style quality signal).
 */
export async function trackWatchCompletion(
  contentId:  string,
  genreIds:   number[],
  completion: number,
): Promise<void> {
  try {
    const prefs    = await loadPrefs();
    const clamped  = Math.min(1, Math.max(0, completion));
    // High-completion bonus: the user loved it → weight +2
    if (clamped > 0.8) {
      for (const g of genreIds) {
        prefs.genreWeights[g] = (prefs.genreWeights[g] ?? 0) + 2;
      }
    }
    const prev = prefs.contentViews[contentId] ?? {
      views: 0, totalCompletion: 0, lastViewed: Date.now(), genreIds,
    };
    prefs.contentViews[contentId] = {
      ...prev,
      totalCompletion: prev.totalCompletion + clamped,
    };
    prefs.updatedAt = Date.now();
    await savePrefs(prefs);
  } catch {}
}

/**
 * Track a search query — boost genres associated with known genre keywords.
 */
export async function trackSearchQuery(query: string): Promise<void> {
  const GENRE_KEYWORDS: Record<string, number[]> = {
    action: [28, 12], adventure: [12, 28], comedy: [35], romance: [10749],
    romantic: [10749], drama: [18], thriller: [53], horror: [27],
    "sci-fi": [878, 10765], scifi: [878, 10765], fantasy: [14, 10765],
    anime: [16], korean: [10749, 18], kdrama: [10749, 18], mystery: [9648],
    crime: [80], documentary: [99], family: [10751], kids: [10751, 10762],
  };
  const q = query.toLowerCase();
  const genreIds: number[] = [];
  for (const [kw, ids] of Object.entries(GENRE_KEYWORDS)) {
    if (q.includes(kw)) genreIds.push(...ids);
  }
  if (genreIds.length === 0) return;
  try {
    const prefs = await loadPrefs();
    for (const g of [...new Set(genreIds)]) {
      prefs.genreWeights[g] = (prefs.genreWeights[g] ?? 0) + 1;
    }
    prefs.updatedAt = Date.now();
    await savePrefs(prefs);
  } catch {}
}

/**
 * Private Netflix-style feedback signal. It is never displayed as a score;
 * it only changes the user's future recommendations.
 */
export async function trackContentFeedback(
  contentId: string,
  genreIds: number[],
  feedback: FeedbackKind,
): Promise<void> {
  try {
    const prefs = await loadPrefs();
    const genreMultiplier = feedback === "down" ? -3 : feedback === "love" ? 4 : 2;
    for (const genreId of genreIds) {
      prefs.genreWeights[genreId] = (prefs.genreWeights[genreId] ?? 0) + genreMultiplier;
    }
    const previous = prefs.contentViews[contentId] ?? {
      views: 0,
      totalCompletion: 0,
      lastViewed: Date.now(),
      genreIds,
    };
    prefs.contentViews[contentId] = {
      ...previous,
      genreIds,
      lastViewed: Date.now(),
      totalCompletion: Math.max(
        0,
        previous.totalCompletion +
          (feedback === "down" ? -0.35 : feedback === "love" ? 0.75 : 0.35),
      ),
    };
    prefs.updatedAt = Date.now();
    await savePrefs(prefs);
  } catch {}
}

/**
 * Local ranking layer used even without an AI key. It combines genre affinity,
 * repeat interest, completion and recency before the optional Gemini re-rank.
 */
export function scoreForUser(
  prefs: UserPrefs | null | undefined,
  contentId: string | number,
  genreIds: number[] = [],
): number {
  if (!prefs) return 0;
  const content = prefs.contentViews[String(contentId)];
  const genreScore = genreIds.reduce(
    (sum, genreId) => sum + (prefs.genreWeights[genreId] ?? 0),
    0,
  );
  const historyScore = content
    ? content.totalCompletion * 5 + content.views * 0.5
    : 0;
  const recencyScore = content
    ? Math.max(
        0,
        1 - (Date.now() - content.lastViewed) / (14 * 24 * 60 * 60 * 1000),
      )
    : 0;
  return genreScore * 2 + historyScore + recencyScore;
}

// ─── Computation API ──────────────────────────────────────────────────────────

/**
 * Returns the user's top N genre IDs sorted by accumulated weight.
 * Returns [] when there is insufficient data (cold start).
 */
export function getTopGenres(prefs: UserPrefs, n = 3): number[] {
  const entries = Object.entries(prefs.genreWeights) as [string, number][];
  if (entries.length === 0) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => Number(id));
}

/**
 * Velocity score = views_in_last_24h × avg_completion_rate.
 * Titles with high recent engagement AND high finish rates float to the top.
 */
export function computeVelocity(item: ContentVelocity): number {
  const ageMs       = Date.now() - item.lastViewed;
  const DAY_MS      = 24 * 60 * 60 * 1000;
  // Decay: full credit within 24 h, half at 48 h, zero at 7 days
  const decayFactor = Math.max(0, 1 - ageMs / (7 * DAY_MS));
  const recentViews = item.views * decayFactor;
  const avgCompletion = item.views > 0 ? item.totalCompletion / item.views : 0;
  return recentViews * (1 + avgCompletion); // completion multiplies engagement
}

/**
 * Returns content IDs sorted by velocity descending.
 */
export function getVelocityRanking(prefs: UserPrefs): string[] {
  return Object.entries(prefs.contentViews)
    .map(([id, data]) => ({ id, score: computeVelocity(data) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ id }) => id);
}

/**
 * Derive best imageMode for personalized rows based on user's top genre.
 * Action / Thriller / Sci-Fi → backdrop (cinematic wide shots show off the genre).
 * Romance / Drama / Comedy / K-drama → poster (portrait posters are more emotive).
 */
export function imageModeForGenre(genreId: number): "poster" | "backdrop" {
  // Genres that look better in landscape backdrop format
  const backdropGenres = new Set([28, 12, 53, 878, 27, 10752, 80, 9648, 10759, 10765]);
  return backdropGenres.has(genreId) ? "backdrop" : "poster";
}

/**
 * Returns a human-readable label for a genre ID (for the personalized row title).
 */
export function genreLabel(genreId: number): string {
  const LABELS: Record<number, string> = {
    28: "Action", 12: "Adventure", 35: "Comedy", 80: "Crime",
    18: "Drama", 10751: "Family", 14: "Fantasy", 27: "Horror",
    9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    16: "Anime", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy",
  };
  return LABELS[genreId] ?? "Top Picks";
}

/** Bust the in-memory cache to force a reload from AsyncStorage. */
export function bustPrefsCache(): void {
  _cache = null;
  _loadPromise = null;
}
