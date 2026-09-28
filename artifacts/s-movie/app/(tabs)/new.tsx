import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SmartImage from "@/components/SmartImage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { tmdb, tmdbImg, type TMDBMovie } from "@/lib/tmdb";
import { useNetworkStatus } from "@/contexts/NetworkContext";

const NEW_HOT_CACHE_KEY = "smovie_new_hot_v5";
const REMIND_KEY_PREFIX = "smovie_remind_v2_";
const { width: SCREEN_W } = Dimensions.get("window");
const BACKDROP_HEIGHT = Math.round((SCREEN_W - 28) * 9 / 16);
const TODAY = new Date().toISOString().slice(0, 10);

type Filter = "comingSoon" | "everyonesWatching";

type FeedItem = {
  id: string;
  tmdbId: number;
  title: string;
  overview: string;
  backdropUri: string;
  releaseDate: string;
  mediaType: "movie" | "tv";
  rating: string;
};

function isBlacklisted(item: TMDBMovie): boolean {
  return item.id === 155 || item.title === "The Dark Knight";
}

function getFriendlyDate(date?: string): string {
  if (!date) return "Coming soon";
  const parsed = new Date(date);
  const today = new Date();
  parsed.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "Available now";
  if (days === 1) return "Coming tomorrow";
  if (days < 7) return `Coming in ${days} days`;
  return `Coming ${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function toFeedItem(item: TMDBMovie): FeedItem | null {
  const backdropUri = tmdbImg(item.backdrop_path, "w780");
  if (!backdropUri) return null;
  const releaseDate = item.first_air_date ?? item.release_date ?? "";
  const mediaType: "movie" | "tv" =
    item.media_type === "movie" || item.title ? "movie" : "tv";
  return {
    id: `tmdb-${item.id}`,
    tmdbId: item.id,
    title: item.title ?? item.name ?? "Untitled",
    overview: item.overview?.trim() || "More details coming soon.",
    backdropUri,
    releaseDate,
    mediaType,
    rating: "U/A 16+",
  };
}

function uniqueFeed(items: TMDBMovie[], requireFutureDate = false): FeedItem[] {
  const seen = new Set<number>();
  return items
    .filter((item) => {
      if (isBlacklisted(item) || seen.has(item.id) || !item.backdrop_path) return false;
      const date = item.first_air_date ?? item.release_date ?? "";
      if (requireFutureDate && date < TODAY) return false;
      seen.add(item.id);
      return true;
    })
    .map(toFeedItem)
    .filter((item): item is FeedItem => item !== null)
    .slice(0, 24);
}

function ChipHeader({
  activeFilter,
  onChange,
  topInset,
  showCachedNotice,
}: {
  activeFilter: Filter;
  onChange: (filter: Filter) => void;
  topInset: number;
  showCachedNotice: boolean;
}) {
  return (
    <View style={[styles.stickyHeader, { paddingTop: topInset + 12 }]}>
      <Text style={styles.pageTitle}>New &amp; Hot</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: activeFilter === "comingSoon" }}
          onPress={() => {
            haptic.selection();
            onChange("comingSoon");
          }}
          style={[styles.filterChip, activeFilter === "comingSoon" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, activeFilter === "comingSoon" && styles.filterChipTextActive]}>
            🍿 Coming Soon
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: activeFilter === "everyonesWatching" }}
          onPress={() => {
            haptic.selection();
            onChange("everyonesWatching");
          }}
          style={[styles.filterChip, activeFilter === "everyonesWatching" && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, activeFilter === "everyonesWatching" && styles.filterChipTextActive]}>
            🔥 Everyone&apos;s Watching
          </Text>
        </Pressable>
      </ScrollView>
      {showCachedNotice && (
        <View style={styles.cacheNotice}>
          <Ionicons name="cloud-offline-outline" size={14} color="#FBBF24" />
          <Text style={styles.cacheNoticeText}>Offline · Showing saved titles</Text>
        </View>
      )}
    </View>
  );
}

function LoadingCard() {
  return (
    <View style={styles.card}>
      <View style={[styles.skeleton, styles.skeletonImage]} />
      <View style={[styles.skeleton, styles.skeletonTitle]} />
      <View style={[styles.skeleton, styles.skeletonLine]} />
      <View style={[styles.skeleton, styles.skeletonLineShort]} />
      <View style={[styles.skeleton, styles.skeletonButton]} />
    </View>
  );
}

function FeedCard({
  item,
  reminded,
  onToggleReminder,
}: {
  item: FeedItem;
  reminded: boolean;
  onToggleReminder: (item: FeedItem) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${item.title}`}
        onPress={() => {
          haptic.light();
          router.push({
            pathname: "/movie/[id]",
            params: { id: item.id, type: item.mediaType, title_param: item.title },
          });
        }}
        style={styles.backdropWrap}
      >
        <SmartImage
          source={{ uri: item.backdropUri }}
          style={styles.backdrop}
          contentFit="cover"
          transition={250}
          cachePolicy="disk"
          title={item.title}
          recyclingKey={`new-hot-${item.id}`}
        />
        <View style={styles.ageBadge}>
          <Text style={styles.ageBadgeText}>{item.rating}</Text>
        </View>
      </Pressable>

      <View style={styles.cardContent}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.schedule}>
          {getFriendlyDate(item.releaseDate)} · Netflix
        </Text>
        <Text style={styles.overview} numberOfLines={3}>{item.overview}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: reminded }}
          onPress={() => onToggleReminder(item)}
          style={({ pressed }) => [
            styles.remindButton,
            reminded && styles.remindButtonActive,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons
            name={reminded ? "checkmark" : "notifications-outline"}
            size={19}
            color={reminded ? "#fff" : "#000"}
          />
          <Text style={[styles.remindButtonText, reminded && styles.remindButtonTextActive]}>
            {reminded ? "Reminded" : "Remind Me"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function NewAndHotScreen() {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const topInset = Math.max(insets.top, 12);
  const [activeFilter, setActiveFilter] = useState<Filter>("comingSoon");
  const [comingSoon, setComingSoon] = useState<FeedItem[]>([]);
  const [everyonesWatching, setEveryonesWatching] = useState<FeedItem[]>([]);
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedFeed, setUsingCachedFeed] = useState(false);

  const loadReminders = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      setReminders(
        new Set(
          keys
            .filter((key) => key.startsWith(REMIND_KEY_PREFIX))
            .map((key) => key.slice(REMIND_KEY_PREFIX.length)),
        ),
      );
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    if (isOffline) {
      setLoading(false);
      setRefreshing(false);
      setUsingCachedFeed(true);
      return;
    }
    try {
      const [comingResponse, trendingResponse] = await Promise.all([
        tmdb.netflixComingSoonTV(1),
        tmdb.netflixTrending(1),
      ]);
      const coming = uniqueFeed(comingResponse.results ?? [], true);
      const candidates = uniqueFeed(
        (trendingResponse.results ?? []).filter(
          (item) => item.media_type === "tv" || item.media_type === "movie" || item.name,
        ),
      ).slice(0, 30);
      // netflixTrending already applies the Netflix network/provider filters
      // server-side. Do not re-verify each title here: those detail calls made
      // New & Hot look empty whenever one metadata request timed out.
      const trending = candidates.slice(0, 24);
      setComingSoon(coming);
      setEveryonesWatching(trending);
      setUsingCachedFeed(false);
      await AsyncStorage.setItem(
        NEW_HOT_CACHE_KEY,
        JSON.stringify({ comingSoon: coming, everyonesWatching: trending, savedAt: Date.now() }),
      );
    } catch {
      setError("Couldn’t load content. Pull down to try again.");
      setUsingCachedFeed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadReminders();
    AsyncStorage.getItem(NEW_HOT_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const cached = JSON.parse(raw) as {
          comingSoon?: FeedItem[];
          everyonesWatching?: FeedItem[];
          savedAt?: number;
        };
        // Stale data is still useful when the device is offline. The network
        // request below revalidates it when possible.
        if (cached.comingSoon?.length) setComingSoon(cached.comingSoon);
        if (cached.everyonesWatching?.length) setEveryonesWatching(cached.everyonesWatching);
        if (cached.comingSoon?.length || cached.everyonesWatching?.length) {
          setUsingCachedFeed(true);
          setLoading(false);
        }
      })
      .catch(() => {});
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, loadReminders]);

  const toggleReminder = useCallback((item: FeedItem) => {
    haptic.selection();
    setReminders((previous) => {
      const next = new Set(previous);
      const key = item.id;
      if (next.has(key)) {
        next.delete(key);
        AsyncStorage.removeItem(REMIND_KEY_PREFIX + key).catch(() => {});
      } else {
        next.add(key);
        AsyncStorage.setItem(REMIND_KEY_PREFIX + key, "1").catch(() => {});
      }
      return next;
    });
  }, []);

  const items = useMemo(
    () => activeFilter === "comingSoon" ? comingSoon : everyonesWatching,
    [activeFilter, comingSoon, everyonesWatching],
  );
  const data = loading && items.length === 0 ? [null, null, null] : items;

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
        renderItem={({ item }) =>
          item ? (
            <FeedCard
              item={item}
              reminded={reminders.has(item.id)}
              onToggleReminder={toggleReminder}
            />
          ) : <LoadingCard />
        }
        ListHeaderComponent={
          <ChipHeader
            activeFilter={activeFilter}
            onChange={setActiveFilter}
            topInset={topInset}
            showCachedNotice={(isOffline || usingCachedFeed) && items.length > 0}
          />
        }
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            tintColor="#fff"
            colors={["#fff"]}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={44} color="#555" />
              <Text style={styles.emptyTitle}>{error ? "Couldn’t load content" : "Nothing to show yet"}</Text>
              <Text style={styles.emptyBody}>{error ?? "Pull down to refresh."}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={<View style={{ height: 90 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  stickyHeader: {
    backgroundColor: "#000",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  pageTitle: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  chipsContent: { gap: 8, paddingRight: 16 },
  cacheNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.28)",
  },
  cacheNoticeText: { color: "#D4D4D4", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  filterChipActive: { backgroundColor: "#fff" },
  filterChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  filterChipTextActive: { color: "#111" },
  feedContent: { paddingTop: 10, paddingHorizontal: 14 },
  card: {
    overflow: "hidden",
    backgroundColor: "#151515",
    borderRadius: 12,
    marginBottom: 18,
  },
  backdropWrap: {
    width: "100%",
    height: BACKDROP_HEIGHT,
    backgroundColor: "#222",
    position: "relative",
  },
  backdrop: { width: "100%", height: "100%" },
  ageBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ageBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: { padding: 15 },
  title: {
    color: "#fff",
    fontSize: 21,
    lineHeight: 26,
    fontFamily: "Inter_800ExtraBold",
  },
  schedule: {
    color: "#bdbdbd",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  overview: {
    color: "#d0d0d0",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginTop: 9,
  },
  remindButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f1f1f1",
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 15,
  },
  remindButtonActive: {
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#555",
  },
  remindButtonText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  remindButtonTextActive: { color: "#fff" },
  skeleton: { backgroundColor: "#252525", borderRadius: 7 },
  skeletonImage: { width: "100%", height: BACKDROP_HEIGHT },
  skeletonTitle: { width: "65%", height: 24, margin: 15 },
  skeletonLine: { width: "90%", height: 13, marginHorizontal: 15, marginBottom: 8 },
  skeletonLineShort: { width: "55%", height: 13, marginHorizontal: 15 },
  skeletonButton: { height: 48, margin: 15, marginTop: 16 },
  emptyState: { alignItems: "center", paddingTop: 90, paddingHorizontal: 28 },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 14,
  },
  emptyBody: {
    color: "#777",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});