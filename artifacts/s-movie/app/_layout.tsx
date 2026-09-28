import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Alert, Image, InteractionManager, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DownloadProgressBar }    from "@/components/DownloadProgressBar";
import { ErrorBoundary }          from "@/components/ErrorBoundary";
import { VpnBlockModal }          from "@/components/VpnBlockModal";
import { IntegrityBlockModal }    from "@/components/IntegrityBlockModal";
import { SuspensionBlockModal }   from "@/components/SuspensionBlockModal";
import { addVpnListener, getVpnBlocked } from "@/lib/vpnState";
import { addSuspensionListener, getAccountSuspended, type SuspensionInfo } from "@/lib/suspensionState";
import { getDeviceFingerprint }   from "@/lib/deviceFingerprint";
import { checkAppIntegrity, type IntegrityViolation } from "@/lib/integrityCheck";
import { addStreamKeyListener }   from "@/lib/streamKeyStatus";
import { HOME_CACHE_TTL_MS }      from "@/lib/homeCache";

import { MyListProvider } from "@/contexts/MyListContext";
import { DownloadProvider } from "@/contexts/DownloadContext";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { CURRENT_VERSION } from "@/data/releaseNotes";
import {
  attachNotificationListeners,
  scheduleWeeklyTrendingNotifications,
  registerForPushNotificationsAsync,
  checkAndNotifyNewTrending,
} from "@/lib/notifications";
import { TRENDING_NOW } from "@/data/movies";
import { checkForAppUpdate, type VersionInfo } from "@/lib/appUpdate";
import { API_HOST } from "@/lib/apiBase";

const PUSH_TOKEN_KEY = "smovie_push_token";

// Splash operations are best-effort. A rejected native promise must never
// become an unhandled rejection before React has mounted.
SplashScreen.preventAutoHideAsync().catch(() => {});
setBaseUrl(API_HOST);

if (Platform.OS === "web" && typeof document !== "undefined") {
  const STYLE_ID = "smovie-hide-replit-badge";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html, body, #root, .app-container {
        background: linear-gradient(180deg, #0A1526 0%, #000000 40%) !important;
        background-attachment: fixed;
        background-repeat: no-repeat;
        min-height: 100vh;
        min-height: 100dvh;
        color: #ffffff;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        outline: 0 !important;
      }
      * { outline: none !important; box-shadow: none !important; }
      div[style*="overflow"] { border: none !important; outline: none !important; box-shadow: none !important; }
      div[style*="border"] { border: none !important; }
      .replit-watermark,
      [class*="replit"],
      [id*="replit"],
      [data-replit-metadata*="badge"],
      [class*="replit-badge" i],
      [id*="replit-badge" i],
      a[href*="replit.com"][target="_blank"],
      iframe[src*="replit.com"],
      iframe[src*="replit.com/badge"],
      div[class*="MadeWithReplit" i],
      div[class*="made-with-replit" i],
      div[id*="replit-dev-banner" i],
      #replit-dev-banner,
      .__replit-badge,
      [data-cy="replit-badge"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: HOME_CACHE_TTL_MS, // Home feeds refresh once per 24-hour window
      gcTime:    HOME_CACHE_TTL_MS, // Keep the in-memory snapshot for that window
      retry: 1,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, animation: "none" }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: "none" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="movie/[id]"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="player"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade",
        }}
      />
      <Stack.Screen
        name="search"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="genre/[id]"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="privacy"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="see-all/[category]"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="notification-settings"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="user-agreement"
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}

function handleNotificationNavigation(
  data: Record<string, unknown> | undefined,
) {
  if (!data) return;
  if (typeof data.movieId === "string" && data.movieId.length > 0) {
    router.push({
      pathname: "/movie/[id]",
      params: { id: data.movieId },
    });
    return;
  }
  if (typeof data.route === "string" && data.route.startsWith("/")) {
    router.push(data.route as any);
  }
}

// ─── OTA Update Toast ─────────────────────────────────────────────────────────
type OtaPhase = "downloading" | "restarting";

