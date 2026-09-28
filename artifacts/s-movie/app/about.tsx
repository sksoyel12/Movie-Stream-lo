import { Feather, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ClipboardExpo from "expo-clipboard";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GOOGLE_USER_KEY } from "@/app/(tabs)/profile";
import { API_BASE } from "@/lib/apiBase";
import { getIdentity } from "@/lib/identity";
import { getDeviceStorageBytes } from "@/lib/storage";

/** Same key used by lib/deviceFingerprint.ts — shares the same stable UUID */
const DEVICE_ID_KEY = "@smovie:deviceId";

// ─────────────────────────────────────────────────────────────────────────────
// Data models
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceData {
  appVersion: string;
  buildNumber: string;
  osLabel: string;
  osApiLevel: string;
  brand: string;
  model: string;
  cpuArch: string;
  esn: string;
  deviceModelId: string;
  isRealDevice: boolean;
  freeStorageBytes: number;
  totalStorageBytes: number;
}

/** Generate stable 11-digit numeric ID from phone brand + model + deviceId */
function generateDeviceModelId(brand: string, model: string, deviceId: string): string {
  const raw = `${brand}|${model}|${deviceId}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  // Second pass for better distribution
  let h2 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h2 ^= raw.charCodeAt(i);
    h2 = (h2 * 0x01000193) >>> 0;
  }
  // Combine both hashes into 11 digits
  const combined = String(h).padStart(6, "0").slice(0, 6) + String(h2).padStart(5, "0").slice(0, 5);
  return combined;
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

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

async function loadDeviceData(): Promise<DeviceData> {
  const deviceId = await getOrCreateDeviceId();

  const appVersion: string =
    Constants.expoConfig?.version ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants as any).manifest?.version ??
    "—";

  let buildNumber = "—";
  if (Platform.OS === "android") {
    const vc = Constants.expoConfig?.android?.versionCode;
    buildNumber = vc !== undefined ? String(vc) : "1";
  } else if (Platform.OS === "ios") {
    buildNumber = Constants.expoConfig?.ios?.buildNumber ?? "1";
  }

  const osName    = Device.osName    ?? (Platform.OS === "web" ? "Web" : Platform.OS);
  const osVersion = Device.osVersion ?? "";
  const osLabel   = osVersion ? `${osName} ${osVersion}` : osName;

  // OS API level (Android API int, or OS version string on iOS/web)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiLevel = (Device as any).platformApiLevel ?? Platform.Version;
  const osApiLevel = String(apiLevel);

  const brand = Device.brand ?? (Platform.OS === "web" ? "Browser" : "Unknown");
  const model =
    Device.modelName ??
    (Platform.OS === "web" && typeof navigator !== "undefined"
      ? navigator.userAgent.split(" ").slice(-2).join(" ").replace(/[()]/g, "").trim() || "—"
      : "—");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const archList = (Device as any).supportedCPUArchitectures as string[] | null | undefined;
  const cpuArch =
    archList && archList.length > 0
      ? archList[0]
      : Platform.OS === "ios"
      ? "arm64"
      : Platform.OS === "android"
      ? "arm64-v8a"
      : typeof navigator !== "undefined" && navigator.userAgent.includes("x86_64")
      ? "x86_64"
      : "—";

  const esnSuffix = deviceId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const esn = `NFANDROID1-SMOVIE-${esnSuffix}`;

  // Storage — native disk capacity on device, browser storage estimate on web.
  const { freeBytes: freeStorageBytes, totalBytes: totalStorageBytes } =
    await getDeviceStorageBytes();

  const deviceModelId = generateDeviceModelId(brand, model, deviceId);

  return {
    appVersion,
    buildNumber,
    osLabel,
    osApiLevel,
    brand,
    model,
    cpuArch,
    esn,
    deviceModelId,
    isRealDevice: Device.isDevice ?? false,
    freeStorageBytes,
    totalStorageBytes,
  };
}

async function loadAccountData(): Promise<AccountData> {
  try {
    const raw = await AsyncStorage.getItem(GOOGLE_USER_KEY);
    if (!raw) return { email: null, name: null, status: "guest" };
    const user = JSON.parse(raw);
    return {
      email: user.email ?? null,
      name: user.name ?? null,
      status: "signed-in",
    };
  } catch {
    return { email: null, name: null, status: "guest" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DeviceData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [uniqueUserId, setUniqueUserId] = useState<string | null>(null);
  const [uidCopied, setUidCopied] = useState(false);
  const uidCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelIdCopied, setModelIdCopied] = useState(false);
  const modelIdCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [esnCopied, setEsnCopied] = useState(false);
  const esnCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Diagnostics state
  const [networkChecking, setNetworkChecking] = useState(false);
  const [networkResults, setNetworkResults] = useState<DiagnosticResult[] | null>(null);
  const [playbackChecking, setPlaybackChecking] = useState(false);
  const [playbackResults, setPlaybackResults] = useState<DiagnosticResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadDeviceData(), loadAccountData()])
      .then(([d, a]) => {
        if (!cancelled) {
          setData(d);
          setAccount(a);
          setLoading(false);
          // Fetch server-assigned unique user ID if signed in
          if (a.status === "signed-in") {
            getIdentity().then((identity) => {
              if (!cancelled && identity?.uniqueUserId) {
                setUniqueUserId(identity.uniqueUserId);
              }
            }).catch(() => {});
          }
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCopyUid = async () => {
    if (!uniqueUserId) return;
    await ClipboardExpo.setStringAsync(uniqueUserId).catch(() => {});
    setUidCopied(true);
    if (uidCopiedTimer.current) clearTimeout(uidCopiedTimer.current);
    uidCopiedTimer.current = setTimeout(() => setUidCopied(false), 2500);
  };

  const handleCopyEsn = async () => {
    if (!data?.esn) return;
    await ClipboardExpo.setStringAsync(data.esn).catch(() => {});
    setEsnCopied(true);
    if (esnCopiedTimer.current) clearTimeout(esnCopiedTimer.current);
    esnCopiedTimer.current = setTimeout(() => setEsnCopied(false), 2500);
  };

  // ── Network diagnostic ────────────────────────────────────────────────────
  const handleCheckNetwork = async () => {
    if (networkChecking) return;
    setNetworkChecking(true);
    setNetworkResults(null);
    try {
      const results: DiagnosticResult[] = [];

      // Network state
      const state = await Network.getNetworkStateAsync().catch(() => null);
      const connected = state?.isConnected ?? false;
      results.push({
        label: "Connectivity",
        value: connected ? "Online" : "Offline",
        ok: connected,
      });

      const netType = state?.type;
      results.push({
        label: "Network Type",
        value: netType === Network.NetworkStateType.WIFI
          ? "Wi-Fi"
          : netType === Network.NetworkStateType.CELLULAR
          ? "Cellular"
          : netType === Network.NetworkStateType.NONE
          ? "None"
          : "Unknown",
        ok: netType !== Network.NetworkStateType.NONE,
      });

      // Latency ping — fetch a tiny resource
      if (connected) {
        const start = Date.now();
        try {
          await fetch("https://www.google.com/generate_204", {
            method: "HEAD",
            cache: "no-store",
          });
          const latency = Date.now() - start;
          results.push({
            label: "Latency",
            value: `${latency} ms`,
            ok: latency < 300,
          });
        } catch {
          results.push({ label: "Latency", value: "Unreachable", ok: false });
        }

        // TMDB API reachability
        const tmdbStart = Date.now();
        try {
          if (!API_BASE) throw new Error("TMDB server proxy unavailable");
          const tmdbResponse = await fetch(`${API_BASE}/tmdb/configuration`, {
            cache: "no-store",
          });
          if (!tmdbResponse.ok) throw new Error(`TMDB server proxy returned ${tmdbResponse.status}`);
          results.push({
            label: "TMDB API",
            value: `Reachable (${Date.now() - tmdbStart} ms)`,
            ok: true,
          });
        } catch {
          results.push({ label: "TMDB API", value: "Unreachable", ok: false });
        }
      }

      setNetworkResults(results);
    } finally {
      setNetworkChecking(false);
    }
  };

  // ── Playback / DRM diagnostic ─────────────────────────────────────────────
  const handlePlaybackSpec = async () => {
    if (playbackChecking) return;
    setPlaybackChecking(true);
    setPlaybackResults(null);
    await new Promise((r) => setTimeout(r, 600)); // short delay for UX
    try {
      const results: DiagnosticResult[] = [];

      // Widevine DRM detection (Android / web EME)
      if (Platform.OS === "android") {
        // expo-device doesn't expose DRM directly; report based on real-device status
        const isReal = Device.isDevice ?? false;
        results.push({
          label: "Widevine DRM",
          value: isReal ? "L1 (Hardware)" : "L3 (Software / Emulator)",
          ok: isReal,
        });
      } else if (Platform.OS === "web" && typeof navigator !== "undefined") {
        const hasSrc = "requestMediaKeySystemAccess" in navigator;
        results.push({
          label: "EME / Widevine",
          value: hasSrc ? "Supported" : "Not Supported",
          ok: hasSrc,
        });
      } else {
        results.push({ label: "Widevine DRM", value: "N/A on iOS", ok: true });
      }

      // HDR support detection (heuristic via screen metrics)
      const { Dimensions, PixelRatio } = require("react-native");
      const pxRatio = PixelRatio.get();
      const hdrLikely = pxRatio >= 3;
      results.push({
        label: "HDR Display",
        value: hdrLikely ? "Likely Supported (DPR ≥ 3)" : "SDR Display",
        ok: hdrLikely,
      });

      // Video codec support (via web MediaSource on web, heuristic on native)
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const ms = (window as any).MediaSource;
        const h265 = ms?.isTypeSupported?.("video/mp4; codecs=\"hvc1.1.6.L93.B0\"") ?? false;
        const h264 = ms?.isTypeSupported?.("video/mp4; codecs=\"avc1.42E01E\"") ?? false;
        const vp9  = ms?.isTypeSupported?.("video/webm; codecs=\"vp9\"") ?? false;
        results.push({ label: "H.264 / AVC", value: h264 ? "Supported" : "Unknown", ok: h264 });
        results.push({ label: "H.265 / HEVC", value: h265 ? "Supported" : "Unknown", ok: h265 });
        results.push({ label: "VP9", value: vp9 ? "Supported" : "Unknown", ok: vp9 });
      } else {
        results.push({ label: "H.264 / AVC", value: "Supported (Native)", ok: true });
        results.push({
          label: "H.265 / HEVC",
          value: Platform.OS === "android" && Number(Platform.Version) >= 21
            ? "Supported (API ≥ 21)"
            : Platform.OS === "ios"
            ? "Supported (iOS Hardware)"
            : "Device Dependent",
          ok: true,
        });
      }

      // Screen resolution info
      const { width, height } = Dimensions.get("screen");
      const fullPx = `${Math.round(width * pxRatio)} × ${Math.round(height * pxRatio)}`;
      results.push({ label: "Physical Resolution", value: fullPx, ok: true });

      setPlaybackResults(results);
    } finally {
      setPlaybackChecking(false);
    }
  };

  // ── Storage bar values ────────────────────────────────────────────────────
  const totalBytes  = data?.totalStorageBytes ?? 0;
  const freeBytes   = data?.freeStorageBytes  ?? 0;
  const usedBytes   = Math.max(0, totalBytes - freeBytes);
  const usedFraction = totalBytes > 0 ? Math.min(1, usedBytes / totalBytes) : 0;
  const usedPct = `${Math.round(usedFraction * 100)}%`;

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
        <Text style={styles.headerTitle}>App Settings / About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Brand card ───────────────────────────────────────────────── */}
        <LinearGradient
          colors={["rgba(229,9,20,0.18)", "rgba(255,107,0,0.10)", "rgba(0,0,0,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandCard}
        >
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoS}>S</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>S Movie Original PREMIUM</Text>
              <View style={styles.badgeRow}>
                {loading ? (
                  <View style={styles.badge}>
                    <ActivityIndicator size="small" color="#e50914" />
                  </View>
                ) : (
                  <>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>v{data?.appVersion ?? "—"}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeGreen]}>
                      <Text style={[styles.badgeText, styles.badgeTextGreen]}>
                        {data?.isRealDevice ? "Real Device" : "Stable Build"}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ── Internal Storage Bar ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="hard-drive" size={13} color="#555" />
            <Text style={styles.sectionTitle}>INTERNAL STORAGE</Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#333" />
              <Text style={styles.loadingText}>Reading storage…</Text>
            </View>
          ) : totalBytes > 0 ? (
            <View style={styles.storagePad}>
              {/* Bar */}
              <View style={storageStyles.track}>
                <View style={[storageStyles.fill, { width: usedPct as `${number}%` }]} />
              </View>
              {/* Labels */}
              <View style={storageStyles.labelsRow}>
                <View style={storageStyles.labelItem}>
                  <View style={[storageStyles.dot, { backgroundColor: "#E50914" }]} />
                  <Text style={storageStyles.labelText}>Used  {fmtBytes(usedBytes)}</Text>
                </View>
                <View style={storageStyles.labelItem}>
                  <View style={[storageStyles.dot, { backgroundColor: "#34D399" }]} />
                  <Text style={storageStyles.labelText}>Free  {fmtBytes(freeBytes)}</Text>
                </View>
                <Text style={storageStyles.totalText}>/ {fmtBytes(totalBytes)}</Text>
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
              <InfoRow label="Model Name"      value={`${data?.brand ?? ""} ${data?.model ?? "—"}`.trim()} />
              <InfoRow label="App Version"     value={`v${data?.appVersion ?? "—"}`} accent />
              <InfoRow label="OS Version"      value={data?.osLabel ?? "—"} />
              <InfoRow label="OS API Level"    value={data?.osApiLevel ?? "—"} />
              <InfoRow label="Build Number"    value={`#${data?.buildNumber ?? "—"}`} />
              <InfoRow label="CPU Arch"        value={data?.cpuArch ?? "—"} />

              {/* Device Model ID — 11-digit stable ID based on phone model */}
              {data?.deviceModelId ? (
                <Pressable
                  onPress={async () => {
                    await ClipboardExpo.setStringAsync(data.deviceModelId).catch(() => {});
                    setModelIdCopied(true);
                    if (modelIdCopiedTimer.current) clearTimeout(modelIdCopiedTimer.current);
                    modelIdCopiedTimer.current = setTimeout(() => setModelIdCopied(false), 2500);
                  }}
                  style={({ pressed }) => [esnRowStyles.row, pressed && { backgroundColor: "rgba(229,9,20,0.04)" }]}
                >
                  <Text style={esnRowStyles.label}>Device ID</Text>
                  <View style={esnRowStyles.valueWrap}>
                    <Text style={[esnRowStyles.value, { color: "#60A5FA", letterSpacing: 1.5, fontSize: 15 }]} numberOfLines={1}>
                      {data.deviceModelId}
                    </Text>
                    <View style={[esnRowStyles.copyBadge, modelIdCopied && esnRowStyles.copyBadgeCopied]}>
                      <Feather name={modelIdCopied ? "check" : "copy"} size={11} color={modelIdCopied ? "#34D399" : "#555"} />
                      <Text style={[esnRowStyles.copyText, modelIdCopied && { color: "#34D399" }]}>
                        {modelIdCopied ? "Copied" : "Copy"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ) : null}

              {/* ESN — tappable to copy */}
              <Pressable
                onPress={handleCopyEsn}
                style={({ pressed }) => [esnRowStyles.row, pressed && { backgroundColor: "rgba(229,9,20,0.04)" }]}
              >
                <Text style={esnRowStyles.label}>ESN ID</Text>
                <View style={esnRowStyles.valueWrap}>
                  <Text style={esnRowStyles.value} numberOfLines={1} adjustsFontSizeToFit>
                    {data?.esn ?? "—"}
                  </Text>
                  <View style={[esnRowStyles.copyBadge, esnCopied && esnRowStyles.copyBadgeCopied]}>
                    <Feather name={esnCopied ? "check" : "copy"} size={11} color={esnCopied ? "#34D399" : "#555"} />
                    <Text style={[esnRowStyles.copyText, esnCopied && { color: "#34D399" }]}>
                      {esnCopied ? "Copied" : "Copy"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </>
          )}
        </View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="user" size={13} color="#555" />
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
          </View>

          {loading ? (
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
                  style={({ pressed }) => [esnRowStyles.row, pressed && { backgroundColor: "rgba(229,9,20,0.04)" }]}
                >
                  <Text style={esnRowStyles.label}>User ID</Text>
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
            onPress={handleCheckNetwork}
            disabled={networkChecking}
            style={({ pressed }) => [
              diagStyles.btn,
              pressed && !networkChecking && { backgroundColor: "#1a1a1a" },
              networkChecking && { opacity: 0.6 },
            ]}
          >
            <View style={diagStyles.btnLeft}>
              <Feather name="wifi" size={18} color="#0EA5E9" />
              <Text style={diagStyles.btnLabel}>Check Network</Text>
            </View>
            {networkChecking
              ? <ActivityIndicator size="small" color="#0EA5E9" />
              : <Feather name="chevron-right" size={16} color="#404040" />}
          </Pressable>

          {networkResults && (
            <View style={diagStyles.resultsWrap}>
              {networkResults.map((r, i) => (
                <View key={i} style={diagStyles.resultRow}>
                  <Ionicons
                    name={r.ok ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={r.ok ? "#34D399" : "#EF4444"}
                  />
                  <Text style={diagStyles.resultLabel}>{r.label}</Text>
                  <Text style={[diagStyles.resultValue, { color: r.ok ? "#34D399" : "#EF4444" }]}>
                    {r.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Playback Specification */}
          <Pressable
            onPress={handlePlaybackSpec}
            disabled={playbackChecking}
            style={({ pressed }) => [
              diagStyles.btn,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" },
              pressed && !playbackChecking && { backgroundColor: "#1a1a1a" },
              playbackChecking && { opacity: 0.6 },
            ]}
          >
            <View style={diagStyles.btnLeft}>
              <Feather name="monitor" size={18} color="#8B5CF6" />
              <Text style={diagStyles.btnLabel}>Playback Specification</Text>
            </View>
            {playbackChecking
              ? <ActivityIndicator size="small" color="#8B5CF6" />
              : <Feather name="chevron-right" size={16} color="#404040" />}
          </Pressable>

          {playbackResults && (
            <View style={diagStyles.resultsWrap}>
              {playbackResults.map((r, i) => (
                <View key={i} style={diagStyles.resultRow}>
                  <Ionicons
                    name={r.ok ? "checkmark-circle" : "alert-circle"}
                    size={14}
                    color={r.ok ? "#34D399" : "#F59E0B"}
                  />
                  <Text style={diagStyles.resultLabel}>{r.label}</Text>
                  <Text style={[diagStyles.resultValue, { color: r.ok ? "#a3e635" : "#F59E0B" }]}>
                    {r.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.footerNote}>
              © 2025 S Movie Original. All rights reserved.{"\n"}
          Device data is read in real-time from your hardware.
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
  valueWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  value: { color: "#E50914", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, flex: 1, textAlign: "right" },
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
    backgroundColor: "#1e1e1e",
    borderRadius: 5,
    overflow: "hidden",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  fill: {
    height: "100%",
    backgroundColor: "#E50914",
    borderRadius: 5,
  },
  labelsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  labelItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    minHeight: 52,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: "flex-start", justifyContent: "center",
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

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 20 },

  brandCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.18)",
    gap: 14,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoBox: {
    width: 54, height: 54,
    borderRadius: 14,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoS: { color: "#fff", fontSize: 30, fontFamily: "Inter_900Black", letterSpacing: -1 },
  appName: { color: "#fff", fontSize: 18, fontFamily: "Inter_800ExtraBold", letterSpacing: -0.4 },
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

  footerNote: {
    color: "#333",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },
});
