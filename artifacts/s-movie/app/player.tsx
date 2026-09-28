import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import SmartImage from "@/components/SmartImage";
import { findMovie } from "@/data/movies";
import { haptic } from "@/lib/haptics";
import { tmdb, tmdbImg, proxyUrl, type TMDBEpisode, type TMDBDetail } from "@/lib/tmdb";
import { loadProgress, saveProgress } from "@/lib/watchProgress";
import { trackWatchCompletion } from "@/lib/userPreferences";
import {
  getDownloadRecord,
  deleteDownload as deleteDownloadFile,
  isDirectVideoUrl,
  type DownloadStatus,
} from "@/lib/downloads";
import { useDownloads } from "@/contexts/DownloadContext";
import { getAccountSuspended, addSuspensionListener } from "@/lib/suspensionState";
import { getIdentity } from "@/lib/identity";
import {
  type ExtractionSource,
  type ExtractionSubtitle,
} from "@/lib/extraction";
import { getMovieBoxPlayback } from "@/lib/movieboxApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Japanese",
  "Korean",
  "Spanish",
] as const;

const SUBTITLES = ["Off", "English", "Hindi", "Tamil", "Telugu", "Japanese", "Korean"] as const;

const SPEEDS = [
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "1x (Normal)", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
] as const;

const QUALITIES = [
  "Auto",
  "2160p (4K)",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
  "240p",
] as const;

const SUBTITLE_FONT_SIZES = [
  { label: "Small", value: 12 },
  { label: "Medium", value: 16 },
  { label: "Large", value: 20 },
  { label: "X-Large", value: 24 },
] as const;

const SUBTITLE_COLORS = [
  { label: "White", value: "#FFFFFF" },
  { label: "Yellow", value: "#FFFF00" },
  { label: "Cyan", value: "#00FFFF" },
  { label: "Green", value: "#00FF00" },
] as const;

type Language = (typeof LANGUAGES)[number];
type Subtitle = (typeof SUBTITLES)[number];
type SpeedValue = (typeof SPEEDS)[number]["value"];
type Quality = (typeof QUALITIES)[number];

const AUTO_HIDE_MS = 3000;

type SubtitleCue = { start: number; end: number; text: string };

function parseSubtitleTimestamp(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseSubtitleCues(text: string): SubtitleCue[] {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return blocks.flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) return [];
    const [start, end] = lines[timingIndex].split("-->").map((value) => value.trim().split(/\s+/)[0]);
    const cueText = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "");
    if (!cueText) return [];
    return [{
      start: parseSubtitleTimestamp(start),
      end: parseSubtitleTimestamp(end),
      text: cueText,
    }];
  });
}

// ─── PlayerScreen (outer shell) ────────────────────────────────────────────────

