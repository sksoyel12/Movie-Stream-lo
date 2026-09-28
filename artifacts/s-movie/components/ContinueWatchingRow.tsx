import { Feather } from "@expo/vector-icons";
import SmartImage from "@/components/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { findMovie } from "@/data/movies";
import { haptic } from "@/lib/haptics";
import { clearProgress, loadAllProgress, type WatchProgress } from "@/lib/watchProgress";
import { useProfile } from "@/contexts/ProfileContext";

const CARD_WIDTH = 120;
const CARD_HEIGHT = 180;
const ITEM_GAP = 10;
const MAX_ITEMS = 5;

function fmtRemaining(positionSec: number, durationSec: number): string {
  const remaining = Math.max(0, durationSec - positionSec);
  const mins = Math.round(remaining / 60);
  if (mins <= 0) return "< 1 min left";
  return `${mins} min left`;
}

function WatchCard({
  item,
  onRemove,
}: {
  item: WatchProgress;
  onRemove: (id: string) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const movie = findMovie(item.movieId);

  const imageSource = item.posterUri
    ? { uri: item.posterUri }
    : movie
      ? (movie.hero ?? movie.poster)
      : null;

  const title = item.title ?? movie?.title ?? "Unknown";
  const fraction =
    item.durationSec > 0 ? Math.min(1, item.positionSec / item.durationSec) : 0;
  const pct = `${Math.round(fraction * 100)}%`;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 50,
      bounciness: 2,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();

  const handlePress = () => {
    haptic.medium();
    router.push({ pathname: "/player", params: { id: item.movieId } });
  };

  const handleRemove = () => {
    haptic.light();
    onRemove(item.movieId);
  };

  return (
    <View style={styles.cardOuter}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.posterWrap}
        >
          {imageSource ? (
            <SmartImage
              source={imageSource as any}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="disk"
              title={title}
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Feather name="film" size={24} color="#444" />
            </View>
          )}

          {/* Dark overlay */}
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.50)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Play circle */}
          <View style={styles.playOverlay} pointerEvents="none">
            <View style={styles.playCircle}>
              <Feather name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>

          {/* Progress bar — gradient red */}
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={["#E50914", "#FF6B35"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: pct as any }]}
            />
          </View>
        </Pressable>
      </Animated.View>

      {/* Title + time remaining */}
      <View style={styles.cardMeta}>
        <Text style={styles.movieTitle} numberOfLines={1}>{title}</Text>
        {item.durationSec > 0 && (
          <Text style={styles.timeLeft}>
            {fmtRemaining(item.positionSec, item.durationSec)}
          </Text>
        )}
      </View>

      {/* X remove button */}
      <Pressable
        onPress={handleRemove}
        hitSlop={10}
        style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.5 }]}
        accessibilityLabel="Remove from Continue Watching"
      >
        <Feather name="x" size={13} color="#737373" />
      </Pressable>
    </View>
  );
}

export function ContinueWatchingRow() {
  const [items, setItems] = useState<WatchProgress[]>([]);
  const { authUser, authLoaded } = useProfile();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!authLoaded) return () => { active = false; };
      loadAllProgress().then((all) => {
        if (active) setItems(all.slice(0, MAX_ITEMS));
      });
      return () => {
        active = false;
      };
    }, [authLoaded, authUser?.uid]),
  );

  const handleRemove = useCallback(async (movieId: string) => {
    await clearProgress(movieId);
    setItems((prev) => prev.filter((p) => p.movieId !== movieId));
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Continue Watching</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.movieId}
        renderItem={({ item }) => (
          <WatchCard item={item} onRemove={handleRemove} />
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ width: ITEM_GAP }} />}
        getItemLayout={(_, index) => ({
          length: CARD_WIDTH + ITEM_GAP,
          offset: (CARD_WIDTH + ITEM_GAP) * index,
          index,
        })}
        removeClippedSubviews={Platform.OS !== "web"}
        maxToRenderPerBatch={5}
        windowSize={3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 22,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginBottom: 11,
    letterSpacing: -0.3,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  emptyState: {
    marginHorizontal: 16,
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#242424",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  emptyTitle: {
    color: "#b5b5b5",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 7,
  },
  emptySubtitle: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 3,
  },
  cardOuter: {
    width: CARD_WIDTH,
    aspectRatio: 2 / 3,
  },
  posterWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  posterPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1c1c1c",
  },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.60)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  cardMeta: {
    marginTop: 7,
    paddingRight: 22,
  },
  movieTitle: {
    color: "#e5e5e5",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  timeLeft: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 0,
    padding: 4,
  },
});
