import { Feather, Ionicons } from "@expo/vector-icons";
import SmartImage from "@/components/SmartImage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { markAllViewed } from "@/lib/notificationPrefs";
import { tmdb, tmdbToCard, type TMDBMovie } from "@/lib/tmdb";
import { useNetworkStatus } from "@/contexts/NetworkContext";

// ─── Local storage key ────────────────────────────────────────────────────────
const NOTIF_CACHE_KEY = "smovie_notif_rows_v3";
const NOTIF_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// ─── Notification type tags ───────────────────────────────────────────────────
const TYPE_TAGS = [
  "New arrival",
  "Trending now",
  "Upcoming this week",
  "New season",
  "Top pick for you",
  "Netflix Lookahead",
  "Suggestions for tonight",
];

// ─── Blacklist ────────────────────────────────────────────────────────────────
function isBlacklisted(m: any): boolean {
  return m?.id === 155 || m?.tmdbId === 155 || m?.title === "The Dark Knight";
}

// ─── Image proxy ──────────────────────────────────────────────────────────────
function wrapProxy(directUrl: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(directUrl)}&output=webp&q=80`;
}
function backdropUri(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return wrapProxy(`https://image.tmdb.org/t/p/w342${path}`);
  if (path.includes("image.tmdb.org")) return wrapProxy(path);
  if (path.includes("wsrv.nl") || path.includes("weserv.nl")) return path;
  return path;
}

// ─── Date formatting ─────────────────────────────────────────────────────────
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "Recently added";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Recently added";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 1) return "Tomorrow";
    if (absDays < 7) return `In ${absDays} days`;
    return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

// ─── Notification row data shape ──────────────────────────────────────────────
interface NotifRow {
  id: string;
  typeTag: string;
  title: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  dateLabel: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
}

// ─── Build notification rows from TMDB cards ──────────────────────────────────
function toNotifRows(
  results: TMDBMovie[],
  tagOffset = 0,
): NotifRow[] {
  return results
    .filter((m) => !isBlacklisted(m))
    .map((m, i) => {
      const card = tmdbToCard(m);
      const bp = m.backdrop_path ?? null;
      const dateIso = m.release_date ?? (m as any).first_air_date ?? null;
      return {
        id: card.id,
        typeTag: TYPE_TAGS[(i + tagOffset) % TYPE_TAGS.length],
        title: card.title,
        overview: m.overview ?? "",
        posterUrl: m.poster_path ? wrapProxy(`https://image.tmdb.org/t/p/w342${m.poster_path}`) : null,
        backdropUrl: backdropUri(bp),
        dateLabel: formatRelativeDate(dateIso),
        tmdbId: m.id,
        mediaType: card.mediaType,
      };
    });
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <View style={styles.row}>
      <View style={[styles.thumbWrap, { backgroundColor: "#1a1a1a" }]} />
      <View style={[styles.textPanel, { gap: 8 }]}>
        <View style={{ width: "60%", height: 14, backgroundColor: "#1a1a1a", borderRadius: 4 }} />
        <View style={{ width: "90%", height: 12, backgroundColor: "#161616", borderRadius: 4 }} />
        <View style={{ width: "30%", height: 11, backgroundColor: "#141414", borderRadius: 4 }} />
      </View>
    </View>
  );
}

