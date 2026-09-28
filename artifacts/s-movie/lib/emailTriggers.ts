/**
 * Email trigger helpers — fire-and-forget calls to the API server.
 *
 * Every function is void and swallows all errors so the auth flow is
 * never interrupted by a transient email delivery failure.
 */

import { Platform } from "react-native";
import { API_BASE } from "@/lib/apiBase";

// ---------------------------------------------------------------------------
// Internal fire-and-forget POST
// ---------------------------------------------------------------------------

function post(path: string, body: Record<string, unknown>): void {
  const url = `${API_BASE ?? ""}${path}`;
  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })
    .then((res) => {
      if (!res.ok && __DEV__) {
        console.warn(`[EmailTrigger] ${path} → HTTP ${res.status}`);
      }
    })
    .catch((err) => {
      if (__DEV__) console.warn(`[EmailTrigger] ${path} network error (non-fatal):`, err);
    });
}

// ---------------------------------------------------------------------------
// First-login detection
// ---------------------------------------------------------------------------

/** Returns true only on the very first Firebase sign-in ever for this account. */
export function isFirstTimeUser(metadata: {
  creationTime?: string;
  lastSignInTime?: string;
}): boolean {
  if (!metadata.creationTime || !metadata.lastSignInTime) return false;
  return metadata.creationTime === metadata.lastSignInTime;
}

// ---------------------------------------------------------------------------
// Public triggers
// ---------------------------------------------------------------------------

/**
 * → Welcome email (Netflix-style hero + "Start Watching" CTA).
 * Call once after the very first Firebase sign-in.
 */
export function triggerWelcomeEmail(email: string, displayName?: string | null): void {
  if (!email) return;
  post("/auth/welcome-email", {
    email,
    ...(displayName ? { displayName } : {}),
  });
}

/**
 * → Login notification with optional "Continue Watching" poster.
 * Call on every subsequent (returning-user) sign-in.
 *
 * @param posterUrl  Proxied poster image URL of the last-watched movie (optional)
 * @param movieTitle Title of the last-watched movie (optional)
 */
export function triggerLoginNotification(
  email: string,
  displayName?: string | null,
  posterUrl?: string | null,
  movieTitle?: string | null,
): void {
  if (!email) return;
  post("/auth/login-notification", {
    email,
    platform:   Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web",
    deviceName: displayName ?? null,
    ...(posterUrl   ? { posterUrl }   : {}),
    ...(movieTitle  ? { movieTitle }  : {}),
  });
}

/**
 * → Goodbye / logout email.
 * Call right before invoking Firebase signOut().
 */
export function triggerLogoutEmail(email: string, displayName?: string | null): void {
  if (!email) return;
  post("/auth/logout-notification", {
    email,
    ...(displayName ? { displayName } : {}),
  });
}

/**
 * → OTP / verification code email.
 * The caller generates `otp` (4–8 numeric digits) and manages verification.
 */
export function triggerOtpEmail(email: string, otp: string, expiryMinutes = 5): void {
  if (!email || !otp) return;
  post("/auth/send-otp", { email, otp, expiryMinutes });
}
