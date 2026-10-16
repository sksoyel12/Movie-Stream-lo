// ─── Site Domain Config ───────────────────────────────────────────────────────
// Jab bhi kisi site ka domain change ho, sirf Replit Secrets mein
// corresponding EXPO_PUBLIC_* variable update karo — code mein kuch nahi badlega.
//
// Replit Secrets mein ye variables set karo:
//   EXPO_PUBLIC_VEGAMOVIES_URL   →  VegaMovies ka base domain
//
// Default fallback values neeche hain (agar secret set na ho to yeh use hoga).
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_DOMAINS = {
  vegamovies: process.env.EXPO_PUBLIC_VEGAMOVIES_URL ?? "https://vegamovies.global",
  fzmovies:   process.env.EXPO_PUBLIC_FZMOVIES_URL   ?? "https://www.fzmovies.net",
  xprime:     process.env.EXPO_PUBLIC_XPRIME_URL     ?? "https://xprime.tv",
} as const;
