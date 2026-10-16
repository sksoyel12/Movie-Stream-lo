import AsyncStorage from "@react-native-async-storage/async-storage";

const WATCH_HISTORY_KEY = "smovie_watch_history";
const MAX_HISTORY = 50;

export type WatchHistoryItem = {
  id: string;
  title: string;
  posterUri: string;
  savedAt: number;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  genreIds?: number[];
};

export async function addToWatchHistory(item: Omit<WatchHistoryItem, "savedAt">): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
    let history: WatchHistoryItem[] = raw ? JSON.parse(raw) : [];

    history = history.filter((h) => h.id !== item.id);

    history.unshift({ ...item, savedAt: Date.now() });

    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export async function loadWatchHistory(): Promise<WatchHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearWatchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WATCH_HISTORY_KEY);
  } catch {}
}

export async function removeFromWatchHistory(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
    let history: WatchHistoryItem[] = raw ? JSON.parse(raw) : [];
    history = history.filter((h) => h.id !== id);
    await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}
