import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PROFILES, useProfile } from "@/contexts/ProfileContext";
import { tmdb, tmdbImg } from "@/lib/tmdb";
import { useNetworkStatus } from "@/contexts/NetworkContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Phase = "splash" | "profiles" | "selecting";

// ── Built-in cartoon avatar images (DiceBear — Cloudflare CDN) ─────────────────
// Used when the user hasn't set a custom avatar photo.
const BUILT_IN_AVATARS: Record<string, string> = {
  sksoyel: "https://api.dicebear.com/7.x/avataaars/png?seed=smovie-main&size=256&backgroundColor=b6e3f4&top=shortCurly&clothesColor=3c4f5c",
  kids:    "https://api.dicebear.com/7.x/adventurer/png?seed=smovie-kids&size=256&backgroundColor=ffd93d",
};

const { width } = Dimensions.get("window");
const CARD_W = (width - 72) / 2;

const AVATAR_COLORS = [
  { label: "Red",    value: "#E50914" },
  { label: "Blue",   value: "#0b4fd4" },
  { label: "Green",  value: "#1DB954" },
  { label: "Yellow", value: "#F5A623" },
  { label: "Purple", value: "#9b59b6" },
];

// ─── Netflix-style initial-letter avatar ──────────────────────────────────────
// Converts a hex color to slightly darker/lighter variants for the gradient.
function darken(hex: string, amount = 0.45): string {
  const c = hex.replace("#", "");
  const r = Math.max(0, parseInt(c.slice(0, 2), 16) - Math.round(255 * amount));
  const g = Math.max(0, parseInt(c.slice(2, 4), 16) - Math.round(255 * amount));
  const b = Math.max(0, parseInt(c.slice(4, 6), 16) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function SmileAvatar({ color, initial }: { color: string; initial?: string }) {
  const letter = (initial ?? "?").charAt(0).toUpperCase();
  const dark = darken(color, 0.55);
  const mid  = darken(color, 0.28);
  return (
    <LinearGradient
      colors={[mid, dark]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={avatar.wrap}
    >
      <View style={[avatar.glow, { borderColor: color + "40" }]} />
      <Text style={[avatar.letter, { color }]}>{letter}</Text>
    </LinearGradient>
  );
}

const avatar = StyleSheet.create({
  wrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  letter: {
    fontSize: 28,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});

// ─── Profile card avatar — shows photo if available, else letter avatar ────────
function ProfileAvatar({
  color,
  initial,
  avatarUri,
  size = 82,
  borderRadius = 10,
}: {
  color: string;
  initial?: string;
  avatarUri?: string | null;
  size?: number;
  borderRadius?: number;
}) {
  if (avatarUri) {
    return (
      <Image
        source={{ uri: avatarUri }}
        style={{ width: size, height: size, borderRadius }}
        resizeMode="cover"
      />
    );
  }
  const letter = (initial ?? "?").charAt(0).toUpperCase();
  const dark = darken(color, 0.55);
  const mid  = darken(color, 0.28);
  return (
    <LinearGradient
      colors={[mid, dark]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ width: size, height: size, borderRadius, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
    >
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius, borderWidth: 1.5, borderColor: color + "40" }} />
      <Text style={{ fontSize: size * 0.38, fontFamily: "Inter_800ExtraBold", color, textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 }}>
        {letter}
      </Text>
    </LinearGradient>
  );
}

// ─── Shared image picker helper ────────────────────────────────────────────────
async function pickImage(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library to set a profile picture.");
      return null;
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (!result.canceled && result.assets[0]?.uri) return result.assets[0].uri;
  return null;
}

// ─── Manage Profiles Modal ────────────────────────────────────────────────────
function ManageProfilesModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { getDisplayName, getDisplayColor, getDisplayAvatar, updateProfileName, updateProfileColor, updateProfileAvatar, extraProfiles, removeProfile } = useProfile();
  const allProfiles = [...PROFILES, ...extraProfiles];

  const [selectedId, setSelectedId] = useState(PROFILES[0].id);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const id = PROFILES[0].id;
      setSelectedId(id);
      setEditName(getDisplayName(id));
      setEditColor(getDisplayColor(id));
      setEditAvatarUri(getDisplayAvatar(id));
    }
  }, [visible]);

  const handleSelectProfile = (id: string) => {
    setSelectedId(id);
    setEditName(getDisplayName(id));
    setEditColor(getDisplayColor(id));
    setEditAvatarUri(getDisplayAvatar(id));
  };

  const handleDelete = async (id: string) => {
    await removeProfile(id);
    if (selectedId === id) {
      const fallback = PROFILES[0].id;
      setSelectedId(fallback);
      setEditName(getDisplayName(fallback));
      setEditColor(getDisplayColor(fallback));
      setEditAvatarUri(getDisplayAvatar(fallback));
    }
  };

  const handlePickPhoto = async () => {
    const uri = await pickImage();
    if (uri) setEditAvatarUri(uri);
  };

  const handleRemovePhoto = () => setEditAvatarUri(null);

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (trimmed.length > 0) await updateProfileName(selectedId, trimmed);
    await updateProfileColor(selectedId, editColor);
    await updateProfileAvatar(selectedId, editAvatarUri);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={mgStyles.backdrop}>
        <View style={mgStyles.sheet}>
          {/* Header */}
          <View style={mgStyles.header}>
            <Text style={mgStyles.title}>Manage Profiles</Text>
            <Pressable onPress={onClose} style={mgStyles.closeBtn} hitSlop={12}>
              <Text style={mgStyles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* Profile selector row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mgStyles.profileRow}>
            {allProfiles.map((p) => {
              const displayName = getDisplayName(p.id);
              const displayColor = getDisplayColor(p.id);
              const displayAvatar = getDisplayAvatar(p.id);
              const isSelected = p.id === selectedId;
              const isDeletable = !PROFILES.some((sp) => sp.id === p.id);
              return (
                <View key={p.id} style={{ position: "relative" }}>
                  <Pressable
                    onPress={() => handleSelectProfile(p.id)}
                    style={[mgStyles.profileChip, isSelected && { borderColor: displayColor }]}
                  >
                    <ProfileAvatar color={displayColor} initial={p.initial} avatarUri={displayAvatar} size={64} borderRadius={12} />
                    <Text style={[mgStyles.chipName, { color: isSelected ? displayColor : "#888" }]} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {p.isKids && (
                      <View style={[mgStyles.kidsBadge, { backgroundColor: displayColor }]}>
                        <Text style={mgStyles.kidsBadgeText}>KIDS</Text>
                      </View>
                    )}
                  </Pressable>
                  {isDeletable && (
                    <Pressable
                      onPress={() => handleDelete(p.id)}
                      hitSlop={6}
                      style={mgStyles.deleteBadge}
                    >
                      <Text style={mgStyles.deleteBadgeTxt}>×</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={mgStyles.divider} />

          {/* Photo picker */}
          <Text style={mgStyles.sectionLabel}>Profile Photo</Text>
          <View style={mgStyles.photoRow}>
            <View style={mgStyles.photoPreviewWrap}>
              <ProfileAvatar color={editColor} initial={editName.trim().charAt(0).toUpperCase() || "?"} avatarUri={editAvatarUri} size={64} borderRadius={12} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Pressable
                style={({ pressed }) => [mgStyles.photoBtn, pressed && { opacity: 0.75 }]}
                onPress={handlePickPhoto}
              >
                <Text style={mgStyles.photoBtnText}>📷  Choose Photo</Text>
              </Pressable>
              {editAvatarUri ? (
                <Pressable
                  style={({ pressed }) => [mgStyles.photoBtn, { borderColor: "#E50914" }, pressed && { opacity: 0.75 }]}
                  onPress={handleRemovePhoto}
                >
                  <Text style={[mgStyles.photoBtnText, { color: "#E50914" }]}>✕  Remove Photo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Name edit */}
          <Text style={mgStyles.sectionLabel}>Profile Name</Text>
          <TextInput
            style={mgStyles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Enter name…"
            placeholderTextColor="#555"
            maxLength={24}
            autoCapitalize="words"
            returnKeyType="done"
            selectionColor={editColor}
          />

          {/* Color picker (only relevant when no photo) */}
          {!editAvatarUri && (
            <>
              <Text style={mgStyles.sectionLabel}>Avatar Color</Text>
              <View style={mgStyles.colorRow}>
                {AVATAR_COLORS.map((c) => {
                  const isActive = editColor === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => setEditColor(c.value)}
                      style={[mgStyles.colorDot, { backgroundColor: c.value }, isActive && mgStyles.colorDotActive]}
                    >
                      {isActive && <View style={mgStyles.colorDotCheck} />}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={mgStyles.divider} />

          {/* Action buttons */}
          <View style={mgStyles.actionRow}>
            <Pressable
              style={({ pressed }) => [mgStyles.cancelBtn, pressed && { opacity: 0.7 }]}
              onPress={onClose}
            >
              <Text style={mgStyles.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [mgStyles.saveBtn, { backgroundColor: editColor }, pressed && { opacity: 0.85 }]}
              onPress={handleSave}
            >
              <Text style={mgStyles.saveTxt}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Profile Modal ────────────────────────────────────────────────────────
function AddProfileModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { addProfile, updateProfileAvatar } = useProfile();
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0].value);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setName("");
    setColor(AVATAR_COLORS[0].value);
    setAvatarUri(null);
    setSaving(false);
    onClose();
  };

  const handlePickPhoto = async () => {
    const uri = await pickImage();
    if (uri) setAvatarUri(uri);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await addProfile(name.trim(), color);
    const newId = `profile_${Date.now()}`;
    if (avatarUri) {
      await updateProfileAvatar(newId, avatarUri).catch(() => {});
    }
    resetAndClose();
  };

  const preview = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={resetAndClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={addStyles.backdrop} onPress={resetAndClose} />
        <View style={addStyles.sheet}>
          <View style={addStyles.handle} />

          {/* Header */}
          <View style={addStyles.header}>
            <Text style={addStyles.title}>New Profile</Text>
            <Pressable onPress={resetAndClose} hitSlop={12} style={addStyles.closeBtn}>
              <Text style={addStyles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* Live preview */}
          <View style={addStyles.previewRow}>
            <ProfileAvatar color={color} initial={preview} avatarUri={avatarUri} size={64} borderRadius={12} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[addStyles.previewName, { color }]}>{name.trim() || "Profile Name"}</Text>
              <Pressable onPress={handlePickPhoto} style={({ pressed }) => [addStyles.photoPickBtn, pressed && { opacity: 0.75 }]}>
                <Text style={addStyles.photoPickText}>{avatarUri ? "📷  Change Photo" : "📷  Add Photo"}</Text>
              </Pressable>
              {avatarUri ? (
                <Pressable onPress={() => setAvatarUri(null)} style={({ pressed }) => [addStyles.photoPickBtn, { borderColor: "#E50914" }, pressed && { opacity: 0.75 }]}>
                  <Text style={[addStyles.photoPickText, { color: "#E50914" }]}>✕  Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={addStyles.divider} />

          {/* Name input */}
          <Text style={addStyles.label}>PROFILE NAME</Text>
          <TextInput
            style={addStyles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name…"
            placeholderTextColor="#444"
            maxLength={20}
            autoCapitalize="words"
            returnKeyType="done"
            autoFocus
            selectionColor={color}
          />

          {/* Color picker (only when no photo) */}
          {!avatarUri && (
            <>
              <Text style={addStyles.label}>AVATAR COLOR</Text>
              <View style={addStyles.colorRow}>
                {AVATAR_COLORS.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => setColor(c.value)}
                    style={[addStyles.colorDot, { backgroundColor: c.value }, color === c.value && addStyles.colorDotActive]}
                  >
                    {color === c.value && <View style={addStyles.colorCheck} />}
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={addStyles.divider} />

          {/* Actions */}
          <View style={addStyles.actionRow}>
            <Pressable
              style={({ pressed }) => [addStyles.cancelBtn, pressed && { opacity: 0.7 }]}
              onPress={resetAndClose}
            >
              <Text style={addStyles.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                addStyles.createBtn,
                { backgroundColor: name.trim() ? color : "#2a2a2a" },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleCreate}
              disabled={!name.trim() || saving}
            >
              <Text style={addStyles.createTxt}>{saving ? "Creating…" : "Create Profile"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { isOffline } = useNetworkStatus();
  const isBootMode = mode !== "profiles";
  const insets = useSafeAreaInsets();

  const { selectProfile, getDisplayName, getDisplayColor, getDisplayAvatar, extraProfiles, removeProfile } = useProfile();
  // Boot mode starts on splash; Switch Profile starts directly on profiles grid
  const [phase, setPhase] = useState<Phase>(isBootMode ? "splash" : "profiles");
  const [busy, setBusy] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [backdropUrls, setBackdropUrls] = useState<string[]>([]);
  const [bgIndex, setBgIndex]           = useState(0);
  const bgOpacity                        = useRef(new Animated.Value(1)).current;

  // Splash layer animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.78)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;

  // Profile screen animations
  const profOpacity = useRef(new Animated.Value(isBootMode ? 0 : 1)).current;
  const profY = useRef(new Animated.Value(isBootMode ? 40 : 0)).current;
  const titleOpacity = useRef(new Animated.Value(isBootMode ? 0 : 1)).current;

  // Per-card scale/opacity for the static PROFILES only
  const cardScales = useRef(PROFILES.map(() => new Animated.Value(1))).current;
  const cardOpacities = useRef(PROFILES.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (!isBootMode) {
      // Switch Profile mode: profiles grid is already visible — nothing to animate
      return;
    }

    // Boot mode: cinematic splash → tabs. Keep navigation independent from
    // animation callbacks because web/native animation drivers can stall a
    // completion callback and leave the app on a dim splash forever.
    const navigationTimer = setTimeout(() => {
      router.replace("/(tabs)");
    }, 1600);

    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(tagOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(splashOpacity, { toValue: 0, duration: 550, useNativeDriver: true }).start(() => {
            // Navigation is handled by the bounded timer above.
          });
        }, 1400);
      });
    });
    return () => clearTimeout(navigationTimer);
  }, []);

  // Fetch Korean Kdrama + India Trending backdrops when profile screen becomes visible
  useEffect(() => {
    if (phase !== "profiles") return;
    (async () => {
      try {
        const [kdrama, india] = await Promise.allSettled([
          tmdb.koreanDramas(1),
          tmdb.trendingMoviesIN(1),
        ]);
        const urls: string[] = [];
        if (kdrama.status === "fulfilled") {
          (kdrama.value.results ?? [])
            .filter((m: any) => m.backdrop_path)
            .slice(0, 10)
            .forEach((m: any) => { const u = tmdbImg(m.backdrop_path, "w780"); if (u) urls.push(u); });
        }
        if (india.status === "fulfilled") {
          (india.value.results ?? [])
            .filter((m: any) => m.backdrop_path)
            .slice(0, 10)
            .forEach((m: any) => { const u = tmdbImg(m.backdrop_path, "w780"); if (u) urls.push(u); });
        }
        // Shuffle the combined list
        for (let i = urls.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [urls[i], urls[j]] = [urls[j], urls[i]];
        }
        if (urls.length > 0) setBackdropUrls(urls);
      } catch {}
    })();
  }, [phase]);

  // Auto-cycle backdrop every 3 seconds with smooth fade
  useEffect(() => {
    if (backdropUrls.length < 2) return;
    const interval = setInterval(() => {
      Animated.timing(bgOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setBgIndex((prev) => (prev + 1) % backdropUrls.length);
        Animated.timing(bgOpacity, { toValue: 1, duration: 700, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [backdropUrls]);

  // Tap handler for built-in PROFILES (animated)
  const handleProfileTap = (profileId: string, index: number) => {
    if (busy) return;
    setBusy(true);
    setPhase("selecting");

    cardOpacities.forEach((anim, i) => {
      if (i !== index) {
        Animated.timing(anim, { toValue: 0.25, duration: 220, useNativeDriver: true }).start();
      }
    });

    Animated.sequence([
      Animated.spring(cardScales[index], { toValue: 1.22, damping: 7, stiffness: 200, useNativeDriver: true }),
      Animated.timing(cardScales[index], { toValue: 1.0, duration: 120, useNativeDriver: true }),
    ]).start(async () => {
      await selectProfile(profileId);
      router.replace("/(tabs)");
    });
  };

  // Tap handler for dynamically added profiles (no complex animation)
  const handleExtraProfileTap = async (profileId: string) => {
    if (busy) return;
    setBusy(true);
    cardOpacities.forEach((anim) =>
      Animated.timing(anim, { toValue: 0.25, duration: 220, useNativeDriver: true }).start()
    );
    await selectProfile(profileId);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Cinematic Splash ─────────────────────────────────────────────────── */}
      {phase === "splash" && (
        <Animated.View style={[styles.splash, { opacity: splashOpacity }]}>
          <Animated.View
            style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: "center" }}
          >
            <Image
              source={require("../assets/images/s-logo.png")}
              style={styles.splashLogo}
              resizeMode="contain"
            />
            <View style={styles.wordmarkRow}>
              <View style={styles.wordmarkAccent} />
              <Text style={styles.wordmark}>S-MOVIE</Text>
              <View style={styles.wordmarkAccent} />
            </View>
          </Animated.View>
          <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
            ORIGINAL
          </Animated.Text>
          {isOffline && (
            <Text style={styles.offlineSplashText}>
              Offline mode · Saved content is ready
            </Text>
          )}
        </Animated.View>
      )}

      {/* ── Profile Picker ───────────────────────────────────────────────────── */}
      {phase !== "splash" && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: profOpacity }]}>
          {/* Solid black base — prevents any previous screen bleeding through */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000000" }]} />
          {/* Full-screen backdrop — auto-cycles every 3s */}
          {backdropUrls.length > 0 ? (
            Platform.OS === "web" ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: bgOpacity },
                  {
                    backgroundImage: `url("${backdropUrls[bgIndex]}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center center",
                  } as any,
                ]}
              />
            ) : (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: bgOpacity }]}>
                <Image
                  source={{ uri: backdropUrls[bgIndex] }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              </Animated.View>
            )
          ) : null}

          {/* ── Curved Stage Overlay ──────────────────────────────────────────────
               Technique: container wider than screen (×1.5) + huge top-corner
               radius creates the theater/stage curved arch effect.
               overflow:hidden clips the gradient to the curved shape.        */}
          <Animated.View style={[pf.stageShell, { transform: [{ translateY: profY }] }]}>
            <LinearGradient
              colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.72)", "rgba(0,0,0,0.92)", "#000000"]}
              locations={[0, 0.28, 0.56, 0.82]}
              style={pf.stageGradient}
            >
              <View style={[pf.stageContent, { paddingTop: Math.max(insets.top + 48, 72), paddingBottom: Math.max(insets.bottom + 24, 40) }]}>

                {/* "Who's Watching?" title */}
                <Animated.Text style={[pf.chooseTitle, { opacity: titleOpacity }]}>
                  Who's Watching?
                </Animated.Text>

                {/* All profiles grid */}
                <ScrollView
                  contentContainerStyle={pf.grid}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={[...PROFILES, ...extraProfiles].length > 4}
                  style={{ flexGrow: 0, width: "100%" }}
                >
                  {/* Built-in profiles */}
                  {PROFILES.map((profile, i) => {
                    const displayName   = getDisplayName(profile.id);
                    const displayColor  = getDisplayColor(profile.id);
                    const displayAvatar = getDisplayAvatar(profile.id);
                    const effectiveAvatar = displayAvatar ?? BUILT_IN_AVATARS[profile.id];
                    return (
                      <Pressable
                        key={profile.id}
                        onPress={() => !isEditMode && !busy && handleProfileTap(profile.id, i)}
                        style={pf.cardTouchable}
                      >
                        <Animated.View style={{ transform: [{ scale: cardScales[i] }], opacity: cardOpacities[i], alignItems: "center" }}>
                          <View style={[pf.avatarWrap, {
                            borderColor: effectiveAvatar ? "rgba(255,255,255,0.18)" : displayColor + "99",
                          }]}>
                            <ProfileAvatar
                              color={displayColor}
                              initial={profile.initial}
                              avatarUri={effectiveAvatar}
                              size={110}
                              borderRadius={15}
                            />
                            {profile.isKids && (
                              <View style={pf.kidsOverlay}>
                                <Text style={pf.kidsOverlayText}>kids</Text>
                              </View>
                            )}
                          </View>
                          <Text style={pf.cardName} numberOfLines={1}>{displayName}</Text>
                        </Animated.View>
                      </Pressable>
                    );
                  })}

                  {/* Extra profiles */}
                  {extraProfiles.map((profile) => {
                    const displayName   = getDisplayName(profile.id);
                    const displayColor  = getDisplayColor(profile.id);
                    const displayAvatar = getDisplayAvatar(profile.id);
                    return (
                      <View key={profile.id} style={{ position: "relative" }}>
                        <Pressable
                          onPress={() => !isEditMode && !busy && handleExtraProfileTap(profile.id)}
                          style={({ pressed }) => [pf.cardTouchable, pressed && { opacity: 0.75 }]}
                        >
                          <View style={{ alignItems: "center" }}>
                            <View style={[pf.avatarWrap, { borderColor: displayAvatar ? "rgba(255,255,255,0.18)" : displayColor + "99" }]}>
                              <ProfileAvatar
                                color={displayColor}
                                initial={profile.initial}
                                avatarUri={displayAvatar}
                                size={110}
                                borderRadius={15}
                              />
                            </View>
                            <Text style={pf.cardName} numberOfLines={1}>{displayName}</Text>
                          </View>
                        </Pressable>
                        {isEditMode && (
                          <Pressable
                            onPress={() => removeProfile(profile.id)}
                            hitSlop={6}
                            style={pf.deleteBadge}
                          >
                            <Text style={pf.deleteBadgeTxt}>×</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Square action buttons — Add & Edit */}
                <View style={pf.squareBtnRow}>
                  <Pressable
                    style={({ pressed }) => [pf.squareBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => setShowAddProfile(true)}
                    disabled={busy}
                  >
                    <Text style={pf.squareBtnIcon}>+</Text>
                    <Text style={pf.squareBtnLabel}>Add</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [pf.squareBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => { setIsEditMode(false); setShowManage(true); }}
                    disabled={busy}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={26} color="#fff" />
                    <Text style={pf.squareBtnLabel}>Edit</Text>
                  </Pressable>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      )}

      {/* ── Manage Profiles Modal ────────────────────────────────────────────── */}
      <ManageProfilesModal
        visible={showManage}
        onClose={() => setShowManage(false)}
      />

      {/* ── Add Profile Modal ─────────────────────────────────────────────────── */}
      <AddProfileModal
        visible={showAddProfile}
        onClose={() => setShowAddProfile(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Splash
  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 8,
  },
  splashLogo: {
    width: 130,
    height: 130,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  wordmarkAccent: {
    width: 28,
    height: 1.5,
    backgroundColor: "#E50914",
    borderRadius: 1,
  },
  wordmark: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 8,
  },
  tagline: {
    color: "#E50914",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 5,
    marginTop: 4,
  },
  offlineSplashText: {
    color: "#FBBF24",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginTop: 12,
  },

  // ── Profiles screen
  profilesWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },

  // ── Header row (logo + edit toggle)
  headerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    position: "relative",
  },
  smallLogo: {
    width: 44,
    height: 44,
    opacity: 0.7,
  },
  editToggle: {
    position: "absolute",
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editToggleText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  editToggleDone: {
    color: "#E50914",
  },

  whoTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 28,
    textAlign: "center",
  },

  // ── Profile cards grid
  gridScroll: {
    width: "100%",
    flexGrow: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 14,
    paddingBottom: 28,
    width: "100%",
  },

  // Card wrapper for positioning delete badge
  cardWrapper: {
    position: "relative",
  },
  deleteBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  deleteBadgeTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
  },

  card: {
    width: CARD_W,
    backgroundColor: "#111",
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 10,
    gap: 10,
  },
  cardName: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  kidsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  kidsBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  // ── Add Profile card
  addCard: {
    width: CARD_W,
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderStyle: "dashed",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 10,
    gap: 10,
  },
  addIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#141414",
  },
  addPlus: {
    color: "#555",
    fontSize: 26,
    fontWeight: "200",
    lineHeight: 30,
  },
  addLabel: {
    color: "#555",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // ── Manage button
  manageBtn: {
    borderWidth: 1,
    borderColor: "#555",
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 36,
  },
  manageText: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});

// ── Netflix-style profile picker styles ────────────────────────────────────────
const pf = StyleSheet.create({
  contentShell: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",           // pin to bottom, Netflix-style
  },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
  },
  stageShell: {
    ...StyleSheet.absoluteFill,
  },
  stageGradient: {
    flex: 1,
    justifyContent: "center",
  },
  stageContent: {
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
  },
  chooseTitle: {
    color: "#ffffff",
    fontSize: 26,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
    marginBottom: 36,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 24,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  cardTouchable: {
    alignItems: "center",
    width: 118,
  },
  avatarWrap: {
    width: 112,
    height: 112,
    borderRadius: 20,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 14,
    elevation: 12,
  },
  kidsOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 3,
    alignItems: "center",
  },
  kidsOverlayText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  cardName: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  kidsBadge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: "#E50914",
  },
  kidsBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.8,
  },
  deleteBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  deleteBadgeTxt: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
    textAlign: "center",
  },
  // ── Action buttons row ─────────────────────────────────────────────────────
  squareBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 32,
  },
  squareBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  squareBtnIcon: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "300",
    lineHeight: 24,
  },
  squareBtnLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});

// ── Manage Profiles Modal styles ───────────────────────────────────────────────
const mgStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "600",
  },

  // Profile selector row
  profileRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  profileChip: {
    width: 90,
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#2a2a2a",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 8,
  },
  deleteBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: "#111",
  },
  deleteBadgeTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: -1,
  },
  chipName: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  kidsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  kidsBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  divider: {
    height: 1,
    backgroundColor: "#222",
    marginVertical: 16,
  },

  sectionLabel: {
    color: "#888",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  nameInput: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },

  colorRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "#fff",
  },
  colorDotCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  previewName: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  photoPreviewWrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
  photoBtn: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  photoBtnText: {
    color: "#ccc",
    fontSize: 13,
    fontWeight: "600",
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelTxt: {
    color: "#aaa",
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

// ── Add Profile Modal styles ───────────────────────────────────────────────────
const addStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    color: "#888",
    fontSize: 14,
    fontWeight: "700",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  previewName: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  photoPickBtn: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  photoPickText: {
    color: "#bbb",
    fontSize: 12,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#1e1e1e",
    marginVertical: 12,
  },
  label: {
    color: "#555",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  nameInput: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  colorRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  colorDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "#fff",
  },
  colorCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelTxt: {
    color: "#aaa",
    fontSize: 15,
    fontWeight: "600",
  },
  createBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  createTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
