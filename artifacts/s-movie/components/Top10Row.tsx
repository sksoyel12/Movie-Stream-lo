import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";

import type { Movie } from "@/data/movies";
import { haptic } from "@/lib/haptics";
import { type TMDBPage, tmdbImg, tmdbToCard } from "@/lib/tmdb";
import {
  getCategoryCacheKey,
  HOME_CACHE_TTL_MS,
  loadHomeCacheSnapshot,
  saveHomeCache,
} from "@/lib/homeCache";
import { Skeleton } from "@/components/Skeleton";
import DynamicPoster from "@/components/DynamicPoster";

// ── Layout constants ──────────────────────────────────────────────────────────
// Tuned to match Netflix's Top 10 exactly:
//   • large outlined rank number on pure black
//   • poster overlaps the right half of the number
//   • no background panel / glassmorphism
const CARD_W        = 120;    // compact poster width
const CARD_H        = 180;    // compact poster height (≈ 2:3)
const NUM_VISIBLE   = 60;     // px of number visible left of poster edge
const ITEM_GAP      = 2;      // tight gap like Netflix
const ITEM_W        = NUM_VISIBLE + CARD_W;
const ITEM_STRIDE   = ITEM_W + ITEM_GAP;

// Number font sizes
const FONT_SINGLE   = 110;    // 1-digit rank, close to Netflix's ~90px treatment
const FONT_DOUBLE   = 92;     // 2-digit rank
// Number container is wider than NUM_VISIBLE so the digit can be large;
// the poster simply overlaps the right portion.
const NUM_BOX_W     = NUM_VISIBLE + CARD_W * 0.55;   // compact number layer

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  title:        string;
  movies:       Movie[];
  tmdbFetcher?: (page: number) => Promise<TMDBPage>;
  refreshKey?:  number;
  loadDelay?:   number;
}

const BLOCKED_IDS_T10 = new Set([155]);
function isBannedT10(m: { id: number; title?: string; name?: string }): boolean {
  if (BLOCKED_IDS_T10.has(m.id)) return true;
  const t = (m.title ?? m.name ?? "").toLowerCase();
  return t.includes("dark knight");
}

function mapResults(results: TMDBPage["results"]): Movie[] {
  return (
    results
      .filter((m) => !isBannedT10(m) && Boolean(m.poster_path))
      .slice(0, 10)
      .map((m, i) => {
        const c = tmdbToCard(m);
        return {
          id:            c.id,
          title:         c.title,
          poster:        c.poster ?? { uri: "" },
          hero:          c.hero ?? undefined,
          poster_url:    (m as any).poster_url ?? null,
          backdrop_url:  (m as any).backdrop_url ?? null,
          year:          c.year,
          rating:        c.rating,
          duration:      "—",
          genres:        c.genres,
          cast:          [],
          director:      "—",
          synopsis:      c.synopsis,
          tmdbRating:    c.tmdbRating,
          dominantColor: "#1a1a2e",
          isTop10:       true,
          top10Rank:     i + 1,
          mediaType:     c.mediaType,
          tmdbId:        c.tmdbId,
          poster_path:   m.poster_path,
        } as Movie;
      })
  );
}

// ── Premium glass rank number ─────────────────────────────────────────────────
// Netflix-style hollow numbers: a translucent interior with a crisp silver
// outline. The poster still overlaps the right half of the number.
const RankNumber = React.memo(function RankNumber({ rank }: { rank: number }) {
  const label    = String(rank);
  const isDouble = label.length > 1;
  const fontSize = isDouble ? FONT_DOUBLE : FONT_SINGLE;
  const strokeW  = isDouble ? 2 : 2.25;

  // Vertical center: baseline = height * 0.82 gives the visual center for
  // both single and double-digit numbers with this font weight.
  const textY    = CARD_H * 0.84;
  const textX    = NUM_BOX_W * 0.44;   // shift left so poster covers right half

  return (
    <Svg
      width={NUM_BOX_W}
      height={CARD_H}
      style={StyleSheet.absoluteFill as any}
      pointerEvents="none"
    >
      {/* Deep drop-shadow layer — separates digit from the poster behind it. */}
      <SvgText
        x={textX + 3}
        y={textY + 6}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="900"
        fill="none"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={strokeW + 10}
        strokeLinejoin="round"
      >
        {label}
      </SvgText>

      {/* Translucent glass body with a crisp silver/white outline. */}
      <SvgText
        x={textX}
        y={textY}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="900"
        fill="rgba(255,255,255,0.06)"
        stroke="#E5E5E5"
        strokeWidth={strokeW}
        strokeLinejoin="round"
      >
        {label}
      </SvgText>
    </Svg>
  );
});

