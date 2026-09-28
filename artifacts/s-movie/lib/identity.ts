/**
 * S-Movie identity & verification client.
 *
 * Wraps the /api/identity/* routes: syncing the Google-authenticated user
 * into the app's own user record (which carries the permanent unique ID),
 * fetching that record, and submitting a photo ID for verification.
 */

import { apiClient } from "@/lib/apiClient";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";

export interface IdentityUser {
  uniqueUserId: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  isSuspended: boolean;
  suspensionReason: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
}

export class DuplicateAttemptError extends Error {
  code = "DUPLICATE_ATTEMPT" as const;
}

/**
 * Call right after a successful Google Sign-In (or on relaunch if a session
 * already exists) to create/fetch this account's permanent identity record.
 *
 * Throws DuplicateAttemptError if this device is already linked to a
 * different S-Movie account — callers should sign the user out in that case.
 */
export async function syncGoogleUser(params: {
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
}): Promise<IdentityUser> {
  const deviceFingerprint = await getDeviceFingerprint();
  try {
    return await apiClient.post<IdentityUser>("/identity/google-sync", {
      email: params.email ?? undefined,
      displayName: params.displayName ?? undefined,
      photoUrl: params.photoUrl ?? undefined,
      deviceFingerprint,
    });
  } catch (e: any) {
    if (e?.code === "DUPLICATE_ATTEMPT") {
      throw new DuplicateAttemptError(e.message);
    }
    throw e;
  }
}

export async function getIdentity(): Promise<IdentityUser | null> {
  try {
    return await apiClient.get<IdentityUser>("/identity/me");
  } catch {
    return null;
  }
}

export interface VerifyPhotoResult {
  verificationStatus: IdentityUser["verificationStatus"];
  isSuspended: boolean;
  suspensionReason: string | null;
  reason: string;
}

/** Submits a base64-encoded photo ID for automated verification. */
export async function submitIdPhoto(imageBase64: string, mimeType = "image/jpeg"): Promise<VerifyPhotoResult> {
  return apiClient.post<VerifyPhotoResult>(
    "/identity/verify-photo",
    { imageBase64, mimeType },
    { timeoutMs: 45_000 },
  );
}
