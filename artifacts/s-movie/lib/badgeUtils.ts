// ── Badge Lifecycle & Popularity Sort — global shared utilities ───────────────
//
// Single source of truth for all dynamic badge expiration rules and
// popularity-based rank sorting used across MovieRow, Top10Row, and any
// future card component.  Import from here; never re-declare locally.

// ── Freshness windows ─────────────────────────────────────────────────────────
// PRIMARY (last_air_date / release_date): 365 days — wide net ensures most
// content that has aired or released within the past year gets a badge.
//
// TV PREMIERE FALLBACK (first_air_date): 2 years — catches episodic shows whose
// last_air_date is missing or stale but which debuted on-platform recently.
//
// Both windows are evaluated independently so an item can never be blocked from
// a badge by a missing or future-dated sibling field.
const FRESH_WINDOW_DAYS = 365;
export const FRESH_WINDOW_MS = FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const TV_PREMIERE_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

// ── Badge label type ──────────────────────────────────────────────────────────
// "New Season"     — TV show with recent air/premiere date → red + Watch Now dual stack
// "Recently added" — Movie with recent release_date        → red badge only
// null             — outside all windows or no usable date → badge never mounted
export type BadgeLabel = "New Season" | "Recently added" | null;

// ── Dynamic badge label — fully programmatic, no hardcoded arrays ─────────────
//
// Evaluation order (all driven by live TMDB payload dates):
//
//   1. TV last_air_date  within 365 days → "New Season"      (most-recent episode)
//   2. TV first_air_date within 2 years  → "New Season"      (premiere fallback)
//   3. Movie release_date within 365 days → "Recently added"
//   4. Otherwise → null
//
// Rules are independent — no early-exit blocks a subsequent check.
// TOP 10 badge is orthogonal (top-right corner) and never interacts with
// this function; it is stamped directly onto cards in MovieRow's useEffect.
export function getNewBadgeLabel(item: {
  last_air_date?:  string | null;
  first_air_date?: string | null;
  release_date?:   string | null;
}): BadgeLabel {
  const now = Date.now();

  // ── 1. TV: most-recent episode air date ───────────────────────────────────
  if (item.last_air_date) {
    const diff = now - new Date(item.last_air_date).getTime();
    if (diff >= 0 && diff <= FRESH_WINDOW_MS) return "New Season";
  }

  // ── 2. TV fallback: premiere date (catches shows with stale last_air_date) ─
  if (item.first_air_date && !item.release_date) {
    const diff = now - new Date(item.first_air_date).getTime();
    if (diff >= 0 && diff <= TV_PREMIERE_WINDOW_MS) return "New Season";
  }

  // ── 3. Movie / non-episodic: theatrical or streaming release date ──────────
  if (item.release_date) {
    const diff = now - new Date(item.release_date).getTime();
    if (diff >= 0 && diff <= FRESH_WINDOW_MS) return "Recently added";
  }

  return null;
}

// ── Popularity-based descending sort ─────────────────────────────────────────
// Used by "Trending Now" and Top 10 rows so card rank order reflects the live
// TMDB popularity score from the network payload.
//
// When a title's popularity drops it slides to a higher index automatically on
// the next data fetch; the ascending title takes its place and inherits the
// correct rank number/badge without any manual intervention.
//
// Returns a NEW array — does not mutate the original.
export function sortByPopularityDesc<T extends { popularity?: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

// ── Popularity-weighted shuffle ───────────────────────────────────────────────
// "Smart Category Poster Refresh": every launch / pull-to-refresh should feel
// different, but categories shouldn't turn into pure noise — a title with 10x
// the popularity score should still show up near the front far more often than
// a long-tail title. This uses the standard "A-ES" weighted random sampling
// trick: give every item a random key = U ** (1/weight) (U ~ Uniform(0,1)),
// then sort descending by key. Higher weight -> key statistically closer to 1
// -> tends to sort first, but the exact order is different on every call.
// Returns a NEW array — does not mutate the original.
export function weightedShuffleByPopularity<T extends { popularity?: number }>(
  items: T[],
): T[] {
  return items
    .map((item) => {
      const weight = Math.max(item.popularity ?? 1, 0.01);
      const key = Math.pow(Math.random(), 1 / weight);
      return { item, key };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}
