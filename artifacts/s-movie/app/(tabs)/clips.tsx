/**
 * Clips — Instagram Reels-style vertical feed
 *
 * • Full-screen vertical snap scroll
 * • Right-side action bar (Play Trailer, Info, Share)
 * • Bottom-left: title, overview, meta
 * • Auto-plays a TMDB-listed preview when card is visible
 * • Starts muted for autoplay reliability, with an explicit sound toggle
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewabilityConfig,
  ViewToken,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SmartImage from "@/components/SmartImage";
import { tmdb, tmdbImg } from "@/lib/tmdb";
import { haptic } from "@/lib/haptics";
import { useNetworkStatus } from "@/contexts/NetworkContext";
import {
  getCachedVideos,
  setCachedVideos,
  prefetchVideos,
  type VideoEntry,
} from "@/lib/trailerCache";

const { width: W, height: H } = Dimensions.get("window");
const CLIP_H = H;

interface ClipItem {
  id: number;
  tmdbId: number;
  title: string;
  backdropUri: string | null;
  posterUri: string | null;
  videoKey: string | null;
  videoType: string;
  overview: string;
  mediaType: "movie" | "tv";
  year: string;
  rating: number;
  genre: string;
}

const CLIPS_CACHE_KEY = "smovie_clips_feed_v1";

function isClipItem(value: unknown): value is ClipItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClipItem>;
  return typeof item.id === "number" &&
    typeof item.tmdbId === "number" &&
    typeof item.title === "string" &&
    (item.mediaType === "movie" || item.mediaType === "tv") &&
    typeof item.videoKey === "string" &&
    Boolean(item.backdropUri || item.posterUri);
}

async function loadClipsCache(): Promise<ClipItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CLIPS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { clips?: unknown[] } | unknown[];
    const items = Array.isArray(parsed) ? parsed : parsed.clips;
    return Array.isArray(items) ? items.filter(isClipItem) : [];
  } catch {
    return [];
  }
}

// ─── TMDB video embed ─────────────────────────────────────────────────────────

function YoutubeEmbed({
  videoKey,
  muted = false,
  autoplay = false,
}: {
  videoKey: string;
  muted?: boolean;
  autoplay?: boolean;
}) {
  const params = [
    autoplay ? "autoplay=1" : "autoplay=0",
    muted ? "mute=1" : "mute=0",
    "rel=0",
    "controls=" + (muted ? "0" : "1"),
    "modestbranding=1",
    "playsinline=1",
    muted ? `loop=1&playlist=${videoKey}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const embedUrl = `https://www.youtube.com/embed/${videoKey}?${params}`;

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <iframe
          src={embedUrl}
          style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" } as any}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </View>
    );
  }

  let NativeWebView: React.ComponentType<any> | null = null;
  try { NativeWebView = require("react-native-webview").WebView; } catch {}

  if (!NativeWebView) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", textAlign: "center", paddingHorizontal: 32 }}>
          Trailer unavailable.
        </Text>
      </View>
    );
  }

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;background:#000}html,body{width:100%;height:100%}iframe{width:100%;height:100%}</style></head><body><iframe src="${embedUrl}" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe></body></html>`;

  return (
    <NativeWebView
      source={{ html }}
      style={{ flex: 1, backgroundColor: "#000" }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      scrollEnabled={false}
    />
  );
}

// ─── Right-side action button ─────────────────────────────────────────────────

function ActionBtn({
  icon,
  label,
  onPress,
  color = "#fff",
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.75}>
      {icon}
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Single clip card ─────────────────────────────────────────────────────────

interface ClipCardProps {
  item: ClipItem;
  isVisible: boolean;
  isAdjacent?: boolean;
}

const ClipCard = React.memo(function ClipCard({ item, isVisible, isAdjacent }: ClipCardProps) {
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const handleLike = useCallback(() => {
    haptic.medium();
    setLiked((v) => !v);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 30 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 30 }),
    ]).start();
  }, [heartScale]);

  const handleTrailer = useCallback(() => {
    if (!item.videoKey) {
      haptic.light();
      router.push({ pathname: "/movie/[id]", params: { id: `tmdb-${item.tmdbId}`, type: item.mediaType, title_param: item.title } });
      return;
    }
    haptic.medium();
    setShowTrailerModal(true);
  }, [item]);

  const handleInfo = useCallback(() => {
    haptic.light();
    router.push({ pathname: "/movie/[id]", params: { id: `tmdb-${item.tmdbId}`, type: item.mediaType, title_param: item.title } });
  }, [item]);

  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        message: `Watch "${item.title}" on S-Movie!\nhttps://www.themoviedb.org/${item.mediaType}/${item.tmdbId}`,
        title: item.title,
      });
    } catch {}
  }, [item]);

  const handleSave = useCallback(() => {
    haptic.light();
    setSaved((v) => !v);
  }, []);

  const handleToggleSound = useCallback(() => {
    // A user gesture is required by browsers and some WebViews before audio
    // can start. Re-mounting the embed with mute=0 lets YouTube honor it.
    haptic.light();
    setMuted((value) => !value);
  }, []);

  // Genre chip color
  const genreColor = item.mediaType === "tv" ? "#8B5CF6" : "#E50914";

  return (
    <View style={[styles.card, { height: CLIP_H }]}>
      {/* Background thumbnail */}
      <SmartImage
        source={
          item.backdropUri ? { uri: item.backdropUri }
          : item.posterUri  ? { uri: item.posterUri }
          : null
        }
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
      />

      {/* TMDB-listed preview (muted until the viewer enables sound) */}
      {(isVisible || isAdjacent) && item.videoKey ? (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: isVisible ? 1 : -1, opacity: isVisible ? 1 : 0 }]}
          pointerEvents={isVisible ? "auto" : "none"}
        >
          <YoutubeEmbed videoKey={item.videoKey} muted={muted} autoplay={isVisible} />
        </View>
      ) : null}

      {/* Gradient: heavy at bottom, light at top */}
      <LinearGradient
        colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.92)"]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Right-side action bar ───────────────────────────────────────────── */}
      <View style={[styles.rightBar, { bottom: insets.bottom + 100 }]} pointerEvents="box-none">

        {/* Audio — starts muted so the visible card can autoplay, then enables
            sound from a real user gesture. */}
        {item.videoKey ? (
          <ActionBtn
            icon={
              <Ionicons
                name={muted ? "volume-mute-outline" : "volume-high-outline"}
                size={30}
                color="#fff"
              />
            }
            label={muted ? "Sound" : "Mute"}
            onPress={handleToggleSound}
          />
        ) : null}

        {/* Like */}
        <ActionBtn
          icon={
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={32}
                color={liked ? "#E50914" : "#fff"}
              />
            </Animated.View>
          }
          label={liked ? "Liked" : "Like"}
          onPress={handleLike}
          color={liked ? "#E50914" : "#fff"}
        />

        {/* Play Trailer */}
        <ActionBtn
          icon={
            <View style={styles.playCircle}>
              <Ionicons name="play" size={20} color="#000" />
            </View>
          }
          label="Trailer"
          onPress={handleTrailer}
        />

        {/* Info */}
        <ActionBtn
          icon={<Ionicons name="information-circle-outline" size={32} color="#fff" />}
          label="Info"
          onPress={handleInfo}
        />

        {/* Save */}
        <ActionBtn
          icon={
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={30}
              color={saved ? "#FBBF24" : "#fff"}
            />
          }
          label={saved ? "Saved" : "Save"}
          onPress={handleSave}
          color={saved ? "#FBBF24" : "#fff"}
        />

        {/* Share */}
        <ActionBtn
          icon={<Ionicons name="paper-plane-outline" size={28} color="#fff" />}
          label="Share"
          onPress={handleShare}
        />
      </View>

      {/* ── Bottom-left content ─────────────────────────────────────────────── */}
      <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 100, paddingRight: 90 }]} pointerEvents="box-none">

        {/* Genre + video-type badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.chip, { backgroundColor: genreColor + "CC" }]}>
            <Text style={styles.chipText}>{item.genre}</Text>
          </View>
          {item.videoType && item.videoKey && (
            <View style={[styles.chip, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Text style={styles.chipText}>{item.videoType}</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

        {/* Meta: year */}
        <View style={styles.metaRow}>
          {item.year ? <Text style={styles.metaText}>{item.year}</Text> : null}
        </View>

        {/* Overview */}
        {item.overview ? (
          <Text style={styles.overview} numberOfLines={2}>{item.overview}</Text>
        ) : null}

        {/* Sound/music bar — Instagram Reels-style */}
        <View style={styles.musicRow}>
          <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.musicText} numberOfLines={1}>
            {item.title} · Original Sound
          </Text>
        </View>
      </View>

      {/* Full-screen TMDB video modal */}
      <Modal visible={showTrailerModal} animationType="slide" onRequestClose={() => setShowTrailerModal(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <YoutubeEmbed videoKey={item.videoKey!} autoplay />
          <Pressable style={styles.closeBtn} onPress={() => setShowTrailerModal(false)}>
            <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
});

