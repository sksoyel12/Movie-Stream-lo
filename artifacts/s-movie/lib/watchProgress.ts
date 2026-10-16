import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";

export type WatchProgress = {
  movieId: string;
  positionSec: number;
  durationSec: number;
  updatedAt: number;
  timestamp?: number;
  lastWatchedAt?: string;
  title?: string;
  posterUri?: string;
};

const STORAGE_KEY = "smovie_watch_progress_v2";

async function loadAll(): Promise<Record<string, WatchProgress>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WatchProgress>) : {};
  } catch {
    return {};
  }
}

async function saveAll(data: Record<string, WatchProgress>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Persist playback position for a movie. Only saves if more than 5s in. */
export async function saveProgress(progress: WatchProgress): Promise<void> {
  if (progress.positionSec < 5) return;
  const now = Date.now();
  const nextProgress: WatchProgress = {
    ...progress,
    updatedAt: now,
    timestamp: progress.positionSec,
    lastWatchedAt: new Date(now).toISOString(),
  };
  const all = await loadAll();
  all[progress.movieId] = nextProgress;
  await saveAll(all);

  const user = firebaseAuth.currentUser;
  if (!user) return;
  try {
    await setDoc(
      doc(firebaseDb, "user_progress", `${user.uid}_${encodeURIComponent(progress.movieId)}`),
      {
        userId: user.uid,
        movieId: progress.movieId,
        timestamp: progress.positionSec,
        currentTime: progress.positionSec,
        positionSec: progress.positionSec,
        durationSec: progress.durationSec,
        lastWatchedAt: nextProgress.lastWatchedAt,
        lastWatchedAtMs: now,
        title: progress.title ?? null,
        posterUri: progress.posterUri ?? null,
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("[WatchProgress] Firestore save failed; local progress kept.", error);
  }
}

/** Load saved progress for a specific movie, or null if none. */
export async function loadProgress(
  movieId: string,
): Promise<WatchProgress | null> {
  const all = await loadAll();
  const local = all[movieId] ?? null;
  const user = firebaseAuth.currentUser;
  if (!user) return local;
  try {
    const snapshot = await getDoc(
      doc(firebaseDb, "user_progress", `${user.uid}_${encodeURIComponent(movieId)}`),
    );
    if (!snapshot.exists()) return local;
    const remote = snapshot.data();
    return {
      movieId,
      positionSec: Number(remote.positionSec ?? remote.currentTime ?? 0),
      durationSec: Number(remote.durationSec ?? 0),
      updatedAt: Number(
        remote.lastWatchedAtMs ??
          (typeof remote.lastWatchedAt === "string" ? Date.parse(remote.lastWatchedAt) : 0) ??
          Date.now(),
      ),
      timestamp: Number(remote.timestamp ?? remote.currentTime ?? 0),
      lastWatchedAt: typeof remote.lastWatchedAt === "string" ? remote.lastWatchedAt : undefined,
      title: typeof remote.title === "string" ? remote.title : local?.title,
      posterUri: typeof remote.posterUri === "string" ? remote.posterUri : local?.posterUri,
    };
  } catch {
    return local;
  }
}

/**
 * Return all movies with saved progress, sorted by most recently watched.
 * Filters out:
 *  - Videos watched < 5s (accidental starts)
 *  - Videos > 95% complete (considered finished)
 */
export async function loadAllProgress(): Promise<WatchProgress[]> {
  const user = firebaseAuth.currentUser;
  if (user) {
    try {
      const snapshot = await getDocs(
        query(collection(firebaseDb, "user_progress"), where("userId", "==", user.uid)),
      );
      const remoteItems = snapshot.docs.map((entry) => {
        const remote = entry.data();
        return {
          movieId: String(remote.movieId ?? entry.id),
          positionSec: Number(remote.positionSec ?? remote.currentTime ?? 0),
          durationSec: Number(remote.durationSec ?? 0),
          updatedAt: Number(
            remote.lastWatchedAtMs ??
              (typeof remote.lastWatchedAt === "string" ? Date.parse(remote.lastWatchedAt) : 0),
          ),
          timestamp: Number(remote.timestamp ?? remote.currentTime ?? 0),
          lastWatchedAt: typeof remote.lastWatchedAt === "string" ? remote.lastWatchedAt : undefined,
          title: typeof remote.title === "string" ? remote.title : undefined,
          posterUri: typeof remote.posterUri === "string" ? remote.posterUri : undefined,
        } satisfies WatchProgress;
      });
      return remoteItems
        .filter((p) => p.positionSec >= 5 && !(p.durationSec > 0 && p.positionSec >= p.durationSec * 0.95))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.warn("[WatchProgress] Firestore fetch failed; using local progress.", error);
    }
  }
  const all = await loadAll();
  return Object.values(all)
    .filter((p) => {
      if (p.positionSec < 5) return false;
      if (p.durationSec > 0 && p.positionSec >= p.durationSec * 0.95)
        return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Remove saved progress for a finished or manually cleared movie. */
export async function clearProgress(movieId: string): Promise<void> {
  const all = await loadAll();
  delete all[movieId];
  await saveAll(all);
  const user = firebaseAuth.currentUser;
  if (user) {
    await deleteDoc(
      doc(firebaseDb, "user_progress", `${user.uid}_${encodeURIComponent(movieId)}`),
    ).catch(() => {});
  }
}
