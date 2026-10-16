/**
 * S-Movie identity & verification client.
 *
 * Wraps the /api/identity/* routes: syncing the authenticated Firebase user
 * into the app's own user record (which carries the permanent unique ID),
 * fetching that record, and submitting a photo ID for verification.
 */

import { apiClient } from "@/lib/apiClient";
import { firebaseAuth } from "@/lib/firebase";
import { getOrCreateLocalSmoId, syncSmoAccountRecord } from "@/lib/smoAccount";

export interface IdentityUser {
  uniqueUserId: string;
  smoId?: string;
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
 * Call after any successful Firebase sign-in (or when restoring a session) to
 * create/fetch this account's permanent identity record.
 *
 * Throws DuplicateAttemptError if this device is already linked to a
 * different S-Movie account — callers should sign the user out in that case.
 */
export async function syncAuthenticatedUser(params: {
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  smoId?: string;
}): Promise<IdentityUser> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("Sign in before creating your S-Movie identity.");
  }

  const localSmoId = params.smoId ?? await getOrCreateLocalSmoId(user.uid);
  let smoId = localSmoId;
  try {
    const record = await syncSmoAccountRecord(user.uid, localSmoId);
    smoId = record.smoId;
  } catch {
    // Keep the locally cached ID available when Firestore is temporarily offline.
  }

  try {
    const identity = await apiClient.post<IdentityUser>("/identity/google-sync", {
      email: params.email ?? undefined,
      displayName: params.displayName ?? undefined,
      photoUrl: params.photoUrl ?? undefined,
      smoId,
    });
    return { ...identity, uniqueUserId: smoId, smoId };
  } catch (e: any) {
    if (e?.code === "DUPLICATE_ATTEMPT") {
      throw new DuplicateAttemptError(e.message);
    }
    return localIdentity(user, smoId);
  }
}

/** Backward-compatible name used by existing Google sign-in UI. */
export const syncGoogleUser = syncAuthenticatedUser;

export async function getIdentity(): Promise<IdentityUser | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  const localSmoId = await getOrCreateLocalSmoId(user.uid);
  let smoId = localSmoId;
  try {
    const record = await syncSmoAccountRecord(user.uid, localSmoId);
    smoId = record.smoId;
  } catch {
    // Account display remains available from local state when Firestore is offline.
  }

  try {
    const identity = await apiClient.get<IdentityUser>("/identity/me");
    return { ...identity, uniqueUserId: smoId, smoId };
  } catch {
    return localIdentity(user, smoId);
  }
}

function localIdentity(
  user: NonNullable<typeof firebaseAuth.currentUser>,
  smoId: string,
): IdentityUser {
  return {
    uniqueUserId: smoId,
    smoId,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    isSuspended: false,
    suspensionReason: null,
    verificationStatus: "unverified",
  };
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
