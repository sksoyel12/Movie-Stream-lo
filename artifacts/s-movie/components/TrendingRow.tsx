/**
 * TrendingRow — "Trending Now" premium horizontal row.
 *
 * Data source: our own API engine at /api/stream/recent (server-side TMDB
 * proxy), so the client never contacts the external TMDB API directly.
 * Falls back to a graceful empty/error state — never leaves a blank space.
 */
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DynamicPoster from "@/components/DynamicPoster";
import { haptic } from "@/lib/haptics";
import { Skeleton } from "@/components/Skeleton";
import { saveHomeCache, loadHomeCache } from "@/lib/homeCache";
import { API_BASE } from "@/lib/apiBase";

// Card dimensions — portrait 2:3 ratio
const CARD_W = 120;
const CARD_H = 180;
const CARD_GAP = 10;

// ─── API base ─────────────────────────────────────────────────────────────────
// Mirrors the same logic used by lib/apiClient.ts and lib/tmdb.ts.
const RECENT_URL = API_BASE ? `${API_BASE}/stream/recent` : null;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrendingItem {
  id: string;
  tmdbId: number;
  title: string;
  mediaType: "movie" | "tv";
  year: number;
  overview: string;
  poster: string | null;       // wsrv.nl-proxied URI, or null
  backdrop: string | null;
  rating: number;
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────
function TrendingCardSkeleton() {
  return (
    <View style={[s.card, { backgroundColor: "#111", marginRight: CARD_GAP }]}>
      <Skeleton style={{ ...StyleSheet.absoluteFill, borderRadius: 12 }} />
    </View>
  );
}

// ─── Single card ──────────────────────────────────────────────────────────────
function TrendingCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn  = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 120 }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1.00, useNativeDriver: true, tension: 120 }).start();

  const handlePress = () => {
    haptic.light();
    router.push({
      pathname: "/movie/[id]",
      params: {
        id: item.id,
        type: item.mediaType,
        poster_path: item.poster ?? "",
        title_param: item.title,
      },
    });
  };

  // Use poster first, then backdrop as fallback
  const imgSrc = item.poster
    ? { uri: item.poster }
    : item.backdrop
    ? { uri: item.backdrop }
    : null;

  const hasPoster = !!imgSrc;

  return (
    <Animated.View style={[s.card, { transform: [{ scale }], marginRight: CARD_GAP }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={StyleSheet.absoluteFill}
      >
        {/* Poster / backdrop image */}
        {hasPoster && (
          <DynamicPoster
            tmdbId={item.tmdbId}
            mediaType={item.mediaType}
            fallback={imgSrc}
            title={item.title}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="disk"
          />
        )}

        {/* Dark background when no image so the title is still readable */}
        {!hasPoster && (
          <View style={[StyleSheet.absoluteFill, s.noPosterBg]} />
        )}

        {/* Rank badge — top-left */}
        <View style={s.rankBadge}>
          <Text style={s.rankText}>#{rank}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const ROW_REFRESH_MS = 3 * 60 * 60 * 1000; // 3 hours

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrendingRow() {
  const [items, setItems]   = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRecent = useCallback(async () => {
    if (!RECENT_URL) {
      if (mountedRef.current) {
        setError("API URL not configured");
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(RECENT_URL, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { items: TrendingItem[]; error?: string };

      if (mountedRef.current) {
        const freshItems = json.items ?? [];
        setItems(freshItems);
        setError(json.error ?? null);
        setLoading(false);
        if (freshItems.length > 0) {
          saveHomeCache("__trending__", freshItems).catch(() => {});
        }
      }
    } catch (e: any) {
      console.warn("[TrendingRow] fetch failed:", e?.message);
      if (mountedRef.current) {
        setError("Could not load trending");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Offline-first: show cache immediately, then load fresh
    loadHomeCache<TrendingItem[]>("__trending__").then((cached) => {
      if (cached && cached.length > 0 && mountedRef.current) {
        setItems(cached);
        setLoading(false);
      }
    });
    fetchRecent();
    intervalRef.current = setInterval(fetchRecent, ROW_REFRESH_MS);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRecent]);

  return (
    <View style={s.container}>
      {/* Section header */}
      <View style={s.header}>
        <Text style={s.sectionTitle}>Trending Now</Text>
        <Text style={s.sectionSub}>This Week</Text>
      </View>

      {loading ? (
        <View style={s.skeletonRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <TrendingCardSkeleton key={i} />
          ))}
        </View>
      ) : error && items.length === 0 ? (
        /* Retry row — tapping retries the fetch */
        <Pressable style={s.errorWrap} onPress={() => { setLoading(true); fetchRecent(); }}>
          <Text style={s.errorText}>⚡ Tap to reload</Text>
        </Pressable>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ minHeight: CARD_H }}
          contentContainerStyle={s.listContent}
          decelerationRate="fast"
          snapToInterval={CARD_W + CARD_GAP}
          snapToAlignment="start"
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          renderItem={({ item, index }) => (
            <TrendingCard item={item} rank={index + 1} />
          )}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    marginBottom: 6,
    minHeight: CARD_H + 60,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  sectionSub: {
    color: "#525252",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 2,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#141414",
  },
  noPosterBg: {
    backgroundColor: "#1c1c2e",
  },

  // Rank badge — top-left corner
  rankBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(229,9,20,0.85)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rankText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },

  // Title always visible at the bottom of the card
  titleWrap: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
  },
  titleText: {
    color: "#ffffff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 15,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  yearText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  // Error / retry strip
  errorWrap: {
    marginHorizontal: 16,
    height: CARD_H,
    borderRadius: 10,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderStyle: "dashed",
  },
  errorText: {
    color: "#525252",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
