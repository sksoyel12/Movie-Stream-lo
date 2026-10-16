import { Bell, CloudOff, Download } from "lucide-react-native";
import { router } from "expo-router";
import React from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { useDownloads } from "@/contexts/DownloadContext";
import { useNetworkStatus } from "@/contexts/NetworkContext";

export type Tab = "Shows" | "Movies" | "Anime" | "New & Hot";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  hasUnread?: boolean;
  scrollY?: Animated.Value;
}

const TABS: Tab[] = ["Shows", "Movies", "Anime", "New & Hot"];

const _fallbackScroll = new Animated.Value(0);
const SF_PRO_DISPLAY_FAMILY =
  Platform.OS === "web"
    ? "SFProDisplayMedium, SF Pro Display, SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    : "SFProDisplayMedium";

export default function Header({ activeTab, onTabChange, hasUnread = false, scrollY }: Props) {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const { downloadingCount } = useDownloads();
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 12) : insets.top;

  const activeScroll = scrollY ?? _fallbackScroll;
  const headerBg = activeScroll.interpolate({
    inputRange: [0, 60],
    outputRange: ["rgba(0,0,0,0)", "rgba(15,15,15,0.92)"],
    extrapolate: "clamp",
  });

  return (
    <View style={[styles.wrap, { paddingTop: topPad }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: headerBg, borderWidth: 0, outlineWidth: 0 },
          Platform.OS === "web" && styles.scrollBgWebTransition,
        ]}
        pointerEvents="none"
      />

      {/* Row 1: Logo + Brand + Icons */}
      <View style={styles.brandRow}>
        <View style={styles.brandLeft}>
          <Image
            source={require("@/assets/images/header-logo-new.png")}
            style={styles.logo}
          />
          <View style={styles.brandTextBlock}>
            <Text style={styles.brandMain}>MOVIE</Text>
            <View style={styles.originalBadge}>
              <Text style={styles.brandSub}>ORIGINAL</Text>
            </View>
          </View>
        </View>

        <View style={styles.iconsRow}>
          <Pressable
            onPress={() => { haptic.light(); router.push("/downloads"); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
            hitSlop={10}
            accessibilityLabel="Downloads"
          >
            <Download size={22} color="#e5e5e5" strokeWidth={2.1} />
            {downloadingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{downloadingCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => { haptic.light(); router.push("/notifications"); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
            hitSlop={10}
            accessibilityLabel="Notifications"
          >
            <Bell size={22} color="#e5e5e5" strokeWidth={2.1} />
            {hasUnread && <View style={styles.badge} />}
          </Pressable>

          {isOffline && (
            <View style={styles.offlinePill} accessibilityLabel="Offline. Cached content is available.">
              <CloudOff size={14} color="#FBBF24" strokeWidth={2.2} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>
      </View>

      {/* Row 2: Tab chips */}
      <View style={styles.pillsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
          style={styles.pillsScroll}
        >
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => { haptic.selection(); onTabChange(t); }}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <View style={[styles.pill, activeTab === t && styles.pillActive]}>
                <Text style={[styles.pillText, activeTab === t && styles.pillTextActive]}>
                  {t}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: "transparent",
    paddingBottom: 0,
    borderWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderColor: "transparent",
    shadowColor: "transparent",
    elevation: 0,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  brandLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 0,
    marginRight: 10,
    resizeMode: "contain",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  brandTextBlock: {
    flexDirection: "column",
    gap: 1,
    justifyContent: "center",
  },
  brandMain: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: SF_PRO_DISPLAY_FAMILY,
    fontWeight: "800",
    letterSpacing: 4,
    lineHeight: 20,
    textTransform: "uppercase",
  },
  originalBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E50914",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  brandSub: {
    color: "#FFFFFF",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 2,
    lineHeight: 12,
    textTransform: "uppercase",
  },
  categoryLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    letterSpacing: 1.5,
    marginTop: 3,
    textTransform: "uppercase",
  },
  iconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconBtn: {
    padding: 2,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E50914",
    borderWidth: 1.5,
    borderColor: "#000000",
  },
  badgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    textAlign: "center",
  },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(251,191,36,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.3)",
  },
  offlineText: {
    color: "#FBBF24",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  scrollBgWebTransition: {
    transition: "background-color 0.3s ease",
  } as any,
  pillsWrapper: {
    marginTop: 10,
    paddingBottom: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderColor: "transparent",
  },
  pillsScroll: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 0,
    borderColor: "transparent",
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingRight: 24,
    borderWidth: 0,
    borderBottomWidth: 0,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 0,
  },
  pillActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
  },
  pillText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  pillTextActive: {
    color: "#000000",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
});
