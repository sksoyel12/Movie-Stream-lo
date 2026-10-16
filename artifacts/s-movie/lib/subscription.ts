/**
 * subscription.ts — VIP status management for S-Movie
 *
 * Storage strategy:
 *   1. AsyncStorage (local, instant) — primary source of truth
 *   2. Firebase Firestore REST API — synced when user is logged in
 *
 * VIP unlocks: Custom Themes, Custom Icon, Priority Notifications, AI Pro
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const VIP_KEY = "smovie_vip_status_v1";
const VIP_SINCE_KEY = "smovie_vip_since_v1";

const FIREBASE_PROJECT_ID = "movie-original";
const FIREBASE_API_KEY    = process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? "AIzaSyACikplYKRKiUffInNTZRy4Rp3EEHw_b3g";

// ─── Firestore REST helpers ────────────────────────────────────────────────────

async function firestoreGet(uid: string): Promise<boolean> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/users/${uid}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.fields?.accountType?.stringValue === "VIP";
  } catch {
    return false;
  }
}

async function firestoreSet(uid: string): Promise<void> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/users/${uid}?key=${FIREBASE_API_KEY}` +
      `&updateMask.fieldPaths=accountType&updateMask.fieldPaths=vipSince`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          accountType: { stringValue: "VIP" },
          vipSince:    { stringValue: new Date().toISOString() },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort — local is already saved
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true if the current user has VIP status */
export async function getVIPStatus(uid?: string | null): Promise<boolean> {
  // 1. Check local cache (instant)
  const local = await AsyncStorage.getItem(VIP_KEY).catch(() => null);
  if (local === "VIP") return true;

  // 2. If logged in, check Firestore (network)
  if (uid) {
    const remote = await firestoreGet(uid);
    if (remote) {
      await AsyncStorage.setItem(VIP_KEY, "VIP").catch(() => {});
      return true;
    }
  }

  return false;
}

/** Grants VIP status — saves locally and to Firestore if logged in */
export async function grantVIPStatus(uid?: string | null): Promise<void> {
  const since = new Date().toISOString();
  await AsyncStorage.setItem(VIP_KEY, "VIP").catch(() => {});
  await AsyncStorage.setItem(VIP_SINCE_KEY, since).catch(() => {});
  if (uid) {
    await firestoreSet(uid);
  }
}

/** Returns VIP since date string or null */
export async function getVIPSince(): Promise<string | null> {
  return AsyncStorage.getItem(VIP_SINCE_KEY).catch(() => null);
}

/** Revokes VIP status locally (admin use) */
export async function revokeVIPStatus(): Promise<void> {
  await AsyncStorage.removeItem(VIP_KEY).catch(() => {});
  await AsyncStorage.removeItem(VIP_SINCE_KEY).catch(() => {});
}

/** UPI payment deep link for ₹5 */
export function buildUPILink(): string {
  const params = new URLSearchParams({
    pa: "sksoyel584845-2@okaxis",
    pn: "S-Movie VIP",
    am: "5",
    cu: "INR",
    tn: "S-Movie VIP Monthly Subscription",
  });
  return `upi://pay?${params.toString()}`;
}
