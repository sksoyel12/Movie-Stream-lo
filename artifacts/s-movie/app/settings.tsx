import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { signOut as firebaseSignOut } from "firebase/auth";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CURRENT_VERSION } from "@/data/releaseNotes";
import { firebaseAuth } from "@/lib/firebase";
import { haptic } from "@/lib/haptics";
import { getDeviceStorageBytes, formatBytes as formatStorageBytes } from "@/lib/storage";
import { checkForAppUpdate, type VersionInfo } from "@/lib/appUpdate";
import { GOOGLE_USER_KEY } from "@/app/(tabs)/profile";

// ─── Local storage keys ─────────────────────────────────────────────────────
const FAMILY_MODE_KEY        = "smovie_settings_family_mode";
const BG_DOWNLOAD_KEY        = "smovie_settings_bg_download";
const AUTO_MINIPLAYER_KEY    = "smovie_settings_auto_miniplayer";
const WATCH_OPTION_KEY       = "smovie_settings_watch_option";

type WatchOption = "Streaming" | "Wi-Fi Only" | "Data Saver";
const WATCH_OPTIONS: WatchOption[] = ["Streaming", "Wi-Fi Only", "Data Saver"];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)}GB`;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  const [familyMode, setFamilyMode]           = useState(false);
  const [bgDownload, setBgDownload]           = useState(true);
  const [autoMiniplayer, setAutoMiniplayer]   = useState(true);
  const [watchOption, setWatchOption]         = useState<WatchOption>("Streaming");
  const [showWatchModal, setShowWatchModal]   = useState(false);

  const [networkLabel, setNetworkLabel]       = useState("—");
  const [freeSpace, setFreeSpace]             = useState("—");
  const [usedSpace, setUsedSpace]             = useState("—");
  const [deviceModel, setDeviceModel]         = useState("—");
  const [buildId, setBuildId]                 = useState("—");
  const [osApi, setOsApi]                     = useState("—");

  const [checkingUpdate, setCheckingUpdate]   = useState(false);
  const [clearingCache, setClearingCache]     = useState(false);
  const [hasNewVersion, setHasNewVersion]     = useState(false);
  const [newVersionInfo, setNewVersionInfo]   = useState<VersionInfo | null>(null);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);

  // ── Auto-check for updates on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const result = await checkForAppUpdate();
        if (result.isAvailable && result.info) {
          setHasNewVersion(true);
          setNewVersionInfo(result.info);
          setShowUpdatePopup(true);
        }
      } catch {}
    })();
  }, []);

  // ── Load persisted preferences ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [fm, bg, mp, wo] = await Promise.all([
          AsyncStorage.getItem(FAMILY_MODE_KEY),
          AsyncStorage.getItem(BG_DOWNLOAD_KEY),
          AsyncStorage.getItem(AUTO_MINIPLAYER_KEY),
          AsyncStorage.getItem(WATCH_OPTION_KEY),
        ]);
        if (fm !== null) setFamilyMode(fm === "1");
        if (bg !== null) setBgDownload(bg === "1");
        if (mp !== null) setAutoMiniplayer(mp === "1");
        if (wo && (WATCH_OPTIONS as string[]).includes(wo)) setWatchOption(wo as WatchOption);
      } catch {}
    })();
  }, []);

  // ── Device / network / storage info for the footer ──────────────────────
  useEffect(() => {
    (async () => {
      // Network type — try to detect 5G vs 4G via connection subtype
      try {
        const state = await Network.getNetworkStateAsync();
        const type = state.type;
        let label =
          type === Network.NetworkStateType.WIFI ? "WIFI" :
          type === Network.NetworkStateType.CELLULAR ? "CELLULAR" :
          type === Network.NetworkStateType.NONE ? "OFFLINE" :
          "UNKNOWN";
        // Attempt 5G detection via NetworkInformation API (web/Android)
        if (type === Network.NetworkStateType.CELLULAR && typeof navigator !== "undefined") {
          const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
          const effectiveType: string = conn?.effectiveType ?? "";
          const downlink: number = conn?.downlink ?? 0;
          if (effectiveType === "4g" && downlink > 100) label = "NETWORK_5G";
          else if (effectiveType === "4g") label = "NETWORK_4G";
          else if (effectiveType === "3g") label = "NETWORK_3G";
          else if (label === "CELLULAR") label = "NETWORK_CELLULAR";
        } else if (label === "WIFI") {
          label = "NETWORK_WIFI";
        }
        setNetworkLabel(state.isConnected === false ? "OFFLINE" : label);
      } catch {
        setNetworkLabel("UNKNOWN");
      }

      // Storage — use the native disk APIs, or the browser's real storage
      // estimate when running on web. Never display a made-up device size.
      const storage = await getDeviceStorageBytes();
      setFreeSpace(storage.totalBytes > 0 ? formatStorageBytes(storage.freeBytes) : "Unavailable");
      setUsedSpace(storage.totalBytes > 0 ? formatStorageBytes(storage.usedBytes) : "Unavailable");

      // Device hardware info
      try {
        const model = Device.modelName ?? Device.deviceName ?? "Unknown";
        setDeviceModel(model);

        // Build ID: Android uses osBuildId, iOS uses buildId field
        const bid = (Device as any).osBuildId ?? Application.nativeBuildVersion ?? "—";
        setBuildId(String(bid));

        // OS API: Android API level or OS version
        const apiLevel = (Device as any).platformApiLevel ?? Device.osVersion ?? Platform.Version;
        setOsApi(String(apiLevel));
      } catch {
        setDeviceModel("Unknown");
      }
    })();
  }, []);

  const persistToggle = useCallback((key: string, value: boolean, setter: (v: boolean) => void) => {
    haptic.light();
    setter(value);
    AsyncStorage.setItem(key, value ? "1" : "0").catch(() => {});
  }, []);

  const handleSelectWatchOption = useCallback((opt: WatchOption) => {
    setWatchOption(opt);
    setShowWatchModal(false);
    AsyncStorage.setItem(WATCH_OPTION_KEY, opt).catch(() => {});
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    if (checkingUpdate) return;
    haptic.medium();
    setCheckingUpdate(true);
    try {
      const result = await checkForAppUpdate();
      if (result.isAvailable && result.info) {
        setHasNewVersion(true);
        setNewVersionInfo(result.info);
        setShowUpdatePopup(true);
      } else if (result.error) {
        Alert.alert("Couldn't Check for Updates", result.error);
      } else {
        setHasNewVersion(false);
        Alert.alert("You're up to date", `S Movie Original v${CURRENT_VERSION} is the latest version.`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [checkingUpdate]);

  const handleClearCache = useCallback(() => {
    haptic.medium();
    Alert.alert(
      "Clear Cache",
      "This frees up storage by removing all cached images and API data. The app will re-download content on next launch.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            setClearingCache(true);
            try {
              // Clear expo-image disk + memory caches (offline image store)
              await Promise.allSettled([
                ExpoImage.clearDiskCache(),
                ExpoImage.clearMemoryCache(),
              ]);
              // Clear all smovie_ AsyncStorage keys:
              //   poster lock entries, home cache, Gemini score cache,
              //   remind-me flags, new-hot feed cache, etc.
              const allKeys = await AsyncStorage.getAllKeys();
              const smovieKeys = allKeys.filter(
                (k) => k.startsWith("smovie_") || k.startsWith("@smovie"),
              );
              if (smovieKeys.length > 0) await AsyncStorage.multiRemove(smovieKeys);
              Alert.alert("Done", "Cache cleared successfully. Freed up image and data storage.");
            } catch {
              Alert.alert("Error", "Couldn't clear all cache. Please try again.");
            } finally {
              setClearingCache(false);
            }
          },
        },
      ],
    );
  }, []);

  const handleLogout = useCallback(() => {
    haptic.medium();
    Alert.alert("Log Out", "Are you sure you want to log out of your account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try { await firebaseSignOut(firebaseAuth); } catch {}
          try { await AsyncStorage.removeItem(GOOGLE_USER_KEY); } catch {}
          router.replace("/(tabs)/profile");
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
          hitSlop={14}
        >
          <Feather name="chevron-left" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Preferences ──────────────────────────────────────────────── */}
        <SettingsSection title="Preferences">
          <SettingsRow
            icon={<Ionicons name="notifications-outline" size={20} color="#fff" />}
            label="Notifications"
            sub="Manage push alerts & channels"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/notification-settings")}
          />
          <SettingsRow
            icon={<Ionicons name="language-outline" size={20} color="#fff" />}
            label="Language"
            sub="App display language"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/(tabs)/profile")}
          />
          <SettingsRow
            icon={<MaterialCommunityIcons name="play-circle-outline" size={20} color="#fff" />}
            label="Watch Options"
            sub={watchOption}
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => setShowWatchModal(true)}
          />
        </SettingsSection>

        {/* ── Playback & Download ─────────────────────────────────────── */}
        <SettingsSection title="Playback & Download">
          <SettingsRow
            icon={<MaterialCommunityIcons name="account-child-outline" size={20} color="#fff" />}
            label="Family Mode"
            sub="Restrict content to family-friendly titles"
            right={
              <Switch
                value={familyMode}
                onValueChange={(v) => persistToggle(FAMILY_MODE_KEY, v, setFamilyMode)}
                trackColor={{ false: "#2a2a2a", true: "#E50914" }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon={<MaterialCommunityIcons name="download-outline" size={20} color="#fff" />}
            label="Download in background"
            sub="Keep downloads running while you browse"
            right={
              <Switch
                value={bgDownload}
                onValueChange={(v) => persistToggle(BG_DOWNLOAD_KEY, v, setBgDownload)}
                trackColor={{ false: "#2a2a2a", true: "#E50914" }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon={<MaterialCommunityIcons name="picture-in-picture-bottom-right-outline" size={20} color="#fff" />}
            label="Auto activate Miniplayer"
            sub="Shrink video when you leave the player"
            right={
              <Switch
                value={autoMiniplayer}
                onValueChange={(v) => persistToggle(AUTO_MINIPLAYER_KEY, v, setAutoMiniplayer)}
                trackColor={{ false: "#2a2a2a", true: "#E50914" }}
                thumbColor="#fff"
              />
            }
          />
        </SettingsSection>

        {/* ── Privacy ──────────────────────────────────────────────────── */}
        <SettingsSection title="Privacy">
          <SettingsRow
            icon={<Feather name="shield" size={20} color="#fff" />}
            label="Privacy Settings"
            sub="Data usage & permission controls"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/privacy")}
          />
        </SettingsSection>

        {/* ── Storage & Cache ─────────────────────────────────────────── */}
        <SettingsSection title="Storage & Cache">
          <SettingsRow
            icon={<Ionicons name="trash-outline" size={20} color="#E50914" />}
            label="Clear Cache"
            sub="Remove cached images and API data to free up space"
            labelStyle={{ color: "#E50914" }}
            right={clearingCache
              ? <ActivityIndicator size="small" color="#E50914" />
              : <Feather name="chevron-right" size={18} color="#404040" />}
            onPress={clearingCache ? undefined : handleClearCache}
            disabled={clearingCache}
          />
        </SettingsSection>

        {/* ── More Info & Support ─────────────────────────────────────── */}
        <SettingsSection title="More Info & Support">
          <SettingsRow
            icon={<MaterialCommunityIcons name="cloud-download-outline" size={20} color="#fff" />}
            label="Check update"
            sub={`Current version: v${CURRENT_VERSION}`}
            right={checkingUpdate
              ? <ActivityIndicator size="small" color="#0EA5E9" />
              : hasNewVersion
              ? (
                <Pressable
                  onPress={() => setShowUpdatePopup(true)}
                  style={styles.newVersionBadge}
                >
                  <Text style={styles.newVersionText}>New Version</Text>
                  <Feather name="chevron-right" size={14} color="#0EA5E9" />
                </Pressable>
              )
              : <Feather name="chevron-right" size={18} color="#404040" />}
            onPress={handleCheckUpdate}
            disabled={checkingUpdate}
          />
          <SettingsRow
            icon={<Ionicons name="information-circle-outline" size={20} color="#fff" />}
            label="About us"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/about")}
          />
          <SettingsRow
            icon={<Feather name="file-text" size={20} color="#fff" />}
            label="Privacy Policy"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/privacy")}
          />
          <SettingsRow
            icon={<Feather name="clipboard" size={20} color="#fff" />}
            label="User Agreement"
            right={<Feather name="chevron-right" size={18} color="#404040" />}
            onPress={() => router.push("/user-agreement")}
          />
          <SettingsRow
            icon={<Feather name="log-out" size={20} color="#E50914" />}
            label="Log out"
            labelStyle={{ color: "#E50914" }}
            onPress={handleLogout}
          />
        </SettingsSection>

        {/* ── Version / device / network footer ───────────────────────── */}
        <Text style={styles.versionText}>
          {`v${Application.nativeApplicationVersion ?? CURRENT_VERSION} | Build:${buildId} | API:${osApi} | ${deviceModel} | ${networkLabel} | Used:${usedSpace} | Free:${freeSpace}`}
        </Text>
      </ScrollView>

      {/* ── Watch Options modal ───────────────────────────────────────── */}
      <Modal visible={showWatchModal} transparent animationType="fade" onRequestClose={() => setShowWatchModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowWatchModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Watch Options</Text>
            {WATCH_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => handleSelectWatchOption(opt)}
                style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: "#1a1a1a" }]}
              >
                <Text style={styles.modalOptionText}>{opt}</Text>
                {watchOption === opt && <Ionicons name="checkmark" size={20} color="#E50914" />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── New Version / Update Available popup (bottom sheet) ──────── */}
      <Modal visible={showUpdatePopup} transparent animationType="slide" onRequestClose={() => setShowUpdatePopup(false)}>
        <Pressable style={styles.updateBackdrop} onPress={() => setShowUpdatePopup(false)}>
          <Pressable style={styles.updateSheet} onPress={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <View style={styles.updateHandle} />

            {/* Title */}
            <Text style={styles.updateSheetTitle}>New Version</Text>

            {/* App info row */}
            <View style={styles.updateAppRow}>
              <Image
                source={require("../assets/images/s-logo.png")}
                style={styles.updateAppIcon}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.updateAppName}>S Movie Original</Text>
                {newVersionInfo && (
                  <Text style={styles.updateAppVersion}>Version: {newVersionInfo.version}</Text>
                )}
              </View>
            </View>

            {/* Divider */}
            <View style={styles.updateDivider} />

            {/* Details */}
            <Text style={styles.updateDetailsLabel}>Details</Text>
            <Text style={styles.updateDetailsText}>
              {newVersionInfo?.releaseNotes
                ? newVersionInfo.releaseNotes
                : "A new version of S Movie Original is available. Update now for the latest features and improvements."}
            </Text>

            {/* Divider */}
            <View style={styles.updateDivider} />

            {/* Buttons row */}
            <View style={styles.updateBtnRow}>
              <Pressable
                style={({ pressed }) => [styles.updateLaterBtn, pressed && { opacity: 0.6 }]}
                onPress={() => setShowUpdatePopup(false)}
              >
                <Text style={styles.updateLaterText}>Later</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.updateNowBtn, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  setShowUpdatePopup(false);
                  router.push("/(tabs)/profile");
                }}
              >
                <Text style={styles.updateNowText}>Update</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SettingsRow({
  icon, label, sub, onPress, right, disabled, labelStyle,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
  labelStyle?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, pressed && !!onPress && !disabled && { backgroundColor: "#161616" }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.rowIconWrap}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    minHeight: 52,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 6,
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  headerSpacer: { width: 44 },

  scroll:        { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 40 },

  section: { marginBottom: 22, paddingHorizontal: 16 },
  sectionTitle: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    backgroundColor: "#0e0e0e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowLabel: { color: "#fff", fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  rowSub:   { color: "#666", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  versionText: {
    color: "#3a3a3a",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: 0.3,
  },

  // ── Watch Options modal ─────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalSheet: {
    backgroundColor: "#141414",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#222",
    width: "100%",
    maxWidth: 340,
    padding: 8,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  modalOptionText: { color: "#e5e5e5", fontSize: 14.5, fontFamily: "Inter_500Medium" },

  // ── New Version badge ──────────────────────────────────────────────────
  newVersionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14,165,233,0.12)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  newVersionText: {
    color: "#0EA5E9",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Update popup (bottom sheet) ────────────────────────────────────────
  updateBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  updateSheet: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingBottom: 36,
    paddingTop: 12,
  },
  updateHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginBottom: 18,
  },
  updateSheetTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 18,
  },
  updateAppRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  updateAppIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#111",
  },
  updateAppName: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  updateAppVersion: {
    color: "#888",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  updateDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  updateDetailsLabel: {
    color: "#aaa",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  updateDetailsText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 20,
  },
  updateBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 32,
    paddingTop: 4,
  },
  updateLaterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  updateLaterText: {
    color: "#888",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  updateNowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  updateNowText: {
    color: "#0EA5E9",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
