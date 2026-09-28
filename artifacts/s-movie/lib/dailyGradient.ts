/**
 * dailyGradient.ts
 * Returns a premium Netflix-style gradient pair that rotates once per day.
 * The index is derived from the calendar day so it is identical for all
 * users on the same date and never requires a manual update.
 */

export type GradientPair = [string, string];

export const DAILY_GRADIENTS: GradientPair[] = [
  ['#0B1E2D', '#000000'], // Netflix dark teal → black  (exact screenshot match)
  ['#0D2137', '#000000'], // deep ocean navy  → black
  ['#0A1A28', '#000000'], // midnight teal    → black
  ['#0E1F30', '#000000'], // dark slate navy  → black
  ['#091C2A', '#000000'], // abyss teal       → black
  ['#0C1E30', '#000000'], // dark petrol      → black
  ['#0B1D2C', '#000000'], // dark marine      → black
];

/**
 * Returns a zero-based day-of-year index (1 Jan = 0).
 * Calculated once per call; callers should cache the result.
 */
function getDayOfYear(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
}

/**
 * Returns today's gradient pair.
 * Pure function — safe to call from any context.
 */
export function getDailyGradient(): GradientPair {
  return DAILY_GRADIENTS[getDayOfYear() % DAILY_GRADIENTS.length];
}

/**
 * Returns the number of milliseconds until the next local midnight.
 * Used by the hook to schedule the nightly gradient swap.
 */
export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}
