import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDownloads } from "@/contexts/DownloadContext";

const ASSUMED_MB = 800;

function formatSpeed(mbps: number): string {
  if (mbps <= 0) return "";
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  return `${(mbps * 1024).toFixed(0)} KB/s`;
}

function formatEta(remainingFraction: number, mbps: number): string {
  if (mbps <= 0 || remainingFraction <= 0) return "";
  const remainingMb = remainingFraction * ASSUMED_MB;
  const secs = Math.round(remainingMb / mbps);
  if (secs < 60) return `${secs}s left`;
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}m ${s}s left`;
}

export function DownloadProgressBar() {
  const { downloads } = useDownloads();
  const active = downloads.filter((d) => d.status === "downloading");

  const slideAnim = useRef(new Animated.Value(80)).current;
  const isVisible = active.length > 0;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isVisible ? 0 : 80,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isVisible]);

  const prevProgress = useRef<Record<string, number>>({});
  const prevTime = useRef<Record<string, number>>({});
  const [speeds, setSpeeds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (active.length === 0) return;
    const now = Date.now();
    const next: Record<string, number> = { ...speeds };

    for (const dl of active) {
      const prevP = prevProgress.current[dl.movieId] ?? 0;
      const prevT = prevTime.current[dl.movieId] ?? now;
      const deltaProg = dl.progress - prevP;
      const deltaMs = now - prevT;

      if (deltaMs > 0 && deltaProg > 0) {
        const mbPerMs = (deltaProg * ASSUMED_MB) / deltaMs;
        const mbps = mbPerMs * 1000;
        next[dl.movieId] = mbps;
      }

      prevProgress.current[dl.movieId] = dl.progress;
      prevTime.current[dl.movieId] = now;
    }

    setSpeeds(next);
  }, [downloads]);

  if (!isVisible && (slideAnim as any)._value === 80) return null;

  const primary = active[0];
  const extra = active.length - 1;
  const pct = Math.round((primary?.progress ?? 0) * 100);
  const spd = primary ? speeds[primary.movieId] ?? 0 : 0;
  const remaining = 1 - (primary?.progress ?? 0);

  return (
    <Animated.View
      style={[styles.bar, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.inner}>
        <View style={styles.left}>
          <Feather name="download" size={14} color="#0EA5E9" />
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={1}>
              {primary?.title ?? "Downloading…"}
              {extra > 0 ? (
                <Text style={styles.extra}>{`  +${extra} more`}</Text>
              ) : null}
            </Text>
            <View style={styles.meta}>
              <Text style={styles.pct}>{pct}%</Text>
              {spd > 0 && (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.speed}>{formatSpeed(spd)}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.eta}>{formatEta(remaining, spd)}</Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.trackBg}>
        <Animated.View
          style={[
            styles.trackFill,
            { width: `${Math.min(pct, 100)}%` as any },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: 60,
    left: 12,
    right: 12,
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
    zIndex: 9998,
    elevation: 9,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#e5e5e5",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  extra: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pct: {
    color: "#0EA5E9",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  dot: {
    color: "#525252",
    fontSize: 11,
  },
  speed: {
    color: "#a3a3a3",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  eta: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  trackBg: {
    height: 3,
    backgroundColor: "#262626",
    width: "100%",
  },
  trackFill: {
    height: "100%",
    backgroundColor: "#0EA5E9",
    borderRadius: 2,
  },
});
