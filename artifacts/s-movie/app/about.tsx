import { Feather, Ionicons } from "@expo/vector-icons";
import * as ClipboardExpo from "expo-clipboard";
import * as Device from "expo-device";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { firebaseAuth } from "@/lib/firebase";
import { syncGoogleUser } from "@/lib/identity";
import { getOrCreateLocalSmoId, syncSmoAccountRecord } from "@/lib/smoAccount";
import { getRuntimeDeviceInfo } from "@/lib/deviceInfo";
import { getStorageBreakdown } from "@/lib/storage";
import { useColors } from "@/hooks/useColors";
import { getNetworkInfo } from "@/lib/networkInfo";

// ─────────────────────────────────────────────────────────────────────────────
// Data models
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceData {
  modelName: string;
  deviceStatus: string;
  osApi: string;
  cpuArch: string;
  network: string;
  networkRegion: string;
  build: string;
  usedStorageBytes: number;
  appDownloadStorageBytes: number;
  freeStorageBytes: number;
  totalStorageBytes: number;
}

interface AccountData {
  email: string | null;
  name: string | null;
  status: "signed-in" | "guest";
}

interface DiagnosticResult {
  label: string;
  value: string;
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanDeviceField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleanValue = value.trim();
  if (
    !cleanValue ||
    cleanValue === "—" ||
    cleanValue === "#—" ||
    cleanValue === "-" ||
    /^(?:k|unknown|generic|browser|desktop|mobile|android|n\/a|not available|0(?:\.0)+)$/i.test(cleanValue)
  ) {
    return null;
  }
  return cleanValue;
}

