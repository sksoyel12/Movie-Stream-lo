import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import SmartImage from "@/components/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AIChatbotModal from "@/components/AIChatbotModal";
import AuthenticationModal from "@/components/AuthenticationModal";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import PhoneAuthModal from "@/components/PhoneAuthModal";
import SubscriptionScreen from "@/components/SubscriptionScreen";
import { firebaseAuth, firebaseConfigReady } from "@/lib/firebase";
import { getVIPStatus } from "@/lib/subscription";
import { haptic } from "@/lib/haptics";
import { saveFeedback } from "@/lib/movieLinks";
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  TwitterAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import {
  syncGoogleUser,
  getIdentity,
  submitIdPhoto,
  DuplicateAttemptError,
  type IdentityUser,
} from "@/lib/identity";
import { CURRENT_VERSION } from "@/data/releaseNotes";
import { useProfile, PROFILES as APP_PROFILES } from "@/contexts/ProfileContext";
import { useLanguage, ALL_LANGUAGES, type Language } from "@/contexts/LanguageContext";
import { useDownloads, type ManagedDownload } from "@/contexts/DownloadContext";
import { loadAllProgress, clearProgress, type WatchProgress } from "@/lib/watchProgress";
import {
  loadWatchHistory,
  clearWatchHistory,
  removeFromWatchHistory,
  type WatchHistoryItem,
} from "@/lib/watchHistory";
import {
  checkForAppUpdate,
  downloadAndInstallApk,
  openApkInBrowser,
  type DownloadProgress,
  type VersionInfo,
} from "@/lib/appUpdate";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { triggerLogoutEmail, triggerLoginNotification, triggerWelcomeEmail } from "@/lib/emailTriggers";

const PUSH_TOKEN_KEY = "smovie_push_token";
const NOTIF_ENABLED_KEY = "smovie_notifications_enabled";
export const GOOGLE_USER_KEY = "smovie_google_user";

type UpdateState =
  | "idle" | "checking" | "available" | "downloading" | "installing" | "upToDate" | "error";

