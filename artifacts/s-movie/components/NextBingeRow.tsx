/**
 * NextBingeRow — "Meet Your Next Binge"
 *
 * Netflix-style horizontal portrait carousel:
 *   • 110×160px portrait cards (pure poster — no big rank numbers)
 *   • Red TOP 10 badge in top-right corner on every card
 *   • Rank number badge (1–10) in top-left corner
 *   • Taps open the movie/show detail page
 *   • Fetches live from TMDb (trending/popular)
 */
import { router } from "expo-router";

import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { haptic } from "@/lib/haptics";
import { tmdb, tmdbToCard, type TMDBPage } from "@/lib/tmdb";
import HindiBadge from "@/components/HindiBadge";
import { Skeleton } from "@/components/Skeleton";
import SmartImage from "@/components/SmartImage";

const CARD_W = 120;
const CARD_H = 180;

interface CardItem {
  id: string;
  title: string;
  poster: { uri: string } | null;
  poster_path: string | null;
  rank: number;
  mediaType: "movie" | "tv";
}

function mapResults(results: TMDBPage["results"]): CardItem[] {
  return results
    .filter((m) => m.poster_path)
    .slice(0, 10)
    .map((m, i) => {
      const c = tmdbToCard(m);
      return {
        id: c.id,
        title: c.title,
        poster: c.poster,
        poster_path: m.poster_path,
        rank: i + 1,
        mediaType: c.mediaType,
      };
    });
}

interface Props {
  title?: string;
  tmdbFetcher?: (page: number) => Promise<TMDBPage>;
  refreshKey?: number;
}

export default function NextBingeRow({
  title = "Meet Your Next Binge",
  tmdbFetcher,
  refreshKey = 0,
}: Props) {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetcher = tmdbFetcher ?? ((p) => tmdb.trendingToday(p));
    fetcher(1)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        const mapped = mapResults(data.results);
        if (mapped.length > 0) setCards(mapped);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tmdbFetcher, refreshKey]);

  return (
    <View style={st.wrap}>
      <Text style={st.sectionTitle}>{title}</Text>

      {loading ? (
        <View style={st.skeletonRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width={CARD_W} height={CARD_H} borderRadius={6} />
          ))}
        </View>
      ) : (
        <FlatList
          data={cards || []}
          keyExtractor={(c) => c.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ minHeight: CARD_H }}
          contentContainerStyle={st.list}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={7}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => {
                haptic.light();
                router.push({
                  pathname: "/movie/[id]",
                  params: {
                    id: item.id,
                    type: item.mediaType,
                    poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                    title_param: item.title ?? "",
                  },
                });
              }}
              style={({ pressed }) => [st.card, pressed && { opacity: 0.72 }]}
            >
              {/* Portrait poster */}
              <SmartImage
                source={item.poster_path ? { uri: `https://image.tmdb.org/t/p/w500${item.poster_path}` } : null}
                style={{ width: CARD_W, height: CARD_H, backgroundColor: "#222", borderRadius: 6, marginRight: 10 }}
                cachePolicy="disk"
                title={item.title}
              />

              {/* Rank number — top left */}
              <View style={st.rankBadge}>
                <Text style={st.rankText}>{index + 1}</Text>
              </View>

              {/* TOP 10 badge — top right, red */}
              <View style={st.top10Badge}>
                <Text style={st.top10Text}>TOP 10</Text>
              </View>
              {/* Hindi badge — only rendered when TMDB confirms Hindi audio exists */}
              <HindiBadge
                tmdbId={(item as any).tmdbId ?? item.id}
                mediaType={item.mediaType}
                style={st.hindiBadge}
                textStyle={st.hindiBadgeText}
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    marginTop: 24,
    minHeight: CARD_H + 60,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 10,
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  list: {
    paddingHorizontal: 10,
  },

  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    gap: 8,
  },

  // Each portrait card — 110×160 like the HTML reference
  card: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#222",
    marginRight: 8,
  },

  poster: {
    width: "100%",
    height: "100%",
    aspectRatio: 2 / 3,
  },

  // Rank number — top-left, small white badge
  rankBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderBottomRightRadius: 5,
  },
  rankText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 13,
  },

  // TOP 10 badge — top-right, Netflix red
  top10Badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#E50914",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderBottomLeftRadius: 4,
  },
  top10Text: {
    color: "#fff",
    fontSize: 7,
    fontFamily: "Inter_900Black",
    letterSpacing: 0.4,
    lineHeight: 10,
  },

  // ── "Hindi" language badge — top-right, semi-transparent ──────────────────
  hindiBadge: {
    position:          "absolute",
    top:               22,           // offset below the TOP 10 badge
    right:             0,
    backgroundColor:   "rgba(0,0,0,0.72)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.20)",
    paddingHorizontal: 5,
    paddingVertical:   2,
    borderTopLeftRadius:    4,
    borderBottomLeftRadius: 4,
    zIndex:            5,
  },
  hindiBadgeText: {
    color:         "#fff",
    fontSize:      8,
    fontFamily:    "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
