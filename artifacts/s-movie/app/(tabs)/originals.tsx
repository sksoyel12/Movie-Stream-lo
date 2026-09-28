import SmartImage from "@/components/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ORIGINALS } from "@/data/movies";

export default function OriginalsScreen() {
  const insets = useSafeAreaInsets();
  const topPad =
    (Platform.OS === "web" ? Math.max(insets.top, 12) : insets.top) + 16;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad }]}
      >
        <View style={styles.brandHeader}>
          <Text style={styles.brandLetter}>S</Text>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandLine}>MY</Text>
            <Text style={styles.brandLineBig}>S Movie Original</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          Stories you can&apos;t find anywhere else.
        </Text>

        {ORIGINALS.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => {
              const p = m.poster as any;
              router.push({
                pathname: "/movie/[id]",
                params: {
                  id: m.id,
                  poster_path: (p?.uri as string) ?? "",
                  title_param: m.title ?? "",
                },
              });
            }}
            style={({ pressed }) => [
              styles.card,
              pressed && { opacity: 0.85 },
            ]}
          >
            <SmartImage source={m.poster} style={styles.cardImage} contentFit="cover" />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.95)"]}
              style={styles.cardGradient}
            />
            <View style={styles.cardOverlay}>
              <View style={styles.originalTag}>
                <Text style={styles.originalTagText}>S Movie Original</Text>
              </View>
              <Text style={styles.cardTitle}>{m.title}</Text>
              <Text style={styles.cardMeta}>
                {m.genres.join(" • ")}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  brandLetter: {
    color: "#0EA5E9",
    fontSize: 56,
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    lineHeight: 60,
  },
  brandTextWrap: {
    paddingTop: 6,
  },
  brandLine: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 4,
  },
  brandLineBig: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    marginTop: 2,
  },
  subtitle: {
    color: "#a3a3a3",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  card: {
    height: 380,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  cardImage: { ...StyleSheet.absoluteFill },
  cardGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "65%",
  },
  cardOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  originalTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229,9,20,0.9)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    marginBottom: 10,
  },
  originalTagText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  cardMeta: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
});