export default function PlayerScreen() {
  const { id, season, episode, type, hdhubUrl, directUrl, title_param, genre_ids } = useLocalSearchParams<{
    id: string;
    season?: string;
    episode?: string;
    type?: string;
    hdhubUrl?: string;
    directUrl?: string;
    title_param?: string;
    genre_ids?: string;
  }>();
  const movie = findMovie(id ?? "");
  const routeGenreIds = useMemo(
    () => (genre_ids ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
    [genre_ids],
  );
  const [completionGenreIds, setCompletionGenreIds] = useState<number[]>(routeGenreIds);

  const { width: winW, height: winH } = useWindowDimensions();
  const isPortraitWeb = Platform.OS === "web" && winH > winW;

  // ─── Suspension gate ─────────────────────────────────────────────────────────
  const [suspended, setSuspended] = useState<{ reason: string } | null>(getAccountSuspended());
  const [suspensionChecked, setSuspensionChecked] = useState(false);

  useEffect(() => {
    // Check identity API for suspension status on mount
    getIdentity().then((identity) => {
      if (identity?.isSuspended) {
        setSuspended({ reason: identity.suspensionReason ?? "Your account has been suspended." });
      }
      setSuspensionChecked(true);
    }).catch(() => setSuspensionChecked(true));

    // Also listen for runtime suspension signals from apiClient
    const unsub = addSuspensionListener((info) => setSuspended(info));
    return () => unsub();
  }, []);

  const [orientationLocked, setOrientationLocked] = useState(false);
  const [streamResult, setStreamResult] = useState<{
    url: string;
    subtitles: any;
    isEmbed: boolean;
    source?: string;
    allSources: Array<{ url: string; source: string; isEmbed: boolean }>;
    currentIndex: number;
    isAutoSwitching: boolean;
    qualitySources?: ExtractionSource[];
    subtitleTracks?: ExtractionSubtitle[];
    extractionWarnings?: string[];
  } | null>(null);


  const [seasons, setSeasons] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [showServerModal, setShowServerModal] = useState(false);

  const ready = streamResult !== null && !streamResult.isAutoSwitching && autoplayCountdown === null;

  // ─── Resolve TMDB ID ──────────────────────────────────────────────────────────
  const tmdbId = (() => {
    if (id?.startsWith("tmdb-")) {
      const n = parseInt(id.replace("tmdb-", ""), 10);
      if (!isNaN(n)) return n;
    }
    const raw = (movie as any)?.tmdbId as number | undefined;
    if (raw) return raw;
    return null;
  })();

  const isTV =
    type === "tv" ||
    (movie as any)?.mediaType === "tv" ||
    Boolean(movie?.episodes && movie.episodes.length > 0);

  const currentSeason = season ? parseInt(season, 10) : 1;
  const currentEpisode = episode ? parseInt(episode, 10) : 1;

  // A quick tap can open the player before the detail screen has finished
  // loading its genre metadata. Resolve it here as a fallback so completed
  // watches still influence the user's genre recommendations.
  useEffect(() => {
    if (routeGenreIds.length > 0 || !tmdbId) {
      if (routeGenreIds.length > 0) setCompletionGenreIds(routeGenreIds);
      return;
    }
    tmdb
      .detail(isTV ? "tv" : "movie", tmdbId)
      .then((detail) => {
        const ids = (detail.genres ?? []).map((genre) => genre.id);
        if (ids.length > 0) setCompletionGenreIds(ids);
      })
      .catch(() => {});
  }, [tmdbId, isTV, routeGenreIds.join(",")]);

  // ─── Auth gate ────────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [authedUser, setAuthedUser] = useState<boolean>(false);
  useEffect(() => {
    let settled = false;
    const settle = (user: boolean) => {
      if (settled) return;
      settled = true;
      setAuthedUser(user);
      setAuthChecked(true);
    };
    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthStateChanged(firebaseAuth, (u) => settle(!!u));
    } catch {
      settle(false);
    }
    const timer = setTimeout(() => settle(false), 3000);
    return () => { unsub?.(); clearTimeout(timer); };
  }, []);

  // ─── TV metadata ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTV || !tmdbId) return;
    setLoadingMetadata(true);
    tmdb.detail("tv", tmdbId).then(detail => {
      const s = (detail.seasons ?? []).filter((x: any) => x.episode_count > 0);
      setSeasons(s);
      const sNum = s.find((x: any) => x.season_number === currentSeason)?.season_number ?? currentSeason;
      return tmdb.seasonDetail(tmdbId, sNum);
    }).then(res => {
      setEpisodes(res.episodes || []);
    }).catch(() => {}).finally(() => setLoadingMetadata(false));
  }, [tmdbId, isTV, currentSeason]);

  const getNextEpisode = useCallback(() => {
    if (!isTV) return null;
    const epIdx = episodes.findIndex(e => e.episode_number === currentEpisode);
    if (epIdx !== -1 && epIdx < episodes.length - 1) {
      return { season: currentSeason, episode: episodes[epIdx + 1].episode_number };
    }
    const sIdx = seasons.findIndex(s => s.season_number === currentSeason);
    if (sIdx !== -1 && sIdx < seasons.length - 1) {
      return { season: seasons[sIdx + 1].season_number, episode: 1 };
    }
    return null;
  }, [isTV, episodes, seasons, currentEpisode, currentSeason]);

  const getPrevEpisode = useCallback(() => {
    if (!isTV) return null;
    const epIdx = episodes.findIndex(e => e.episode_number === currentEpisode);
    if (epIdx > 0) {
      return { season: currentSeason, episode: episodes[epIdx - 1].episode_number };
    }
    const sIdx = seasons.findIndex(s => s.season_number === currentSeason);
    if (sIdx > 0) {
      const prevSeason = seasons[sIdx - 1];
      return { season: prevSeason.season_number, episode: prevSeason.episode_count ?? 1 };
    }
    return null;
  }, [isTV, episodes, seasons, currentEpisode, currentSeason]);

  const startNextEpisode = useCallback(() => {
    const next = getNextEpisode();
    if (next) {
      router.setParams({ season: String(next.season), episode: String(next.episode) });
      setStreamResult(null);
    }
    setAutoplayCountdown(null);
  }, [getNextEpisode]);

  useEffect(() => {
    if (autoplayCountdown === null) return;
    if (autoplayCountdown <= 0) { startNextEpisode(); return; }
    const timer = setTimeout(() => setAutoplayCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [autoplayCountdown, startNextEpisode]);

  const s = currentSeason;
  const e = currentEpisode;

  // ─── Fetch stream URL ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadStream = async () => {
      // ── Step 1: Local download ────────────────────────────────────────────────
      const localMovieId = id || movie?.id;
      if (localMovieId) {
        const rec = await getDownloadRecord(localMovieId).catch(() => null);
        if (!cancelled && rec?.status === "complete" && rec.localPath) {
          setStreamResult({
            url: rec.localPath,
            subtitles: false,
            isEmbed: false,
            source: "Local Download",
            allSources: [{ url: rec.localPath, source: "Local Download", isEmbed: false }],
            currentIndex: 0,
            isAutoSwitching: false,
          });
          return;
        }
      }

      // ── Step 2: MovieBox/Aoneroom online playback ────────────────────────────
      const movieBoxTitle = title_param || movie?.title || id || "";
      if (movieBoxTitle.trim()) {
        try {
          const playback = await getMovieBoxPlayback(
            movieBoxTitle,
            isTV ? s : 0,
            isTV ? e : 0,
          );
          if (!cancelled && playback?.url) {
            setStreamResult({
              url: playback.url,
              subtitles: false,
              isEmbed: false,
              source: "MovieBox / Aoneroom",
              allSources: [{ url: playback.url, source: "MovieBox / Aoneroom", isEmbed: false }],
              currentIndex: 0,
              isAutoSwitching: false,
            });
            return;
          }
        } catch {
          // Show the unavailable state below when no playable URL is returned.
        }
      }

      // ── Step 3: MovieBox has no playable URL ────────────────────────────────
      if (!cancelled) {
        setStreamResult({
          url: "",
          subtitles: false,
          isEmbed: false,
          source: "none",
          allSources: [],
          currentIndex: 0,
          isAutoSwitching: false,
        });
      }
    };

    loadStream();
    return () => { cancelled = true; };
  }, [id, season, episode, isTV, tmdbId, directUrl]);

  // ─── Lock landscape orientation ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const lockLandscape = async () => {
      try {
        if (Platform.OS === "web") {
          const screen: any = (typeof window !== "undefined" && window.screen) || null;
          if (screen?.orientation?.lock) {
            try { await screen.orientation.lock("landscape"); } catch { }
          }
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        }
        if (mounted) setOrientationLocked(true);
      } catch { }
    };
    lockLandscape();
    return () => {
      mounted = false;
      const restore = async () => {
        try {
          if (Platform.OS === "web") {
            const screen: any = (typeof window !== "undefined" && window.screen) || null;
            if (screen?.orientation?.unlock) { try { screen.orientation.unlock(); } catch { } }
          } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          }
        } catch { }
      };
      restore();
    };
  }, []);

  const handleBack = async () => {
    try {
      if (Platform.OS !== "web") {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch { }
    router.back();
  };

  const tryNextSource = () => {
    if (!streamResult) return;
    const nextIdx = streamResult.currentIndex + 1;
    if (nextIdx < streamResult.allSources.length) {
      const nextSource = streamResult.allSources[nextIdx];
      setStreamResult({
        ...streamResult,
        url: nextSource.url,
        isEmbed: nextSource.isEmbed,
        source: nextSource.source,
        currentIndex: nextIdx,
        isAutoSwitching: false,
      });
      haptic.light();
    } else {
      Alert.alert("Playback Error", "None of the available sources are responding. Please try again later.");
    }
  };

  // ─── Suspension check — block all playback ───────────────────────────────────
  if (suspended) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }]}>
        <View style={{
          backgroundColor: "#0f172a",
          borderRadius: 24,
          padding: 28,
          width: "100%",
          maxWidth: 380,
          borderWidth: 1,
          borderColor: "#1e293b",
          alignItems: "center",
        }}>
          <View style={{ backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 50, padding: 18, marginBottom: 18 }}>
            <Ionicons name="ban" size={48} color="#EF4444" />
          </View>
          <Text style={{ color: "#f8fafc", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 10 }}>
            Account Suspended
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 8 }}>
            {suspended.reason}
          </Text>
          <Text style={{ color: "#64748b", fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 24 }}>
            Movies aur series tab tak nahi chalenge jab tak account restore nahi hota.{"\n\n"}
            Help Center se contact karo — account theek hone ke baad app wapas kaam karega.
          </Text>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#E50914", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12, alignSelf: "stretch", justifyContent: "center" }}
            onPress={() => Linking.openURL("mailto:wftis.aryux07@gmail.com?subject=Account%20Suspended%20-%20Help%20Center").catch(() => {})}
          >
            <Ionicons name="mail-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Help Center Contact Karo</Text>
          </Pressable>
          <Pressable style={{ paddingVertical: 10 }} onPress={() => router.back()}>
            <Text style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}>Wapas Jao</Text>
          </Pressable>
          <Text style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 8 }}>
            Support 24–48 hours mein reply karta hai.
          </Text>
        </View>
      </View>
    );
  }

  // ─── Auth loading screen ──────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  // ─── Brief silent loading state ───────────────────────────────────────────────
  if (!ready && autoplayCountdown === null) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  // ─── No MovieBox stream ──────────────────────────────────────────────────────
  if (streamResult?.source === "none") {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }]}>
        <Ionicons name="videocam-off-outline" size={54} color="#E50914" />
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 18, textAlign: "center" }}>
          MovieBox video unavailable
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 21 }}>
          Is title ke liye MovieBox/Aoneroom ne playable media URL nahi diya.
        </Text>
        <Pressable
          style={{ marginTop: 24, backgroundColor: "#E50914", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13 }}
          onPress={handleBack}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const resolvedUrl = streamResult?.url || "";
  const nextEp = getNextEpisode();
  const prevEp = getPrevEpisode();

  const webLandscapeStyle = isPortraitWeb ? {
    position: "absolute" as const,
    width: winH,
    height: winW,
    left: -(winH - winW) / 2,
    top: (winH - winW) / 2,
    transform: [{ rotate: "90deg" }],
  } : { flex: 1 };

  return (
    <View style={isPortraitWeb ? { flex: 1, overflow: "hidden" } : { flex: 1 }}>
      <View style={webLandscapeStyle}>
        <NativePlayerScreen
          movieId={id ?? ""}
          videoUrl={resolvedUrl}
          title={title_param || movie?.title}
          posterUri={movie?.poster && typeof movie.poster === "object" && "uri" in movie.poster ? (movie.poster as any).uri : undefined}
          onBack={handleBack}
          orientationLocked={orientationLocked}
          isTV={isTV}
          tmdbId={tmdbId}
          initialSeason={currentSeason}
          initialEpisode={currentEpisode}
          onTimeout={tryNextSource}
          onEnded={() => nextEp && setAutoplayCountdown(5)}
          onCompletion={() => {
            if (id) void trackWatchCompletion(id, completionGenreIds, 1);
          }}
          seasons={seasons}
          episodes={episodes}
          prevEpisode={prevEp}
          nextEpisode={nextEp}
           extractionSources={streamResult?.qualitySources ?? []}
           extractionSubtitles={streamResult?.subtitleTracks ?? []}
          onPrevEpisode={() => {
            if (prevEp) {
              router.setParams({ season: String(prevEp.season), episode: String(prevEp.episode) });
              setStreamResult(null);
            }
          }}
          onNextEpisode={() => {
            if (nextEp) {
              router.setParams({ season: String(nextEp.season), episode: String(nextEp.episode) });
              setStreamResult(null);
            }
          }}
        />

        {/* Autoplay Next Overlay */}
        {autoplayCountdown !== null && nextEp && (
          <View style={styles.autoplayOverlay}>
            <BlurView intensity={70} tint="dark" style={styles.autoplayCard}>
              <Text style={styles.autoplayComingUp}>Coming up next...</Text>
              <Text style={styles.autoplayTitle} numberOfLines={2}>
                E{nextEp.episode}: {episodes.find(e => e.episode_number === nextEp.episode)?.name || "Next Episode"}
              </Text>
              <View style={styles.autoplayCircleWrap}>
                <Text style={styles.autoplaySeconds}>{autoplayCountdown}</Text>
              </View>
              <View style={styles.autoplayActions}>
                <Pressable onPress={() => setAutoplayCountdown(null)} style={styles.autoplayCancelBtn}>
                  <Text style={styles.autoplayCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={startNextEpisode} style={styles.autoplayNowBtn}>
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={styles.autoplayNowText}>Play Now</Text>
                </Pressable>
              </View>
            </BlurView>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Native Player ─────────────────────────────────────────────────────────────

type SettingsView = "main" | "audio" | "subtitles" | "subtitle_style" | "speed" | "quality" | "report";

function NativePlayerScreen({
  movieId,
  videoUrl,
  title,
  posterUri,
  onBack,
  orientationLocked,
  isTV,
  tmdbId,
  initialSeason,
  initialEpisode,
  onTimeout,
  onEnded,
  onCompletion,
  seasons,
  episodes,
  prevEpisode,
  nextEpisode,
  onPrevEpisode,
  onNextEpisode,
  extractionSources,
  extractionSubtitles,
}: {
  movieId: string;
  videoUrl: string;
  title?: string;
  posterUri?: string;
  onBack: () => void;
  orientationLocked: boolean;
  isTV: boolean;
  tmdbId: number | null;
  initialSeason: number;
  initialEpisode: number;
  onTimeout?: () => void;
  onEnded?: () => void;
  onCompletion?: () => void;
  seasons: any[];
  episodes: TMDBEpisode[];
  prevEpisode: { season: number; episode: number } | null;
  nextEpisode: { season: number; episode: number } | null;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  extractionSources: ExtractionSource[];
  extractionSubtitles: ExtractionSubtitle[];
}) {
  // Keep screen awake during playback
  useKeepAwake();

  // ─── UI state ─────────────────────────────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>("main");
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [screenLocked, setScreenLocked] = useState(false);

  // Controls fade animation
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const prevShowControlsRef = useRef(true);

  useEffect(() => {
    if (showControls !== prevShowControlsRef.current) {
      Animated.timing(controlsOpacity, {
        toValue: showControls ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start();
      prevShowControlsRef.current = showControls;
    }
  }, [showControls]);

  useEffect(() => {
    if (seasons.length > 0) {
      const idx = seasons.findIndex(s => s.season_number === initialSeason);
      if (idx !== -1) setSelectedSeasonIdx(idx);
    }
  }, [initialSeason, seasons]);

  // ─── Playback preferences ─────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Language>("English");
  const [subtitle, setSubtitle] = useState<Subtitle>("Off");
  const [speed, setSpeed] = useState<SpeedValue>(1);
  const [quality, setQuality] = useState<Quality>("Auto");
  const [subtitleFontSize, setSubtitleFontSize] = useState(16);
  const [subtitleColor, setSubtitleColor] = useState("#FFFFFF");
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(0.6);
  const qualityOptions = useMemo(() => {
    const labels = extractionSources
      .map((source) => source.quality.trim())
      .filter((label) => label && label !== "Unknown" && label.toLowerCase() !== "auto");
    return ["Auto", ...Array.from(new Set(labels))];
  }, [extractionSources]);
  const subtitleOptions = useMemo(() => {
    if (extractionSubtitles.length === 0) return ["Off"];
    return [
      "Off",
      ...Array.from(
        new Set(
          extractionSubtitles
            .map((track) => track.label)
            .filter((label) => label.toLowerCase() !== "off"),
        ),
      ),
    ];
  }, [extractionSubtitles]);

  useEffect(() => {
    if (!qualityOptions.includes(quality)) setQuality("Auto");
  }, [quality, qualityOptions]);

  useEffect(() => {
    if (!subtitleOptions.includes(subtitle)) setSubtitle("Off");
  }, [subtitle, subtitleOptions]);

  const selectedSource = useMemo(() => {
    if (extractionSources.length === 0 || quality === "Auto") return extractionSources[0];
    return extractionSources.find((source) =>
      source.quality.toLowerCase() === quality.toLowerCase() ||
      source.quality.toLowerCase().includes(quality.toLowerCase().split(" ")[0]),
    ) ?? extractionSources[0];
  }, [extractionSources, quality]);

  const videoSource = useMemo(() => {
    if (!selectedSource) return videoUrl;
    return {
      uri: selectedSource.url,
      contentType: selectedSource.contentType,
      headers: selectedSource.headers,
      metadata: { title, artwork: posterUri },
    };
  }, [posterUri, selectedSource, title, videoUrl]);

  // ─── Playback state ───────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0); // estimated buffered seconds
  const [skipIntroDismissed, setSkipIntroDismissed] = useState(false);
  const [skipRecapDismissed, setSkipRecapDismissed] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);

  // ─── Long press speed boost ───────────────────────────────────────────────────
  const [isLongPressingSpeed, setIsLongPressingSpeed] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSpeedRef = useRef<SpeedValue>(1);

  // ─── Gesture state ────────────────────────────────────────────────────────────
  const [volume, setVolumeState] = useState(1.0);
  const [brightness, setBrightnessState] = useState(1.0);
  const [activeGesture, setActiveGesture] = useState<null | "volume" | "brightness" | "seek">(null);
  const volumeRef = useRef(1.0);
  const brightnessRef = useRef(1.0);
  const gestureStartValue = useRef(1.0);
  const gestureKind = useRef<null | "volume" | "brightness" | "seek">(null);
  const gestureHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" | null }>({ time: 0, side: null });
  const seekFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right" } | null>(null);

  // Horizontal seek gesture
  const [seekPreviewPos, setSeekPreviewPos] = useState<number | null>(null); // seconds
  const seekStartPositionRef = useRef(0);
  const seekGestureStartX = useRef(0);

  // Animated seek overlay opacity
  const seekOverlayOpacity = useRef(new Animated.Value(0)).current;

  // Volume/brightness HUD animated opacity
  const volumeHudOpacity = useRef(new Animated.Value(0)).current;
  const brightnessHudOpacity = useRef(new Animated.Value(0)).current;

  const showHud = (kind: "volume" | "brightness") => {
    const anim = kind === "volume" ? volumeHudOpacity : brightnessHudOpacity;
    Animated.timing(anim, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  };
  const hideHud = (kind: "volume" | "brightness") => {
    const anim = kind === "volume" ? volumeHudOpacity : brightnessHudOpacity;
    Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
  };

  const setVolume = (v: number) => { volumeRef.current = v; setVolumeState(v); };
  const setBrightness = (v: number) => { brightnessRef.current = v; setBrightnessState(v); };

  // ─── Download state ───────────────────────────────────────────────────────────
  const { startDownload: ctxStartDownload, removeDownload: ctxRemoveDownload } = useDownloads();
  const [dlStatus, setDlStatus] = useState<DownloadStatus>("idle");
  const [dlProgress, setDlProgress] = useState(0);
  const [showDlBar, setShowDlBar] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);

  // ─── Video player ─────────────────────────────────────────────────────────────
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const activeSubtitle = useMemo(
    () => extractionSubtitles.find((track) => track.label === subtitle || track.lang === subtitle),
    [extractionSubtitles, subtitle],
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeSubtitle || subtitle === "Off") {
      setSubtitleCues([]);
      return;
    }
    fetch(activeSubtitle.url)
      .then((response) => {
        if (!response.ok) throw new Error("Subtitle request failed");
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setSubtitleCues(parseSubtitleCues(text));
      })
      .catch(() => {
        if (!cancelled) setSubtitleCues([]);
      });
    return () => { cancelled = true; };
  }, [activeSubtitle, subtitle]);

  const activeCue = useMemo(
    () => subtitleCues.find((cue) => position >= cue.start && position <= cue.end),
    [position, subtitleCues],
  );

  // ─── Progress persistence & resume ───────────────────────────────────────────
  useEffect(() => {
    if (!movieId) return;
    getDownloadRecord(movieId).then((rec) => {
      if (rec) {
        setDlStatus(rec.status);
        setDlProgress(rec.progress);
        if (rec.status === "downloading") setShowDlBar(true);
      }
    }).catch(() => {});
  }, [movieId]);

  useEffect(() => {
    if (!movieId) return;
    let cancelled = false;
    loadProgress(movieId).then((saved) => {
      if (saved && !cancelled && saved.positionSec > 5) {
        try { player.currentTime = saved.positionSec; } catch { }
      }
    });
    progressSaveRef.current = setInterval(() => {
      if (positionRef.current > 5 && durationRef.current > 0) {
        saveProgress({
          movieId,
          positionSec: positionRef.current,
          durationSec: durationRef.current,
          updatedAt: Date.now(),
          title,
          posterUri,
        });
      }
    }, 5000);
    return () => {
      cancelled = true;
      if (progressSaveRef.current) clearInterval(progressSaveRef.current);
      if (positionRef.current > 5 && durationRef.current > 0) {
        saveProgress({
          movieId,
          positionSec: positionRef.current,
          durationSec: durationRef.current,
          updatedAt: Date.now(),
          title,
          posterUri,
        });
      }
    };
  }, [movieId, player]);

  // ─── Player event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const subStatus = player.addListener("statusChange", (e: any) => {
      if ((player.status as string) === "finished") {
        onCompletion?.();
        onEnded?.();
      }
    });
    return () => subStatus.remove();
  }, [player, onEnded, onCompletion]);

  useEffect(() => {
    try { player.volume = volume; } catch { }
  }, [player, volume]);

  useEffect(() => {
    try { player.playbackRate = speed; } catch { }
  }, [player, speed]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      if (e.isPlaying) setIsBuffering(false);
    });
    const sub2 = player.addListener("statusChange", (e: any) => {
      if (player.duration && !Number.isNaN(player.duration)) setDuration(player.duration);
      const status = e?.status ?? (player as any).status;
      if (status === "readyToPlay" || status === "idle") setIsBuffering(false);
      if (status === "loading") setIsBuffering(true);
      if (status === "error") {
        setIsBuffering(false);
        setVideoError("Unable to load video. Please try again.");
      }
    });
    const interval = setInterval(() => {
      try {
        if (player.currentTime != null) {
          const t = player.currentTime;
          setPosition(t);
          positionRef.current = t;
          if (t > 0) setIsBuffering(false);
          // Estimate buffered as position + 30s (expo-video doesn't expose buffered)
          setBuffered(Math.min(t + 30, durationRef.current));
        }
        if (player.duration && !Number.isNaN(player.duration)) {
          setDuration(player.duration);
          durationRef.current = player.duration;
        }
      } catch { }
    }, 500);
    const bufferTimeout = setTimeout(() => {
      if (isBuffering && onTimeout) {
        onTimeout();
      }
      setIsBuffering(false);
    }, 15000);
    return () => { sub.remove(); sub2.remove(); clearInterval(interval); clearTimeout(bufferTimeout); };
  }, [player, onTimeout]);

  // ─── Auto-hide controls ───────────────────────────────────────────────────────
  useEffect(() => {
    if (showControls && !showSettings && !showEpisodes) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [showControls, showSettings, showEpisodes, isPlaying]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  // ─── Playback controls ────────────────────────────────────────────────────────
  const togglePlay = () => {
    haptic.medium();
    player.playing ? player.pause() : player.play();
  };

  const skip = (deltaSeconds: number) => {
    haptic.light();
    try {
      const next = Math.max(0, Math.min((player.currentTime ?? 0) + deltaSeconds, duration || 1e9));
      player.currentTime = next;
      setPosition(next);
    } catch { }
  };

  const seekTo = (seconds: number) => {
    try {
      const clamped = Math.max(0, Math.min(seconds, duration || 1e9));
      player.currentTime = clamped;
      setPosition(clamped);
      positionRef.current = clamped;
    } catch { }
  };

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const total = Math.floor(s);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const bufferedProgress = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  // ─── Episode switch ───────────────────────────────────────────────────────────
  const switchEpisode = (s: number, e: number) => {
    haptic.medium();
    setShowEpisodes(false);
    setIsBuffering(true);
    router.setParams({ season: String(s), episode: String(e) });
  };

  // ─── PanResponder — vertical=brightness/volume, horizontal=seek, tap=toggle ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !screenLocked,
      onMoveShouldSetPanResponder: (_evt, gs) => {
        if (screenLocked) return false;
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        return absX > 6 || absY > 8;
      },
      onPanResponderGrant: (evt, gs) => {
        if (screenLocked) return;
        const { width } = Dimensions.get("window");
        const side = evt.nativeEvent.locationX < width / 2 ? "brightness" : "volume";
        // Determine if mostly horizontal
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        if (absX > absY * 1.5) {
          gestureKind.current = "seek";
          seekGestureStartX.current = evt.nativeEvent.locationX;
          seekStartPositionRef.current = positionRef.current;
          Animated.timing(seekOverlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        } else {
          gestureKind.current = side;
          gestureStartValue.current = side === "brightness" ? brightnessRef.current : volumeRef.current;
          showHud(side);
        }
        if (gestureHideTimer.current) clearTimeout(gestureHideTimer.current);
        setActiveGesture(gestureKind.current);
      },
      onPanResponderMove: (evt, gs) => {
        const kind = gestureKind.current;
        if (!kind) return;
        if (kind === "seek") {
          const { width } = Dimensions.get("window");
          // 1px = 0.5s seek
          const delta = (gs.dx / width) * Math.min(duration, 600);
          const newPos = Math.max(0, Math.min(seekStartPositionRef.current + delta, durationRef.current));
          setSeekPreviewPos(newPos);
        } else {
          const delta = -(gs.dy / 220);
          const next = Math.max(0, Math.min(1, gestureStartValue.current + delta));
          if (kind === "brightness") setBrightness(next);
          else setVolume(next);
        }
      },
      onPanResponderRelease: (evt, gs) => {
        const kind = gestureKind.current;
        if (kind === "seek") {
          if (seekPreviewPos !== null) {
            seekTo(seekPreviewPos);
            haptic.light();
          }
          setSeekPreviewPos(null);
          Animated.timing(seekOverlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        } else if (kind === "volume" || kind === "brightness") {
          // Small movement = tap
          if (Math.abs(gs.dy) < 8 && Math.abs(gs.dx) < 8) {
            const { width } = Dimensions.get("window");
            const tapX = evt.nativeEvent.locationX;
            const side = tapX < width / 2 ? ("left" as const) : ("right" as const);
            const now = Date.now();
            const last = lastTapRef.current;
            if (now - last.time < 300 && last.side === side) {
              // Double-tap seek
              const delta = side === "left" ? -10 : 10;
              try {
                const next = Math.max(0, Math.min((player.currentTime ?? 0) + delta, durationRef.current || 1e9));
                player.currentTime = next;
                setPosition(next);
              } catch { }
              haptic.light();
              if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
              setSeekFlash({ side });
              seekFlashTimerRef.current = setTimeout(() => setSeekFlash(null), 800);
              lastTapRef.current = { time: 0, side: null };
            } else {
              // Single tap toggle controls
              setShowControls(s => !s);
              lastTapRef.current = { time: now, side };
            }
          }
          if (gestureHideTimer.current) clearTimeout(gestureHideTimer.current);
          gestureHideTimer.current = setTimeout(() => {
            if (kind) hideHud(kind as any);
            setActiveGesture(null);
          }, 1200);
        } else {
          // Pure tap on no-gesture start
          if (Math.abs(gs.dy) < 8 && Math.abs(gs.dx) < 8) {
            setShowControls(s => !s);
          }
        }
        gestureKind.current = null;
      },
    }),
  ).current;

  // ─── Long press for 2x speed ──────────────────────────────────────────────────
  const handleLongPressIn = () => {
    if (screenLocked) return;
    longPressTimer.current = setTimeout(() => {
      prevSpeedRef.current = speed;
      setSpeed(2);
      setIsLongPressingSpeed(true);
      haptic.medium();
    }, 500);
  };
  const handleLongPressOut = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (isLongPressingSpeed) {
      setSpeed(prevSpeedRef.current);
      setIsLongPressingSpeed(false);
      haptic.light();
    }
  };

  // ─── Download ─────────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!movieId) return;
    haptic.medium();
    if (dlStatus === "complete") {
      Alert.alert("Already Downloaded", `"${title ?? "This title"}" is saved for offline viewing.`, [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            await ctxRemoveDownload(movieId);
            setDlStatus("idle"); setDlProgress(0); setShowDlBar(false);
          },
        },
      ]);
      return;
    }
    if (dlStatus === "downloading") {
      Alert.alert("Downloading…", `${Math.round(dlProgress * 100)}% complete`);
      return;
    }
    if (!isDirectVideoUrl(videoUrl)) {
      Alert.alert(
        "Download unavailable",
        "This server supports streaming only. Offline download needs a direct video file.",
      );
      return;
    }
    haptic.success();
    setDlStatus("downloading"); setDlProgress(0); setShowDlBar(true);
    try {
      await ctxStartDownload(
        { movieId, title: title ?? movieId, posterUri: null },
        videoUrl,
        (p) => { setDlProgress(p); },
      );
      setDlStatus("complete"); setDlProgress(1); haptic.success();
      Alert.alert("Download Complete", `"${title ?? "This title"}" saved for offline viewing.`);
    } catch {
      setDlStatus("error");
      Alert.alert("Download Failed", "Please check your connection and try again.");
    } finally {
      setTimeout(() => setShowDlBar(false), 3000);
    }
  };

  const dlIcon = (() => {
    if (dlStatus === "complete") return "checkmark-circle";
    if (dlStatus === "downloading") return "cloud-download";
    if (dlStatus === "error") return "alert-circle";
    return "download-outline";
  })() as any;
  const dlIconColor = dlStatus === "complete" ? "#34D399" : dlStatus === "error" ? "#e50914" : "#fff";

  // ─── Report problem ───────────────────────────────────────────────────────────
  const handleReportProblem = () => {
    setShowSettings(false);
    Alert.alert(
      "Report a Problem",
      "What issue are you experiencing?",
      [
        { text: "Video won't play", onPress: () => Alert.alert("Reported", "We'll investigate the stream issue.") },
        { text: "Poor video quality", onPress: () => Alert.alert("Reported", "Quality feedback noted, thank you.") },
        { text: "Wrong audio/subtitles", onPress: () => Alert.alert("Reported", "A/V issue logged for review.") },
        { text: "Other", onPress: () => Alert.alert("Reported", "Your report has been submitted.") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  // ─── Computed ─────────────────────────────────────────────────────────────────
  const currentEpName = isTV
    ? episodes.find(ep => ep.episode_number === initialEpisode)?.name
    : undefined;
  const displayTitle = currentEpName
    ? `E${initialEpisode}: ${currentEpName}`
    : (title ?? "Now Playing");

  // ─── Lock screen overlay ──────────────────────────────────────────────────────
  if (screenLocked) {
    return (
      <View style={styles.container}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
        />
        {/* Buffering overlay even when locked */}
        {isBuffering && (
          <View pointerEvents="none" style={styles.bufferOverlay}>
            <ActivityIndicator size="large" color="#e50914" />
          </View>
        )}
        {/* Lock indicator */}
        <View style={nStyles.lockScreen}>
          <Pressable
            onPress={() => { setScreenLocked(false); haptic.medium(); }}
            style={nStyles.unlockBtn}
            accessibilityLabel="Unlock screen"
            accessibilityRole="button"
          >
            <Ionicons name="lock-closed" size={22} color="#fff" />
            <Text style={nStyles.unlockText}>Tap to unlock</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Main player UI ───────────────────────────────────────────────────────────
  return (
    <View
      style={styles.container}
      onTouchStart={handleLongPressIn}
      onTouchEnd={handleLongPressOut}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
      />

      {/* Brightness dimmer overlay */}
      {brightness < 0.99 && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: (1 - brightness) * 0.82, zIndex: 6 }]}
        />
      )}

      {/* Buffering spinner */}
      {isBuffering && !videoError && (
        <View pointerEvents="none" style={styles.bufferOverlay}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.bufferText}>FETCHING STREAM...</Text>
          <Text style={styles.bufferSubtext}>Configuring secure server channel inside S Movie Original</Text>
        </View>
      )}

      {/* 2x speed indicator */}
      {isLongPressingSpeed && (
        <View pointerEvents="none" style={nStyles.speedBoostOverlay}>
          <MaterialIcons name="fast-forward" size={28} color="#fff" />
          <Text style={nStyles.speedBoostText}>2× Speed</Text>
        </View>
      )}

      {/* Video error state */}
      {videoError && (
        <View style={styles.errorOverlay}>
          <Feather name="alert-circle" size={40} color="#e50914" />
          <Text style={styles.errorOverlayText}>
            Playback Error.{"\n"}Please check your data connection or activate VPN.
          </Text>
          <Pressable
            onPress={() => { setVideoError(null); setIsBuffering(true); try { player.play(); } catch { } }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Download bar */}
      {showDlBar && dlStatus === "downloading" && (
        <View style={styles.dlBar}>
          <Ionicons name="cloud-download" size={13} color="#34D399" />
          <View style={styles.dlBarTrack}>
            <View style={[styles.dlBarFill, { width: `${Math.round(dlProgress * 100)}%` }]} />
          </View>
          <Text style={styles.dlBarText}>{Math.round(dlProgress * 100)}%</Text>
        </View>
      )}

      {/* Brightness HUD */}
      <Animated.View pointerEvents="none" style={[gestureStyles.leftHud, { opacity: brightnessHudOpacity }]}>
        <Ionicons name={brightness < 0.3 ? "moon-outline" : brightness < 0.7 ? "sunny-outline" : "sunny"} size={22} color="#fff" />
        <View style={gestureStyles.sliderTrack}>
          <View style={[gestureStyles.sliderFill, { height: `${Math.round(brightness * 100)}%` as any }]} />
        </View>
        <Text style={gestureStyles.hudPct}>{Math.round(brightness * 100)}%</Text>
      </Animated.View>

      {/* Volume HUD */}
      <Animated.View pointerEvents="none" style={[gestureStyles.rightHud, { opacity: volumeHudOpacity }]}>
        <Ionicons name={volume === 0 ? "volume-mute" : volume < 0.4 ? "volume-low" : volume < 0.75 ? "volume-medium" : "volume-high"} size={22} color="#fff" />
        <View style={gestureStyles.sliderTrack}>
          <View style={[gestureStyles.sliderFill, { height: `${Math.round(volume * 100)}%` as any }]} />
        </View>
        <Text style={gestureStyles.hudPct}>{Math.round(volume * 100)}%</Text>
      </Animated.View>

      {/* Seek preview overlay */}
      {seekPreviewPos !== null && (
        <Animated.View pointerEvents="none" style={[nStyles.seekOverlay, { opacity: seekOverlayOpacity }]}>
          <Text style={nStyles.seekOverlayTime}>{fmt(seekPreviewPos)}</Text>
          <Text style={nStyles.seekOverlayDelta}>
            {seekPreviewPos > positionRef.current ? "+" : ""}{fmt(Math.abs(seekPreviewPos - positionRef.current))}
          </Text>
        </Animated.View>
      )}

      {/* Double-tap seek flash left */}
      {seekFlash?.side === "left" && (
        <View pointerEvents="none" style={tapStyles.leftFlash}>
          <MaterialIcons name="replay-10" size={40} color="#fff" />
          <Text style={tapStyles.seekLabel}>-10s</Text>
        </View>
      )}
      {/* Double-tap seek flash right */}
      {seekFlash?.side === "right" && (
        <View pointerEvents="none" style={tapStyles.rightFlash}>
          <MaterialIcons name="forward-10" size={40} color="#fff" />
          <Text style={tapStyles.seekLabel}>+10s</Text>
        </View>
      )}

      {/* Subtitle render overlay */}
      {subtitle !== "Off" && activeCue && position > 0 && (
        <View pointerEvents="none" style={nStyles.subtitleOverlay}>
          <View style={[nStyles.subtitleBg, { backgroundColor: `rgba(0,0,0,${subtitleBgOpacity})` }]}>
            <Text style={[nStyles.subtitleText, { fontSize: subtitleFontSize, color: subtitleColor }]}>
              {activeCue.text}
            </Text>
          </View>
        </View>
      )}

      {/* Main gesture/tap area + controls overlay */}
      <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents={showControls ? "box-none" : "none"}>
          {showControls && (
            <LinearGradient
              colors={["rgba(0,0,0,0.75)", "transparent", "transparent", "rgba(0,0,0,0.85)"]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          )}

          {showControls && (
            <View style={styles.overlay}>
              {/* ── Top bar ─────────────────────────────────────────────────── */}
              <View style={styles.topBar}>
                <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back" accessibilityRole="button">
                  <Feather name="arrow-left" size={24} color="#fff" />
                </Pressable>

                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text style={styles.titleText} numberOfLines={1}>{displayTitle}</Text>
                  {isTV && <Text style={nStyles.subtitleTopBar} numberOfLines={1}>S{initialSeason} · {title}</Text>}
                </View>

                <View style={{ flexDirection: "row", gap: 4 }}>
                  {/* Lock screen button */}
                  <Pressable
                    onPress={() => { setScreenLocked(true); haptic.medium(); setShowControls(false); }}
                    hitSlop={10} style={styles.iconBtn}
                    accessibilityLabel="Lock screen" accessibilityRole="button"
                  >
                    <Ionicons name="lock-open-outline" size={22} color="#fff" />
                  </Pressable>

                  {/* Download */}
                  <Pressable onPress={handleDownload} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Download" accessibilityRole="button">
                    <Ionicons name={dlIcon} size={22} color={dlIconColor} />
                  </Pressable>

                  {/* Settings */}
                  <Pressable
                    onPress={() => { setShowSettings(true); setSettingsView("main"); }}
                    hitSlop={10} style={styles.iconBtn}
                    accessibilityLabel="Settings" accessibilityRole="button"
                  >
                    <Ionicons name="settings-sharp" size={24} color="#fff" />
                  </Pressable>
                </View>
              </View>

              {/* ── Center controls ──────────────────────────────────────────── */}
              <View style={styles.centerRow}>
                {/* Previous Episode */}
                {isTV && (
                  <Pressable
                    onPress={() => { if (prevEpisode) { haptic.medium(); onPrevEpisode?.(); } }}
                    style={[styles.centerBtn, !prevEpisode && { opacity: 0.3 }]}
                    hitSlop={10}
                    disabled={!prevEpisode}
                    accessibilityLabel="Previous episode" accessibilityRole="button"
                  >
                    <Ionicons name="play-skip-back" size={32} color="#fff" />
                  </Pressable>
                )}

                {/* Skip back 10s */}
                <Pressable
                  onPress={() => skip(-10)}
                  style={({ pressed }) => [styles.centerBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={10}
                  accessibilityLabel="Rewind 10 seconds" accessibilityRole="button"
                >
                  <MaterialIcons name="replay-10" size={44} color="#fff" />
                </Pressable>

                {/* Play/Pause */}
                <Pressable
                  onPress={togglePlay}
                  style={({ pressed }) => [styles.playPauseBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={10}
                  accessibilityLabel={isPlaying ? "Pause" : "Play"} accessibilityRole="button"
                >
                  <View style={styles.netflixPlayWrap}>
                    <Text style={styles.netflixN}>N</Text>
                    {isPlaying ? (
                      <View style={styles.nativePauseWrap}>
                        <View style={styles.nativePauseBar} />
                        <View style={styles.nativePauseBar} />
                      </View>
                    ) : (
                      <Ionicons name="play" size={34} color="#fff" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                </Pressable>

                {/* Skip forward 10s */}
                <Pressable
                  onPress={() => skip(10)}
                  style={({ pressed }) => [styles.centerBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={10}
                  accessibilityLabel="Forward 10 seconds" accessibilityRole="button"
                >
                  <MaterialIcons name="forward-10" size={44} color="#fff" />
                </Pressable>

                {/* Next Episode */}
                {isTV && (
                  <Pressable
                    onPress={() => { if (nextEpisode) { haptic.medium(); onNextEpisode?.(); } }}
                    style={[styles.centerBtn, !nextEpisode && { opacity: 0.3 }]}
                    hitSlop={10}
                    disabled={!nextEpisode}
                    accessibilityLabel="Next episode" accessibilityRole="button"
                  >
                    <Ionicons name="play-skip-forward" size={32} color="#fff" />
                  </Pressable>
                )}
              </View>

              {/* ── Skip Intro / Recap ───────────────────────────────────────── */}
              {!skipIntroDismissed && position > 30 && position < 240 && duration > 300 && (
                <Pressable
                  style={styles.skipIntroBtn}
                  onPress={() => { haptic.light(); player.currentTime = Math.min(240, duration); setSkipIntroDismissed(true); }}
                  accessibilityLabel="Skip intro" accessibilityRole="button"
                >
                  <Text style={styles.skipIntroBtnText}>Skip Intro</Text>
                  <Ionicons name="play-forward" size={14} color="#fff" style={{ marginLeft: 4 }} />
                </Pressable>
              )}

              {isTV && !skipRecapDismissed && position > 5 && position < 90 && duration > 300 && (
                <Pressable
                  style={[styles.skipIntroBtn, { bottom: 140 }]}
                  onPress={() => { haptic.light(); player.currentTime = Math.min(90, duration); setSkipRecapDismissed(true); }}
                  accessibilityLabel="Skip recap" accessibilityRole="button"
                >
                  <Text style={styles.skipIntroBtnText}>Skip Recap</Text>
                  <Ionicons name="play-forward" size={14} color="#fff" style={{ marginLeft: 4 }} />
                </Pressable>
              )}

              {/* ── Bottom bar ───────────────────────────────────────────────── */}
              <View style={styles.bottomBar}>
                {/* Progress row with buffered track */}
                <View style={styles.progressRow}>
                  <Text style={styles.timeText}>{fmt(position)}</Text>
                  <View style={styles.progressTrack}>
                    {/* Buffered */}
                    <View style={[nStyles.bufferedFill, { width: `${bufferedProgress}%` }]} />
                    {/* Played */}
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    {/* Knob */}
                    <View style={[styles.progressKnob, { left: `${progress}%` }]} />
                  </View>
                  <Text style={styles.timeText}>-{fmt(Math.max(0, duration - position))}</Text>
                </View>

                {/* Bottom actions row */}
                <View style={styles.bottomActionsRow}>
                  {/* Speed chips */}
                  {([1, 1.5, 2] as SpeedValue[]).map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => { haptic.selection(); setSpeed(s); }}
                      style={[styles.speedChip, speed === s && styles.speedChipActive]}
                      accessibilityLabel={`${s}x speed`}
                    >
                      <Text style={[styles.speedChipText, speed === s && styles.speedChipTextActive]}>
                        {s === 1 ? "1x" : `${s}x`}
                      </Text>
                    </Pressable>
                  ))}

                  {/* Quality */}
                  <Pressable
                    onPress={() => { haptic.light(); setShowSettings(true); setSettingsView("quality"); }}
                    style={({ pressed }) => [styles.qualityChip, pressed && { opacity: 0.7 }]}
                    hitSlop={6}
                    accessibilityLabel={`Quality: ${quality}`}
                  >
                    <MaterialIcons name="hd" size={14} color="#fff" />
                    <Text style={styles.qualityChipText}>{quality === "Auto" ? "Auto" : quality.split(" ")[0]}</Text>
                  </Pressable>

                  {/* Audio */}
                  <Pressable
                    onPress={() => { haptic.light(); setShowSettings(true); setSettingsView("audio"); }}
                    style={({ pressed }) => [styles.qualityChip, pressed && { opacity: 0.7 }]}
                    hitSlop={6}
                    accessibilityLabel={`Audio: ${language}`}
                  >
                    <Ionicons name="language" size={12} color="#fff" />
                    <Text style={styles.qualityChipText}>{language.slice(0, 3)}</Text>
                  </Pressable>

                  {/* Subtitle */}
                  <Pressable
                    onPress={() => { haptic.light(); setShowSettings(true); setSettingsView("subtitles"); }}
                    style={({ pressed }) => [styles.qualityChip, pressed && { opacity: 0.7 }]}
                    hitSlop={6}
                    accessibilityLabel={`Subtitle: ${subtitle}`}
                  >
                    <MaterialIcons name="closed-caption" size={14} color="#fff" />
                    <Text style={styles.qualityChipText}>{subtitle === "Off" ? "Sub" : subtitle.slice(0, 3)}</Text>
                  </Pressable>

                  {/* Episodes */}
                  {isTV && (
                    <Pressable
                      onPress={() => { haptic.medium(); setShowEpisodes(true); }}
                      style={[styles.qualityChip, { backgroundColor: "rgba(229,9,20,0.2)", borderColor: "rgba(229,9,20,0.4)" }]}
                      hitSlop={6}
                      accessibilityLabel="Episode list"
                    >
                      <Ionicons name="layers" size={14} color="#e50914" />
                      <Text style={[styles.qualityChipText, { color: "#e50914" }]}>Eps</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Persistent close button — always visible */}
      <Pressable onPress={onBack} hitSlop={14} style={styles.persistentCloseBtn} accessibilityLabel="Close player" accessibilityRole="button">
        <View style={styles.persistentCloseBg}>
          <Feather name="x" size={22} color="#fff" />
        </View>
      </Pressable>

      {/* ── Episodes drawer ──────────────────────────────────────────────────── */}
      <Modal transparent visible={showEpisodes} animationType="fade" onRequestClose={() => setShowEpisodes(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowEpisodes(false)}>
          <Pressable style={styles.modalDrawer} onPress={e => e.stopPropagation()}>
            <View style={styles.drawerHeader}>
              <Text style={styles.modalTitle}>Episodes</Text>
              <Pressable onPress={() => setShowEpisodes(false)} style={styles.drawerCloseX}>
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </View>
            {seasons.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonScroll} contentContainerStyle={{ gap: 10 }}>
                {seasons.map((s, i) => (
                  <Pressable
                    key={s.season_number}
                    onPress={() => setSelectedSeasonIdx(i)}
                    style={[styles.speedChip, selectedSeasonIdx === i && styles.speedChipActive]}
                  >
                    <Text style={[styles.speedChipText, selectedSeasonIdx === i && styles.speedChipTextActive]}>
                      {s.name || `S${s.season_number}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <ScrollView style={{ flex: 1 }}>
              {episodes.length > 0 ? episodes.map((ep) => (
                <Pressable
                  key={ep.id}
                  onPress={() => switchEpisode(seasons[selectedSeasonIdx]?.season_number ?? 1, ep.episode_number)}
                  style={({ pressed }) => [
                    styles.epModalRow,
                    pressed && { backgroundColor: "rgba(255,255,255,0.05)" },
                    initialSeason === (seasons[selectedSeasonIdx]?.season_number ?? 1) && initialEpisode === ep.episode_number && styles.epActiveRow,
                  ]}
                >
                  <View style={styles.epModalThumbWrap}>
                    <SmartImage
                      source={ep.still_path ? { uri: tmdbImg(ep.still_path, "w300") || "" } : posterUri ? { uri: proxyUrl(posterUri) || "" } : undefined}
                      style={styles.epModalThumb}
                    />
                    {initialSeason === (seasons[selectedSeasonIdx]?.season_number ?? 1) && initialEpisode === ep.episode_number && (
                      <View style={styles.epPlayingIndicator}>
                        <Ionicons name="play" size={16} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.epModalTitle, initialSeason === (seasons[selectedSeasonIdx]?.season_number ?? 1) && initialEpisode === ep.episode_number && { color: "#e50914" }]} numberOfLines={1}>
                      {ep.episode_number}. {ep.name}
                    </Text>
                    <Text style={styles.epModalDesc} numberOfLines={3}>{ep.overview || "No description available."}</Text>
                  </View>
                </Pressable>
              )) : (
                <Text style={{ color: "#737373", textAlign: "center", marginTop: 40 }}>No episodes found.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Settings modal ───────────────────────────────────────────────────── */}
      <Modal transparent visible={showSettings} animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>

            {settingsView === "main" && (
              <>
                <Text style={styles.modalTitle}>Playback Settings</Text>
                <SettingsRow icon={<MaterialIcons name="hd" size={22} color="#fff" />} label="Quality" value={quality} onPress={() => setSettingsView("quality")} />
                <SettingsRow icon={<Ionicons name="language" size={20} color="#fff" />} label="Audio / Language" value={language} onPress={() => setSettingsView("audio")} />
                <SettingsRow icon={<MaterialIcons name="closed-caption" size={22} color="#fff" />} label="Subtitles" value={subtitle} onPress={() => setSettingsView("subtitles")} />
                <SettingsRow icon={<MaterialIcons name="speed" size={22} color="#fff" />} label="Playback Speed" value={SPEEDS.find(s => s.value === speed)?.label ?? `${speed}x`} onPress={() => setSettingsView("speed")} />
                <SettingsRow icon={<Ionicons name="text" size={20} color="#fff" />} label="Subtitle Style" value={`${subtitleFontSize}px`} onPress={() => setSettingsView("subtitle_style")} />
                <SettingsRow icon={<Feather name="alert-triangle" size={20} color="#e50914" />} label="Report a Problem" value="" onPress={handleReportProblem} />
                <Pressable onPress={() => setShowSettings(false)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseText}>Done</Text>
                </Pressable>
              </>
            )}

            {settingsView === "quality" && (
              <OptionsList
                title="Video Quality"
                options={qualityOptions}
                selected={quality}
                onSelect={(v) => { setQuality(v as Quality); setSettingsView("main"); }}
                onBack={() => setSettingsView("main")}
              />
            )}

            {settingsView === "audio" && (
              <OptionsList
                title="Audio / Language"
                options={LANGUAGES}
                selected={language}
                onSelect={(v) => { setLanguage(v as Language); setSettingsView("main"); }}
                onBack={() => setSettingsView("main")}
              />
            )}

            {settingsView === "subtitles" && (
              <OptionsList
                title="Subtitles"
                options={subtitleOptions}
                selected={subtitle}
                onSelect={(v) => { setSubtitle(v as Subtitle); setSettingsView("main"); }}
                onBack={() => setSettingsView("main")}
              />
            )}

            {settingsView === "subtitle_style" && (
              <>
                <View style={styles.optionsHeader}>
                  <Pressable onPress={() => setSettingsView("main")} hitSlop={10}>
                    <Feather name="chevron-left" size={24} color="#fff" />
                  </Pressable>
                  <Text style={styles.modalTitle}>Subtitle Style</Text>
                  <View style={{ width: 24 }} />
                </View>

                <Text style={nStyles.styleLabel}>Font Size</Text>
                <View style={nStyles.styleRow}>
                  {SUBTITLE_FONT_SIZES.map(({ label, value }) => (
                    <Pressable
                      key={label}
                      onPress={() => setSubtitleFontSize(value)}
                      style={[nStyles.styleChip, subtitleFontSize === value && nStyles.styleChipActive]}
                    >
                      <Text style={[nStyles.styleChipText, subtitleFontSize === value && nStyles.styleChipTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={nStyles.styleLabel}>Color</Text>
                <View style={nStyles.styleRow}>
                  {SUBTITLE_COLORS.map(({ label, value }) => (
                    <Pressable
                      key={label}
                      onPress={() => setSubtitleColor(value)}
                      style={[nStyles.colorSwatch, { borderColor: subtitleColor === value ? value : "transparent" }]}
                    >
                      <View style={[nStyles.colorSwatchInner, { backgroundColor: value }]} />
                    </Pressable>
                  ))}
                </View>

                <Text style={nStyles.styleLabel}>Background Opacity</Text>
                <View style={nStyles.styleRow}>
                  {[0, 0.3, 0.6, 0.9].map(v => (
                    <Pressable
                      key={v}
                      onPress={() => setSubtitleBgOpacity(v)}
                      style={[nStyles.styleChip, subtitleBgOpacity === v && nStyles.styleChipActive]}
                    >
                      <Text style={[nStyles.styleChipText, subtitleBgOpacity === v && nStyles.styleChipTextActive]}>
                        {v === 0 ? "None" : v === 0.3 ? "Low" : v === 0.6 ? "Med" : "High"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={() => setSettingsView("main")} style={[styles.modalCloseBtn, { marginTop: 16 }]}>
                  <Text style={styles.modalCloseText}>Done</Text>
                </Pressable>
              </>
            )}

            {settingsView === "speed" && (
              <OptionsList
                title="Playback Speed"
                options={SPEEDS.map(s => s.label)}
                selected={SPEEDS.find(s => s.value === speed)?.label ?? "1x (Normal)"}
                onSelect={(v) => {
                  const next = SPEEDS.find(s => s.label === v);
                  if (next) setSpeed(next.value);
                  setSettingsView("main");
                }}
                onBack={() => setSettingsView("main")}
              />
            )}

          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && { backgroundColor: "rgba(255,255,255,0.05)" }]}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
    >
      <View style={styles.settingsRowLeft}>
        {icon}
        <Text style={styles.settingsLabel}>{label}</Text>
      </View>
      <View style={styles.settingsRowRight}>
        {value ? <Text style={styles.settingsValue}>{value}</Text> : null}
        <Feather name="chevron-right" size={20} color="#a3a3a3" />
      </View>
    </Pressable>
  );
}

function OptionsList({
  title, options, selected, onSelect, onBack,
}: {
  title: string;
  options: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
  onBack: () => void;
}) {
  return (
    <View>
      <View style={styles.optionsHeader}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back" accessibilityRole="button">
          <Feather name="chevron-left" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.modalTitle}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onSelect(opt)}
          style={({ pressed }) => [styles.optionRow, pressed && { backgroundColor: "rgba(255,255,255,0.05)" }]}
          accessibilityLabel={opt} accessibilityRole="menuitem"
          accessibilityState={{ selected: selected === opt }}
        >
          <Text style={[styles.optionLabel, selected === opt && styles.optionLabelActive]}>{opt}</Text>
          {selected === opt && <Feather name="check" size={20} color="#e50914" />}
        </Pressable>
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────


const nStyles = StyleSheet.create({
  subtitleTopBar: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  lockScreen: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  unlockText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  speedBoostOverlay: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    marginTop: -28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 50,
  },
  speedBoostText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  bufferedFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
  },
  seekOverlay: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 30,
  },
  seekOverlayTime: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  seekOverlayDelta: {
    color: "#E50914",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  subtitleOverlay: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 15,
  },
  subtitleBg: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 4,
  },
  subtitleText: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 22,
  },
  styleLabel: {
    color: "#a3a3a3",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  styleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  styleChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  styleChipActive: {
    backgroundColor: "rgba(229,9,20,0.2)",
    borderColor: "#e50914",
  },
  styleChipText: {
    color: "#a3a3a3",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  styleChipTextActive: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
});

const gestureStyles = StyleSheet.create({
  leftHud: {
    position: "absolute", left: 16, top: "50%", marginTop: -90,
    width: 44, height: 180, backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 22, alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, zIndex: 20,
  },
  rightHud: {
    position: "absolute", right: 16, top: "50%", marginTop: -90,
    width: 44, height: 180, backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 22, alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, zIndex: 20,
  },
  sliderTrack: {
    flex: 1, width: 4, backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2, marginVertical: 8, overflow: "hidden", justifyContent: "flex-end",
  },
  sliderFill: { width: "100%", backgroundColor: "#fff", borderRadius: 2 },
  hudPct: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

const tapStyles = StyleSheet.create({
  leftFlash: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: "42%",
    alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.32)",
    borderTopRightRadius: 80, borderBottomRightRadius: 80, zIndex: 25,
  },
  rightFlash: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: "42%",
    alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.32)",
    borderTopLeftRadius: 80, borderBottomLeftRadius: 80, zIndex: 25,
  },
  seekLabel: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? 20 : 16, gap: 8,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  persistentCloseBtn: {
    position: "absolute", top: Platform.OS === "android" ? 20 : 16, left: 16, zIndex: 99,
  },
  persistentCloseBg: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.60)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  titleText: { flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  centerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 36,
  },
  centerBtn: { padding: 8 },
  playPauseBtn: { padding: 8 },
  netflixPlayWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "#e50914",
    alignItems: "center", justifyContent: "center",
    gap: 2,
    shadowColor: "#e50914", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 16, elevation: 12,
  },
  netflixN: {
    color: "#fff", fontSize: 11, fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1, position: "absolute", top: 7, left: 10, opacity: 0.9,
  },
  nativePauseWrap: { flexDirection: "row", gap: 6, marginTop: 4 },
  nativePauseBar: { width: 5, height: 28, backgroundColor: "#fff", borderRadius: 3 },

  bottomBar: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeText: {
    color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium",
    minWidth: 44, textAlign: "center",
  },
  progressTrack: {
    flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2, position: "relative",
  },
  progressFill: {
    position: "absolute", top: 0, left: 0,
    height: "100%", backgroundColor: "#e50914", borderRadius: 2,
  },
  progressKnob: {
    position: "absolute", top: -5,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#e50914", marginLeft: -7,
  },
  bottomActionsRow: {
    flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap",
  },
  speedChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  speedChipActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  speedChipText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  speedChipTextActive: { color: "#fff" },
  qualityChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  qualityChipText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },

  skipIntroBtn: {
    position: "absolute", right: 16, bottom: 96,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 4, borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 20,
  },
  skipIntroBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  dlBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingHorizontal: 16, paddingVertical: 8, zIndex: 20,
  },
  dlBarTrack: {
    flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2, overflow: "hidden",
  },
  dlBarFill: { height: "100%", backgroundColor: "#34D399", borderRadius: 2 },
  dlBarText: { color: "#34D399", fontSize: 11, fontFamily: "Inter_700Bold", minWidth: 32, textAlign: "right" },

  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row", justifyContent: "flex-end",
  },
  modalDrawer: {
    backgroundColor: "#0d0d0d", width: "45%", height: "100%",
    padding: 20, borderLeftWidth: 1, borderLeftColor: "#262626",
  },
  drawerHeader: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    marginBottom: 20, position: "relative",
  },
  drawerCloseX: { position: "absolute", right: 0, top: 0 },
  seasonScroll: { marginBottom: 15, flexGrow: 0 },
  modalSheet: {
    backgroundColor: "#0d0d0d",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#1e1e1e",
  },
  modalTitle: {
    color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold",
    textAlign: "center", marginBottom: 16,
  },
  settingsRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e1e1e",
  },
  settingsRowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingsRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingsLabel: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
  settingsValue: { color: "#737373", fontSize: 13, fontFamily: "Inter_400Regular" },
  modalCloseBtn: {
    marginTop: 18, backgroundColor: "#1a1a1a",
    borderRadius: 10, paddingVertical: 13, alignItems: "center",
  },
  modalCloseText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  optionsHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  optionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1a1a1a",
  },
  optionLabel: { color: "#a3a3a3", fontSize: 14, fontFamily: "Inter_400Regular" },
  optionLabelActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },

  autoplayOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  autoplayCard: {
    width: "80%", maxWidth: 400,
    backgroundColor: "rgba(25,25,25,0.8)",
    borderRadius: 20, padding: 30, alignItems: "center",
    overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  autoplayComingUp: {
    color: "#a3a3a3", fontSize: 14, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8,
  },
  autoplayTitle: {
    color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold",
    textAlign: "center", marginBottom: 24,
  },
  autoplayCircleWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "rgba(229,9,20,0.15)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 30, borderWidth: 3, borderColor: "rgba(229,9,20,0.4)",
  },
  autoplaySeconds: { color: "#e50914", fontSize: 34, fontFamily: "Inter_800ExtraBold" },
  autoplayActions: { flexDirection: "row", gap: 12, width: "100%" },
  autoplayCancelBtn: {
    flex: 1, backgroundColor: "#262626",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  autoplayCancelText: { color: "#a3a3a3", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  autoplayNowBtn: {
    flex: 1.5, backgroundColor: "#e50914",
    paddingVertical: 14, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  autoplayNowText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  bufferOverlay: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)", zIndex: 5, gap: 14,
  },
  bufferText: { color: "#ffffff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  bufferSubtext: { color: "#555555", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  errorOverlay: {
    ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.80)", zIndex: 10, gap: 14, paddingHorizontal: 32,
  },
  errorOverlayText: {
    color: "#e5e5e5", fontSize: 14, fontFamily: "Inter_500Medium",
    textAlign: "center", lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: "#e50914", borderRadius: 6,
    paddingHorizontal: 28, paddingVertical: 10,
  },
  retryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  epModalRow: {
    flexDirection: "row", gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e1e1e",
  },
  epActiveRow: { backgroundColor: "rgba(229,9,20,0.06)" },
  epModalThumbWrap: {
    width: 120, height: 68, borderRadius: 4,
    overflow: "hidden", backgroundColor: "#1a1a1a",
  },
  epModalThumb: { width: "100%", height: "100%" },
  epPlayingIndicator: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  epModalTitle: {
    color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4,
  },
  epModalDesc: {
    color: "#737373", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16,
  },
});
