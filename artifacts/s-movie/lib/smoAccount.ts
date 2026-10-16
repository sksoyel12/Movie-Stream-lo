import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

import { firebaseDb } from "@/lib/firebase";

const SMO_ID_PREFIX = "@smovie:smoId:";
const SMO_ID_PATTERN = /^\d{12}$/;
const NUMERIC_ID_SPACE = 1_000_000_000_000;
const MAX_ID_RESERVATION_ATTEMPTS = 10;

export type SmoAccountStatus = "active" | "suspended";

export interface SmoAccountStatusResult {
  status: SmoAccountStatus;
  reason: string | null;
}

async function getUidHash(uid: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      uid,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  } catch {
    // Deterministic fallback for runtimes without the native crypto module.
    let digest = "";
    for (let round = 0; round < 8; round++) {
      let hash = (2166136261 ^ Math.imul(round + 1, 0x45d9f3b)) >>> 0;
      const input = `${round}:${uid}`;
      for (let index = 0; index < input.length; index++) {
        hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
      }
      digest += (hash >>> 0).toString(16).padStart(8, "0");
    }
    return digest;
  }
}

function numericIdFromHash(hash: string): string {
  let remainder = 0;
  for (const character of hash) {
    const digit = Number.parseInt(character, 16);
    if (!Number.isFinite(digit)) continue;
    remainder = (remainder * 16 + digit) % NUMERIC_ID_SPACE;
  }
  return Math.floor(remainder).toString().padStart(12, "0");
}

function formatSmoId(numericId: string): string {
  return numericId;
}

function getNumericId(smoId: string | null | undefined): string | null {
  const match = typeof smoId === "string" ? SMO_ID_PATTERN.exec(smoId) : null;
  return match?.[0] ?? null;
}

function incrementNumericId(numericId: string, offset: number): string {
  return ((Number(numericId) + offset) % NUMERIC_ID_SPACE)
    .toString()
    .padStart(12, "0");
}

function getStorageKey(uid: string): string {
  return `${SMO_ID_PREFIX}${uid}`;
}

async function readCachedSmoId(uid: string): Promise<string | null> {
  const key = getStorageKey(uid);
  try {
    const value = await AsyncStorage.getItem(key);
    if (value && SMO_ID_PATTERN.test(value)) return value;
  } catch {
    // Web storage can be unavailable in private browsing or embedded previews.
  }
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const value = localStorage.getItem(key);
      if (value && SMO_ID_PATTERN.test(value)) return value;
    }
  } catch {
    // The deterministic ID can still be regenerated from the Firebase UID.
  }
  return null;
}

async function cacheSmoId(uid: string, smoId: string): Promise<void> {
  const key = getStorageKey(uid);
  try {
    await AsyncStorage.setItem(key, smoId);
    return;
  } catch {
    // Fall through to localStorage on web.
  }
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, smoId);
    }
  } catch {
    // A storage restriction must not prevent the ID from being displayed.
  }
}

export async function getOrCreateLocalSmoId(uid: string): Promise<string> {
  const stored = await readCachedSmoId(uid);
  if (stored) return stored;

  const smoId = formatSmoId(numericIdFromHash(await getUidHash(uid)));
  await cacheSmoId(uid, smoId);
  return smoId;
}

function parseAccountStatus(data: DocumentData | undefined): SmoAccountStatusResult {
  const rawStatus = typeof data?.status === "string"
    ? data.status.trim().toLowerCase()
    : "";
  const suspended =
    rawStatus === "suspended" ||
    rawStatus === "banned" ||
    rawStatus === "blocked" ||
    data?.isSuspended === true ||
    data?.banned === true;

  const reason = typeof data?.suspensionReason === "string"
    ? data.suspensionReason.trim()
    : typeof data?.banReason === "string"
    ? data.banReason.trim()
    : null;

  return {
    status: suspended ? "suspended" : "active",
    reason: reason || (suspended ? "This account has been suspended." : null),
  };
}

export async function syncSmoAccountRecord(
  uid: string,
  proposedSmoId: string,
): Promise<{ smoId: string } & SmoAccountStatusResult> {
  const userRef = doc(firebaseDb, "users", uid);
  const assignmentRef = doc(firebaseDb, "smoIdAssignments", uid);
  const uidHash = await getUidHash(uid);
  const proposedNumericId = getNumericId(proposedSmoId) ?? numericIdFromHash(uidHash);
  const result = await runTransaction(firebaseDb, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const assignmentSnapshot = await transaction.get(assignmentRef);
    const data = userSnapshot.exists() ? userSnapshot.data() : undefined;
    const storedId = getNumericId(data?.smoId);
    const assignedId = getNumericId(assignmentSnapshot.data()?.smoId);
    const accountStatus = parseAccountStatus(data);
    const firstCandidate = assignedId ?? storedId ?? proposedNumericId;
    let reservedId: string | null = null;
    let newReservationRef: ReturnType<typeof doc> | null = null;

    for (let offset = 0; offset < MAX_ID_RESERVATION_ATTEMPTS; offset++) {
      const numericId = incrementNumericId(firstCandidate, offset);
      const reservationRef = doc(firebaseDb, "smoIdRegistry", numericId);
      const reservation = await transaction.get(reservationRef);
      if (!reservation.exists() || assignedId === numericId) {
        reservedId = numericId;
        newReservationRef = reservation.exists() ? null : reservationRef;
        break;
      }
    }

    if (!reservedId) {
      throw new Error("Could not reserve a unique S-Movie ID. Please try again.");
    }

    const smoId = formatSmoId(reservedId);
    if (newReservationRef) {
      transaction.set(newReservationRef, {
        claimed: true,
        createdAt: serverTimestamp(),
      });
    }
    if (!assignmentSnapshot.exists() || assignedId !== reservedId) {
      transaction.set(assignmentRef, { smoId });
    }
    transaction.set(
      userRef,
      {
        smoId,
        status: accountStatus.status,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return { smoId, ...accountStatus };
  });

  await cacheSmoId(uid, result.smoId);
  return result;
}

export function subscribeToSmoAccountStatus(
  uid: string,
  onStatus: (result: SmoAccountStatusResult) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(firebaseDb, "users", uid),
    (snapshot) => {
      onStatus(parseAccountStatus(snapshot.exists() ? snapshot.data() : undefined));
    },
    (error) => onError?.(error),
  );
}
