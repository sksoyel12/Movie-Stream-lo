import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createNotificationChannels, forceNotifyTrending } from "@/lib/notifications";
import { haptic } from "@/lib/haptics";

type PermStatus = "granted" | "denied" | "undetermined" | "loading";

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [permStatus, setPermStatus] = useState<PermStatus>("loading");
  const [testing, setTesting]       = useState(false);
  const [testSent, setTestSent]     = useState(false);

  // ── Check real system permission on mount ──────────────────────────────────
  const checkPerm = useCallback(async () => {
    setPermStatus("loading");
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermStatus(status as PermStatus);
    } catch {
      setPermStatus("undetermined");
    }
  }, []);

  useEffect(() => { checkPerm(); }, [checkPerm]);

  // ── Request permission ──────────────────────────────────────────────────────
  const handleRequestPerm = useCallback(async () => {
    haptic.medium();
    try {
      if (Platform.OS === "web") {
        Alert.alert("Not supported", "Notifications require the Android app.");
        return;
      }

      const { status: current } = await Notifications.getPermissionsAsync();

      if (current === "denied") {
        // Already denied — send user to system settings
        Alert.alert(
          "Permission Denied",
          "To enable notifications, go to your phone's Settings → Apps → S Movie Original → Notifications and turn them on.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      await createNotificationChannels();
      const { status } = await Notifications.requestPermissionsAsync();
      setPermStatus(status as PermStatus);

      if (status === "granted") {
        haptic.success();
      }
    } catch {
      setPermStatus("undetermined");
    }
  }, []);

  // ── Send test notification ──────────────────────────────────────────────────
  const handleTest = useCallback(async () => {
    if (permStatus !== "granted") {
      Alert.alert("Permission needed", "Please enable notifications first.");
      return;
    }
    haptic.medium();
    setTesting(true);
    setTestSent(false);

    try {
      // Clear rate-limit cache so it always fires
      await AsyncStorage.removeItem("smovie_last_notif_check_v2");
      const ok = await forceNotifyTrending();
      if (ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 4000);
      } else {
        Alert.alert("Could not send", "Check your internet connection and try again.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Try again.");
    } finally {
      setTesting(false);
    }
  }, [permStatus]);

  const isGranted = permStatus === "granted";
  const isDenied  = permStatus === "denied";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { haptic.light(); router.back(); }}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>

        {/* ── Permission status card ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>PERMISSION STATUS</Text>
        <View style={styles.card}>
          <View style={styles.statusBlock}>
            {permStatus === "loading" ? (
              <ActivityIndicator color="#E50914" size="small" />
            ) : (
              <>
                <View style={[
                  styles.statusIconWrap,
                  isGranted ? styles.statusIconGreen : styles.statusIconRed,
                ]}>
                  <Ionicons
                    name={isGranted ? "checkmark-circle" : "close-circle"}
                    size={26}
                    color={isGranted ? "#34D399" : "#E50914"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>
                    {isGranted ? "Notifications Enabled" : isDenied ? "Notifications Blocked" : "Permission Not Granted"}
                  </Text>
                  <Text style={styles.statusSub}>
                    {isGranted
                      ? "You'll receive alerts about new trending movies & series."
                      : isDenied
                      ? "Open Settings to allow S Movie Original to send notifications."
                      : "Tap below to allow notifications."}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Enable / Open Settings button */}
          {!isGranted && permStatus !== "loading" && (
            <>
              <View style={styles.divider} />
              <Pressable
                onPress={handleRequestPerm}
                style={({ pressed }) => [styles.enableBtn, pressed && { opacity: 0.78 }]}
              >
                <Ionicons name="notifications" size={18} color="#fff" />
                <Text style={styles.enableBtnText}>
                  {isDenied ? "Open System Settings" : "Enable Notifications"}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── Test notification card ───────────────────────────────────────── */}
        {Platform.OS !== "web" && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>TEST</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconWrap, { backgroundColor: isGranted ? "rgba(229,9,20,0.1)" : "#1a1a1a" }]}>
                    <MaterialCommunityIcons
                      name="bell-ring-outline"
                      size={20}
                      color={isGranted ? "#E50914" : "#404040"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, !isGranted && { color: "#404040" }]}>
                      Send Test Notification
                    </Text>
                    <Text style={styles.rowSub}>
                      {testSent
                        ? "✅ Notification sent! Check in ~3 seconds."
                        : "Fires a trending movie alert right now."}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleTest}
                  disabled={!isGranted || testing}
                  style={({ pressed }) => [
                    styles.testBtn,
                    isGranted ? styles.testBtnActive : styles.testBtnDisabled,
                    pressed && isGranted && { opacity: 0.7 },
                  ]}
                >
                  {testing
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[styles.testBtnText, !isGranted && { color: "#404040" }]}>
                        {testSent ? "Sent ✓" : "Test"}
                      </Text>
                  }
                </Pressable>
              </View>
            </View>
          </>
        )}

        {/* ── Info card ───────────────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Feather name="info" size={13} color="#525252" style={{ marginTop: 1, flexShrink: 0 }} />
          <Text style={styles.infoText}>
            Notifications are sent once per hour maximum. They alert you about new trending movies and series on TMDB. No marketing or spam.
          </Text>
        </View>

        {/* Web notice */}
        {Platform.OS === "web" && (
          <View style={styles.infoCard}>
            <Feather name="smartphone" size={13} color="#525252" style={{ marginTop: 1, flexShrink: 0 }} />
            <Text style={styles.infoText}>
              Install the Android APK to receive real notifications on your device.
            </Text>
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a1a1a",
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, textAlign: "center",
    color: "#fff", fontSize: 17,
    fontFamily: "Inter_700Bold", letterSpacing: -0.3,
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 28,
  },

  sectionLabel: {
    color: "#404040", fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginBottom: 10, paddingLeft: 4,
  },

  card: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    overflow: "hidden",
  },

  // Status block
  statusBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  statusIconWrap: {
    width: 46, height: 46,
    borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  statusIconGreen: { backgroundColor: "rgba(52,211,153,0.1)" },
  statusIconRed:   { backgroundColor: "rgba(229,9,20,0.1)" },
  statusTitle: {
    color: "#fff", fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 3,
  },
  statusSub: {
    color: "#525252", fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },

  // Enable button
  enableBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E50914",
    margin: 14,
    marginTop: 0,
    borderRadius: 12,
    paddingVertical: 13,
  },
  enableBtnText: {
    color: "#fff", fontSize: 15,
    fontFamily: "Inter_700Bold",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#1c1c1c",
    marginHorizontal: 16,
    marginBottom: 14,
  },

  // Row
  row: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 16,
  },
  rowLeft: {
    flexDirection: "row", alignItems: "center",
    gap: 12, flex: 1, marginRight: 12,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  rowLabel: {
    color: "#e5e5e5", fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  rowSub: {
    color: "#525252", fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },

  // Test button
  testBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20, minWidth: 60,
    alignItems: "center", justifyContent: "center",
  },
  testBtnActive:   { backgroundColor: "#E50914" },
  testBtnDisabled: { backgroundColor: "#1a1a1a" },
  testBtnText: {
    color: "#fff", fontSize: 13,
    fontFamily: "Inter_700Bold",
  },

  // Info card
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#161616",
  },
  infoText: {
    flex: 1, color: "#525252",
    fontSize: 12, fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
