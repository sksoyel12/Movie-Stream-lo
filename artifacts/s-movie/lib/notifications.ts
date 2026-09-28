/**
 * notifications.ts — S-MOVIE push notification system
 *
 * Local notifications (no server needed):
 *  - Fires on every app launch if 1+ hour has passed since last check
 *  - Deduplicates by movie id so same movie is never shown twice
 *  - Deep-links into movie detail on tap
 *  - All errors silently caught — never crashes the app
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { tmdbGet } from "@/lib/tmdb";

// ─── Foreground handler ───────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Keys ─────────────────────────────────────────────────────────────────────
const LAST_NOTIFIED_KEY = "smovie_last_notified_ids_v2";
const LAST_CHECK_KEY    = "smovie_last_notif_check_v2";
const MIN_GAP_MS        = 60 * 60 * 1000; // 1 hour (was 4h — too long)

// ─── Android channels ─────────────────────────────────────────────────────────
export async function createNotificationChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("promo", {
    name: "🎬 S-MOVIE New Releases",
    description: "Alerts for new blockbusters and trending series",
    importance: Notifications.AndroidImportance.MAX,      // MAX so it heads-up
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E50914",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    enableVibrate: true,
    showBadge: true,
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync("default", {
    name: "General",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1769FF",
    sound: "default",
  });
}

// ─── Permission request ───────────────────────────────────────────────────────
/**
 * Requests notification permission.
 * Returns the Expo push token if granted + projectId present, else null.
 * Local notifications work even WITHOUT a push token — permission is enough.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Skip on web — browser notification permission dialog is disruptive on app open.
  // Users can enable notifications from the Profile → Settings screen instead.
  if (Platform.OS === "web") return null;

  await createNotificationChannels();

  // Simulators/emulators can still run local scheduled notifications,
  // but getExpoPushTokenAsync requires a real device.
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  // Local notifications work without any Expo push token — no server dependency needed.
  return null;
}

// ─── Trending fetch ───────────────────────────────────────────────────────────
interface TrendingItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string;
}

async function fetchTrending(): Promise<TrendingItem[]> {
  const data = await tmdbGet<{ results?: TrendingItem[] }>(
    "/trending/all/day",
    { language: "en-US" },
  );
  return (data.results ?? []) as TrendingItem[];
}

// ─── Main: check TMDB → fire notification ─────────────────────────────────────
/**
 * Checks TMDB trending every 1 hour. Fires a local heads-up notification
 * for the first trending movie the user hasn't been alerted about yet.
 *
 * SAFE to call on every app launch — rate-limited internally.
 */
export async function checkAndNotifyNewTrending(): Promise<void> {
  try {
    // Check permission first — bail early if denied
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    // Rate-limit: skip if checked within the last hour
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (lastCheck && Date.now() - parseInt(lastCheck) < MIN_GAP_MS) {
      return;
    }

    const items = await fetchTrending();
    if (items.length === 0) return;

    // Load already-notified IDs
    const raw = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    const notifiedIds: Set<number> = raw ? new Set(JSON.parse(raw)) : new Set();

    // Find first unnotified item
    const novel = items.find((m) => !notifiedIds.has(m.id));

    if (!novel) {
      // All top trending shown — reset so we never go silent
      notifiedIds.clear();
      await AsyncStorage.setItem(LAST_NOTIFIED_KEY, JSON.stringify([]));
    }

    const target = novel ?? items[0];
    const displayTitle = target.title ?? target.name ?? "A New Blockbuster";
    const tmdbId = `tmdb-${target.id}`;
    const mediaType = target.media_type === "tv" ? "tv" : "movie";
    const posterUrl = target.poster_path
      ? `https://wsrv.nl/?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w342${target.poster_path}`)}&output=webp&q=85`
      : undefined;

    const messages = [
      { title: "🎬 New on S-Movie Original!", body: `"${displayTitle}" is trending right now — tap to watch in HD!` },
      { title: "🔥 Trending Today", body: `"${displayTitle}" is on fire. Don't miss it!` },
      { title: "🍿 Watch Now", body: `"${displayTitle}" just hit #1 trending. Start watching instantly!` },
      { title: "✨ S-MOVIE Pick", body: `"${displayTitle}" is the talk of the town. Check it out!` },
    ];
    const msg = messages[target.id % messages.length];

    await Notifications.scheduleNotificationAsync({
      content: {
        title: msg.title,
        body: msg.body,
        data: {
          movieId: tmdbId,
          type: mediaType,
          route: `/movie/${tmdbId}`,
        },
        ...(Platform.OS === "android"
          ? {
              android: {
                channelId: "promo",
                largeIcon: posterUrl,
                color: "#E50914",
                priority: "max",      // MAX = heads-up banner on Android
                sticky: false,
                smallIcon: "ic_notification",
                tag: "smovie_trending",
              },
            } as any
          : {}),
        ...(Platform.OS === "ios" && posterUrl
          ? { attachments: [{ url: posterUrl, identifier: "poster" } as any] }
          : {}),
      },
      trigger: {
        seconds: 3,                    // 3s delay — fast & feels organic
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    // Mark this movie as notified
    notifiedIds.add(target.id);
    const arr = [...notifiedIds].slice(-50); // keep last 50
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, JSON.stringify(arr));
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    // Never crash the app over a notification
  }
}