// ─── Single row item ─────────────────────────────────────────────────────────
function NotifRow({ item, index }: { item: NotifRow; index: number }) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push({
          pathname: "/movie/[id]",
          params: {
            id: item.id,
            type: item.mediaType,
            poster_path: item.backdropUrl ?? "",
            title_param: item.title ?? "",
          },
        });
      }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}
    >
      {/* LEFT — premium portrait poster */}
      <View style={styles.thumbWrap}>
        {item.posterUrl ? (
          <SmartImage
            source={{ uri: item.posterUrl }}
            style={styles.thumb}
            contentFit="cover"
            transition={300}
            cachePolicy="disk"
            title={item.title}
            recyclingKey={`notif-${item.id}`}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="film-outline" size={20} color="#333" />
          </View>
        )}
      </View>

      {/* RIGHT — text panel */}
      <View style={styles.textPanel}>
        {/* Type tag with red dot accent */}
        <View style={styles.tagRow}>
          <View style={styles.redDot} />
          <Text style={styles.typeTag} numberOfLines={1}>
            {item.typeTag}
          </Text>
        </View>
        {/* Title */}
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {/* Overview snippet */}
        {item.overview ? (
          <Text style={styles.subDesc} numberOfLines={2}>
            {item.overview}
          </Text>
        ) : null}
        {/* Date stamp */}
        <Text style={styles.dateStamp}>{item.dateLabel}</Text>
      </View>

      {/* Bell icon */}
      <Ionicons name="notifications-outline" size={18} color="#525252" style={styles.bellIcon} />
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const [rows, setRows]               = useState<NotifRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      markAllViewed();
    }, []),
  );

  // Load cache first so the screen is never empty on mount
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
         const { rows: cached } = JSON.parse(raw);
        if (cached?.length) {
          setRows(cached);
          // Even an expired cache is useful offline. The request below
          // revalidates it when a connection is available.
          setLoading(false);
        }
      } catch {}
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    if (isOffline) {
      setError("You're offline. Showing saved notifications.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      // Fetch all 4 TMDB sources in parallel
      const [trendingDay, trendingWeek, upcomingRes, popularTVRes] = await Promise.all([
        tmdb.trendingToday(1),
        tmdb.trending(1),
        tmdb.upcoming(1),
        tmdb.popularTV(1),
      ]);

      // Build rows from each source with different tag offsets for visual variety
      const trendingDayRows  = toNotifRows(trendingDay.results,   0); // "New arrival"
      const upcomingRows     = toNotifRows(upcomingRes.results,    2); // "Upcoming this week"
      const trendingWeekRows = toNotifRows(trendingWeek.results,   1); // "Trending now"
      const popularTVRows    = toNotifRows(popularTVRes.results,   3); // "New season"

      // Interleave all sources for variety, deduplicate by id
      const seen = new Set<string>();
      const merged: NotifRow[] = [];
      const maxLen = Math.max(
        trendingDayRows.length,
        upcomingRows.length,
        trendingWeekRows.length,
        popularTVRows.length,
      );

      for (let i = 0; i < maxLen; i++) {
        for (const list of [trendingDayRows, upcomingRows, trendingWeekRows, popularTVRows]) {
          const item = list[i];
          if (item && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }

      const final = merged.slice(0, 50);
      setRows(final);

      // Persist to cache
      await AsyncStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify({
        rows: final,
        savedAt: Date.now(),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[Notifications] fetchData error:", msg);
      setError("Couldn't load notifications. Check your connection.");

      // Fall back to whatever is in cache
      try {
        const raw = await AsyncStorage.getItem(NOTIF_CACHE_KEY);
        if (raw) {
          const { rows: cached } = JSON.parse(raw);
          if (cached?.length) setRows(cached);
        }
      } catch {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 12) : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { haptic.light(); router.back(); }}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Error banner (shown even when cached rows are visible) ── */}
      {error && rows.length > 0 && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#E50914" />
          <Text style={styles.errorBannerText}>Showing cached content · {error}</Text>
        </View>
      )}

      {loading && rows.length === 0 ? (
        // ── Skeleton while loading with no cache ──
        <FlatList
          data={[1, 2, 3, 4, 5, 6, 7, 8]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <SkeletonRow />}
          style={styles.list}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <NotifRow item={item} index={index} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E50914"
              colors={["#E50914"]}
            />
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              {error ? (
                <>
                  <Ionicons name="cloud-offline-outline" size={44} color="#E50914" />
                  <Text style={styles.emptyTitle}>Couldn't load notifications</Text>
                  <Text style={styles.emptyBody}>{error}</Text>
                  <Pressable
                    onPress={() => { setLoading(true); fetchData(); }}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryBtnText}>Try Again</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Ionicons name="notifications-off-outline" size={44} color="#333" />
                  <Text style={styles.emptyTitle}>No notifications yet</Text>
                  <Text style={styles.emptyBody}>Pull down to refresh</Text>
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    fontWeight: "bold",
    letterSpacing: -0.3,
  },

  // Error banner (shown above list when stale cache is used)
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0d0d0d",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  errorBannerText: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },

  // List
  list:        { flex: 1, backgroundColor: "#000" },
  listContent: { paddingTop: 4 },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#000",
  },

  // Premium poster — portrait artwork instead of a cropped landscape backdrop.
  thumbWrap: {
    width: 84,
    height: 122,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#111",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#252525",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  thumb: {
    width: 84,
    height: 122,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },

  // Text panel
  textPanel: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "flex-start",
    gap: 2,
  },

  // Tag row with red accent dot
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 1,
  },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E50914",
    flexShrink: 0,
  },
  typeTag: {
    color: "#E50914",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  itemTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  subDesc: {
    color: "#A3A3A3",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: 1,
  },
  dateStamp: {
    color: "#525252",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },

  // Bell icon
  bellIcon: { marginLeft: 10, flexShrink: 0, marginTop: 4 },

  // Separator
  separator: {
    height: 1,
    backgroundColor: "#111",
    marginHorizontal: 16,
  },

  // Empty / Error state
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 14,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptyBody: {
    color: "#737373",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#E50914",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