function fmtGB(bytes: number): string {
  return `${(Math.max(0, bytes) / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function loadDeviceData(): Promise<DeviceData> {
  const runtimeDevice = await getRuntimeDeviceInfo();
  const unavailable = Platform.OS === "web"
    ? "Unavailable in browser preview"
    : "Not reported by device";
  const deviceStatus = runtimeDevice.isPhysicalDevice === true
    ? "Physical device"
    : runtimeDevice.isPhysicalDevice === false
    ? "Simulator / emulator"
    : Platform.OS === "web"
    ? "Not verifiable in browser"
    : "Not reported by device";
  const apiLevel = Platform.OS === "android" && Device.platformApiLevel
    ? String(Device.platformApiLevel)
    : runtimeDevice.osApiLevel;
  const modelName = runtimeDevice.modelName ??
    (Platform.OS === "android"
      ? cleanDeviceField(Device.modelName) ?? cleanDeviceField(Device.designName)
      : null) ??
    unavailable;
  const osLabel = runtimeDevice.osLabel ??
    (Platform.OS === "android" ? `Android ${Device.osVersion ?? ""}`.trim() : null);
  const osApi = osLabel
    ? apiLevel
      ? `${osLabel} (API ${apiLevel})`
      : osLabel
    : unavailable;
  const cpuArch = runtimeDevice.cpuArch ??
    (Platform.OS === "android"
      ? Device.supportedCpuArchitectures?.filter(Boolean).join(", ") || null
      : null) ??
    unavailable;
  const build = Platform.OS === "web"
    ? unavailable
    : cleanDeviceField(Device.osInternalBuildId) ??
      cleanDeviceField(Device.osBuildId) ??
      unavailable;

  return {
    modelName,
    deviceStatus,
    osApi,
    cpuArch,
    build,
    network: "Checking…",
    networkRegion: "Checking…",
    usedStorageBytes: 0,
    appDownloadStorageBytes: 0,
    freeStorageBytes: 0,
    totalStorageBytes: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [data, setData] = useState<DeviceData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [uniqueUserId, setUniqueUserId] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [uidCopied, setUidCopied] = useState(false);
  const uidCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageLoading, setStorageLoading] = useState(true);

  // Diagnostics state
  const [connectionChecking, setConnectionChecking] = useState(false);
  const [connectionResults, setConnectionResults] = useState<DiagnosticResult[] | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDeviceData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);

        getStorageBreakdown()
          .then((storage) => {
            if (cancelled) return;
            setData((current) =>
              current
                ? {
                    ...current,
                    usedStorageBytes: storage.usedBytes,
                    appDownloadStorageBytes: storage.appDownloadBytes,
                    freeStorageBytes: storage.freeBytes,
                    totalStorageBytes: storage.totalBytes,
                  }
                : current,
            );
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setStorageLoading(false);
          });

        getNetworkInfo()
          .then((network) => {
            if (cancelled) return;
            setData((current) =>
              current
                ? { ...current, network: network.label, networkRegion: network.region }
                : current,
            );
          })
          .catch(() => {
            if (!cancelled) {
              setData((current) =>
                current
                  ? { ...current, network: "Unavailable", networkRegion: "Unavailable" }
                  : current,
              );
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setStorageLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Show a locally persisted deterministic ID immediately, then sync it to
  // Firestore and the API without making the About screen depend on either.
  useEffect(() => {
    let cancelled = false;
    let authEvent = 0;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      const event = ++authEvent;
      if (!user) {
        setAccount({ email: null, name: null, status: "guest" });
        setUniqueUserId(null);
        setIdentityStatus("signed-out");
        return;
      }

      setAccount({
        email: user.email ?? null,
        name: user.displayName ?? user.email ?? user.phoneNumber ?? "S Movie Original User",
        status: "signed-in",
      });
      setIdentityStatus("loading");

      void (async () => {
        try {
          const localSmoId = await getOrCreateLocalSmoId(user.uid);
          if (!cancelled && event === authEvent) {
            setUniqueUserId(localSmoId);
            setIdentityStatus("ready");
          }
          const identity = await syncGoogleUser({
            email: user.email,
            displayName: user.displayName,
            photoUrl: user.photoURL,
            smoId: localSmoId,
          });
          if (!cancelled && event === authEvent) {
            setUniqueUserId(identity.uniqueUserId);
            setIdentityStatus("ready");
          }
        } catch {
          if (!cancelled && event === authEvent) {
            // The local ID is still shown if a remote sync is unavailable.
            setIdentityStatus((current) => current === "ready" ? "ready" : "error");
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      authEvent++;
      unsubscribe();
    };
  }, []);

  const handleCopyUid = async () => {
    if (!uniqueUserId) return;
    await ClipboardExpo.setStringAsync(uniqueUserId).catch(() => {});
    setUidCopied(true);
    if (uidCopiedTimer.current) clearTimeout(uidCopiedTimer.current);
    uidCopiedTimer.current = setTimeout(() => setUidCopied(false), 2500);
  };

  const handleCheckNetwork = async () => {
    if (connectionChecking) return;
    setConnectionChecking(true);
    setConnectionResults(null);
    try {
      const snapshot = await getNetworkInfo();
      setConnectionResults([
        {
          label: "Connection",
          value: snapshot.label,
          ok: snapshot.connected !== false,
        },
        {
          label: "Region / carrier",
          value: snapshot.region,
          ok: true,
        },
        {
          label: "Internet access",
          value: snapshot.internetReachable === true
            ? "Available"
            : snapshot.internetReachable === false
            ? "Unavailable"
            : "Not reported",
          ok: snapshot.internetReachable !== false,
        },
      ]);
      if (!data) {
        setData({
          modelName: "Not reported by device",
          deviceStatus: "Not reported by device",
          osApi: "Not reported by device",
          cpuArch: "Not reported by device",
          network: snapshot.label,
          networkRegion: snapshot.region,
          build: "Not reported by device",
          usedStorageBytes: 0,
          appDownloadStorageBytes: 0,
          freeStorageBytes: 0,
          totalStorageBytes: 0,
        });
      } else {
        setData({
          ...data,
          network: snapshot.label,
          networkRegion: snapshot.region,
        });
      }
    } finally {
      setConnectionChecking(false);
    }
  };

  // ── Open the requested external speed-test service ────────────────────────
  const handleInternetSpeedTest = () => {
    setNetworkError(null);
    try {
      void Linking.openURL("https://fast.com/").catch(() => {
        setNetworkError("Could not open FAST.com. Please try again or open https://fast.com/ in your browser.");
      });
    } catch {
      setNetworkError("Could not open FAST.com. Please try again or open https://fast.com/ in your browser.");
    }
  };

  // ── Storage bar values ────────────────────────────────────────────────────
  const totalBytes  = data?.totalStorageBytes ?? 0;
  const freeBytes   = data?.freeStorageBytes  ?? 0;
  const appDownloadBytes = Math.min(
    data?.appDownloadStorageBytes ?? 0,
    Math.max(0, totalBytes - freeBytes),
  );
  const usedBytes = Math.max(0, data?.usedStorageBytes ?? 0);
  const usedFraction = totalBytes > 0 ? Math.min(1, usedBytes / totalBytes) : 0;
  const downloadFraction = totalBytes > 0 ? Math.min(1, appDownloadBytes / totalBytes) : 0;
  const freeFraction = totalBytes > 0 ? Math.min(1, freeBytes / totalBytes) : 0;
  const asPercent = (fraction: number) =>
    `${Math.max(0, Math.min(1, fraction)) * 100}%` as `${number}%`;
  const usedPct = asPercent(usedFraction);
  const downloadPct = asPercent(downloadFraction);
  const freePct = asPercent(freeFraction);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top || 12 }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
          hitSlop={14}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>App Settings / About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Brand card ───────────────────────────────────────────────── */}
        <View style={styles.brandCard}>
          <View style={styles.logoRow}>
            <Image
              source={require("../assets/images/app-logo-icon.png")}
              style={styles.logoImage}
              resizeMode="cover"
              accessibilityLabel="S Movie Original app logo"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>S Movie Original</Text>
              <Text style={styles.appSubtitle}>DEVICE &amp; STORAGE</Text>
            </View>
          </View>
        </View>

        {/* ── Internal Storage Bar ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="hard-drive" size={13} color="#555" />
            <Text style={styles.sectionTitle}>
              {Platform.OS === "web" ? "STORAGE QUOTA" : "INTERNAL STORAGE"}
            </Text>
          </View>

          {storageLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#333" />
              <Text style={styles.loadingText}>Reading storage…</Text>
            </View>
          ) : totalBytes > 0 ? (
            <View style={styles.storagePad}>
              {/* Bar */}
              <View
                style={[storageStyles.track, { backgroundColor: colors.border }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round((usedFraction + downloadFraction) * 100) }}
              >
                <View style={[storageStyles.segment, { width: usedPct, backgroundColor: colors.foreground }]} />
                <View style={[storageStyles.segment, { width: downloadPct, backgroundColor: colors.downloadAccent }]} />
                <View style={[storageStyles.segment, { width: freePct, backgroundColor: colors.mutedForeground }]} />
              </View>
              {/* Labels */}
              <View style={storageStyles.labelsRow}>
                <View style={storageStyles.labelItem}>
                  <View style={[storageStyles.dot, { backgroundColor: colors.foreground }]} />
                  <Text style={storageStyles.labelText}>
                    {Platform.OS === "web" ? "Site used" : "Used"} · {fmtGB(usedBytes)}
                  </Text>
                </View>
                <View style={storageStyles.labelItem}>
                  <View style={[storageStyles.dot, { backgroundColor: colors.downloadAccent }]} />
                  <Text style={storageStyles.labelText}>S-Movie · {fmtGB(appDownloadBytes)}</Text>
                </View>
                <View style={storageStyles.labelItem}>
                  <View style={[storageStyles.dot, { backgroundColor: colors.mutedForeground }]} />
                  <Text style={storageStyles.labelText}>
                    {Platform.OS === "web" ? "Quota free" : "Free"} · {fmtGB(freeBytes)}
                  </Text>
                </View>
                <Text style={storageStyles.totalText}>
                  {fmtGB(totalBytes)} {Platform.OS === "web" ? "quota" : "total"}
                </Text>
              </View>
            </View>
          ) : (
            <InfoRow label="Storage Info" value="Not available on this platform" />
          )}
        </View>

        {/* ── Device Details ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="smartphone" size={13} color="#555" />
            <Text style={styles.sectionTitle}>DEVICE DETAILS</Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#333" />
              <Text style={styles.loadingText}>Reading hardware…</Text>
            </View>
          ) : (
            <>
              {Platform.OS === "web" &&
              (!data ||
                  [data.modelName, data.osApi, data.cpuArch].every(
                    (value) => value === "Unavailable in browser preview",
                )) ? (
                <InfoRow
                  label="Device hardware"
                  value="Unavailable in browser preview"
                />
              ) : (
                <>
                  <InfoRow label="Device type" value={data?.deviceStatus ?? "Unavailable"} />
                  <InfoRow label="Model" value={data?.modelName ?? "Unavailable"} />
                  <InfoRow label="OS / API" value={data?.osApi ?? "Unavailable"} />
                  <InfoRow label="Supported arch" value={data?.cpuArch ?? "Unavailable"} />
                  {Platform.OS !== "web" && (
                    <InfoRow label="OS build" value={data?.build ?? "Unavailable"} />
                  )}
                </>
              )}
              <InfoRow label="Network" value={data?.network ?? "Unknown"} />
              <InfoRow label="Network Region / Carrier" value={data?.networkRegion ?? "Unknown"} />
            </>
          )}
        </View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="user" size={13} color="#555" />
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
          </View>

          {identityStatus === "loading" && !account ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#333" />
              <Text style={styles.loadingText}>Loading account…</Text>
            </View>
          ) : account?.status === "signed-in" ? (
            <>
              <InfoRow label="Email"   value={account.email  ?? "—"} accent />
              <InfoRow label="Name"    value={account.name   ?? "—"} />
              <InfoRow label="Status"  value="Signed In" accent />
              {uniqueUserId ? (
                <Pressable
                  onPress={handleCopyUid}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy S-Movie ID ${uniqueUserId}`}
                  style={({ pressed }) => [esnRowStyles.row, pressed && { backgroundColor: "rgba(229,9,20,0.04)" }]}
                >
                  <Text style={esnRowStyles.label}>S-Movie ID</Text>
                  <View style={esnRowStyles.valueWrap}>
                    <Text style={[esnRowStyles.value, { color: "#60A5FA" }]} numberOfLines={1} adjustsFontSizeToFit>
                      {uniqueUserId}
                    </Text>
                    <View style={[esnRowStyles.copyBadge, uidCopied && esnRowStyles.copyBadgeCopied]}>
                      <Feather name={uidCopied ? "check" : "copy"} size={11} color={uidCopied ? "#34D399" : "#555"} />
                      <Text style={[esnRowStyles.copyText, uidCopied && { color: "#34D399" }]}>
                        {uidCopied ? "Copied" : "Copy"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ) : null}
              {uniqueUserId ? (
                /* SOURCE_LOCK_START: account identity note render */
                <Text style={styles.identityNote}>
                  Unique to this account; email updates and linked sign-in methods won’t change it.
                </Text>
                /* SOURCE_LOCK_END: account identity note render */
              ) : identityStatus === "loading" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#60A5FA" />
                  <Text style={styles.loadingText}>Loading S-Movie ID…</Text>
                </View>
              ) : (
                <InfoRow
                  label="S-Movie ID"
                  value={identityStatus === "error" ? "ID unavailable" : "Preparing local ID…"}
                />
              )}
            </>
          ) : (
            <InfoRow label="Account" value="Guest (not signed in)" />
          )}
        </View>

        {/* ── Diagnostics ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="activity" size={13} color="#555" />
            <Text style={styles.sectionTitle}>DIAGNOSTICS</Text>
          </View>

          {/* Check Network */}
          <Pressable
            testID="check-network"
            accessibilityRole="button"
            onPress={handleCheckNetwork}
            disabled={connectionChecking}
            style={({ pressed }) => [
              diagStyles.btn,
              pressed && !connectionChecking && { backgroundColor: "#1a1a1a" },
              connectionChecking && { opacity: 0.6 },
            ]}
          >
            <View style={diagStyles.btnLeft}>
              <Feather name="wifi" size={18} color={colors.downloadAccent} />
              <Text style={diagStyles.btnLabel}>Check Network</Text>
            </View>
            {connectionChecking
              ? <ActivityIndicator size="small" color={colors.downloadAccent} />
              : <Feather name="chevron-right" size={16} color="#404040" />}
          </Pressable>

          {connectionResults && (
            <View style={diagStyles.resultsWrap}>
              {connectionResults.map((result, index) => (
                <View key={index} style={diagStyles.resultRow}>
                  <Ionicons
                    name={result.ok ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={result.ok ? "#34D399" : "#EF4444"}
                  />
                  <Text style={diagStyles.resultLabel}>{result.label}</Text>
                  <Text style={[diagStyles.resultValue, { color: result.ok ? "#34D399" : "#EF4444" }]}>
                    {result.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Playback Specification */}
          <Pressable
            testID="playback-specification"
            accessibilityRole="button"
            accessibilityLabel="Playback Specification"
            accessibilityHint="Opens device DRM and playback details"
            onPress={() => router.push("/playback-specification")}
            style={({ pressed }) => [
              diagStyles.btn,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" },
              pressed && { backgroundColor: "#1a1a1a" },
            ]}
          >
            <View style={diagStyles.btnLeft}>
              <Feather name="monitor" size={18} color="#8B5CF6" />
              <Text style={diagStyles.btnLabel}>Playback Specification</Text>
            </View>
            <Feather name="chevron-right" size={16} color="#404040" />
          </Pressable>

          {/* Internet Speed Test */}
          <Pressable
            testID="internet-speed-test"
            accessibilityRole="button"
            accessibilityLabel="Open Internet Speed Test on FAST.com"
            onPress={handleInternetSpeedTest}
            style={({ pressed }) => [
              diagStyles.btn,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" },
              pressed && { backgroundColor: "#1a1a1a" },
            ]}
          >
            <View style={diagStyles.btnLeft}>
              <Feather name="bar-chart-2" size={18} color={colors.downloadAccent} />
              <Text style={diagStyles.btnLabel}>Internet Speed Test</Text>
            </View>
            <Feather name="external-link" size={16} color="#404040" />
          </Pressable>

          {networkError ? (
            <Text style={diagStyles.networkError}>{networkError}</Text>
          ) : null}
        </View>

        <Text style={styles.footerNote}>
          © 2025 S Movie Original. All rights reserved.{"\n"}
          Only device and browser details available to this app are shown.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, accent && rowStyles.valueAccent]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  label: { color: "#888", fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  value: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1 },
  valueAccent: { color: "#34D399", fontFamily: "Inter_600SemiBold" },
});

const esnRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  label: { color: "#888", fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 0, width: 70 },
  valueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  value: {
    color: "#E50914",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: "nowrap",
    textAlign: "right",
  },
  copyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  copyBadgeCopied: { borderColor: "rgba(52,211,153,0.3)", backgroundColor: "rgba(52,211,153,0.06)" },
  copyText: { color: "#555", fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
});

const storageStyles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  segment: {
    height: "100%",
  },
  labelsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 14,
    columnGap: 12,
    rowGap: 8,
  },
  labelItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  labelText: { color: "#888", fontSize: 12, fontFamily: "Inter_400Regular" },
  totalText: { color: "#555", fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: "auto" },
});

const diagStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  btnLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnLabel: { color: "#e5e5e5", fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  resultsWrap: {
    backgroundColor: "#0a0a0a",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultLabel: { color: "#888", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  resultValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  networkError: {
    color: "#F87171",
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: 16,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 52,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: "flex-start", justifyContent: "center",
    paddingLeft: 6,
  },
  backChevron: {
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 36,
    lineHeight: 40,
    marginTop: -3,
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

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16, gap: 20 },

  brandCard: {
    marginTop: 14,
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 14,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  logoImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
    flexShrink: 0,
  },
  appName: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  appSubtitle: {
    color: "#888888",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 5,
  },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 5, flexWrap: "wrap" },
  badge: {
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.28)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 22,
  },
  badgeText: { color: "#e50914", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  badgeGreen: { backgroundColor: "rgba(52,211,153,0.10)", borderColor: "rgba(52,211,153,0.28)" },
  badgeTextGreen: { color: "#34D399" },

  section: {
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { color: "#444", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  storagePad: { paddingTop: 6 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  loadingText: { color: "#333", fontSize: 13, fontFamily: "Inter_400Regular" },
  /* SOURCE_LOCK_START: account identity note style */
  identityNote: {
    color: "#666",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginHorizontal: 16,
    marginTop: -2,
    marginBottom: 12,
  },
  /* SOURCE_LOCK_END: account identity note style */

  footerNote: {
    color: "#333",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },
});
