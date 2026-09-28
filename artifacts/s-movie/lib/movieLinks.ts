import { getDatabase, ref, set, get, child, push } from "firebase/database";
import app from "./firebase";

export interface MovieLinks {
  vegamovies?: string;
  fzmovies?: string;
  xprime?: string;
  directVideo?: string;
}

export interface EpisodeLink {
  directVideo: string;
}

const db = getDatabase(app, "https://movie-original-default-rtdb.asia-southeast1.firebasedatabase.app/");

export async function saveMovieLinks(tmdbId: number, links: MovieLinks): Promise<void> {
  const movieRef = ref(db, `movies/${tmdbId}`);
  const clean: MovieLinks = {};
  if (links.vegamovies?.trim()) clean.vegamovies = links.vegamovies.trim();
  if (links.fzmovies?.trim()) clean.fzmovies = links.fzmovies.trim();
  if (links.xprime?.trim()) clean.xprime = links.xprime.trim();
  if (links.directVideo?.trim()) clean.directVideo = links.directVideo.trim();
  await set(movieRef, clean);
}

export async function fetchMovieLinks(tmdbId: number): Promise<MovieLinks | null> {
  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `movies/${tmdbId}`));
    if (snapshot.exists()) return snapshot.val() as MovieLinks;
    return null;
  } catch {
    return null;
  }
}

export async function saveEpisodeLink(
  tmdbId: number,
  season: number,
  episode: number,
  directVideo: string,
): Promise<void> {
  const epRef = ref(db, `episodes/${tmdbId}/S${season}E${episode}`);
  await set(epRef, { directVideo: directVideo.trim() });
}

export async function fetchEpisodeLink(
  tmdbId: number,
  season: number,
  episode: number,
): Promise<EpisodeLink | null> {
  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `episodes/${tmdbId}/S${season}E${episode}`));
    if (snapshot.exists()) return snapshot.val() as EpisodeLink;
    return null;
  } catch {
    return null;
  }
}

export async function saveFeedback(text: string): Promise<void> {
  const feedbackRef = ref(db, "feedback");
  await push(feedbackRef, {
    text: text.trim(),
    timestamp: Date.now(),
  });
}
