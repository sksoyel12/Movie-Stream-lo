/**
 * HeroBannerCarousel — 3D Center-Focused Vertical Poster Carousel
 *
 * Reference-exact layout:
 *   • Center poster: large, highly rounded, pink neon outer shadow glow
 *   • Side posters: scale 0.85, darkened opacity overlay, blurred
 *   • Below cards: script title (two-tone), tagline, dot-separated genres,
 *     Watch Now (white) + My List (semi-transparent dark) buttons
 *   • Dot indicators • 5s auto-slide • Swipe gesture
 *
 * Streaming sources (105 links) live in:
 *   lib/sourceCatalog.ts   — 76-entry master registry
 *   lib/streamingService.ts — 39 active embed race pool
 *   lib/movieSources.ts    — 15 dynamic scrapers
 * None of these files are touched here.
 */
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import SmartImage, { prefetchImages } from "@/components/SmartImage";
import { Skeleton } from "@/components/Skeleton";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isNetflixHeroMovie, type Movie } from "@/data/movies";
import { useMyList } from "@/contexts/MyListContext";
import { haptic } from "@/lib/haptics";
import { tmdbToCard } from "@/lib/tmdb";

const { width: W } = Dimensions.get("window");

// ─── Coverflow geometry ────────────────────────────────────────
const CARD_W   = Math.round(W * 0.62);      // center card
const CARD_H   = Math.round(CARD_W * 1.5);  // standard 2:3 portrait ratio
const CARD_R   = 24;
const GAP      = 10;
const PEEK     = Math.round((W - CARD_W) / 2) - GAP - 2;
const SNAP     = CARD_W + GAP;
const AUTO_MS  = 5_000;
const SIDE_SCALE = 0.85;

// ─── Colour tokens ─────────────────────────────────────────────
const PINK        = "#E8608A";
const NEON_PINK   = "#ff007f";
const PINK_TITLE  = "#E8608A";

// ─── Animated dot indicator ────────────────────────────────────
function Dot({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [active]);
  return (
    <Animated.View
      style={[
        dot.base,
        {
          width: anim.interpolate({ inputRange: [0, 1], outputRange: [5, 22] }),
          backgroundColor: anim.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(255,255,255,0.28)", "#fff"],
          }),
        },
      ]}
    />
  );
}
const dot = StyleSheet.create({
  base: { height: 4, borderRadius: 2, marginHorizontal: 3 },
});


// ─── Single poster card (scroll region only — no text inside) ──
function PosterCard({
  item,
  scrollX,
  index,
  onPress,
}: {
  item: Movie;
  scrollX: Animated.Value;
  index: number;
  onPress: () => void;
}) {
  const imgSrc = item.poster ?? (item as any).hero;

  const inputRange: [number, number, number] = [
    (index - 1) * SNAP,
    index * SNAP,
    (index + 1) * SNAP,
  ];

  // Scale: center card = 1.0, side cards = 0.85, smoothly transitions during drag
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
    extrapolate: "clamp",
  });

  // Dim: side cards get 55% dark overlay, center is clear
  const dimOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.55, 0, 0.55],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[pc.wrap, { transform: [{ scale }] }]}>

      {/* ── Poster card ───────────────────────────────────────── */}
      <Pressable style={pc.card} onPress={onPress} android_ripple={null}>

        {imgSrc ? (
          <SmartImage
            source={imgSrc}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={{ top: "0%", left: "50%" }}
            transition={350}
            cachePolicy="disk"
            priority="high"
            title={item.title}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#141414" }]} />
        )}

        {/* Subtle top vignette */}
        <LinearGradient
          colors={["rgba(0,0,0,0.35)", "transparent"]}
          style={[StyleSheet.absoluteFill, { height: CARD_H * 0.22, bottom: "auto" }]}
          pointerEvents="none"
        />

        {/* Animated dim overlay — smoothly darkens side cards during drag */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "#000",
              opacity: dimOpacity,
              borderRadius: CARD_R,
            },
          ]}
          pointerEvents="none"
        />
      </Pressable>
    </Animated.View>
  );
}

const pc = StyleSheet.create({
  wrap: {
    width: CARD_W,
    aspectRatio: 2 / 3,
    marginRight: GAP,
    borderRadius: CARD_R,
    overflow: "hidden",          // clips the scale animation to rounded shape
    backgroundColor: "transparent",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: CARD_R,
    overflow: "hidden",
    backgroundColor: "transparent", // no dark bleed at poster edges
  },
});

