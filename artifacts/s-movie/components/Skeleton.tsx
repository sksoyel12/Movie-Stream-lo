import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(
    typeof width === "number" ? width : 240,
  );

  useEffect(() => {
    if (typeof width === "number" && width !== containerWidth) {
      setContainerWidth(width);
    }
  }, [width]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-containerWidth * 1.8, containerWidth * 2.2],
  });

  return (
    <View
      style={[
        styles.base,
        { width: width as any, height, borderRadius, overflow: "hidden" },
        style,
      ]}
      onLayout={
        typeof width === "string"
          ? (e) => setContainerWidth(e.nativeEvent.layout.width)
          : undefined
      }
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.07)",
            "rgba(255,255,255,0.20)",
            "rgba(255,255,255,0.07)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: "100%", width: containerWidth * 4 }}
        />
      </Animated.View>
    </View>
  );
}

export function SkeletonCard({
  width = 110,
  height = 165,
}: {
  width?: number;
  height?: number;
}) {
  return <Skeleton width={width} height={height} borderRadius={8} />;
}

export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={140} height={16} borderRadius={4} style={styles.rowTitle} />
      <View style={styles.rowCards}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    </View>
  );
}

export function SkeletonEpisodeRow() {
  return (
    <View style={styles.episodeRow}>
      <Skeleton width={120} height={68} borderRadius={6} />
      <View style={styles.episodeInfo}>
        <Skeleton width="80%" height={13} borderRadius={3} />
        <Skeleton width="50%" height={11} borderRadius={3} style={{ marginTop: 6 }} />
        <Skeleton width="90%" height={11} borderRadius={3} style={{ marginTop: 4 }} />
        <Skeleton width="70%" height={11} borderRadius={3} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

export function SkeletonDownloadRow() {
  return (
    <View style={styles.downloadRow}>
      <Skeleton width={80} height={112} borderRadius={6} />
      <View style={styles.downloadInfo}>
        <Skeleton width="75%" height={15} borderRadius={3} />
        <Skeleton width="40%" height={11} borderRadius={3} style={{ marginTop: 7 }} />
        <Skeleton width="55%" height={11} borderRadius={3} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.downloadActions}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <Skeleton width={28} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: "#1c1c1c" },
  row: { marginTop: 22, paddingHorizontal: 0 },
  rowTitle: { marginLeft: 16, marginBottom: 10 },
  rowCards: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8,
  },
  episodeRow: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 14,
    alignItems: "flex-start",
  },
  episodeInfo: { flex: 1, paddingTop: 2 },
  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a1a1a",
  },
  downloadInfo: { flex: 1 },
  downloadActions: { alignItems: "center", gap: 10 },
});
