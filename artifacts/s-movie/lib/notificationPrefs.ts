import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

import type { NotifItem } from "@/data/notifications";

const REMINDERS_KEY = "smovie_notification_reminders_v1";
const VIEWED_AT_KEY  = "smovie_notifications_viewed_at_v1";
const NOTIF_ID_PREFIX = "smovie_sched_notif_id_";

export type RemindersMap = Record<string, boolean>;

// ─── Permission helper ────────────────────────────────────────────────────────

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;           // local notifs unsupported on web
  if (!Device.isDevice) return false;               // simulator / emulator

  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;

  const { status: asked } = await Notifications.requestPermissionsAsync();
  return asked === "granted";
}

// ─── Android channel (call once; idempotent) ──────────────────────────────────

async function ensureReminderChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Premiere Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0EA5E9",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
  });
}

// ─── Schedule a reminder for an upcoming title ────────────────────────────────

/**
 * Schedules a local push notification at 9 AM on the premiere date.
 * If the premiere date has already passed, fires a "now streaming" alert in 3 s.
 * Returns true on success, false if permission was denied.
 */
export async function scheduleReminder(item: NotifItem): Promise<boolean> {
  const granted = await ensurePermission();
  if (!granted) return false;

  await ensureReminderChannel();

  // Cancel any existing scheduled notification for this item first
  await cancelReminder(item.id, /* keepPref */ true);

  // Build trigger date — 9:00 AM on the release date
  const [year, month, day] = item.releaseDateISO.split("-").map(Number);
  const fireDate = new Date(year, month - 1, day, 9, 0, 0);
  const now = new Date();

  let trigger: Notifications.NotificationTriggerInput;

  if (fireDate.getTime() > now.getTime() + 60_000) {
    // Future date → calendar trigger at 9 AM on release day
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    };
  } else {
    // Date already passed or within the next minute → fire in 5 s (demo / testing)
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    };
  }

  const content: Notifications.NotificationContentInput = {
    title: "🎬 Premiere Today!",
    body: `"${item.title}" is now available on S-MOVIE. Time to watch!`,
    data: { route: "/notifications", itemId: item.id },
    ...(Platform.OS === "android"
      ? { android: { channelId: "reminders", color: "#0EA5E9", priority: "high" } } as any
      : {}),
  };

  try {
    const notifId = await Notifications.scheduleNotificationAsync({ content, trigger });
    // Persist the notification identifier so we can cancel it later
    await AsyncStorage.setItem(`${NOTIF_ID_PREFIX}${item.id}`, notifId);
    return true;
  } catch {
    return false;
  }
}

// ─── Cancel a scheduled reminder ─────────────────────────────────────────────

/**
 * Cancels the scheduled notification for the given item id.
 * @param keepPref - if true, don't touch the reminder preference (used internally).
 */
export async function cancelReminder(id: string, keepPref = false): Promise<void> {
  try {
    const key = `${NOTIF_ID_PREFIX}${id}`;
    const notifId = await AsyncStorage.getItem(key);
    if (notifId) {
      await Notifications.cancelScheduledNotificationAsync(notifId);
      await AsyncStorage.removeItem(key);
    }
  } catch {}
  if (!keepPref) {
    await saveReminder(id, false);
  }
}

// ─── Reminder toggle persistence ──────────────────────────────────────────────

export async function loadReminders(): Promise<RemindersMap> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    return raw ? (JSON.parse(raw) as RemindersMap) : {};
  } catch {
    return {};
  }
}

export async function saveReminder(id: string, on: boolean): Promise<void> {
  try {
    const current = await loadReminders();
    if (on) {
      current[id] = true;
    } else {
      delete current[id];
    }
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(current));
  } catch {}
}

// ─── Unread badge tracking ────────────────────────────────────────────────────

export async function getViewedAt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(VIEWED_AT_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export async function markAllViewed(): Promise<void> {
  try {
    await AsyncStorage.setItem(VIEWED_AT_KEY, String(Date.now()));
  } catch {}
}

export async function hasUnread(latestAddedAt: number): Promise<boolean> {
  const viewedAt = await getViewedAt();
  return latestAddedAt > viewedAt;
}