// ─── Main Clips Screen ────────────────────────────────────────────────────────

export default function ClipsScreen() {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [usingCachedFeed, setUsingCachedFeed] = useState(false);

  const fetchClips = useCallback(async () => {
    if (isOffline) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [moviesPage, tvPage] = await Promise.allSettled([
        tmdb.trendingMovies(1),
        tmdb.trendingTV(1),
      ]);

      const movies  = moviesPage.status === "fulfilled" ? moviesPage.value.results.slice(0, 12) : [];
      const tvShows = tvPage.status    === "fulfilled" ? tvPage.value.results.slice(0, 8)    : [];

      const combined = [
        ...movies.map((m: any)  => ({ ...m, media_type: "movie" as const })),
        ...tvShows.map((t: any) => ({ ...t, media_type: "tv"    as const })),
      ]
        .sort(() => Math.random() - 0.5)
        .slice(0, 20);

      const withVideos = await Promise.all(
        combined.map(async (item: any) => {
          let videoKey: string | null = null;
          let videoType = "";
          try {
            const mt: "movie" | "tv" = item.media_type;
            let videos: VideoEntry[] | null = await getCachedVideos(item.id, mt);
            if (!videos) {
              const res = await tmdb.videos(mt, item.id);
              const tmdbVideos = (res.results ?? []).filter(
                (v: any) =>
                  v.site === "YouTube" &&
                  (v.type === "Clip" || v.type === "Teaser"),
              ) as VideoEntry[];
              await setCachedVideos(item.id, mt, tmdbVideos);
              videos = tmdbVideos;
            }
            // Only use clips and teasers explicitly listed by TMDB.
            const clip = videos.find((v) => v.type === "Clip");
            const pick = clip ?? videos.find((v) => v.type === "Teaser");
            if (pick) { videoKey = pick.key; videoType = pick.type; }
          } catch {}

          return {
            id:          item.id,
            tmdbId:      item.id,
            title:       item.title ?? item.name ?? "Untitled",
            backdropUri: item.backdrop_path ? tmdbImg(item.backdrop_path, "w780") : null,
            posterUri:   item.poster_path   ? tmdbImg(item.poster_path,   "w342")     : null,
            videoKey,
            videoType,
            overview:    item.overview ?? "",
            mediaType:   item.media_type,
            year:        (item.release_date ?? item.first_air_date ?? "").slice(0, 4),
            rating:      Math.round((item.vote_average ?? 0) * 10) / 10,
            genre:       item.media_type === "tv" ? "TV Show" : "Movie",
          } as ClipItem;
        }),
      );

      // A card without a TMDB-listed clip/teaser cannot occupy a feed page.
      const nextClips = withVideos.filter((c) => c.videoKey && (c.backdropUri || c.posterUri));
      setClips(nextClips);
      setUsingCachedFeed(false);
      await AsyncStorage.setItem(
        CLIPS_CACHE_KEY,
        JSON.stringify({ clips: nextClips, savedAt: Date.now() }),
      );
    } catch (e) {
      console.warn("[ClipsScreen] fetch error:", e);
      setUsingCachedFeed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => {
    let cancelled = false;
    loadClipsCache().then((cached) => {
      if (cancelled || cached.length === 0) return;
      setClips(cached);
      setUsingCachedFeed(true);
      setLoading(false);
    }).finally(() => {
      if (!cancelled) fetchClips();
    });
    return () => { cancelled = true; };
  }, [fetchClips]);

  useEffect(() => {
    if (clips.length === 0) return;
    const upcoming = clips
      .slice(visibleIndex + 1, visibleIndex + 3)
      .map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType }));
    if (upcoming.length === 0) return;
    prefetchVideos(upcoming, tmdb.videos.bind(tmdb)).catch(() => {});
  }, [visibleIndex, clips]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchClips(); }, [fetchClips]);

  const viewabilityConfig = useRef<ViewabilityConfig>({ viewAreaCoveragePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null)
        setVisibleIndex(viewableItems[0].index);
    },
  ).current;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.loadingText}>Loading clips…</Text>
      </View>
    );
  }

  if (clips.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="film-outline" size={52} color="#404040" />
        <Text style={styles.emptyText}>No clips available</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchClips}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {(isOffline || usingCachedFeed) && clips.length > 0 ? (
        <View style={[styles.cacheBanner, { top: insets.top + 40 }]}>
          <Ionicons name="cloud-offline-outline" size={14} color="#FBBF24" />
          <Text style={styles.cacheBannerText}>
            {isOffline ? "Offline · Showing saved clips" : "Showing saved clips"}
          </Text>
        </View>
      ) : null}
      {/* Floating header — Instagram Reels style */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="none">
        <Text style={styles.headerTitle}>Clips</Text>
        <View style={styles.headerUnderline} />
      </View>

      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => (
          <ClipCard
            item={item}
            isVisible={index === visibleIndex}
            isAdjacent={index === visibleIndex + 1}
          />
        )}
        pagingEnabled
        snapToInterval={CLIP_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onRefresh={onRefresh}
        refreshing={refreshing}
        getItemLayout={(_, index) => ({ length: CLIP_H, offset: CLIP_H * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1, backgroundColor: "#000",
    justifyContent: "center", alignItems: "center", gap: 12,
  },
  loadingText: { color: "#737373", fontSize: 14, marginTop: 8 },
  emptyText:   { color: "#737373", fontSize: 16 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: "#E50914", borderRadius: 8,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cacheBanner: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 250,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(18,18,18,0.88)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.3)",
  },
  cacheBannerText: { color: "#D4D4D4", fontSize: 12, fontWeight: "600" },

  // Floating header
  header: {
    position: "absolute", top: 0, left: 0, right: 0,
    zIndex: 200, paddingHorizontal: 18, paddingBottom: 6,
    alignItems: "flex-start",
  },
  headerTitle: {
    color: "#fff", fontSize: 20, fontWeight: "700", letterSpacing: 0.3,
  },
  headerUnderline: {
    marginTop: 3, width: 28, height: 2.5,
    backgroundColor: "#E50914", borderRadius: 2,
  },

  // Card
  card: { width: W, position: "relative", overflow: "hidden" },

  // Right-side action bar (Instagram Reels style)
  rightBar: {
    position: "absolute", right: 12,
    alignItems: "center", gap: 22, zIndex: 20,
  },
  actionBtn: { alignItems: "center", gap: 4 },
  actionLabel: {
    color: "#fff", fontSize: 11, fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },

  // Bottom-left content
  bottomContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, gap: 6, zIndex: 10,
  },
  badgeRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: {
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 5,
  },
  chipText: {
    color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.4,
  },
  title: {
    color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 28,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  dot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  overview: {
    color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 18,
  },
  musicRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2,
  },
  musicText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12, flex: 1,
  },

  closeBtn: { position: "absolute", top: 52, right: 16, zIndex: 100 },
});