// ─── Info panel below the carousel (title, genres, buttons) ───
function InfoPanel({
  movie,
  onPlay,
  onInfo,
  onToggleList,
}: {
  movie: Movie;
  onPlay: () => void;
  onInfo: () => void;
  onToggleList: () => void;
}) {
  const { isInList } = useMyList();
  const inList = isInList(movie.id);
  const isTv   = (movie as any).mediaType === "tv";

  const tagline = (movie as any).synopsis
    ? (movie as any).synopsis.trim().slice(0, 110)
    : "";

  const genres = (movie.genres ?? []).slice(0, 3);

  return (
    <View style={ip.root}>
      {/* Tagline */}
      {tagline ? (
        <Text style={ip.tagline} numberOfLines={3}>{tagline}</Text>
      ) : null}

      {/* Dot-separated genre tags */}
      {genres.length > 0 && (
        <View style={ip.genreRow}>
          {genres.map((g, gi) => (
            <React.Fragment key={g}>
              <Text style={ip.genre}>{g}</Text>
              {gi < genres.length - 1 && (
                <View style={ip.genreDot} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Buttons */}
      <View style={ip.btnRow}>
        {/* Watch Now — solid white */}
        <Pressable
          style={({ pressed }) => [ip.watchBtn, pressed && { opacity: 0.87, transform: [{ scale: 0.97 }] }]}
          onPress={onPlay}
        >
          <Ionicons name="play" size={15} color="#000" style={{ marginRight: 6 }} />
          <Text style={ip.watchTxt}>Watch Now</Text>
        </Pressable>

        {/* My List — semi-transparent dark */}
        <Pressable
          style={({ pressed }) => [ip.listBtn, pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] }]}
          onPress={isTv ? onInfo : onToggleList}
        >
          <Ionicons
            name={inList ? "checkmark" : "add"}
            size={15}
            color="#fff"
            style={{ marginRight: 5 }}
          />
          <Text style={ip.listTxt}>
            {inList ? "In List" : "My List"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const ip = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
  },
  tagline: {
    fontFamily: "Inter_400Regular",
    color: "#aaaaaa",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 8,
    letterSpacing: 0.1,
    paddingHorizontal: 16,
  },
  genreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  genre: {
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  genreDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: PINK,
    opacity: 0.85,
    marginHorizontal: 8,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginBottom: 25,
  },
  watchBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#fff",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  watchTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000",
    letterSpacing: 0.2,
  },
  listBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "rgba(40,40,40,0.85)",
    borderRadius: 11,
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  listTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
    letterSpacing: 0.2,
  },
});

// ─── Main Carousel ─────────────────────────────────────────────
export default function HeroBannerCarousel({
  movies,
  refreshing = false,
}: {
  movies: Movie[];
  refreshing?: boolean;
}) {
  const insets     = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollX   = useRef(new Animated.Value(0)).current;
  const scrollRef  = useRef<ScrollView>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragging   = useRef(false);

  // Header height: status bar + logo row (~50px) + tabs row (~58px)
  const HEADER_H = insets.top + 108;

  // The home screen (fetchHero) fully enriches movies with Netflix-style random
  // poster artwork before passing them in. The carousel uses movies directly as
  // the display list — no second-round enrichment here so there is no extra
  // state update that would trigger a redundant fade/reset cycle.
  // Hard guard: the Hero Banner only renders cards explicitly marked as
  // Netflix content by the home feed. This protects the banner even if a
  // different caller later passes a general catalog list.
  const enrichedMovies = movies.filter(isNetflixHeroMovie);

  const moviesRef = useRef<Movie[]>(movies);
  useEffect(() => { moviesRef.current = movies; }, [movies]);

  // ── Fade-in animation whenever a fresh batch of movies arrives ──
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const prevMovieIds = useRef<string>(movies.map(m => m.id).join(","));
  useEffect(() => {
    const newIds = movies.map(m => m.id).join(",");
    if (!movies.length || newIds === prevMovieIds.current) return;
    prevMovieIds.current = newIds;

    // 1. Fade out
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // 2. Reset scroll + active index to card 0
      scrollX.setValue(0);
      setActiveIdx(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });

      // 3. Fade in with new glow colors already applied
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    });
  }, [movies]);

  const { toggle } = useMyList();

  // Prefetch first 5 poster images whenever enriched list changes
  useEffect(() => {
    if (!enrichedMovies.length) return;
    const urls = enrichedMovies.slice(0, 5).flatMap((m) => {
      const s = m.poster ?? (m as any).hero;
      return typeof s === "object" && s !== null ? [(s as any).uri as string] : [];
    });
    prefetchImages(urls);
  }, [enrichedMovies]);

  const scrollTo = useCallback((idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SNAP, animated: true });
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (dragging.current) return;
      const count = moviesRef.current.length;
      // The timer mounts before TMDB finishes loading. Never calculate
      // `(index + 1) % 0`, which leaves activeIdx as NaN and stops the carousel.
      if (count < 2) return;
      setActiveIdx((prev) => {
        const current = Number.isFinite(prev) ? prev : 0;
        const next = (current + 1) % count;
        scrollRef.current?.scrollTo({ x: next * SNAP, animated: true });
        return next;
      });
    }, AUTO_MS);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = e.nativeEvent.contentOffset.x;
        const idx = Math.round(x / SNAP);
        if (idx >= 0 && idx < moviesRef.current.length) {
          setActiveIdx(idx);
        }
      },
    },
  );

  if (!enrichedMovies.length) {
    return (
      <View style={{
        height: HEADER_H + CARD_H + 200,
        backgroundColor: "transparent",
        flexDirection: "column",
        alignItems: "center",
      }}>
        {/* Spacer: pushes skeleton below the floating header */}
        <View style={{ height: HEADER_H + 12 }} />

        {/* Center poster skeleton — same size as actual PosterCard */}
        <Skeleton width={CARD_W} height={CARD_H} borderRadius={CARD_R} />

        {/* Dots skeleton */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={i === 0 ? 22 : 5} height={4} borderRadius={2} />
          ))}
        </View>

        {/* Title + tagline + buttons skeleton */}
        <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: 18, paddingHorizontal: 32 }}>
          <Skeleton width="52%" height={22} borderRadius={6} />
          <Skeleton width="78%" height={11} borderRadius={4} style={{ marginTop: 12 }} />
          <Skeleton width="62%" height={11} borderRadius={4} style={{ marginTop: 7 }} />
          <View style={{ flexDirection: "row", gap: 14, marginTop: 22 }}>
            <Skeleton width={116} height={42} borderRadius={22} />
            <Skeleton width={100} height={42} borderRadius={22} />
          </View>
        </View>
      </View>
    );
  }

  const activeMovie = enrichedMovies[activeIdx] ?? enrichedMovies[0];
  const isTv = (activeMovie as any).mediaType === "tv";

  return (
    <Animated.View style={[r.root, { opacity: fadeAnim }, { outlineWidth: 0, outlineColor: "transparent" } as any]}>

      {/* ── Refresh loading overlay (shown while TMDB fetch is in flight) ── */}
      {refreshing && (
        <View style={r.refreshOverlay} pointerEvents="none">
          <View style={r.refreshPill}>
            <Text style={r.refreshTxt}>Fetching latest…</Text>
          </View>
        </View>
      )}

      {/* ── 3-Poster Coverflow Scroll ──────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SNAP}
        snapToAlignment="start"
        contentContainerStyle={r.scrollRow}
        style={r.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={12}
        onScrollBeginDrag={() => {
          dragging.current = true;
          if (timerRef.current) clearInterval(timerRef.current);
        }}
        onMomentumScrollEnd={() => {
          dragging.current = false;
          startTimer();
        }}
      >
        {enrichedMovies.map((item, index) => (
          <PosterCard
            key={item.id}
            item={item}
            scrollX={scrollX}
            index={index}
            onPress={() => {
              haptic.light();
              router.push({
                pathname: "/movie/[id]",
                params: { id: item.id, type: (item as any).mediaType ?? "movie" },
              });
            }}
          />
        ))}
      </ScrollView>

      {/* ── Dot indicators ─────────────────────────────────────── */}
      <View style={r.dots}>
        {enrichedMovies.map((_, i) => <Dot key={i} active={i === activeIdx} />)}
      </View>

      {/* ── Info panel: title + tagline + genres + buttons ──────── */}
      <InfoPanel
        movie={activeMovie}
        onPlay={() => {
          haptic.medium();
          router.push({
            pathname: "/movie/[id]",
            params: { id: activeMovie.id, type: isTv ? "tv" : "movie" },
          });
        }}
        onInfo={() => {
          haptic.light();
          router.push({
            pathname: "/movie/[id]",
            params: { id: activeMovie.id, type: isTv ? "tv" : "movie" },
          });
        }}
        onToggleList={() => {
          haptic.light();
          const posterSrc = activeMovie.poster ?? (activeMovie as any).hero;
          toggle(activeMovie.id, {
            title:     activeMovie.title,
            posterUri: (typeof posterSrc === "object" && posterSrc && "uri" in posterSrc)
                         ? (posterSrc as { uri: string }).uri
                         : "",
            mediaType: isTv ? "tv" : "movie",
          });
        }}
      />

    </Animated.View>
  );
}

const r = StyleSheet.create({
  root: {
    backgroundColor: "transparent",
    marginTop: 110,
    paddingTop: 8,
    overflow: "visible",
    borderWidth: 0,
    outlineWidth: 0,
  },

  // paddingHorizontal = PEEK centers the first card
  scrollRow: {
    paddingHorizontal: PEEK,
    paddingTop: 0,
    paddingBottom: 10,
  },

  // Suppress React Native Web default 1px outline and background on the horizontal ScrollView
  scrollView: {
    backgroundColor: "transparent",
    borderWidth: 0,
    outlineWidth: 0,
  } as any,

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    height: 12,
  },

  // ── Refresh overlay — floats above the poster scroll during fetch ──
  refreshOverlay: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: "center",
  },
  refreshPill: {
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  refreshTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#00F0FF",
    letterSpacing: 0.4,
  },
});