function OtaToast({ phase }: { phase: OtaPhase | null }) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 80, duration: 180, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  if (!phase) return null;

  const isRestarting = phase === "restarting";

  return (
    <Animated.View style={[otaStyles.toast, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={[otaStyles.accent, isRestarting && otaStyles.accentGreen]} />
      <MaterialCommunityIcons
        name={isRestarting ? "check-circle-outline" : "cloud-download-outline"}
        size={20}
        color={isRestarting ? "#34D399" : "#e50914"}
        style={otaStyles.icon}
      />
      <View style={otaStyles.textWrap}>
        <Text style={otaStyles.title}>
          {isRestarting ? "Update ready" : "Update available"}
        </Text>
        <Text style={otaStyles.sub}>
          {isRestarting ? "Restarting S Movie Original…" : "Downloading latest version…"}
        </Text>
      </View>
      {!isRestarting && <ActivityIndicator size="small" color="#e50914" style={otaStyles.spinner} />}
    </Animated.View>
  );
}

// ─── Forced Update Modal (un-closeable) ──────────────────────────────────────

function ForceUpdateModal({
  visible,
  info,
}: {
  visible: boolean;
  info: VersionInfo | null;
}) {
  const handleUpdate = () => {
    const url = info?.apkUrl;
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={uStyles.backdrop}>
        <View style={uStyles.sheet}>
          <LinearGradient
            colors={["#e50914", "#b0060f"]}
            style={uStyles.banner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <MaterialCommunityIcons name="cloud-download" size={40} color="#fff" />
            <Text style={uStyles.bannerTitle}>New Version Available</Text>
            <Text style={uStyles.bannerSub}>v{info?.version ?? ""}</Text>
          </LinearGradient>

          <View style={uStyles.body}>
            <Text style={uStyles.versionLine}>
              Installed: <Text style={uStyles.vOld}>v{CURRENT_VERSION}</Text>
              {"  —  "}
              Latest: <Text style={uStyles.vNew}>v{info?.version ?? ""}</Text>
            </Text>

            <Text style={uStyles.updateMessage}>
              Please install the latest version to get new movies and anime.
            </Text>

            {info?.releaseNotes ? (
              <View style={uStyles.notes}>
                <Text style={uStyles.notesLabel}>What's New</Text>
                <Text style={uStyles.notesText}>{info.releaseNotes}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [uStyles.updateBtn, pressed && { opacity: 0.88 }]}
              onPress={handleUpdate}
            >
              <MaterialCommunityIcons name="download" size={20} color="#fff" />
              <Text style={uStyles.updateBtnText}>Download Now</Text>
            </Pressable>

            <Text style={uStyles.forcedNote}>
              This update is required to continue using S Movie Original
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}


export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    SFProDisplayMedium: require("@/assets/fonts/SF-Pro-Display-Medium.otf"),
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });
  const [fontTimeoutElapsed, setFontTimeoutElapsed] = useState(false);
  const bootReady = fontsLoaded || !!fontError || fontTimeoutElapsed;

  useEffect(() => {
    const timeout = setTimeout(() => setFontTimeoutElapsed(true), 4000);
    return () => clearTimeout(timeout);
  }, []);

  // Hide the native splash only after fonts are determined (loaded OR errored).
  // Calling hideAsync() before fonts are ready caused the native splash to
  // disappear prematurely and reveal a black screen mid-load. With this
  // pattern the native splash stays visible until the real UI is ready,
  // producing a smooth, single transition with no intermediate black flash.
  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, bootReady ? 250 : 4000);
    return () => clearTimeout(timeout);
  }, [bootReady]);

  const [forceUpdateInfo, setForceUpdateInfo] = useState<VersionInfo | null>(null);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const [otaPhase, setOtaPhase] = useState<OtaPhase | null>(null);
  const [vpnBlocked, setVpnBlockedState]         = useState(() => {
    try {
      return getVpnBlocked();
    } catch {
      return false;
    }
  });
  const [integrityViolation, setIntegrityViolation] = useState<IntegrityViolation>(null);
  const [suspension, setSuspension] = useState<SuspensionInfo | null>(() => {
    try {
      return getAccountSuspended();
    } catch {
      return null;
    }
  });

  // Warm device fingerprint, subscribe to VPN signals, run integrity check,
  // and listen for stream-key refresh failures (show a user-friendly alert).
  useEffect(() => {
    getDeviceFingerprint().catch(() => {});
    const unsubVpn = addVpnListener(setVpnBlockedState);
    const unsubSuspension = addSuspensionListener(setSuspension);
    checkAppIntegrity().then((result) => {
      if (!result.ok) setIntegrityViolation(result.violation);
    }).catch(() => {});
    const unsubKey = addStreamKeyListener((status) => {
      if (status === "refresh_failed") {
        Alert.alert(
          "Session Expiring",
          "Your streaming session could not be renewed. Please go back and reopen the content to continue watching.",
          [{ text: "OK" }],
        );
      }
    });
    return () => { unsubVpn(); unsubSuspension(); unsubKey(); };
  }, []);

  // ─── Boot profile setup ───────────────────────────────────────────────────
  // Ensure default profile and auth keys are seeded in AsyncStorage on first
  // launch. Navigation is handled by app/index.tsx → /onboarding?mode=boot,
  // so we do NOT call router.replace here (that would re-trigger onboarding
  // after fonts load and restart the splash mid-animation).
  useEffect(() => {
    if (!bootReady) return;
    (async () => {
      try {
        const selectedProfile = await AsyncStorage.getItem("smovie_selected_profile");
        if (!selectedProfile) {
          await AsyncStorage.setItem("smovie_selected_profile", "sksoyel");
        }
      } catch {}
    })();
  }, [bootReady]);

  // ─── Startup APK update check ─────────────────────────────────────────────
  useEffect(() => {
    if (!bootReady) return;
    (async () => {
      try {
        const result = await checkForAppUpdate();
        if (result.isAvailable && result.info) {
          if (result.info.forceUpdate) {
            setForceUpdateInfo(result.info);
            setShowForceUpdate(true);
          } else {
            Alert.alert(
              "New Version Available",
              "Please install the latest version to get new movies and anime.",
              [
                { text: "Later", style: "cancel" },
                {
                  text: "Download Now",
                  onPress: () => {
                    Linking.openURL(result.info!.apkUrl).catch(() => {});
                  },
                },
              ],
            );
          }
        }
      } catch {
        // Silently ignore
      }
    })();
  }, [bootReady]);

  // ─── EAS OTA update check (expo-updates) ──────────────────────────────────
  // Shows a toast while downloading, then reloads. In Expo Go / dev builds
  // Updates.isEnabled is false so this is a complete no-op during development.
  useEffect(() => {
    if (!bootReady) return;
    if (!Updates.isEnabled) return; // skip in Expo Go / dev
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          setOtaPhase("downloading");
          await Updates.fetchUpdateAsync();
          setOtaPhase("restarting");
          // Brief pause so user can read "Restarting…" before reload
          await new Promise((r) => setTimeout(r, 900));
          await Updates.reloadAsync();
        }
      } catch {
        // Never crash the app if the OTA check fails
        setOtaPhase(null);
      }
    })();
  }, [bootReady]);

  // Register for push notifications & attach deep-linking listeners
  // Deferred with InteractionManager so it doesn't block the first render
  useEffect(() => {
    let detach: (() => void) | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          await registerForPushNotificationsAsync();
          // ── Live TMDB trending check → "New Content Alert" notification ──
          // Fires immediately with the #1 trending item not yet notified.
          // Rate-limited internally to once every 4 hours.
          await checkAndNotifyNewTrending();

          // Also schedule periodic legacy promos for variety
          const trendingTitles = TRENDING_NOW.slice(0, 3).map((m) => m.title);
          if (trendingTitles.length > 0) {
            await scheduleWeeklyTrendingNotifications(trendingTitles);
          }
        } catch { }

        try {
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (lastResponse) {
            handleNotificationNavigation(
              lastResponse.notification.request.content.data as
                | Record<string, unknown>
                | undefined,
            );
          }
        } catch { }

        detach = attachNotificationListeners({
          onResponse: (response) => {
            handleNotificationNavigation(
              response.notification.request.content.data as
                | Record<string, unknown>
                | undefined,
            );
          },
        });
      })();
    });
    return () => { task.cancel(); detach?.(); };
  }, []);

  // Mount navigation immediately. Header and bottom-tab icons use Lucide
  // vectors, so they do not need the legacy icon-font gate. Waiting here can
  // leave the web preview on a permanent black frame when Expo font loading
  // never settles; the native splash is still hidden through the bounded
  // bootReady timer above.
  return (
    <SafeAreaProvider>
      <NetworkProvider>
      <ErrorBoundary>
        <LanguageProvider>
        <ProfileProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: "transparent" }}>
              <KeyboardProvider>
                <MyListProvider>
                  <UserPreferencesProvider>
                  <DownloadProvider>
                    <StatusBar style="light" />
                    <RootLayoutNav />
                    {/* Force update modal — un-closeable */}
                    <ForceUpdateModal
                      visible={showForceUpdate}
                      info={forceUpdateInfo}
                    />
                    {/* Download progress bar */}
                    <DownloadProgressBar />
                    {/* OTA update toast */}
                    <OtaToast phase={otaPhase} />
                    {/* VPN / proxy block — full-screen overlay */}
                    <VpnBlockModal
                      visible={vpnBlocked}
                      onRetry={() => setVpnBlockedState(false)}
                    />
                    {/* Emulator / integrity block — non-dismissable */}
                    <IntegrityBlockModal
                      visible={!!integrityViolation}
                      violation={integrityViolation}
                    />
                    {/* Account suspension block — shown when a streaming/API call returns ACCOUNT_SUSPENDED */}
                    <SuspensionBlockModal
                      visible={!!suspension}
                      reason={suspension?.reason}
                      onDismiss={() => setSuspension(null)}
                    />
                  </DownloadProvider>
                  </UserPreferencesProvider>
                </MyListProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ProfileProvider>
        </LanguageProvider>
      </ErrorBoundary>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}

const otaStyles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 28,
    left: 16,
    right: 16,
    backgroundColor: "#141414",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
  },
  accent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "#e50914",
  },
  accentGreen: {
    backgroundColor: "#34D399",
  },
  icon: {
    marginLeft: 12,
    marginRight: 2,
  },
  textWrap: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  sub: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  spinner: {
    marginRight: 16,
  },
});

const uStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#141414",
    borderRadius: 18,
    overflow: "hidden",
  },
  banner: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  bannerTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  bannerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  body: { padding: 20 },
  versionLine: {
    color: "#737373",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginBottom: 10,
  },
  vOld: { color: "#a3a3a3", fontFamily: "Inter_600SemiBold" },
  vNew: { color: "#34D399", fontFamily: "Inter_700Bold" },
  updateMessage: {
    color: "#d4d4d4",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 18,
  },
  notes: {
    backgroundColor: "#1e1e1e",
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  notesLabel: {
    color: "#525252",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  notesText: {
    color: "#a3a3a3",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  updateBtn: {
    backgroundColor: "#e50914",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  updateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  forcedNote: {
    color: "#404040",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
});

