import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useMyList } from "@/contexts/MyListContext";
import SmartImage from "@/components/SmartImage";
import { haptic } from "@/lib/haptics";

const { width: W } = Dimensions.get("window");
const CARD_W = Math.round(W * 0.28);
const CARD_H = Math.round(CARD_W * 1.5);
const GAP = 8;

/**
 * My List — served entirely from MyListContext (AsyncStorage-backed), no TMDB
 * fetch involved. Renders nothing when the list is empty, so no empty/placeholder
 * box is ever shown.
 */
export default function MyListRow() {
  const { allItems } = useMyList();

  if (allItems.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.titleText}>My List</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}
      >
        {allItems.slice(0, 20).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              haptic.light();
              router.push({
                pathname: "/movie/[id]",
                params: { id: item.id, type: item.mediaType },
              });
            }}
          >
            {({ pressed }) => (
              <View style={[styles.card, pressed && { opacity: 0.78 }]}>
                {item.posterUri ? (
                  <SmartImage
                    source={{ uri: item.posterUri }}
                    style={styles.poster}
                    contentFit="cover"
                    cachePolicy="disk"
                    title={item.title}
                  />
                ) : null}
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 11,
  },
  titleText: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1c1c1c",
  },
  poster: {
    width: "100%",
    height: "100%",
    aspectRatio: 2 / 3,
  },
});
