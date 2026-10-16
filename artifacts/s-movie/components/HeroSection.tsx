import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import SmartImage from "@/components/SmartImage";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { useDailyGradient } from "@/hooks/useDailyGradient";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMyList } from "@/contexts/MyListContext";
import type { Movie } from "@/data/movies";
import { haptic } from "@/lib/haptics";

interface Props {
  movie: Movie;
  onColorChange?: (color: string) => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const HERO_H = Math.round(SCREEN_H * 0.70);

export default function HeroSection({ movie, onColorChange }: Props) {
  const { isInList, toggle } = useMyList();
  const inList = isInList(movie.id);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Daily gradient background ──────────────────────────────
  const { gradient: dailyGradient, fadeAnim: gradientFade } = useDailyGradient();

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
    if (movie.dominantColor) onColorChange?.(movie.dominantColor);
  }, [movie.id]);

  const handlePlay = () => {
    haptic.medium();
    router.push({ pathname: "/player", params: { id: movie.id } });
  };

  const handleInfo = () => {
    haptic.light();
    const p = (movie.poster ?? (movie as any).hero) as any;
    const posterUri: string = (p?.uri as string) ?? "";
    router.push({
      pathname: "/movie/[id]",
      params: {
        id: movie.id,
        poster_path: posterUri,
        title_param: movie.title ?? "",
        type: (movie as any).mediaType ?? "movie",
      },
    });
  };

  const handleMyList = () => {
    haptic.light();
    const posterSrc = movie.poster ?? (movie as any).hero;
    toggle(movie.id, {
      title:     movie.title,
      posterUri: (typeof posterSrc === "object" && posterSrc && "uri" in posterSrc)
                   ? (posterSrc as { uri: string }).uri
                   : "",
      mediaType: (movie as any).mediaType === "tv" ? "tv" : "movie",
    });
  };

  const genres = movie.genres?.slice(0, 3) ?? [];
  const duration = movie.duration && movie.duration !== "—" ? movie.duration : null;
  const year = movie.year;

  return (
    <Pressable onPress={handleInfo} style={styles.container}>

      {/* ── Daily gradient background — renders behind the poster image ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: gradientFade }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[dailyGradient[0], dailyGradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Full-width background image */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <SmartImage
          source={movie.poster}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={600}
          cachePolicy="disk"
          priority="high"
          title={movie.title}
        />
      </Animated.View>

      {/* Strong bottom gradient — transparent → black */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.10)", "rgba(0,0,0,0.72)", "#000"]}
        locations={[0, 0.50, 0.78, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Overlay content at bottom */}
      <View style={styles.overlay}>
        {/* Movie Title */}
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>

        {/* ── Details Strip ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.detailsRow}
          contentContainerStyle={styles.detailsRowContent}
        >
          {/* Year */}
          {year ? (
            <Text style={styles.detailMeta}>{year}</Text>
          ) : null}

          {year ? <View style={styles.dot} /> : null}

          {/* Runtime */}
          {duration ? (
            <Text style={styles.detailMeta}>{duration}</Text>
          ) : null}

          {duration ? <View style={styles.dot} /> : null}

          {/* Genre pills */}
          {genres.map((g) => (
            <View key={g} style={styles.genrePill}>
              <Text style={styles.genreText}>{g}</Text>
            </View>
          ))}
        </ScrollView>

        {/* TOP 10 badge row */}
        <View style={styles.badgeRow}>
          <View style={styles.top10Badge}>
            <Text style={styles.top10Text}>TOP</Text>
            <Text style={styles.top10Num}>10</Text>
          </View>
          <Text style={styles.rankText}>#1 in Movies Today</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePlay}
            style={({ pressed }) => [
              styles.playBtn,
              pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Ionicons name="play" size={20} color="#000" />
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>

          <Pressable
            onPress={handleMyList}
            style={({ pressed }) => [
              styles.myListBtn,
              pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Ionicons
              name={inList ? "checkmark-outline" : "add-outline"}
              size={22}
              color="#fff"
            />
            <Text style={styles.myListBtnText}>My List</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    height: HERO_H,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 22,
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 29,
    fontFamily: "Inter_900Black",
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 10,
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  // ── Details strip ────────────────────────────────────────────
  detailsRow: {
    flexGrow: 0,
    marginBottom: 12,
  },
  detailsRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  detailMeta: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  imdbBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(245,158,11,0.18)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imdbLabel: {
    color: "#F59E0B",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  imdbScore: {
    color: "#F59E0B",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  genrePill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  genreText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  // ── Badge + actions ──────────────────────────────────────────
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  top10Badge: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    alignItems: "center",
  },
  top10Text: {
    color: "#fff",
    fontSize: 7,
    fontFamily: "Inter_900Black",
    lineHeight: 8,
  },
  top10Num: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_900Black",
    lineHeight: 14,
  },
  rankText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  actionsRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  playBtn: {
    flex: 1,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 5,
    gap: 7,
  },
  playBtnText: {
    color: "#000",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  myListBtn: {
    flex: 1,
    backgroundColor: "rgba(50,50,50,0.85)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 5,
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  myListBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
