/**
 * MovieAIPanel — Background Gemini enrichment for the movie detail page.
 *
 * Single Gemini call per title (24 h AsyncStorage cache) that surfaces:
 *   • AI Summary        — smarter than the raw TMDB overview
 *   • Mood Tags         — 3–4 vibe chips (Intense, Feel-good, …)
 *   • Watch Order       — franchise order when applicable (null for standalones)
 *   • Why You'll Love It — 3 punchy personalised reasons
 *
 * No VIP gate — this panel is free. GeminiRecommender handles the gated
 * "Smart Picks" carousel separately.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "@/lib/haptics";
import { loadWatchHistory } from "@/lib/watchHistory";

// ─── Gemini config ────────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

// ─── Types ────────────────────────────────────────────────────────────────────
interface AIPanelData {
  summary: string;
  moodTags: string[];
  watchOrder: string[] | null;
  whyWatch: string[];
  personalizedHook: string | null;
}

interface MovieAIPanelProps {
  title: string;
  overview: string;
  genres: string[];
  year?: string | number;
  tmdbId: number;
  mediaType: "movie" | "tv";
}

// ─── Gemini fetch ─────────────────────────────────────────────────────────────
async function fetchAIPanelData(
  title: string,
  overview: string,
  genres: string[],
  year: string | number | undefined,
  tmdbId: number,
  mediaType: "movie" | "tv",
  recentTitles: string[]
): Promise<AIPanelData | null> {
  if (!GEMINI_KEY) return null;

  const cacheKey = `smovie_ai_panel_v2_${mediaType}_${tmdbId}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data as AIPanelData;
    }
  } catch {}

  const recentContext =
    recentTitles.length > 0
      ? `The user recently watched: ${recentTitles.slice(0, 5).join(", ")}.`
      : "";

  const prompt = `You are an expert film critic and recommendation engine for S Movie Original, a premium Indian streaming app.

Title: "${title}" (${year ?? "N/A"}, ${mediaType === "tv" ? "TV Series" : "Film"})
Genres: ${genres.length > 0 ? genres.join(", ") : "Unknown"}
Overview: "${overview || "No overview available."}"
${recentContext}

Respond with ONLY a valid JSON object (no markdown, no code fences) with exactly these keys:

{
  "summary": "2-3 sentence engaging summary. Highlight what makes this special — tone, standout performances, why it matters. Do NOT repeat the overview verbatim.",
  "moodTags": ["Tag1", "Tag2", "Tag3"],
  "watchOrder": ["Title 1 (Year)", "Title 2 (Year)"] or null,
  "whyWatch": ["Short punchy reason 1", "Short punchy reason 2", "Short punchy reason 3"],
  "personalizedHook": "One sentence connecting this to the user's recent viewing taste" or null
}

Rules:
- moodTags: 3–4 items from: Intense, Feel-good, Emotional, Mind-bending, Action-packed, Dark, Funny, Romantic, Inspiring, Suspenseful, Heartwarming, Thrilling, Dramatic, Nostalgic, Thought-provoking
- watchOrder: ONLY include if this is part of a multi-film franchise (MCU, Fast & Furious, John Wick, etc.) — list the full watch order including this film. Use null for standalone films or one-off TV shows.
- whyWatch: max 10 words each, specific to THIS title
- personalizedHook: ${recentTitles.length > 0 ? "write one sentence based on the recent titles above" : "null"}`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 600 },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as AIPanelData;

    // Validate minimum shape
    if (!parsed.summary || !Array.isArray(parsed.moodTags)) return null;

    const data: AIPanelData = {
      summary: parsed.summary ?? "",
      moodTags: (parsed.moodTags ?? []).slice(0, 4),
      watchOrder: Array.isArray(parsed.watchOrder) && parsed.watchOrder.length > 1
        ? parsed.watchOrder
        : null,
      whyWatch: (parsed.whyWatch ?? []).slice(0, 3),
      personalizedHook: parsed.personalizedHook ?? null,
    };

    AsyncStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

// ─── Skeleton pulse ───────────────────────────────────────────────────────────
function SkeletonLine({ width, height = 13 }: { width: string | number; height?: number }) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View
      style={[cs.skeletonBase, { width, height, marginBottom: 7 }, { opacity: anim }] as any}
    />
  );
}

// ─── Section collapse/expand ──────────────────────────────────────────────────
function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    haptic.light();
    const next = !open;
    setOpen(next);
    Animated.timing(rotation, {
      toValue: next ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const chevronRotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={cs.section}>
      <Pressable onPress={toggle} style={cs.sectionHeader} accessibilityRole="button">
        <Ionicons name={icon} size={14} color="#a78bfa" style={{ marginRight: 6 }} />
        <Text style={cs.sectionTitle}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }], marginLeft: "auto" }}>
          <Ionicons name="chevron-down" size={14} color="#555" />
        </Animated.View>
      </Pressable>
      {open && <View style={cs.sectionBody}>{children}</View>}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MovieAIPanel({
  title,
  overview,
  genres,
  year,
  tmdbId,
  mediaType,
}: MovieAIPanelProps) {
  const [data, setData] = useState<AIPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    const history = await loadWatchHistory().catch(() => []);
    const recentTitles = history.slice(0, 8).map((h) => h.title);
    const result = await fetchAIPanelData(
      title, overview, genres, year, tmdbId, mediaType, recentTitles
    );
    setData(result);
    setLoading(false);
    if (result) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [title, overview, genres, year, tmdbId, mediaType, fadeAnim]);

  useEffect(() => {
    load();
  }, [load]);

  // Don't render at all if no key
  if (!GEMINI_KEY) return null;

  return (
    <View style={cs.wrap}>
      {/* Header row */}
      <View style={cs.headerRow}>
        <View style={cs.aiBadge}>
          <Ionicons name="sparkles" size={11} color="#fff" />
          <Text style={cs.aiBadgeText}>AI Insights</Text>
        </View>
        <Text style={cs.panelTitle}>Powered by Gemini</Text>
      </View>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <View style={cs.skeletonWrap}>
          <SkeletonLine width="92%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="60%" height={10} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <SkeletonLine width={56} height={24} />
            <SkeletonLine width={72} height={24} />
            <SkeletonLine width={48} height={24} />
          </View>
        </View>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {!loading && data && (
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* AI Summary — always open */}
          <CollapsibleSection title="AI Summary" icon="document-text-outline" defaultOpen>
            <Text style={cs.summaryText}>{data.summary}</Text>

            {/* Mood tags */}
            {data.moodTags.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={cs.tagRow}
              >
                {data.moodTags.map((tag) => (
                  <View key={tag} style={cs.moodTag}>
                    <Text style={cs.moodTagText}>{tag}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </CollapsibleSection>

          {/* Why You'll Love It */}
          {data.whyWatch.length > 0 && (
            <CollapsibleSection title="Why You'll Love It" icon="heart-outline" defaultOpen>
              {data.personalizedHook ? (
                <View style={cs.personalizedBanner}>
                  <Ionicons name="person-circle-outline" size={14} color="#a78bfa" style={{ marginRight: 6, flexShrink: 0 }} />
                  <Text style={cs.personalizedText}>{data.personalizedHook}</Text>
                </View>
              ) : null}
              {data.whyWatch.map((reason, i) => (
                <View key={i} style={cs.reasonRow}>
                  <View style={cs.reasonBullet}>
                    <Text style={cs.reasonBulletText}>{i + 1}</Text>
                  </View>
                  <Text style={cs.reasonText}>{reason}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}

          {/* Watch Order — only shown for franchise films */}
          {data.watchOrder && data.watchOrder.length > 1 && (
            <CollapsibleSection title="Watch Order" icon="list-outline">
              <Text style={cs.watchOrderNote}>
                This title is part of a franchise. Here's the recommended order:
              </Text>
              {data.watchOrder.map((entry, i) => {
                const isCurrent = entry.toLowerCase().includes(title.toLowerCase().slice(0, 8));
                return (
                  <View key={i} style={[cs.watchOrderRow, isCurrent && cs.watchOrderRowActive]}>
                    <View style={[cs.watchOrderNum, isCurrent && cs.watchOrderNumActive]}>
                      <Text style={[cs.watchOrderNumText, isCurrent && cs.watchOrderNumTextActive]}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={[cs.watchOrderTitle, isCurrent && cs.watchOrderTitleActive]} numberOfLines={1}>
                      {entry}
                    </Text>
                    {isCurrent && (
                      <View style={cs.nowBadge}>
                        <Text style={cs.nowBadgeText}>Now</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </CollapsibleSection>
          )}

        </Animated.View>
      )}

      {/* No data / no key — silently hide */}
      {!loading && !data && null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  wrap: {
    marginTop: 20,
    marginBottom: 4,
    marginHorizontal: 16,
    backgroundColor: "#0d0d16",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e1a2e",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a28",
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4c1d95",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  panelTitle: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  skeletonWrap: {
    padding: 14,
    paddingTop: 12,
  },
  skeletonBase: {
    borderRadius: 6,
    backgroundColor: "#2a2a2a",
  },

  // ── Section ──────────────────────────────────────────────────────────────
  section: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a28",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  // ── Summary ───────────────────────────────────────────────────────────────
  summaryText: {
    color: "#bbb",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 12,
  },
  tagRow: {
    gap: 8,
    paddingBottom: 2,
  },
  moodTag: {
    backgroundColor: "#1e1a2e",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2d2550",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  moodTagText: {
    color: "#a78bfa",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  // ── Why You'll Love It ────────────────────────────────────────────────────
  personalizedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1a1230",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d2550",
    padding: 10,
    marginBottom: 12,
  },
  personalizedText: {
    color: "#c4b5fd",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    flex: 1,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  reasonBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1e1a2e",
    borderWidth: 1,
    borderColor: "#2d2550",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  reasonBulletText: {
    color: "#a78bfa",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  reasonText: {
    color: "#bbb",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },

  // ── Watch Order ───────────────────────────────────────────────────────────
  watchOrderNote: {
    color: "#666",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
    lineHeight: 16,
  },
  watchOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#141420",
  },
  watchOrderRowActive: {
    backgroundColor: "#12102a",
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderBottomColor: "transparent",
  },
  watchOrderNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2d2550",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  watchOrderNumActive: {
    backgroundColor: "#4c1d95",
    borderColor: "#7c3aed",
  },
  watchOrderNumText: {
    color: "#666",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  watchOrderNumTextActive: {
    color: "#fff",
  },
  watchOrderTitle: {
    color: "#999",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  watchOrderTitleActive: {
    color: "#e5e5e5",
    fontFamily: "Inter_700Bold",
  },
  nowBadge: {
    backgroundColor: "#E50914",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  nowBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