// ── Individual card ───────────────────────────────────────────────────────────
const Top10Item = React.memo(function Top10Item({
  movie,
  rank,
  refreshKey,
  onPress,
}: {
  movie:       Movie;
  rank:        number;
  refreshKey:  number;
  onPress:     () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue:          0.96,
      useNativeDriver:  true,
      damping:          14,
      stiffness:        280,
      mass:             0.7,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue:          1,
      useNativeDriver:  true,
      damping:          14,
      stiffness:        240,
      mass:             0.7,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={s.item}
    >
      {/*
        The number sits in absolute position, full width of the item.
        Its SVG x-coordinate shifts it left so the poster covers the right half.
      */}
      <View style={s.numberLayer} pointerEvents="none">
        <RankNumber rank={rank} />
      </View>

      {/* Poster — floats above the number via zIndex + elevation */}
      <Animated.View style={[s.posterCol, { transform: [{ scale }] }]}>
        <View style={s.posterWrap}>
          <DynamicPoster
            tmdbId={(movie as any).tmdbId}
            mediaType={(movie as any).mediaType === "tv" ? "tv" : "movie"}
            fallback={
              (movie as any).poster_url
                ? { uri: (movie as any).poster_url }
                : (movie as any).poster_path
                ? { uri: tmdbImg((movie as any).poster_path, "w500") ?? "" }
                : (movie.poster as any)
            }
            title={movie.title}
            style={s.poster}
            contentFit="cover"
            cachePolicy="disk"
            priority="high"
            recyclingKey={`${movie.id}-r${refreshKey}`}
          />
          {/* Subtle bottom vignette so text/badges on poster read clearly */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.38)"]}
            style={s.cardGrad}
            pointerEvents="none"
          />
        </View>
      </Animated.View>
    </Pressable>
  );
});

