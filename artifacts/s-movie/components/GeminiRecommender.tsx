import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Modal,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tmdb, tmdbImg } from "@/lib/tmdb";
import SmartImage from "@/components/SmartImage";
import { haptic } from "@/lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import { firebaseAuth } from "@/lib/firebase";
import { getVIPStatus } from "@/lib/subscription";
import SubscriptionScreen from "@/components/SubscriptionScreen";

const { width: W } = Dimensions.get("window");
const CARD_W = Math.round(W * 0.28);
const CARD_H = Math.round(CARD_W * 1.5);

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const CACHE_TTL = 4 * 60 * 60 * 1000;

interface RecommendCard {
  id: string;
  title: string;
  posterUri: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  reason?: string;
}

async function fetchGeminiRecommendations(
  movieTitle: string,
  genres: string[],
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<RecommendCard[]> {
  if (!GEMINI_API_KEY) return [];

  const cacheKey = `smovie_gemini_recs_${mediaType}_${tmdbId}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch {}

  const prompt = `You are a movie recommendation engine. The user just watched "${movieTitle}" (${genres.join(", ")}).
Recommend 6 similar ${mediaType === "tv" ? "TV shows" : "movies"} that fans of this title would enjoy.
For each, provide the exact TMDB ID, title, and a 1-sentence reason.

Respond with ONLY a JSON array (no markdown, no code blocks) like:
[{"tmdbId": 12345, "title": "Movie Name", "mediaType": "${mediaType}", "reason": "Similar because..."}]

Use only well-known titles with accurate TMDB IDs. No placeholder IDs.`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const items: Array<{
      tmdbId: number;
      title: string;
      mediaType: "movie" | "tv";
      reason?: string;
    }> = JSON.parse(match[0]);

    const cards: RecommendCard[] = [];
    for (const item of items.slice(0, 6)) {
      if (!item.tmdbId || !item.title) continue;
      try {
        const mt = item.mediaType ?? mediaType;
        const detail = await tmdb.detail(mt, item.tmdbId);
        if (!detail?.poster_path) continue;
        cards.push({
          id: `tmdb-${item.tmdbId}`,
          title: item.title,
          posterUri: tmdbImg(detail.poster_path, "w342") ?? "",
          mediaType: mt,
          tmdbId: item.tmdbId,
          reason: item.reason,
        });
      } catch {}
    }

    if (cards.length > 0) {
      AsyncStorage.setItem(cacheKey, JSON.stringify({ data: cards, ts: Date.now() })).catch(() => {});
    }
    return cards;
  } catch {
    return [];
  }
}

interface GeminiRecommenderProps {
  movieTitle: string;
  genres: string[];
  tmdbId: number;
  mediaType: "movie" | "tv";
}

export default function GeminiRecommender({
  movieTitle,
  genres,
  tmdbId,
  mediaType,
}: GeminiRecommenderProps) {
  const [cards, setCards] = useState<RecommendCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVIP, setIsVIP] = useState<boolean | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);

  const uid = firebaseAuth.currentUser?.uid ?? null;

  useEffect(() => {
    getVIPStatus(uid).then(setIsVIP).catch(() => setIsVIP(false));
  }, [uid]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchGeminiRecommendations(
      movieTitle,
      genres,
      tmdbId,
      mediaType
    );
    setCards(result);
    setLoading(false);
  }, [movieTitle, genres, tmdbId, mediaType]);

  useEffect(() => {
    if (isVIP === true) load();
  }, [isVIP, load]);

  if (!GEMINI_API_KEY) return null;
  if (isVIP === null) return null; // still loading VIP status

  // ── VIP Gate — non-VIP users see a locked teaser ─────────────────────────
  if (!isVIP) {
    return (
      <>
        <View style={styles.wrap}>
          <View style={styles.headerRow}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={12} color="#fff" />
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
            <Text style={styles.title}>Smart Picks for You</Text>
            <View style={styles.vipBadge}>
              <Ionicons name="star" size={11} color="#FFD700" />
              <Text style={styles.vipBadgeText}>VIP</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Gemini AI picks movies just for you, every day
          </Text>
          <Pressable
            style={({ pressed }) => [styles.lockedCard, pressed && { opacity: 0.85 }]}
            onPress={() => setShowSubModal(true)}
          >
            <View style={styles.lockIconWrap}>
              <Ionicons name="star" size={32} color="#FFD700" />
            </View>
            <Text style={styles.lockedTitle}>AI Pro · VIP Feature</Text>
            <Text style={styles.lockedSub}>
              Unlock Gemini AI recommendations for just ₹5
            </Text>
            <View style={styles.unlockBtn}>
              <Text style={styles.unlockBtnText}>Go VIP · ₹5/month</Text>
            </View>
          </Pressable>
        </View>
        <Modal visible={showSubModal} animationType="slide" statusBarTranslucent onRequestClose={() => setShowSubModal(false)}>
          <SubscriptionScreen onClose={() => {
            setShowSubModal(false);
            getVIPStatus(uid).then((v) => { setIsVIP(v); if (v) load(); }).catch(() => {});
          }} />
        </Modal>
      </>
    );
  }

  if (!loading && cards.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={12} color="#fff" />
          <Text style={styles.aiBadgeText}>AI</Text>
        </View>
        <Text style={styles.title}>Smart Picks for You</Text>
      </View>
      <Text style={styles.subtitle}>
        Gemini AI picked these based on {movieTitle}
      </Text>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#E50914" size="small" />
          <Text style={styles.loaderText}>AI is thinking…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {cards.map((card) => (
            <Pressable
              key={card.id}
              onPress={() => {
                haptic.light();
                router.push({
                  pathname: "/movie/[id]",
                  params: { id: card.id, type: card.mediaType },
                });
              }}
            >
              {({ pressed }) => (
                <View style={[styles.card, pressed && { opacity: 0.75 }]}>
                  <SmartImage
                    source={{ uri: card.posterUri }}
                    style={styles.poster}
                    contentFit="cover"
                    cachePolicy="disk"
                    title={card.title}
                  />
                  {card.reason ? (
                    <View style={styles.reasonOverlay}>
                      <Text style={styles.reasonText} numberOfLines={2}>
                        {card.reason}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  aibadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  aiBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  subtitle: {
    color: "#666",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  vipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1a1200",
    borderWidth: 1,
    borderColor: "#FFD700",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  vipBadgeText: {
    color: "#FFD700",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  lockedCard: {
    marginHorizontal: 16,
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a1a00",
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  lockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#1a1200",
    borderWidth: 1,
    borderColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  lockedTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  lockedSub: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  unlockBtn: {
    marginTop: 8,
    backgroundColor: "#FFD700",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  unlockBtnText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  loader: {
    height: CARD_H,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loaderText: {
    color: "#666",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
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
  reasonOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 6,
  },
  reasonText: {
    color: "#e5e5e5",
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    lineHeight: 12,
  },
});