interface GoogleUser {
  name: string;
  email: string;
  picture?: string;
}

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [availableInfo, setAvailableInfo] = useState<VersionInfo | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [profileHasNewVersion, setProfileHasNewVersion] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showWatchHistoryModal, setShowWatchHistoryModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isVIP, setIsVIP] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);

  const { downloads, removeDownload, refreshDownloads } = useDownloads();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editDraftName, setEditDraftName] = useState("");
  const [editDraftAvatarUri, setEditDraftAvatarUri] = useState<string | null>(null);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);
  const [customDisplayName, setCustomDisplayName] = useState<string | null>(null);

  const {
    profile,
    clearProfile,
    getDisplayAvatar,
    getDisplayName: getCtxDisplayName,
    authUser,
    authLoaded,
  } = useProfile();
  const activeProfileData = APP_PROFILES.find(p => p.id === profile?.id) ?? APP_PROFILES[0];
  const contextAvatarUri = profile ? getDisplayAvatar(profile.id) : null;
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "ok" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: "info" | "ok" | "err" = "info", ms = 3500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // ── User Account — Google Sign-In ───────────────────────────────────────────
  const [googleUser, setGoogleUser]           = useState<GoogleUser | null>(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPhoneAuthModal, setShowPhoneAuthModal] = useState(false);
  const [signingIn, setSigningIn]             = useState(false);

  // ── Unique User ID & photo-ID verification ──────────────────────────────────
  const [identity, setIdentity]           = useState<IdentityUser | null>(null);
  const [verifyingPhoto, setVerifyingPhoto] = useState(false);

  const syncIdentity = useCallback(async (user: GoogleUser) => {
    try {
      const record = await syncGoogleUser({
        email: user.email,
        displayName: user.name,
        photoUrl: user.picture,
      });
      setIdentity(record);
    } catch (e: unknown) {
      if (e instanceof DuplicateAttemptError) {
        Alert.alert(
          "Account Already Exists",
          "This device is already linked to another S Movie Original account. Please sign in with that account instead.",
          [{ text: "OK" }],
        );
        await firebaseSignOut(firebaseAuth).catch(() => {});
        setGoogleUser(null);
        setIdentity(null);
        await AsyncStorage.removeItem(GOOGLE_USER_KEY);
      }
      // Other errors (network, etc.) — silently retry next time; don't block sign-in UX.
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(GOOGLE_USER_KEY)
      .then(async (raw) => {
        if (!raw) return;
        const user: GoogleUser = JSON.parse(raw);
        setGoogleUser(user);
        // Ensure the identity record exists (covers app relaunch with a
        // cached Google user but no fresh redirect result this session).
        const existing = await getIdentity();
        if (existing) setIdentity(existing);
        else await syncIdentity(user);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firebase auth is the source of truth. Keep the profile badge and local
  // cache synchronized whenever Firebase restores or changes the session.
  useEffect(() => {
    if (!authLoaded) return;
    if (!authUser) {
      setGoogleUser(null);
      setIdentity(null);
      AsyncStorage.removeItem(GOOGLE_USER_KEY).catch(() => {});
      return;
    }

    const account: GoogleUser = {
      name: authUser.displayName ?? authUser.email ?? authUser.phoneNumber ?? "S Movie Original User",
      email: authUser.email ?? authUser.phoneNumber ?? authUser.uid,
      picture: authUser.photoURL ?? undefined,
    };
    setGoogleUser(account);
    AsyncStorage.removeItem("smovie_auth_user").catch(() => {});
    AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account)).catch(() => {});
  }, [authLoaded, authUser]);

  // Load VIP status on mount
  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid ?? null;
    getVIPStatus(uid).then(setIsVIP).catch(() => {});
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    if (googleUser) { setShowGoogleModal(true); return; }
    if (Platform.OS !== "web") {
      showToast("Google Sign-In is only available on web.", "info");
      return;
    }
    setSigningIn(true);
    try {
      console.log("[GoogleSignIn] Initiating signInWithPopup…", {
        authDomain: firebaseAuth.config.authDomain,
        currentOrigin: typeof window !== "undefined" ? window.location.origin : "N/A",
      });
      const provider = new GoogleAuthProvider();
      // Force account selection every time so users can switch accounts
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const fbUser = result.user;
      const account: GoogleUser = {
        name: fbUser.displayName ?? fbUser.email ?? "S Movie Original User",
        email: fbUser.email ?? fbUser.uid,
        picture: fbUser.photoURL ?? undefined,
      };
      setGoogleUser(account);
      setIdentity(null);
      await AsyncStorage.removeItem("smovie_auth_user");
      await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account));
      setShowAuthModal(false);
      setShowGoogleModal(false);
      await syncIdentity(account);
      showToast("Welcome! Login successful.", "ok");
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const code = err?.code ?? "";
      const message = err?.message ?? String(e);
      console.error("[GoogleSignIn] signInWithPopup error:", { code, message });
      showToast(`Sign-in error: ${code || message || "Unknown error"}`, "err");
    } finally {
      setSigningIn(false);
    }
  }, [googleUser, showToast, syncIdentity]);

  const handleSocialSignIn = useCallback(async (
    provider: GoogleAuthProvider | TwitterAuthProvider | FacebookAuthProvider,
    providerName: string,
  ) => {
    if (Platform.OS !== "web") {
      showToast(`${providerName} Sign-In is only available on web.`, "info");
      return;
    }
    setSigningIn(true);
    try {
      const result = await signInWithPopup(firebaseAuth, provider);
      const fbUser = result.user;
      const account: GoogleUser = {
        name: fbUser.displayName ?? fbUser.email ?? "S Movie Original User",
        email: fbUser.email ?? fbUser.uid,
        picture: fbUser.photoURL ?? undefined,
      };
      setGoogleUser(account);
      setIdentity(null);
      await AsyncStorage.removeItem("smovie_auth_user");
      await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account));
      setShowAuthModal(false);
      setShowGoogleModal(false);
      await syncIdentity(account);
      showToast(`Welcome! Signed in with ${providerName}.`, "ok");
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const code = err?.code ?? "";
      const message = err?.message ?? String(e);
      showToast(`Sign-in error: ${code || message || "Unknown error"}`, "err");
    } finally {
      setSigningIn(false);
    }
  }, [showToast, syncIdentity]);

  const handleTwitterSignIn = useCallback(() => {
    const provider = new TwitterAuthProvider();
    return handleSocialSignIn(provider, "Twitter");
  }, [handleSocialSignIn]);

  const handleFacebookSignIn = useCallback(() => {
    const provider = new FacebookAuthProvider();
    return handleSocialSignIn(provider, "Facebook");
  }, [handleSocialSignIn]);

  const handleGoogleSignOut = useCallback(async () => {
    setGoogleUser(null);
    setIdentity(null);
    await AsyncStorage.removeItem(GOOGLE_USER_KEY);
    // Fire goodbye email before signing out (fire-and-forget, never blocks)
    const currentUser = firebaseAuth.currentUser;
    if (currentUser?.email) {
      triggerLogoutEmail(currentUser.email, currentUser.displayName);
    }
    await firebaseSignOut(firebaseAuth).catch(() => {});
    setShowGoogleModal(false);
    showToast("Signed out successfully.", "info");
  }, [showToast]);

  const handleEmailSignIn = useCallback(async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    if (!email || !password) {
      showToast("Enter your email and password to sign in.", "err");
      return;
    }
    if (!firebaseConfigReady) {
      showToast("Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_API_KEY.", "err");
      return;
    }
    setSigningIn(true);
    try {
      const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const user = result.user;
      const account: GoogleUser = {
        name: user.displayName ?? user.email ?? "S Movie Original User",
        email: user.email ?? email,
        picture: user.photoURL ?? undefined,
      };
      setGoogleUser(account);
      await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account));
      setShowAuthModal(false);
      showToast("Welcome back. You're signed in.", "ok");
      // Fire login notification email (Netflix-style security alert)
      if (user.email) {
        triggerLoginNotification(user.email, user.displayName);
      }
    } catch (errorValue) {
      const code = (errorValue as { code?: string })?.code ?? "";
      const message =
        code === "auth/invalid-credential" || code === "auth/wrong-password"
          ? "That email or password is incorrect."
          : code === "auth/user-not-found"
            ? "No account was found for that email."
            : code === "auth/too-many-requests"
              ? "Too many attempts. Please try again later."
              : "Unable to sign in. Please check your details and try again.";
      showToast(message, "err");
    } finally {
      setSigningIn(false);
    }
  }, [showToast]);

  const handleForgotPassword = useCallback(async (email: string) => {
    if (!email) {
      showToast("Enter your email first to reset your password.", "err");
      return;
    }
    if (!firebaseConfigReady) {
      showToast("Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_API_KEY.", "err");
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      showToast("Password reset link sent to your email.", "ok");
    } catch (errorValue) {
      const code = (errorValue as { code?: string })?.code ?? "";
      showToast(
        code === "auth/invalid-email"
          ? "Enter a valid email address."
          : "Unable to send the password reset email. Please try again.",
        "err",
      );
    }
  }, [showToast]);

  const handleCreateAccount = useCallback(async ({
    name,
    email,
    password,
    confirmPassword,
  }: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (!name || !email || !password || !confirmPassword) {
      showToast("Complete all fields to create your account.", "err");
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match.", "err");
      return;
    }
    if (password.length < 6) {
      showToast("Your password must be at least 6 characters.", "err");
      return;
    }
    if (!firebaseConfigReady) {
      showToast("Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_API_KEY.", "err");
      return;
    }
    setSigningIn(true);
    try {
      const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(result.user, { displayName: name });
      const account: GoogleUser = {
        name,
        email: result.user.email ?? email,
        picture: result.user.photoURL ?? undefined,
      };
      setGoogleUser(account);
      await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account));
      setShowAuthModal(false);
      showToast("Your account was created successfully.", "ok");
      // Fire welcome email to the USER's email (not EMAIL_USER)
      triggerWelcomeEmail(result.user.email ?? email, name);
    } catch (errorValue) {
      const code = (errorValue as { code?: string })?.code ?? "";
      showToast(
        code === "auth/email-already-in-use"
          ? "An account already exists for that email."
          : code === "auth/invalid-email"
            ? "Enter a valid email address."
            : "Unable to create your account. Please try again.",
        "err",
      );
    } finally {
      setSigningIn(false);
    }
  }, [showToast]);

  const handleCopyUniqueId = useCallback(async () => {
    if (!identity?.uniqueUserId) return;
    await Clipboard.setStringAsync(identity.uniqueUserId);
    showToast("User ID copied to clipboard.", "ok");
  }, [identity, showToast]);

  const handleVerifyPhoto = useCallback(async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library to upload your ID.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";

    setVerifyingPhoto(true);
    try {
      const outcome = await submitIdPhoto(asset.base64!, mimeType);
      setIdentity((prev) =>
        prev
          ? {
              ...prev,
              verificationStatus: outcome.verificationStatus,
              isSuspended: outcome.isSuspended,
              suspensionReason: outcome.suspensionReason,
            }
          : prev,
      );
      if (outcome.isSuspended) {
        Alert.alert("Verification Failed", outcome.reason, [{ text: "OK" }]);
      } else {
        Alert.alert("Verified", "Your ID has been verified successfully.", [{ text: "OK" }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not verify your ID right now.";
      showToast(msg, "err");
    } finally {
      setVerifyingPhoto(false);
    }
  }, [showToast]);

  useEffect(() => {
    AsyncStorage.getItem(PUSH_TOKEN_KEY).then((t) => setPushToken(t)).catch(() => {});
    AsyncStorage.getItem(NOTIF_ENABLED_KEY).then((v) => setNotificationsEnabled(v === "true")).catch(() => {});
  }, []);

  const toggleNotifications = useCallback(async (value: boolean) => {
    setNotificationsEnabled(value);
    try {
      await AsyncStorage.setItem(NOTIF_ENABLED_KEY, value ? "true" : "false");
    } catch {}
  }, []);

  // Auto-check for updates on mount — drives the "New Version" badge on Settings row
  useEffect(() => {
    checkForAppUpdate().then((r) => {
      if (r.isAvailable) setProfileHasNewVersion(true);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForUpdates = useCallback(async () => {
    setUpdateState("checking");
    showToast("Checking for updates…", "info", 8000);

    // ── Step 1: always try the direct APK version check first (no EAS needed) ──
    const manual = await checkForAppUpdate();

    if (manual.isAvailable && manual.info) {
      setAvailableInfo(manual.info);
      setUpdateState("available");
      setToast(null);
      setShowUpdateDialog(true);
      return;
    }

    // ── Step 2: already up to date (or network error) ─────────────────────────
    if (manual.error) {
      showToast(`Could not reach update server: ${manual.error}`, "err");
      setUpdateState("idle");
    } else {
      showToast("Your app is up to date.", "ok");
      setUpdateState("upToDate");
      setTimeout(() => setUpdateState("idle"), 3000);
    }
  }, [showToast]);

  const startDownload = useCallback(async () => {
    if (!availableInfo) return;
    setShowUpdateDialog(false);
    setUpdateState("downloading");
    setDownloadPercent(0);
    try {
      await downloadAndInstallApk(availableInfo.apkUrl, (p: DownloadProgress) =>
        setDownloadPercent(Math.round(p.percent * 100)),
      );
      setUpdateState("installing");
    } catch {
      if (Platform.OS === "android") {
        Alert.alert("Installer could not open", "Open download link in browser?", [
          { text: "Cancel", style: "cancel", onPress: () => setUpdateState("idle") },
          { text: "Open in Browser", onPress: () => { openApkInBrowser(availableInfo.apkUrl); setUpdateState("idle"); } },
        ]);
      } else {
        openApkInBrowser(availableInfo.apkUrl);
        setUpdateState("idle");
      }
    }
  }, [availableInfo]);

  const enablePushNotifications = useCallback(async () => {
    setRegisteringPush(true);
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        setPushToken(token);
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
        Alert.alert("Notifications enabled", "You'll receive alerts about new releases.");
      }
    } finally { setRegisteringPush(false); }
  }, []);

  const copyPushToken = useCallback(async () => {
    if (!pushToken) return;
    await Clipboard.setStringAsync(pushToken);
    Alert.alert("Copied", "Push token copied to clipboard.");
  }, [pushToken]);

  const updateBusy = ["checking", "downloading", "installing"].includes(updateState);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("smovie_custom_avatar").catch(() => null),
      AsyncStorage.getItem("smovie_custom_name").catch(() => null),
    ]).then(([savedAvatar, savedName]) => {
      if (savedAvatar) setCustomAvatarUri(savedAvatar);
      if (savedName) setCustomDisplayName(savedName);
    }).catch(() => {});
  }, []);

  const openEditModal = useCallback(() => {
    setEditDraftName(customDisplayName ?? "");
    setEditDraftAvatarUri(customAvatarUri);
    setShowEditModal(true);
  }, [customDisplayName, customAvatarUri]);

  const handlePickAvatar = useCallback(async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to your photo library to set a profile picture.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setEditDraftAvatarUri(result.assets[0].uri);
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const trimmed = editDraftName.trim();
    const nameToSave = trimmed || null;
    const avatarToSave = editDraftAvatarUri;
    setCustomDisplayName(nameToSave);
    setCustomAvatarUri(avatarToSave);
    await Promise.all([
      nameToSave
        ? AsyncStorage.setItem("smovie_custom_name", nameToSave)
        : AsyncStorage.removeItem("smovie_custom_name"),
      avatarToSave
        ? AsyncStorage.setItem("smovie_custom_avatar", avatarToSave)
        : AsyncStorage.removeItem("smovie_custom_avatar"),
    ]).catch(() => {});
    setShowEditModal(false);
    showToast("Profile updated!", "ok");
  }, [editDraftName, editDraftAvatarUri, showToast]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ─── Header ──────────────────────────────────── */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>{t.profileTitle}</Text>
            <View style={styles.headerActions}>
              {/* Account Sign-In button */}
              <Pressable
                hitSlop={10}
                onPress={googleUser ? handleGoogleSignIn : () => setShowAuthModal(true)}
                disabled={signingIn}
                style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.7 }, signingIn && { opacity: 0.5 }]}
              >
                {signingIn ? (
                  <View style={styles.googleIconWrap}>
                    <ActivityIndicator size="small" color="#E50914" />
                  </View>
                ) : googleUser ? (
                  <View style={[styles.googleIconWrap, { backgroundColor: "rgba(229,9,20,0.18)" }]}>
                    <Text style={[styles.googleG, { color: "#E50914", fontSize: 14 }]}>
                      {googleUser.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.googleIconWrap}>
                    <Ionicons name="person-outline" size={16} color="#aaa" />
                  </View>
                )}
              </Pressable>

            </View>
          </View>

          {/* ─── Active profile avatar ────────────────────── */}
          <View style={styles.activeProfileWrap}>
            <Pressable
              onPress={openEditModal}
              style={({ pressed }) => [{ marginBottom: 16, position: "relative" }, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.activeAvatar}>
                {(contextAvatarUri || customAvatarUri) ? (
                  <Image
                    source={{ uri: contextAvatarUri ?? customAvatarUri! }}
                    style={{ width: "100%", height: "100%", borderRadius: 50 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={require("../../assets/images/s-logo.png")}
                    style={{ width: "100%", height: "100%", borderRadius: 50 }}
                    resizeMode="cover"
                  />
                )}
              </View>
            </Pressable>
            <Text style={styles.activeProfileBrandName}>
              {customDisplayName ? customDisplayName.toUpperCase() : "MOVIE ORIGINAL"}
            </Text>
            <Text style={styles.activeProfileSub}>
              {activeProfileData.isKids ? "Kids • Standard" : "Standard • HD"}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* ─── Guest authentication CTA ──────────────────── */}
          {!googleUser && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              onPress={() => setShowAuthModal(true)}
              style={({ pressed }) => [
                styles.profileAuthTrigger,
                pressed && styles.profileAuthTriggerPressed,
              ]}
              testID="profile-auth-trigger"
            >
              <Text style={styles.profileAuthTriggerText}>Sign In</Text>
            </Pressable>
          )}

          {/* ─── Unique User ID card (always visible when signed in) ─────── */}
          {googleUser && identity && (
            <View style={styles.uidSection}>
              <LinearGradient
                colors={["rgba(229,9,20,0.09)", "rgba(0,0,0,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.uidCard}
              >
                {/* Top: label + ID + copy button */}
                <View style={styles.uidTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uidLabel}>YOUR UNIQUE USER ID</Text>
                    <Text style={styles.uidValue}>{identity.uniqueUserId}</Text>
                  </View>
                  <Pressable
                    onPress={handleCopyUniqueId}
                    hitSlop={12}
                    style={({ pressed }) => [styles.uidCopyBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="copy-outline" size={19} color="#E50914" />
                  </Pressable>
                </View>

                <View style={styles.uidInnerDivider} />

                {/* Status: badge + optional Verify ID button */}
                <View style={styles.uidStatusRow}>
                  <Ionicons
                    name={
                      identity.verificationStatus === "verified"
                        ? "shield-checkmark"
                        : identity.isSuspended
                        ? "alert-circle"
                        : "shield-outline"
                    }
                    size={14}
                    color={
                      identity.verificationStatus === "verified"
                        ? "#34D399"
                        : identity.isSuspended
                        ? "#EF4444"
                        : "#737373"
                    }
                  />
                  <Text
                    style={[
                      styles.uidStatusText,
                      identity.verificationStatus === "verified" && { color: "#34D399" },
                      identity.isSuspended && { color: "#EF4444" },
                    ]}
                  >
                    {identity.isSuspended
                      ? "Account Under Verification"
                      : identity.verificationStatus === "verified"
                      ? "Identity Verified"
                      : identity.verificationStatus === "rejected"
                      ? "Verification Failed — Re-upload ID"
                      : identity.verificationStatus === "pending"
                      ? "Verification Pending"
                      : "Pending Verification"}
                  </Text>
                  {identity.verificationStatus !== "verified" && !identity.isSuspended && (
                    <Pressable
                      onPress={handleVerifyPhoto}
                      disabled={verifyingPhoto}
                      style={({ pressed }) => [
                        styles.uidVerifyBtn,
                        pressed && { opacity: 0.8 },
                        verifyingPhoto && { opacity: 0.5 },
                      ]}
                    >
                      {verifyingPhoto ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.uidVerifyBtnText}>Verify ID</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </LinearGradient>
            </View>
          )}

          {/* ─── Netflix-style profile sections ───────────────────── */}
          {/* Standalone top card */}
          <Section>
            <SettingsRow
              icon={<Ionicons name="person-circle-outline" size={21} color="#fff" />}
              label="Manage Profile"
              sub="Edit name, avatar & display settings"
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={openEditModal}
            />
          </Section>

          {/* Continue Watching — horizontal Netflix-style poster row */}
          <ContinueWatchingRow />

          {/* Account */}
          <Section title="ACCOUNT">
            <SettingsRow
              icon={<Ionicons name="cloud-download-outline" size={21} color="#fff" />}
              label={t.myDownloads}
              sub={downloads.filter(d => d.status === "complete").length > 0
                ? `${downloads.filter(d => d.status === "complete").length} file${downloads.filter(d => d.status === "complete").length !== 1 ? "s" : ""} saved offline`
                : t.myDownloadsSub}
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => setShowDownloadsModal(true)}
              badge={downloads.filter(d => d.status === "complete").length > 0
                ? String(downloads.filter(d => d.status === "complete").length)
                : undefined}
            />
            <SettingsRow
              icon={<Ionicons name="time-outline" size={21} color="#fff" />}
              label={t.watchHistory}
              sub={t.noHistoryYet}
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => setShowWatchHistoryModal(true)}
            />
            <SettingsRow
              icon={<Feather name="bookmark" size={21} color="#fff" />}
              label="My List"
              sub="Movies and shows you've saved"
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => router.push({ pathname: "/see-all/[category]", params: { category: "My List" } })}
            />
          </Section>

          {/* Settings */}
          <Section title="SETTINGS">
            <SettingsRow
              icon={<Ionicons name="language-outline" size={21} color="#fff" />}
              label="Preferred Subtitles"
               sub={ALL_LANGUAGES.find((entry) => entry.code === language)?.native ?? language}
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => setShowLanguageModal(true)}
            />
            <SettingsRow
              icon={<Ionicons name="settings-outline" size={21} color="#fff" />}
              label="Settings"
              sub="Preferences, playback, privacy & more"
              right={
                profileHasNewVersion ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(14,165,233,0.12)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: "#0EA5E9", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>New Version</Text>
                    <Feather name="chevron-right" size={13} color="#0EA5E9" />
                  </View>
                ) : (
                  <Feather name="chevron-right" size={18} color="#404040" />
                )
              }
              onPress={() => router.push("/settings")}
            />
          </Section>

          {/* Support */}
          <Section title="SUPPORT">
            <SettingsRow
              icon={<Feather name="message-square" size={21} color="#fff" />}
              label="Feedback"
              sub="Share your thoughts with the team"
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => { setFeedbackText(""); setFeedbackSent(false); setShowFeedback(true); }}
            />
            <SettingsRow
              icon={<Feather name="info" size={21} color="#fff" />}
              label="About"
              sub="App version, device info & diagnostics"
              right={<Feather name="chevron-right" size={18} color="#404040" />}
              onPress={() => router.push("/about")}
            />
          </Section>

          <Text style={styles.footer}>Made by S Movie Original Team</Text>
        </ScrollView>
      </SafeAreaView>

      {/* ─── Authentication Modal ─────────────────────────── */}
      <AuthenticationModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onGooglePress={() => {
          setShowAuthModal(false);
          void handleGoogleSignIn();
        }}
        onTwitterPress={() => {
          setShowAuthModal(false);
          void handleTwitterSignIn();
        }}
        onFacebookPress={() => {
          setShowAuthModal(false);
          void handleFacebookSignIn();
        }}
        onPhonePress={() => {
          setShowAuthModal(false);
          setShowPhoneAuthModal(true);
        }}
        onSignIn={handleEmailSignIn}
        onCreateAccount={handleCreateAccount}
      />

      {/* ─── Phone OTP flow launched from Authentication Modal ─── */}
      <PhoneAuthModal
        visible={showPhoneAuthModal}
        onClose={() => setShowPhoneAuthModal(false)}
        onSuccess={(user) => {
          setShowPhoneAuthModal(false);
          const account: GoogleUser = {
            name: "S Movie Original User",
            email: user.phoneNumber,
          };
          setGoogleUser(account);
          void AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(account));
          showToast(
            `Phone verified for ${user.phoneNumber}. You’re signed in.`,
            "ok",
          );
        }}
      />

      {/* ─── Google Account Modal ─────────────────────────── */}
      <Modal visible={showGoogleModal} transparent animationType="fade" onRequestClose={() => setShowGoogleModal(false)}>
        <Pressable style={styles.dialogBackdrop} onPress={() => setShowGoogleModal(false)}>
          <Pressable style={styles.googleModalSheet} onPress={(e) => e.stopPropagation()}>
            {/* Google avatar */}
            <View style={styles.googleModalAvatar}>
              {googleUser?.picture ? (
                <Image source={{ uri: googleUser.picture }} style={styles.googleModalAvatarImg} />
              ) : (
                <View style={[styles.googleModalAvatarImg, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: "#E50914" }}>
                    {(googleUser?.name ?? "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.googleModalName}>{googleUser?.name ?? "S Movie Original User"}</Text>
            <Text style={styles.googleModalEmail}>{googleUser?.email ?? "Google Account"}</Text>
            <View style={styles.googleModalDivider} />

            {/* Unique User ID — for support / referral */}
            {identity?.uniqueUserId ? (
              <Pressable
                onPress={handleCopyUniqueId}
                style={({ pressed }) => [styles.uniqueIdCard, pressed && { opacity: 0.8 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.uniqueIdLabel}>Your Unique User ID</Text>
                  <Text style={styles.uniqueIdValue}>{identity.uniqueUserId}</Text>
                </View>
                <Ionicons name="copy-outline" size={18} color="#E50914" />
              </Pressable>
            ) : null}

            {/* Identity verification status */}
            {identity ? (
              <View style={styles.verifyCard}>
                <View style={styles.verifyRow}>
                  <Ionicons
                    name={
                      identity.verificationStatus === "verified"
                        ? "shield-checkmark"
                        : identity.verificationStatus === "rejected"
                        ? "alert-circle"
                        : "shield-outline"
                    }
                    size={18}
                    color={
                      identity.verificationStatus === "verified"
                        ? "#34D399"
                        : identity.verificationStatus === "rejected"
                        ? "#f59e0b"
                        : "#737373"
                    }
                  />
                  <Text style={styles.verifyLabel}>
                    {identity.verificationStatus === "verified"
                      ? "ID Verified"
                      : identity.verificationStatus === "rejected"
                      ? "Verification Failed"
                      : identity.verificationStatus === "pending"
                      ? "Verification Pending"
                      : "ID Not Verified"}
                  </Text>
                </View>
                {identity.isSuspended && identity.suspensionReason ? (
                  <Text style={styles.verifyReason}>{identity.suspensionReason}</Text>
                ) : null}
                {identity.verificationStatus !== "verified" ? (
                  <Pressable
                    onPress={handleVerifyPhoto}
                    disabled={verifyingPhoto}
                    style={({ pressed }) => [
                      styles.verifyBtn,
                      pressed && { opacity: 0.8 },
                      verifyingPhoto && { opacity: 0.6 },
                    ]}
                  >
                    {verifyingPhoto ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={16} color="#fff" />
                        <Text style={styles.verifyBtnText}>Upload Photo ID</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Pressable
              onPress={handleGoogleSignOut}
              style={({ pressed }) => [styles.googleSignOutBtn, pressed && { opacity: 0.78 }]}
            >
              <Ionicons name="log-out-outline" size={17} color="#E50914" />
              <Text style={styles.googleSignOutText}>Sign Out</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowGoogleModal(false)}
              style={({ pressed }) => [styles.googleModalDismiss, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.googleModalDismissText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Update dialog ────────────────────────────────── */}
      <Modal visible={showUpdateDialog} transparent animationType="fade" onRequestClose={() => { setShowUpdateDialog(false); setUpdateState("idle"); }}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogSheet}>
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={styles.dialogBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <MaterialCommunityIcons name="cloud-download" size={36} color="#fff" />
              <Text style={styles.dialogBannerTitle}>New Version Available</Text>
              <Text style={styles.dialogBannerVersion}>v{availableInfo?.version ?? ""}</Text>
            </LinearGradient>
            <View style={styles.dialogBody}>
              {availableInfo?.releaseNotes ? (
                <View style={styles.dialogNotes}>
                  <Text style={styles.dialogNotesLabel}>What's new</Text>
                  <Text style={styles.dialogNotesText}>{availableInfo.releaseNotes}</Text>
                </View>
              ) : null}
              <Text style={styles.dialogMessage}>
                Please install the latest version to get new movies and anime.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.dialogUpdateBtn, pressed && { opacity: 0.88 }]}
                onPress={() => { openApkInBrowser(availableInfo!.apkUrl); setShowUpdateDialog(false); setUpdateState("idle"); }}
              >
                <Feather name="download" size={18} color="#000" />
                <Text style={styles.dialogUpdateBtnText}>Download Now</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.dialogDismissBtn, pressed && { opacity: 0.7 }]} onPress={() => { setShowUpdateDialog(false); setUpdateState("idle"); }}>
                <Text style={styles.dialogDismissText}>Remind me later</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Download progress ────────────────────────────── */}
      <Modal visible={updateState === "downloading" || updateState === "installing"} transparent animationType="fade">
        <View style={styles.progressBackdrop}>
          <View style={styles.progressSheet}>
            <MaterialCommunityIcons name="cloud-download" size={40} color="#0EA5E9" />
            <Text style={styles.progressTitle}>{updateState === "installing" ? "Opening installer…" : "Downloading update"}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${downloadPercent}%` }]} />
            </View>
            <Text style={styles.progressPct}>{updateState === "installing" ? "Follow the installer prompt" : `${downloadPercent}%`}</Text>
          </View>
        </View>
      </Modal>

      {/* ─── Profile Edit Modal ───────────────────────────────────── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={editStyles.backdrop}
            onPress={() => setShowEditModal(false)}
          />
          <View style={editStyles.sheet}>
            <View style={editStyles.handle} />

            {/* Header */}
            <View style={editStyles.sheetHeader}>
              <Text style={editStyles.sheetTitle}>Edit Profile</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setShowEditModal(false)}
                style={({ pressed }) => [editStyles.sheetClose, pressed && { opacity: 0.6 }]}
              >
                <Feather name="x" size={20} color="#737373" />
              </Pressable>
            </View>

            {/* Avatar picker */}
            <View style={editStyles.avatarSection}>
              <Pressable
                onPress={handlePickAvatar}
                style={({ pressed }) => [editStyles.editAvatarWrap, pressed && { opacity: 0.75 }]}
              >
                {editDraftAvatarUri ? (
                  <Image
                    source={{ uri: editDraftAvatarUri }}
                    style={editStyles.editAvatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={require("../../assets/images/s-logo.png")}
                    style={editStyles.editAvatarImg}
                    resizeMode="cover"
                  />
                )}
                <View style={editStyles.editAvatarOverlay}>
                  <Feather name="camera" size={22} color="#fff" />
                  <Text style={editStyles.editAvatarHint}>Change Photo</Text>
                </View>
              </Pressable>
              {editDraftAvatarUri && (
                <Pressable
                  onPress={() => setEditDraftAvatarUri(null)}
                  style={({ pressed }) => [editStyles.removePhotoBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={editStyles.removePhotoText}>Remove photo</Text>
                </Pressable>
              )}
            </View>

            {/* Name input */}
            <View style={editStyles.fieldWrap}>
              <Text style={editStyles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={editStyles.nameInput}
                value={editDraftName}
                onChangeText={setEditDraftName}
                placeholder="MOVIE ORIGINAL"
                placeholderTextColor="#333"
                maxLength={32}
                autoCapitalize="characters"
                returnKeyType="done"
                selectionColor="#E50914"
              />
              <Text style={editStyles.fieldHint}>
                Shown below your avatar · leave empty to use default
              </Text>
            </View>

            {/* Save */}
            <Pressable
              onPress={handleSaveProfile}
              style={({ pressed }) => [editStyles.saveBtn, pressed && { opacity: 0.88 }]}
            >
              <Feather name="check" size={17} color="#000" />
              <Text style={editStyles.saveBtnText}>Save Changes</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Downloads Modal ────────────────────────────────────────── */}
      <DownloadsModal
        visible={showDownloadsModal}
        onClose={() => setShowDownloadsModal(false)}
        downloads={downloads}
        removeDownload={removeDownload}
        refreshDownloads={refreshDownloads}
        t={t}
      />

      {/* ─── Watch History Modal ────────────────────────────────────── */}
      <WatchHistoryModal
        visible={showWatchHistoryModal}
        onClose={() => setShowWatchHistoryModal(false)}
        t={t}
      />

      {/* ─── AI Chatbot Modal ───────────────────────────────────────── */}
      <AIChatbotModal
        visible={showChatbot}
        onClose={() => setShowChatbot(false)}
      />

      {/* ─── Subscription Screen Modal ───────────────────────────────── */}
      <Modal
        visible={showSubscription}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowSubscription(false)}
      >
        <SubscriptionScreen
          onClose={() => {
            setShowSubscription(false);
            // Re-check VIP status after closing (user may have just activated)
            const uid = firebaseAuth.currentUser?.uid ?? null;
            getVIPStatus(uid).then(setIsVIP).catch(() => {});
          }}
        />
      </Modal>

      {/* ─── Feedback Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showFeedback}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFeedback(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={fbStyles.backdrop} onPress={() => setShowFeedback(false)} />
          <View style={fbStyles.sheet}>
            <View style={fbStyles.handle} />
            {feedbackSent ? (
              <View style={fbStyles.sentWrap}>
                <Feather name="check-circle" size={48} color="#34D399" />
                <Text style={fbStyles.sentTitle}>Shukriya! 🙏</Text>
                <Text style={fbStyles.sentSub}>Aapka feedback hume mil gaya.{"\n"}Hum isko zaroor consider karenge.</Text>
                <Pressable style={fbStyles.doneBtn} onPress={() => setShowFeedback(false)}>
                  <Text style={fbStyles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={fbStyles.title}>Feedback do 💬</Text>
                <Text style={fbStyles.sub}>App mein koi problem hai? Koi suggestion? Hume batao.</Text>
                <TextInput
                  style={fbStyles.input}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder="Yahan likhो..."
                  placeholderTextColor="#444"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  maxLength={500}
                />
                <Text style={fbStyles.charCount}>{feedbackText.length}/500</Text>
                <Pressable
                  style={({ pressed }) => [
                    fbStyles.sendBtn,
                    (!feedbackText.trim() || feedbackSending || pressed) && { opacity: 0.6 },
                  ]}
                  disabled={!feedbackText.trim() || feedbackSending}
                  onPress={async () => {
                    if (!feedbackText.trim()) return;
                    setFeedbackSending(true);
                    try {
                      await saveFeedback(feedbackText);
                    } catch { }
                    setFeedbackSending(false);
                    setFeedbackSent(true);
                  }}
                >
                  {feedbackSending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="send" size={18} color="#fff" />
                  }
                  <Text style={fbStyles.sendBtnText}>
                    {feedbackSending ? "Bhej rahe hain…" : "Feedback Bhejo"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Language Picker Modal ──────────────────────────────────── */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable style={langStyles.backdrop} onPress={() => setShowLanguageModal(false)} />
        <View style={langStyles.sheet}>
          <View style={langStyles.handle} />
          <View style={langStyles.sheetHeader}>
            <View>
              <Text style={langStyles.sheetTitle}>{t.languageModalTitle}</Text>
              <Text style={langStyles.sheetSub}>{ALL_LANGUAGES.length} languages available</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={() => setShowLanguageModal(false)}
              style={({ pressed }) => [langStyles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="x" size={20} color="#737373" />
            </Pressable>
          </View>

          <FlatList
            data={ALL_LANGUAGES}
            keyExtractor={(item) => item.code}
            style={langStyles.langList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={langStyles.langListContent}
            ItemSeparatorComponent={() => <View style={langStyles.langSep} />}
            renderItem={({ item: lang }) => {
              const selected = language === lang.code;
              const isFullyTranslated = lang.code === "en" || lang.code === "hi";
              return (
                <TouchableOpacity
                  style={[langStyles.langRow, selected && langStyles.langRowSelected]}
                  activeOpacity={0.7}
                  onPress={async () => {
                    await setLanguage(lang.code);
                    setShowLanguageModal(false);
                    showToast(
                      lang.code === "hi"
                        ? "भाषा अपडेट हो गई!"
                        : `Language set to ${lang.label}`,
                      "ok",
                    );
                  }}
                >
                  <View style={langStyles.langLeft}>
                    <View style={langStyles.langLabelRow}>
                      <Text style={[langStyles.langLabel, selected && langStyles.langLabelActive]}>
                        {lang.label}
                      </Text>
                      {!isFullyTranslated && (
                        <View style={langStyles.enBadge}>
                          <Text style={langStyles.enBadgeText}>EN</Text>
                        </View>
                      )}
                    </View>
                    <Text style={langStyles.langNative}>{lang.native}</Text>
                    <Text style={langStyles.langRegion}>{lang.region}</Text>
                  </View>
                  {selected ? (
                    <Feather name="check" size={20} color="#E50914" />
                  ) : (
                    <View style={langStyles.langUncheck} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
          <View style={{ height: 24 }} />
        </View>
      </Modal>

      {/* ─── Toast banner ──────────────────────────────────────────── */}
      {toast && (
        <View style={[
          toastStyles.bar,
          toast.kind === "ok"  && toastStyles.barOk,
          toast.kind === "err" && toastStyles.barErr,
        ]}>
          <Ionicons
            name={toast.kind === "ok" ? "checkmark-circle" : toast.kind === "err" ? "alert-circle" : "information-circle"}
            size={18}
            color="#fff"
          />
          <Text style={toastStyles.text} numberOfLines={2}>{toast.msg}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Downloads Modal ──────────────────────────────────────────────────────────

function DownloadsModal({
  visible,
  onClose,
  downloads,
  removeDownload,
  refreshDownloads,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  downloads: ManagedDownload[];
  removeDownload: (id: string) => Promise<void>;
  refreshDownloads: () => Promise<void>;
  t: import("@/contexts/LanguageContext").Translations;
}) {
  const completed = downloads.filter((d) => d.status === "complete");
  const inProgress = downloads.filter((d) => d.status === "downloading");
  const all = [...inProgress, ...completed];

  const totalBytes = completed.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);

  const fmtSize = (bytes: number) => {
    if (bytes === 0) return "0 MB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  useEffect(() => {
    if (visible) refreshDownloads().catch(() => {});
  }, [visible]);

  const handleDelete = useCallback((item: ManagedDownload) => {
    Alert.alert(t.deleteDownloadConfirm, `"${item.title}" — ${t.deleteDownloadMsg}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: t.deleteDownloadConfirm,
        style: "destructive",
        onPress: () => removeDownload(item.movieId),
      },
    ]);
  }, [t, removeDownload]);

  const handleDeleteAll = useCallback(() => {
    if (completed.length === 0) return;
    Alert.alert(t.deleteAll, `Remove all ${completed.length} download${completed.length !== 1 ? "s" : ""}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: t.deleteAll,
        style: "destructive",
        onPress: async () => {
          for (const d of completed) await removeDownload(d.movieId);
        },
      },
    ]);
  }, [completed, t, removeDownload]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={dlStyles.root}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {/* Header */}
          <View style={dlStyles.header}>
            <Text style={dlStyles.title}>{t.downloadsModalTitle}</Text>
            <View style={dlStyles.headerRight}>
              {completed.length > 0 && (
                <Pressable onPress={handleDeleteAll} hitSlop={10} style={dlStyles.deleteAllBtn}>
                  <Text style={dlStyles.deleteAllText}>{t.deleteAll}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [dlStyles.closeBtn, pressed && { opacity: 0.6 }]}
              >
                <Feather name="x" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Storage summary bar */}
          {completed.length > 0 && (
            <View style={dlStyles.storageBar}>
              <Ionicons name="cloud-download-outline" size={16} color="#737373" />
              <Text style={dlStyles.storageText}>
                {t.totalStorage}: <Text style={dlStyles.storageValue}>{fmtSize(totalBytes)}</Text>
              </Text>
              <View style={dlStyles.storageCount}>
                <Text style={dlStyles.storageCountText}>{completed.length} file{completed.length !== 1 ? "s" : ""}</Text>
              </View>
            </View>
          )}

          {/* Empty state */}
          {all.length === 0 ? (
            <View style={dlStyles.emptyWrap}>
              <View style={dlStyles.emptyIconWrap}>
                <Ionicons name="cloud-download-outline" size={52} color="#2a2a2a" />
              </View>
              <Text style={dlStyles.emptyTitle}>{t.noDownloadsYet}</Text>
              <Text style={dlStyles.emptySub}>{t.noDownloadsSub}</Text>
            </View>
          ) : (
            <FlatList
              data={all}
              keyExtractor={(item) => item.movieId}
              contentContainerStyle={dlStyles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={dlStyles.sep} />}
              renderItem={({ item }) => {
                const isDownloading = item.status === "downloading";
                const sizeMb = item.sizeBytes > 0 ? `${(item.sizeBytes / (1024 * 1024)).toFixed(0)} MB` : null;

                return (
                  <View style={dlStyles.row}>
                    {/* Poster */}
                    <Pressable
                      onPress={() => {
                        if (item.status === "complete") {
                          onClose();
                          router.push({ pathname: "/player", params: { id: item.movieId } });
                        }
                      }}
                      style={({ pressed }) => [dlStyles.posterWrap, pressed && { opacity: 0.8 }]}
                    >
                      {item.posterUri ? (
                        <SmartImage
                          source={{ uri: item.posterUri }}
                          style={dlStyles.poster}
                          contentFit="cover"
                          cachePolicy="disk"
                        />
                      ) : (
                        <View style={[dlStyles.poster, dlStyles.posterFallback]}>
                          <Feather name="film" size={20} color="#444" />
                        </View>
                      )}
                      {item.status === "complete" && (
                        <View style={dlStyles.playOverlay}>
                          <Feather name="play" size={14} color="#fff" />
                        </View>
                      )}
                    </Pressable>

                    {/* Info */}
                    <View style={dlStyles.info}>
                      <Text style={dlStyles.itemTitle} numberOfLines={2}>{item.title}</Text>
                      <View style={dlStyles.metaRow}>
                        <View style={dlStyles.hdBadge}>
                          <Text style={dlStyles.hdText}>HD</Text>
                        </View>
                        {sizeMb && <Text style={dlStyles.sizeText}>{sizeMb}</Text>}
                        {isDownloading && (
                          <Text style={dlStyles.progressText}>{Math.round((item.progress ?? 0) * 100)}%</Text>
                        )}
                      </View>
                      {isDownloading && (
                        <View style={dlStyles.progressTrack}>
                          <View style={[dlStyles.progressFill, { width: `${Math.round((item.progress ?? 0) * 100)}%` }]} />
                        </View>
                      )}
                    </View>

                    {/* Actions */}
                    <View style={dlStyles.actions}>
                      {item.status === "complete" && (
                        <Pressable
                          onPress={() => {
                            onClose();
                            router.push({ pathname: "/player", params: { id: item.movieId } });
                          }}
                          style={({ pressed }) => [dlStyles.playBtn, pressed && { opacity: 0.8 }]}
                        >
                          <Feather name="play" size={14} color="#000" />
                          <Text style={dlStyles.playBtnText}>{t.playNow}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => handleDelete(item)}
                        hitSlop={8}
                        style={({ pressed }) => [dlStyles.deleteBtn, pressed && { opacity: 0.6 }]}
                      >
                        <Feather name="trash-2" size={18} color="#E50914" />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const dlStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1c1c1c",
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  title: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  deleteAllBtn: { padding: 4 },
  deleteAllText: { color: "#E50914", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  closeBtn: { padding: 4 },

  storageBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#0d0d0d",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1c1c1c",
  },
  storageText: { flex: 1, color: "#737373", fontSize: 12, fontFamily: "Inter_400Regular" },
  storageValue: { color: "#e5e5e5", fontFamily: "Inter_600SemiBold" },
  storageCount: {
    backgroundColor: "rgba(229,9,20,0.1)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
  },
  storageCountText: { color: "#E50914", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 48 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { color: "#e5e5e5", fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { color: "#525252", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  list: { padding: 16, paddingBottom: 60 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "#1c1c1c", marginVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },

  posterWrap: { position: "relative" },
  poster: { width: 68, height: 100, borderRadius: 6, backgroundColor: "#1c1c1c" },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  playOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  info: { flex: 1, gap: 6 },
  itemTitle: { color: "#e5e5e5", fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hdBadge: {
    backgroundColor: "#1c1c1c",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#333",
  },
  hdText: { color: "#737373", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  sizeText: { color: "#525252", fontSize: 12, fontFamily: "Inter_400Regular" },
  progressText: { color: "#0EA5E9", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressTrack: { height: 3, backgroundColor: "#1c1c1c", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#0EA5E9", borderRadius: 2 },

  actions: { alignItems: "center", gap: 10 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  playBtnText: { color: "#000", fontSize: 12, fontFamily: "Inter_700Bold" },
  deleteBtn: { padding: 6 },
});

// ─── Watch History Modal ───────────────────────────────────────────────────────

function WatchHistoryModal({
  visible,
  onClose,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  t: import("@/contexts/LanguageContext").Translations;
}) {
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadWatchHistory().then((h) => { setItems(h); setLoading(false); });
  }, [visible]);

  const handleRemove = useCallback(async (id: string) => {
    await removeFromWatchHistory(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    Alert.alert(t.watchHistoryTitle, t.clearHistory + "?", [
      { text: "Cancel", style: "cancel" },
      {
        text: t.clearHistory,
        style: "destructive",
        onPress: async () => {
          await clearWatchHistory();
          setItems([]);
        },
      },
    ]);
  }, [t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={whStyles.root}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={whStyles.header}>
            <Text style={whStyles.title}>{t.watchHistoryTitle}</Text>
            <View style={whStyles.headerRight}>
              {items.length > 0 && (
                <Pressable onPress={handleClearAll} hitSlop={10} style={whStyles.clearBtn}>
                  <Text style={whStyles.clearText}>{t.clearHistory}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [whStyles.closeBtn, pressed && { opacity: 0.6 }]}
              >
                <Feather name="x" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color="#E50914" style={{ marginTop: 60 }} />
          ) : items.length === 0 ? (
            <View style={whStyles.emptyWrap}>
              <Ionicons name="time-outline" size={52} color="#333" />
              <Text style={whStyles.emptyText}>{t.startWatching}</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={whStyles.listContent}
            >
              {/* ── Horizontal "Continue Watching" poster row ─────────────── */}
              <Text style={whStyles.sectionLabel}>Continue Watching</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={whStyles.hRow}
              >
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [whStyles.hCard, pressed && { opacity: 0.78, transform: [{ scale: 0.96 }] }]}
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: "/movie/[id]",
                        params: {
                          id: item.id,
                          poster_path: item.posterUri ?? "",
                          title_param: item.title ?? "",
                        },
                      });
                    }}
                  >
                    {item.posterUri ? (
                      <SmartImage
                        source={{ uri: item.posterUri }}
                        style={whStyles.hPoster}
                        contentFit="cover"
                        cachePolicy="disk"
                        transition={200}
                      />
                    ) : (
                      <View style={[whStyles.hPoster, whStyles.hPosterFallback]}>
                        <Feather name="film" size={28} color="#333" />
                      </View>
                    )}
                    {/* Play icon overlay */}
                    <View style={whStyles.hPlayOverlay} pointerEvents="none">
                      <View style={whStyles.hPlayCircle}>
                        <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                    <Pressable
                      hitSlop={10}
                      style={whStyles.hXBtn}
                      onPress={(e) => { e.stopPropagation?.(); handleRemove(item.id); }}
                    >
                      <Feather name="x" size={9} color="#fff" />
                    </Pressable>
                    <Text style={whStyles.hCardTitle} numberOfLines={2}>{item.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* ── Full list below ─────────────────────────────────────────── */}
              <Text style={[whStyles.sectionLabel, { marginTop: 24 }]}>All History</Text>
              <View style={whStyles.grid}>
                {items.map((item) => (
                  <Pressable
                    key={`grid-${item.id}`}
                    style={({ pressed }) => [whStyles.card, pressed && { opacity: 0.75 }]}
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: "/movie/[id]",
                        params: {
                          id: item.id,
                          poster_path: item.posterUri ?? "",
                          title_param: item.title ?? "",
                        },
                      });
                    }}
                  >
                    {item.posterUri ? (
                      <SmartImage
                        source={{ uri: item.posterUri }}
                        style={whStyles.poster}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                    ) : (
                      <View style={[whStyles.poster, { alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="film" size={24} color="#444" />
                      </View>
                    )}
                    <Pressable
                      hitSlop={8}
                      style={whStyles.xBtn}
                      onPress={() => handleRemove(item.id)}
                    >
                      <Feather name="x" size={10} color="#fff" />
                    </Pressable>
                    <Text style={whStyles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const WH_CARD_W = 110;
const WH_CARD_H = Math.round(WH_CARD_W * 1.5);

const whStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1c1c1c",
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  title: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  clearBtn: { padding: 4 },
  clearText: { color: "#E50914", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  closeBtn: { padding: 4 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyText: { color: "#525252", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },

  // ── Scrollable body ───────────────────────────────────────────────────────
  listContent: { paddingBottom: 60 },
  sectionLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },

  // ── Horizontal "Continue Watching" row ───────────────────────────────────
  hRow: { paddingHorizontal: 16, gap: 10 },
  hCard: { width: WH_CARD_W, position: "relative" },
  hPoster: { width: WH_CARD_W, height: WH_CARD_H, borderRadius: 8, backgroundColor: "#1c1c1c" },
  hPosterFallback: { alignItems: "center", justifyContent: "center" },
  hPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    top: 0, left: 0, right: 0,
    height: WH_CARD_H,
  },
  hPlayCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  hXBtn: {
    position: "absolute",
    top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 8, padding: 3,
    zIndex: 10,
  },
  hCardTitle: {
    color: "#d4d4d4", fontSize: 10, fontFamily: "Inter_500Medium",
    marginTop: 5, lineHeight: 14, width: WH_CARD_W,
  },

  // ── 3-column grid (All History) ───────────────────────────────────────────
  grid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, gap: 8,
    paddingBottom: 20,
  },
  card: { width: "31%" },
  poster: { width: "100%", aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: "#1c1c1c" },
  xBtn: {
    position: "absolute", top: 5, right: 5,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 10, padding: 3,
  },
  cardTitle: { color: "#d4d4d4", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 5, lineHeight: 14 },
});

// ─── Language Modal Styles ────────────────────────────────────────────────────

const langStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "82%",
    backgroundColor: "#141414",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#222",
    overflow: "hidden",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  sheetTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  sheetSub: { color: "#525252", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4 },

  langList: { flexGrow: 0 },
  langListContent: { paddingBottom: 8 },
  langSep: { height: StyleSheet.hairlineWidth, backgroundColor: "#1c1c1c", marginHorizontal: 20 },

  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  langRowSelected: {
    backgroundColor: "rgba(229,9,20,0.06)",
  },
  langLeft: { flex: 1, gap: 2, marginRight: 12 },
  langLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  langLabel: { color: "#e5e5e5", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  langLabelActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  langNative: { color: "#737373", fontSize: 13, fontFamily: "Inter_400Regular" },
  langRegion: { color: "#3a3a3a", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  langUncheck: { width: 20, height: 20 },

  enBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  enBadgeText: { color: "#525252", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});

// ─── Watch History Row (legacy - kept for reference) ──────────────────────────

function WatchHistoryRow() {
  const [items, setItems] = useState<WatchProgress[]>([]);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadAllProgress().then((all) => setItems(all.slice(0, 10)));
    }, []),
  );

  const handleRemove = useCallback(async (movieId: string) => {
    await clearProgress(movieId);
    setItems((prev) => prev.filter((p) => p.movieId !== movieId));
  }, []);

  const handleClearAll = useCallback(() => {
    Alert.alert("Clear Watch History", "Remove all watch history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        style: "destructive",
        onPress: async () => {
          for (const item of items) await clearProgress(item.movieId);
          setItems([]);
        },
      },
    ]);
  }, [items]);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#1a1a1a" }]}
      >
        <View style={styles.rowIconWrap}>
          <Ionicons name="time-outline" size={21} color="#fff" />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Watch History</Text>
          <Text style={styles.rowSub}>{items.length > 0 ? `${items.length} title${items.length !== 1 ? "s" : ""} watched` : "No history yet"}</Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#404040" />
      </Pressable>
      {expanded && items.length > 0 && (
        <View style={histStyles.historyWrap}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.movieId}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={histStyles.histList}
            renderItem={({ item }) => {
              const fraction = item.durationSec > 0 ? Math.min(1, item.positionSec / item.durationSec) : 0;
              const minsLeft = Math.round(Math.max(0, item.durationSec - item.positionSec) / 60);
              return (
                <Pressable
                  onPress={() => router.push({ pathname: "/player", params: { id: item.movieId } })}
                  style={({ pressed }) => [histStyles.histCard, pressed && { opacity: 0.75 }]}
                >
                  {item.posterUri ? (
                    <SmartImage
                      source={{ uri: item.posterUri }}
                      style={histStyles.histThumb}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : (
                    <View style={[histStyles.histThumb, { backgroundColor: "#1c1c1c", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="film" size={20} color="#444" />
                    </View>
                  )}
                  <View style={histStyles.histProgress}>
                    <View style={[histStyles.histFill, { width: `${Math.round(fraction * 100)}%` }]} />
                  </View>
                  <Pressable onPress={() => handleRemove(item.movieId)} hitSlop={8} style={histStyles.histX}>
                    <Feather name="x" size={11} color="#a3a3a3" />
                  </Pressable>
                  <Text style={histStyles.histTitle} numberOfLines={1}>{item.title ?? "Unknown"}</Text>
                  {item.durationSec > 0 && (
                    <Text style={histStyles.histTime}>{minsLeft > 0 ? `${minsLeft}m left` : "Done"}</Text>
                  )}
                </Pressable>
              );
            }}
          />
          <Pressable onPress={handleClearAll} style={histStyles.clearBtn}>
            <Text style={histStyles.clearText}>Clear History</Text>
          </Pressable>
        </View>
      )}
      {expanded && items.length === 0 && (
        <View style={histStyles.emptyWrap}>
          <Text style={histStyles.emptyText}>Start watching to build history</Text>
        </View>
      )}
    </View>
  );
}

const histStyles = StyleSheet.create({
  historyWrap: { backgroundColor: "#0d0d0d", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1c1c1c" },
  histList: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  histCard: { width: 110 },
  histThumb: { width: 110, height: 65, borderRadius: 6, overflow: "hidden", backgroundColor: "#1c1c1c" },
  histProgress: { height: 3, backgroundColor: "#2a2a2a", borderRadius: 1.5, marginTop: 4, overflow: "hidden" },
  histFill: { height: "100%", backgroundColor: "#fff", borderRadius: 1.5 },
  histX: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 2 },
  histTitle: { color: "#d4d4d4", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 4 },
  histTime: { color: "#737373", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  clearBtn: { alignSelf: "flex-end", paddingHorizontal: 16, paddingBottom: 10 },
  clearText: { color: "#525252", fontSize: 11, fontFamily: "Inter_500Medium" },
  emptyWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  emptyText: { color: "#525252", fontSize: 13, fontFamily: "Inter_400Regular" },
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SettingsRow({
  icon, label, sub, onPress, right, disabled, badge, labelStyle,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
  badge?: string;
  labelStyle?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, pressed && !disabled && { backgroundColor: "#1a1a1a" }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.rowIconWrap}>{icon}</View>
      <View style={styles.rowText}>
        <View style={styles.rowLabelRow}>
          <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
          {badge && (
            <View style={[
              styles.badge,
              badge === "ON" && styles.badgeGreen,
              badge === "NEW" && styles.badgeRed,
              badge === "UPCOMING" && styles.badgeGray,
            ]}>
              <Text style={[styles.badgeText, badge === "UPCOMING" && styles.badgeTextGray]}>{badge}</Text>
            </View>
          )}
        </View>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  safe: { flex: 1 },
  scroll: { paddingBottom: 100 },

  // ── Sign-Up Modal ─────────────────────────────────────────────────────────
  signUpSheet: {
    backgroundColor: "#141414", borderRadius: 24,
    padding: 28, alignItems: "center", width: "90%",
    borderWidth: 1, borderColor: "#222",
  },
  signUpHeader: { alignItems: "center", marginBottom: 24 },
  signUpIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(229,9,20,0.12)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  signUpIconText: { fontSize: 30 },
  signUpTitle: {
    color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold",
    marginBottom: 6, letterSpacing: -0.3,
  },
  signUpSubtitle: {
    color: "#737373", fontSize: 13, fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  signUpFieldWrap: { width: "100%", marginBottom: 14 },
  signUpLabel: {
    color: "#525252", fontSize: 10, fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2, marginBottom: 6,
  },
  signUpInput: {
    backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1,
    borderColor: "#2a2a2a", color: "#fff", fontFamily: "Inter_400Regular",
    fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
    width: "100%",
  },
  signUpBtn: {
    backgroundColor: "#E50914", borderRadius: 50,
    paddingVertical: 14, width: "100%", alignItems: "center",
    marginBottom: 8, marginTop: 4,
  },
  signUpBtnText: {
    color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  // ── Google button (header) ────────────────────────────────────────────────
  googleBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(66,133,244,0.5)",
    backgroundColor: "rgba(66,133,244,0.1)",
    overflow: "hidden",
  },
  googleAvatar: { width: 34, height: 34, borderRadius: 17 },
  googleIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(66,133,244,0.12)",
  },
  googleG: {
    fontSize: 16, fontFamily: "Inter_800ExtraBold",
    color: "#4285F4", lineHeight: 20,
  },

  // ── Google account modal ──────────────────────────────────────────────────
  googleModalSheet: {
    backgroundColor: "#141414", borderRadius: 24,
    padding: 28, alignItems: "center", width: "85%",
    borderWidth: 1, borderColor: "#222",
  },
  googleModalAvatar: { marginBottom: 14 },
  googleModalAvatarImg: { width: 72, height: 72, borderRadius: 36 },
  googleModalName: {
    color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold",
    letterSpacing: -0.3, marginBottom: 4,
  },
  googleModalEmail: {
    color: "#737373", fontSize: 13, fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  googleModalDivider: { width: "100%", height: 1, backgroundColor: "#1e1e1e", marginBottom: 16 },
  uniqueIdCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  uniqueIdLabel: { color: "#737373", fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  uniqueIdValue: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  verifyCard: {
    width: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  verifyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  verifyLabel: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  verifyReason: { color: "#f59e0b", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#E50914",
    borderRadius: 10,
    paddingVertical: 10,
  },
  verifyBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  googleSignOutBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(229,9,20,0.1)", borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)", borderRadius: 50,
    paddingVertical: 12, paddingHorizontal: 28, marginBottom: 12, width: "100%",
    justifyContent: "center",
  },
  googleSignOutText: { color: "#E50914", fontSize: 15, fontFamily: "Inter_700Bold" },
  googleModalDismiss: { paddingVertical: 8, paddingHorizontal: 20 },
  googleModalDismissText: { color: "#525252", fontSize: 13, fontFamily: "Inter_400Regular" },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  editIcon: { padding: 6 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerSignInBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  gIcon: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  headerSignInText: {
    color: "#e5e5e5",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  headerUserPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(52,211,153,0.1)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.3)",
  },
  headerUserDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34D399",
  },
  headerUserText: {
    color: "#34D399",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 72,
  },
  userIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  userIdDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E50914",
  },
  userIdText: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  userIdValue: {
    color: "#E50914",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },

  activeProfileWrap: { alignItems: "center", paddingVertical: 28 },
  activeProfileBrandName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  activeAvatar: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  activeProfileSub: { color: "#9E9E9E", fontSize: 13, fontFamily: "Inter_400Regular" },

  switchProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229,9,20,0.25)",
  },
  switchProfileText: {
    color: "#e5e5e5",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#1a1a1a", marginHorizontal: 0, marginBottom: 8 },

  profileAuthTrigger: {
    alignSelf: "center",
    width: "92%",
    maxWidth: 420,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  profileAuthTriggerPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  profileAuthTriggerText: {
    color: "#1f1f1f",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },

  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: {
    color: "#404040",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionBody: { backgroundColor: "#111", borderRadius: 12, overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1c1c1c",
  },
  rowIconWrap: { width: 28, alignItems: "center" },
  rowText: { flex: 1 },
  rowLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: "#e5e5e5", fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSub: { color: "#525252", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeGreen: { backgroundColor: "rgba(52,211,153,0.15)" },
  badgeRed: { backgroundColor: "rgba(229,9,20,0.15)" },
  badgeGray: { backgroundColor: "rgba(255,255,255,0.08)" },
  badgeText: { color: "#34D399", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  badgeTextGray: { color: "#9ca3af" },

  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#111",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    alignItems: "center",
  },
  signOutText: { color: "#0EA5E9", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  versionCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.18)",
  },
  versionCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  versionAppName: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  versionNumber: {
    color: "#0EA5E9",
    fontSize: 22,
    fontFamily: "Inter_900Black",
    letterSpacing: 0.5,
  },
  versionBadge: {
    backgroundColor: "rgba(52,211,153,0.15)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.35)",
  },
  versionBadgeText: {
    color: "#34D399",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  versionSub: {
    color: "#555",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  footer: {
    color: "#333",
    fontSize: 11,
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
    fontFamily: "Inter_400Regular",
  },

  dialogBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center", padding: 24 },
  dialogSheet: { width: "100%", backgroundColor: "#141414", borderRadius: 16, overflow: "hidden" },
  dialogBanner: { paddingVertical: 28, paddingHorizontal: 24, alignItems: "center", gap: 8 },
  dialogBannerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  dialogBannerVersion: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontFamily: "Inter_500Medium" },
  dialogBody: { padding: 20 },
  dialogMessage: {
    color: "#a3a3a3",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  dialogNotes: { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, marginBottom: 18 },
  dialogNotesLabel: { color: "#525252", fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  dialogNotesText: { color: "#d4d4d4", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  dialogUpdateBtn: { backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 6, gap: 8, marginBottom: 10 },
  dialogUpdateBtnText: { color: "#000", fontSize: 15, fontFamily: "Inter_700Bold" },
  dialogDismissBtn: { alignItems: "center", paddingVertical: 10 },
  dialogDismissText: { color: "#737373", fontSize: 14, fontFamily: "Inter_500Medium" },

  progressBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center", padding: 32 },
  progressSheet: { width: "100%", backgroundColor: "#141414", borderRadius: 18, padding: 28, alignItems: "center", gap: 10 },
  progressTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  progressBarTrack: { width: "100%", height: 5, backgroundColor: "#2a2a2a", borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressBarFill: { height: "100%", backgroundColor: "#0EA5E9", borderRadius: 3 },
  progressPct: { color: "#737373", fontSize: 13, fontFamily: "Inter_500Medium" },

  // ── Unique User ID card (main profile view) ───────────────────────────────
  uidSection: { paddingHorizontal: 16, paddingBottom: 8 },
  uidCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
    padding: 16,
    gap: 12,
    backgroundColor: "#0d0d0d",
  },
  uidTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  uidLabel: {
    color: "#555",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  uidValue: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
  },
  uidCopyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(229,9,20,0.10)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  uidInnerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  uidStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  uidStatusText: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  uidVerifyBtn: {
    backgroundColor: "#E50914",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexShrink: 0,
  },
  uidVerifyBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});

const authStyles = StyleSheet.create({
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: "hidden",
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  loggedInCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    overflow: "hidden",
  },
  loggedInLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  loggedInDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#34D399",
  },
  loggedInLabel: { color: "#737373", fontSize: 11, fontFamily: "Inter_500Medium" },
  loggedInMobile: { color: "#e5e5e5", fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  signOutPill: {
    backgroundColor: "rgba(229,9,20,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.35)",
  },
  signOutPillText: { color: "#E50914", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  modalRoot: { flex: 1, backgroundColor: "#000" },
  modalSafe: { flex: 1 },
  modalScroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  closeBtn: {
    alignSelf: "flex-end",
    margin: 16,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
  },

  brandWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 32 },
  brandIcon: {
    width: 72, height: 72, borderRadius: 36,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(229,9,20,0.4)",
  },
  brandName: {
    color: "#E5E5E5",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    textTransform: "uppercase",
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    gap: 0,
  },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#2a2a2a",
  },
  stepDotActive: { backgroundColor: "#E50914" },
  stepLine: {
    width: 48, height: 2,
    backgroundColor: "#1a1a1a",
    marginHorizontal: 6,
  },
  stepLineActive: { backgroundColor: "#E50914" },

  card: {
    backgroundColor: "#111",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1e1e1e",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  cardSub: {
    color: "#525252",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 28,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginBottom: 20,
    overflow: "hidden",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: "#2a2a2a",
    backgroundColor: "#141414",
  },
  prefixFlag: { fontSize: 18 },
  prefixCode: {
    color: "#e5e5e5",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  phoneInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 16,
    letterSpacing: 1,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#E50914",
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 16,
  },
  actionBtnDisabled: { backgroundColor: "#3a0a0a", opacity: 0.6 },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },

  disclaimer: {
    color: "#333",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 8,
  },

  otpWrap: { marginBottom: 24, position: "relative" },
  otpInput: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    color: "transparent",
    fontSize: 1,
    zIndex: 1,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 0,
    height: 58,
  },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: { borderColor: "#E50914" },
  otpBoxFilled: { borderColor: "#3a3a3a", backgroundColor: "#1e1e1e" },
  otpChar: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },

  resendRow: { alignItems: "center", marginTop: 8 },
  resendText: { color: "#525252", fontSize: 13, fontFamily: "Inter_400Regular" },
  resendLink: { color: "#E50914", fontFamily: "Inter_600SemiBold" },
});

const ccStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#1e1e1e",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetTitle: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e1e1e",
  },
  ccRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a1a1a",
  },
  ccRowActive: {
    backgroundColor: "rgba(229,9,20,0.06)",
  },
  ccFlag: { fontSize: 22 },
  ccName: {
    flex: 1,
    color: "#e5e5e5",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  ccCode: {
    color: "#525252",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

const toastStyles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(30,30,30,0.97)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  barOk:  { borderColor: "rgba(52,211,153,0.35)", backgroundColor: "rgba(20,40,30,0.97)" },
  barErr: { borderColor: "rgba(229,9,20,0.35)",  backgroundColor: "rgba(40,10,10,0.97)" },
  text: {
    flex: 1,
    color: "#e5e5e5",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
});

const editStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#1e1e1e",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#2a2a2a",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e1e1e",
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  sheetClose: {
    padding: 4,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  editAvatarWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(229,9,20,0.5)",
  },
  editAvatarImg: {
    width: "100%",
    height: "100%",
  },
  editAvatarOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  editAvatarHint: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  removePhotoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    backgroundColor: "rgba(229,9,20,0.07)",
  },
  removePhotoText: {
    color: "#E50914",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  fieldWrap: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  fieldLabel: {
    color: "#404040",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textTransform: "uppercase",
  },
  fieldHint: {
    color: "#333",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 15,
  },
  saveBtnText: {
    color: "#000",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});

const fbStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#666",
    marginBottom: 16,
    lineHeight: 19,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 14,
    minHeight: 120,
  },
  charCount: {
    color: "#444",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 6,
    marginBottom: 16,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E50914",
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  sentWrap: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  sentTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  sentSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#666",
    textAlign: "center",
    lineHeight: 21,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 13,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
