/**
 * Content Availability helpers
 *
 * "Coming Soon" = the title's release date (or first air date for TV) is
 * strictly in the future compared to today's date. All released content
 * is treated as streamable via our 94-source embed pool.
 */

/** Returns true if the title has not yet been released. */
export function isComingSoon(
  releaseDate?: string | null,
  firstAirDate?: string | null,
): boolean {
  const dateStr = releaseDate || firstAirDate;
  if (!dateStr || dateStr.length < 4) return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    // Compare date-only (strip time) to avoid timezone jitter flipping status mid-day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
  } catch {
    return false;
  }
}

/** Filter a list of TMDB-shaped items, keeping only released titles. */
export function filterReleased<T extends {
  release_date?: string;
  first_air_date?: string;
}>(items: T[]): T[] {
  return items.filter(
    (m) => !isComingSoon(m.release_date, m.first_air_date),
  );
}
