/**
 * Genre Results Screen
 * Full-page infinite-scroll poster grid for a Netflix secret genre.
 */
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import SmartImage from "@/components/SmartImage";
import DynamicPoster from "@/components/DynamicPoster";
import { GENRE_BY_ID, GROUP_BY_ID } from "@/lib/genreData";
import { tmdbToCard, type TMDBMovie } from "@/lib/tmdb";

const { width: SCREEN_W } = Dimensions.get("window");
const COLS = 3;
const GAP = 6;
const CARD_W = (SCREEN_W - 16 * 2 - GAP * (COLS - 1)) / COLS;
const CARD_H = Math.round(CARD_W * 1.5);

interface GridItem {
  id: string;
  tmdbId: number;
  title: string;
  poster: { uri: string } | null;
  year: number;
  rating: number;
  mediaType: "movie" | "tv";
}

function toGridItem(m: TMDBMovie): GridItem {
  const card = tmdbToCard(m);
  return {
    id: card.id,
    tmdbId: card.tmdbId,
    title: card.title,
    poster: card.poster,
    year: card.year,
    rating: card.tmdbRating,
    mediaType: card.mediaType,
  };
}

export default function GenreResultsScreen() {
  const { id: rawId, label: rawLabel } = useLocalSearchParams<{ id: string; label: string }>();
  const genreId = Number(rawId);

  const genre = GENRE_BY_ID.get(genreId);
  const group = GROUP_BY_ID.get(genreId);
  const entry = genre ?? (group ? { ...group, fetcher: group.subGenres[0].fetcher } : null);

  const [items, setItems] = useState<GridItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    if (!entry) return;
    if (!append) setLoading(true);
    else {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const data = await entry.fetcher(p);
      const next = data.results
        .filter((m: TMDBMovie) => m.poster_path)
        .map(toGridItem);
      setItems((prev) => {
        if (!append) return next;
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...next.filter((r) => !ids.has(r.id))];
      });
      setPage(p);
      setTotalPages(data.total_pages ?? 1);
    } catch {
      // silently fail — keep showing what we have
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [entry]);

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || loading || page >= totalPages) return;
    fetchPage(page + 1, true);
  }, [loading, page, totalPages, fetchPage]);

  const onPress = (item: GridItem) => {
    router.push({
      pathname: "/movie/[id]",
      params: {
        id: item.id,
        type: item.mediaType,
        poster_path: item.poster?.uri ?? "",
        title_param: item.title ?? "",
      },
    });
  };

  const displayLabel = rawLabel ?? entry?.label ?? "Genre";
  const colors = entry?.colors ?? ["#1a1a2e", "#0a1628"];
  const netflixCode = genreId;

  const renderItem = ({ item, index }: { item: GridItem; index: number }) => {
    const col = index % COLS;
    const marginRight = col < COLS - 1 ? GAP : 0;
    return (
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          st.card,
          { width: CARD_W, height: CARD_H, marginRight, marginBottom: GAP },
          pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
        ]}
      >
        <DynamicPoster
          tmdbId={item.tmdbId}
          mediaType={item.mediaType}
          fallback={item.poster}
          title={item.title}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={item.id}
          cachePolicy="disk"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.82)"]}
          style={st.cardGrad}
        />
        <View style={st.cardBadgeRow}>
          <View style={[st.typeBadge, item.mediaType === "tv" ? st.tvBadge : st.mvBadge]}>
            <Text style={st.typeBadgeText}>{item.mediaType === "tv" ? "TV" : "MV"}</Text>
          </View>
        </View>
        <View style={st.cardBottom}>
          <Text style={st.cardTitle} numberOfLines={2}>{item.title}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />

      {/* Gradient header */}
      <LinearGradient colors={[colors[0], colors[1]]} style={st.headerGrad}>
        <SafeAreaView edges={["top"]} style={st.headerSafe}>
          <View style={st.headerRow}>
            <Pressable onPress={() => router.back()} style={st.backBtn} hitSlop={12}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
            <View style={st.headerCenter}>
              <View>
                <Text style={st.headerTitle} numberOfLines={1}>{displayLabel}</Text>
                <Text style={st.headerCode}>Netflix Code #{netflixCode}</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Grid */}
      {loading ? (
        <View style={st.skeleton}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[st.skeletonCard, { width: CARD_W, height: CARD_H }]} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <View style={st.empty}>
          <Feather name="film" size={48} color="#1f2937" />
          <Text style={st.emptyText}>No titles found</Text>
          <Text style={st.emptySubtext}>Try a different genre</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={st.grid}
          columnWrapperStyle={{ gap: 0 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews
          windowSize={8}
          ListHeaderComponent={
            <Text style={st.countText}>
              {items.length}+ titles in this genre
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={st.footerLoader}>
                <ActivityIndicator size="small" color="#0EA5E9" />
                <Text style={st.footerText}>Loading more…</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a1628" },

  headerGrad: { paddingBottom: 16 },
  headerSafe: {},
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerEmoji: { fontSize: 32 },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerCode: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },

  grid: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  card: {
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#0f1923",
  },
  cardGrad: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
  cardBadgeRow: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  typeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tvBadge: { backgroundColor: "rgba(14,165,233,0.85)" },
  mvBadge: { backgroundColor: "rgba(239,68,68,0.85)" },
  typeBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  cardBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
  },
  cardTitle: {
    color: "#e5e5e5",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 13,
  },
  cardRating: {
    color: "#a3a3a3",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  skeleton: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    padding: 16,
    paddingTop: 8,
  },
  skeletonCard: {
    borderRadius: 8,
    backgroundColor: "#111d2e",
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 80,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    color: "#374151",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  countText: {
    color: "#4b5563",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    paddingVertical: 10,
  },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 20,
  },
  footerText: {
    color: "#4b5563",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