// ─── Force-fire a notification (for testing / manual trigger) ─────────────────
/**
 * Bypasses the rate limit and fires a notification immediately (after 2s).
 * Call from a debug/test button.
 */
export async function forceNotifyTrending(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return false;

    // Clear rate-limit so next call to checkAndNotifyNewTrending also runs
    await AsyncStorage.removeItem(LAST_CHECK_KEY);

    await checkAndNotifyNewTrending();
    return true;
  } catch {
    return false;
  }
}

// ─── Legacy helpers ───────────────────────────────────────────────────────────

const TEMPLATES = [
  (t: string) => ({ title: "Trending Right Now 🔥", body: `"${t}" is on fire — don't miss it!` }),
  (t: string) => ({ title: "S-MOVIE Pick of the Day", body: `"${t}" is trending. Start watching now!` }),
  (t: string) => ({ title: "Top Pick For You 🎬", body: `"${t}" just hit #1. See what everyone is watching!` }),
  (t: string) => ({ title: "Hot New Release", body: `"${t}" just dropped. Stream it free now!` }),
];

export async function schedulePromoNotification(opts?: {
  movieTitle?: string;
  movieId?: string;
  posterUrl?: string;
  delaySeconds?: number;
}) {
  const { movieTitle = "Top Picks", movieId, posterUrl, delaySeconds = 30 } = opts ?? {};
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const idx = Math.floor(Math.random() * TEMPLATES.length);
    const { title, body } = TEMPLATES[idx](movieTitle);
    await Notifications.scheduleNotificationAsync({
      content: {
        title, body,
        data: movieId ? { movieId, type: "trending_promo" } : { type: "trending_promo" },
        ...(Platform.OS === "android"
          ? { android: { channelId: "promo", largeIcon: posterUrl, color: "#E50914", priority: "high" } } as any
          : {}),
        ...(Platform.OS === "ios" && posterUrl
          ? { attachments: [{ url: posterUrl, identifier: "poster" } as any] }
          : {}),
      },
      trigger: { seconds: delaySeconds, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
    });
  } catch { }
}

export async function scheduleWeeklyTrendingNotifications(titles: string[]) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content.data as any)?.type === "trending_promo") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    // Shorter delays: 2h, 8h, 24h (was 3h, 24h, 48h — too long)
    const delays = [2 * 3600, 8 * 3600, 24 * 3600];
    for (let i = 0; i < Math.min(titles.length, delays.length); i++) {
      const { title, body } = TEMPLATES[i % TEMPLATES.length](titles[i]);
      await Notifications.scheduleNotificationAsync({
        content: {
          title, body,
          data: { type: "trending_promo" },
          ...(Platform.OS === "android"
            ? { android: { channelId: "promo", color: "#E50914", priority: "high" } } as any
            : {}),
        },
        trigger: { seconds: delays[i], type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
      });
    }
  } catch { }
}

export function attachNotificationListeners(opts?: {
  onReceived?: (n: Notifications.Notification) => void;
  onResponse?: (r: Notifications.NotificationResponse) => void;
}) {
  const receivedSub = Notifications.addNotificationReceivedListener((n) => opts?.onReceived?.(n));
  const responseSub = Notifications.addNotificationResponseReceivedListener((r) => opts?.onResponse?.(r));
  return () => { receivedSub.remove(); responseSub.remove(); };
}