// ── Main row ─────────────────────────────────────────────────────────────────
export default function Top10Row({
  title,
  movies:   initialMovies,
  tmdbFetcher,
  refreshKey = 0,
  loadDelay  = 0,
}: Props) {
  const [movies,  setMovies]  = useState<Movie[]>(initialMovies);
  const [loading, setLoading] = useState(Boolean(tmdbFetcher));
  const mountedRef   = useRef(true);
  const fetcherRef   = useRef(tmdbFetcher);
  fetcherRef.current = tmdbFetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!fetcherRef.current) { setMovies(initialMovies); return; }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      let cached: Movie[] | null = null;
      try {
        const cacheSnapshot = await loadHomeCacheSnapshot<Movie[]>(
          getCategoryCacheKey(title),
          HOME_CACHE_TTL_MS,
        );
        cached = cacheSnapshot.data;
        if (cached && cached.length > 0 && !cancelled && mountedRef.current) {
          setMovies(cached);
          setLoading(false);
        }
        // An empty snapshot is not usable content. Older builds could persist
        // an empty category response during an API outage; treating that as a
        // fresh cache leaves the title visible with no cards for the whole
        // feed window. Retry the live endpoint whenever the cached row is empty.
        if (cacheSnapshot.fresh && cached && cached.length > 0) return;
        if (loadDelay > 0) await new Promise((r) => setTimeout(r, loadDelay));
        if (cancelled || !mountedRef.current) return;
        const data = await fetcherRef.current!(1);
        if (cancelled || !mountedRef.current) return;
        const mapped = mapResults(data.results);
        if (mapped.length > 0) {
          setMovies(mapped);
          saveHomeCache(getCategoryCacheKey(title), mapped).catch(() => {});
        } else if (!cached) {
          setMovies(initialMovies);
        }
      } catch {
        if (!cancelled && mountedRef.current && !cached) setMovies(initialMovies);
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, loadDelay]);

  const renderItem = useCallback(
    ({ item: m, index }: { item: Movie; index: number }) => (
      <Top10Item
        movie={m}
        rank={index + 1}
        refreshKey={refreshKey}
        onPress={() => {
          haptic.light();
          router.push({
            pathname: "/movie/[id]",
            params: { id: m.id, type: (m as any).mediaType ?? "movie" },
          });
        }}
      />
    ),
    [refreshKey],
  );

  const keyExtractor  = useCallback((m: Movie) => String(m.id), []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ITEM_STRIDE,
      offset: ITEM_STRIDE * index + 16,
      index,
    }),
    [],
  );

  return (
    <View style={s.wrap}>
      <Text style={s.rowTitle}>{title}</Text>

      {loading ? (
        <View style={s.skeletonRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={s.skeletonItem}>
              {/* Skeleton number placeholder */}
              <Skeleton
                width={NUM_VISIBLE - 8}
                height={CARD_H * 0.72}
                borderRadius={4}
                style={{ alignSelf: "flex-end", marginRight: -4, opacity: 0.4 }}
              />
              <Skeleton width={CARD_W} height={CARD_H} borderRadius={12} />
            </View>
          ))}
        </View>
      ) : (
        <View style={s.listWrapper}>
          <FlatList
            data={movies ?? []}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled
            nestedScrollEnabled
            style={{ minHeight: CARD_H + 10 }}
            contentContainerStyle={s.list}
            getItemLayout={getItemLayout}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={9}
            decelerationRate={Platform.OS === "android" ? 0.985 : "fast"}
            snapToInterval={ITEM_STRIDE}
            snapToAlignment="start"
            removeClippedSubviews={Platform.OS !== "web"}
          />

          {/* Left-edge fade — hides the cropped number of the first scrolled card */}
          <LinearGradient
            colors={["#000000", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.fadeLeft}
            pointerEvents="none"
          />
          {/* Right-edge fade */}
          <LinearGradient
            colors={["transparent", "#000000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.fadeRight}
            pointerEvents="none"
          />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const FADE_W = 32;

const s = StyleSheet.create({
  wrap: {
    marginTop:    20,
    marginBottom: 4,
    backgroundColor: "#000000",
  },

  rowTitle: {
    color:             "#ffffff",
    fontSize:          17,
    fontFamily:        "Inter_700Bold",
    paddingHorizontal: 16,
    marginBottom:      10,
    letterSpacing:     -0.3,
  },

  // Wrapper that holds the FlatList + fade overlays
  listWrapper: {
    position: "relative",
  },

  list: {
    paddingLeft:  16,
    paddingRight: 16,
    alignItems:   "flex-end",
  },

  // ── Item ─────────────────────────────────────────────────────────────────
  item: {
    position:      "relative",
    flexDirection: "row",
    alignItems:    "flex-end",
    width:         ITEM_W,
    marginRight:   ITEM_GAP,
    height:        CARD_H,
  },

  // Number layer: absolute, full item width, behind poster (zIndex 0)
  numberLayer: {
    ...StyleSheet.absoluteFill,
    zIndex:   0,
    overflow: "visible",
  },

  // ── Poster ────────────────────────────────────────────────────────────────
  posterCol: {
    // Push poster to the right so number peeks from the left
    marginLeft: NUM_VISIBLE,
    zIndex:     10,
  },

  posterWrap: {
    width:           CARD_W,
    height:          CARD_H,
    aspectRatio:     2 / 3,
    borderRadius:    12,
    overflow:        "hidden",
    backgroundColor: "#1c1c1c",
    // Drop shadow gives the "card floating over number" depth
    shadowColor:     "#000",
    shadowOffset:    { width: -8, height: 4 },
    shadowOpacity:   0.80,
    shadowRadius:    14,
    elevation:       14,
  },

  poster: {
    width:  "100%",
    height: "100%",
    aspectRatio: 2 / 3,
  },

  cardGrad: {
    position: "absolute",
    left:     0,
    right:    0,
    bottom:   0,
    height:   CARD_H * 0.30,
  },

  // ── Edge fades ────────────────────────────────────────────────────────────
  fadeLeft: {
    position: "absolute",
    top:      0,
    left:     0,
    width:    FADE_W,
    bottom:   0,
    zIndex:   20,
  },

  fadeRight: {
    position: "absolute",
    top:      0,
    right:    0,
    width:    FADE_W,
    bottom:   0,
    zIndex:   20,
  },

  // ── Skeleton ──────────────────────────────────────────────────────────────
  skeletonRow: {
    flexDirection:     "row",
    paddingHorizontal: 16,
    gap:               ITEM_GAP,
    alignItems:        "flex-end",
  },

  skeletonItem: {
    flexDirection: "row",
    alignItems:    "flex-end",
    gap:           0,
  },
});
