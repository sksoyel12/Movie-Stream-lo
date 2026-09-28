/**
 * Welcome email trigger.
 *
 * Called once, immediately after a brand-new Firebase account is detected.
 * The call is fire-and-forget — a failure here must never block the user's
 * onboarding or registration flow.
 */

import { API_BASE } from "@/lib/apiBase";

/**
 * Ask the API server to send a welcome email to `email`.
 *
 * Safe to call without awaiting — errors are swallowed intentionally.
 */
export function triggerWelcomeEmail(email: string): void {
  if (!email) return;

  // API_BASE already includes "/api" (e.g. "https://host/api")
  const url = `${API_BASE ?? ""}/auth/welcome-email`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
    .then((res) => {
      if (!res.ok) {
        // Non-fatal: log in dev, swallow in prod
        if (__DEV__) {
          console.warn("[WelcomeEmail] Server responded with", res.status);
        }
      }
    })
    .catch((err) => {
      if (__DEV__) {
        console.warn("[WelcomeEmail] Network error (non-fatal):", err);
      }
    });
}

/**
 * Returns true if the Firebase user signed up for the very first time.
 * Firebase sets creationTime === lastSignInTime only on the initial sign-in.
 */
export function isFirstTimeUser(metadata: {
  creationTime?: string;
  lastSignInTime?: string;
}): boolean {
  if (!metadata.creationTime || !metadata.lastSignInTime) return false;
  return metadata.creationTime === metadata.lastSignInTime;
}
