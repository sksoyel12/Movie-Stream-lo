import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import SmartImage from "@/components/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SkeletonEpisodeRow } from "@/components/Skeleton";
import YoutubeEmbed from "@/components/YoutubeEmbed";
import GeminiRecommender from "@/components/GeminiRecommender";
import MovieAIPanel from "@/components/MovieAIPanel";
import MovieShareBottomSheet, { type ShareTarget } from "@/components/MovieShareBottomSheet";
import TitleMetadataRow from "@/components/TitleMetadataRow";
import { useMyList } from "@/contexts/MyListContext";
import { findMovie } from "@/data/movies";
import { haptic } from "@/lib/haptics";
import {
  downloadStoryPoster,
  shareToInstagramStory,
} from "@/lib/instagramStoryShare";
import {
  deleteDownload,
  downloadVideo,
  getDownloadRecord,
  type DownloadStatus,
} from "@/lib/downloads";
import {
  tmdb,
  tmdbGet,
  tmdbImg,
  tmdbToCard,
  fetchDetailPosterUri,
  type TMDBCastMember,
  type TMDBDetail,
  type TMDBEpisode,
  type TMDBMovie,
} from "@/lib/tmdb";
import { pickHindiFromVideos } from "@/lib/hindi-trailer";
import { loadProgress } from "@/lib/watchProgress";
import { addToWatchHistory } from "@/lib/watchHistory";
import {
  trackContentView,
  trackContentFeedback,
} from "@/lib/userPreferences";
import { routeStream } from "@/lib/streamingRouter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchMovieLinks, type MovieLinks } from "@/lib/movieLinks";
import {
  getDetailCacheKey,
  loadDetailCache,
  saveDetailCache,
  type DetailMediaType,
} from "@/lib/detailCache";
import {
  buildTitleMetadata,
  formatTitleAnnouncement,
  getTitleAnnouncement,
} from "@/lib/titleMetadata";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DETAIL_HERO_HEIGHT = Math.round((SCREEN_W * 9) / 16);

function buildSeasons(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => `Season ${i + 1}`);
}

function formatEpisodeDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function mapCertification(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const normalized = raw.toUpperCase().replace(/\s+/g, " ");
  const indianUa = normalized.match(/^U\/?A\s*(\d{1,2})\s*\+?$/);
  if (indianUa) return `U/A ${indianUa[1]}+`;
  if (normalized === "U" || normalized === "G" || normalized === "PG") return "U/A 13+";
  if (normalized === "UA" || normalized === "U/A") return "U/A 13+";
  if (normalized === "PG-13" || normalized === "TV-14") return "U/A 13+";
  if (normalized === "R" || normalized === "NC-17" || normalized === "TV-MA" || normalized === "A") return "A";
  return raw;
}

function pickCertification(
  data:
    | { results?: Array<{ iso_3166_1?: string; release_dates?: Array<{ certification?: string }> }> }
    | { results?: Array<{ iso_3166_1?: string; rating?: string }> },
  mediaType: "movie" | "tv",
): string | null {
  const results = data.results ?? [];
  const region =
    results.find((entry) => entry.iso_3166_1 === "IN") ??
    results.find((entry) => entry.iso_3166_1 === "US") ??
    results[0];
  if (!region) return null;

  if (mediaType === "movie") {
    const releaseDates = (region as { release_dates?: Array<{ certification?: string }> }).release_dates ?? [];
    return mapCertification(releaseDates.find((entry) => entry.certification?.trim())?.certification);
  }
  return mapCertification((region as { rating?: string }).rating);
}

type CachedTMDBDetail = {
  detail: TMDBDetail;
  type: DetailMediaType;
  posterUri: string | null;
  heroUri: string | null;
};

type MovieCollection = {
  id: number;
  name: string;
  overview: string;
  parts: Array<{
    id: number;
    title: string;
    poster_path: string | null;
    release_date: string;
    vote_average: number;
    overview: string;
  }>;
};

const COLLECTION_CACHE_PREFIX = "smovie_collection_v1_";

function collectionCacheKey(id: number): string {
  return `${COLLECTION_CACHE_PREFIX}${id}`;
}

function buildDynamicMovie(
  routeId: string,
  cached: CachedTMDBDetail,
): ReturnType<typeof findMovie> {
  const { detail, type, posterUri, heroUri } = cached;
  const title = detail.title ?? detail.name ?? "Untitled";
  const yearValue = (detail.release_date ?? detail.first_air_date ?? "").slice(0, 4);
  const year = /^\d{4}$/.test(yearValue) ? Number(yearValue) : 0;
  const seasons = detail.number_of_seasons ?? 0;

  return {
    id: routeId,
    title,
    poster: posterUri
      ? { uri: posterUri }
      : require("@/assets/images/hero.png"),
    hero: heroUri ? { uri: heroUri } : undefined,
    year,
    rating: "",
    duration:
      type === "tv"
        ? `${seasons} Season${seasons !== 1 ? "s" : ""}`
        : detail.runtime
          ? `${detail.runtime}m`
          : "",
    genres: detail.genres?.map((g) => g.name) ?? [],
    cast: [],
    director: "—",
    synopsis: detail.overview ?? "",
    dominantColor: "#1a1a2e",
    mediaType: type,
    tmdbRating: Math.round((detail.vote_average ?? 0) * 10) / 10,
    tmdbId: detail.id,
  } as any;
}

// ─── Memoised episode row ─────────────────────────────────────────────────────
// Defined OUTSIDE the main component so its identity never changes between
// renders. React.memo means a row only re-renders when its own props change.
interface EpisodeRowProps {
  ep: any;
  idx: number;
  isSelected: boolean;
  epProgress: number;
  movieId: string;
  isTV: boolean;
  seasonNum: number;
  episodeNum: number;
  movieTitle?: string;
  genreIds?: number[];
}
const EpisodeRow = React.memo(function EpisodeRow({
  ep,
  idx,
  isSelected,
  epProgress,
  movieId,
  isTV,
  seasonNum,
  episodeNum,
  movieTitle,
  genreIds,
}: EpisodeRowProps) {
  const isTMDB = ep?.episode_number != null;
  const epNum    = isTMDB ? ep.episode_number : ep.number ?? idx + 1;
  const epTitle  = isTMDB ? ep.name : ep.title ?? `Episode ${idx + 1}`;
  const epDesc   = isTMDB ? ep.overview : ep.description ?? "";
  const epDurRaw = isTMDB
    ? ep.runtime ?? 0
    : parseInt(ep.duration ?? "0", 10) || 0;
  const epDurLabel = epDurRaw >= 60
    ? `${Math.floor(epDurRaw / 60)}h ${epDurRaw % 60}m`
    : epDurRaw > 0 ? `${epDurRaw}m` : "";
  const thumbUri = isTMDB && ep.still_path
    ? `https://wsrv.nl/?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w780${ep.still_path}`)}`
    : null;
  const thumbSource = thumbUri ? { uri: thumbUri } : ep.thumbnail ?? ep.poster;
  const airDate = isTMDB ? ep.air_date : null;
  const episodeDateLabel = formatEpisodeDate(airDate);
  const isNew = airDate
    ? (Date.now() - new Date(airDate).getTime()) < 30 * 24 * 60 * 60 * 1000
    : false;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => {
        haptic.medium();
        router.push({
          pathname: "/player",
          params: {
            id: movieId,
            type: isTV ? "tv" : "movie",
            title_param: movieTitle ?? "",
            ...(genreIds?.length ? { genre_ids: genreIds.join(",") } : {}),
            season: String(seasonNum),
            episode: String(episodeNum),
          },
        });
      }}
      style={[styles.epCard, isSelected && styles.epCardActive]}
    >

      <View style={styles.epTopRow}>
        <View style={styles.epThumbWrap}>
          <SmartImage
            source={thumbSource}
            style={styles.epThumb}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
            title={epTitle}
          />
          <View style={[styles.epPlayCircle, isSelected && styles.epPlayCircleActive]}>
            <Ionicons name="play" size={isSelected ? 20 : 16} color="#fff" />
          </View>
          {epProgress > 0 && epProgress < 0.97 && (
            <View style={styles.epThumbProgress}>
              <View style={[styles.epThumbProgressFill, { width: `${Math.round(epProgress * 100)}%` as any }]} />
            </View>
          )}
        </View>

        <View style={styles.epMeta}>
          <View style={styles.epTitleRow}>
            <Text
              style={[styles.epTitle, isSelected && styles.epTitleActive]}
              numberOfLines={2}
            >
              {epNum}. {epTitle}
            </Text>
          </View>
          <View style={styles.epMetaBottom}>
            {epDurLabel ? (
              <Text style={styles.epDuration}>{epDurLabel}</Text>
            ) : null}
            {episodeDateLabel ? (
              <Text style={styles.epDate}>{episodeDateLabel}</Text>
            ) : null}
            {epProgress > 0.97 && (
              <View style={styles.epWatchedBadge}>
                <Ionicons name="checkmark" size={10} color="#34D399" />
                <Text style={styles.epWatchedText}>Watched</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          onPress={() => haptic.light()}
          hitSlop={10}
          style={styles.epDownloadBtn}
        >
          <Feather name="download" size={20} color="#737373" />
        </Pressable>
      </View>

      {epDesc ? (
        <Text style={styles.epDesc} numberOfLines={3}>
          {epDesc}
        </Text>
      ) : null}

      <View style={styles.epDivider} />
    </TouchableOpacity>
  );
});

export default function MovieDetail() {
  const rawParams = useLocalSearchParams<{ id: string; hdhubUrl?: string; poster_path?: string; title_param?: string; type?: string }>();
  const { id, hdhubUrl, poster_path: posterPathParam, title_param, type: typeParam } = rawParams ?? {};

  // Instant poster source — shown immediately from nav params before TMDB loads
  const navPosterSource = posterPathParam
    ? { uri: posterPathParam }
    : null;
  const insets = useSafeAreaInsets();

  // Numeric TMDB ID extracted directly from route param (works even without static data)
  const numericTmdbId = (() => {
    if (!id?.startsWith("tmdb-")) return null;
    const n = parseInt(id.replace("tmdb-", ""), 10);
    return isNaN(n) ? null : n;
  })();

  // Auth gate — must be checked before any redirect or data load
  const [authChecked, setAuthChecked] = useState(false);

  // Dynamic movie fetched from TMDB for IDs not in the local catalogue
  const [dynamicMovie, setDynamicMovie] = useState<ReturnType<typeof findMovie>>(undefined);
  // Start in loading state immediately when we have a valid TMDB ID and no local data,
  // so the very first render never flashes "Movie not found" before the effect fires.
  const [loadingDynamic, setLoadingDynamic] = useState(() => {
    const hasTmdbId = id?.startsWith("tmdb-") && !isNaN(parseInt((id ?? "").replace("tmdb-", ""), 10));
    return hasTmdbId && !findMovie(id ?? "");
  });
  // Set when all dynamic-load attempts fail — shows a retryable error rather than
  // permanently hiding the poster and leaving the screen blank.
  const [dynamicLoadFailed, setDynamicLoadFailed] = useState(false);
  // Incrementing this causes the dynamic-load effect to re-run for a retry.
  const [dynamicRetryKey, setDynamicRetryKey] = useState(0);

  const staticMovie = findMovie(id ?? "");
  const movie = staticMovie ?? dynamicMovie;

  const { isInList, toggle } = useMyList();
  const inList = movie ? isInList(movie.id) : false;
  const [activeSection, setActiveSection] = useState<"episodes" | "collection" | "trailers" | "more">("episodes");
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  const [dlStatus, setDlStatus] = useState<DownloadStatus>("idle");
  const [dlProgress, setDlProgress] = useState(0);

  // YouTube trailer for hero + full videos list for Trailers & More tab
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [allVideos, setAllVideos] = useState<Array<{ key: string; name: string; type: string; site: string; isHindi?: boolean }>>([]);
  const [isTrailerHindi, setIsTrailerHindi] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [heroTrailerFailed, setHeroTrailerFailed] = useState(false);

  // User rating — persisted locally
  const [userRating, setUserRating] = useState<"down" | "up" | "love" | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  // Ref for the main detail scroll view — used to jump back to the hero when switching trailers
  const mainScrollRef = useRef<import("react-native").ScrollView>(null);

  // Full-screen trailer modal
  const [showTrailerModal, setShowTrailerModal] = useState(false);

  // JustWatch watch providers (via TMDb)
  const [watchProviders, setWatchProviders] = useState<Array<{ logo_path: string; provider_name: string; provider_id: number }>>([]);
  // IMDb external ID for linking
  const [imdbId, setImdbId] = useState<string | null>(null);
  // TMDB regional content certification used by the Netflix-style metadata row
  const [contentCertification, setContentCertification] = useState<string | null>(null);
  // Movie franchise / collection data
  const [collectionData, setCollectionData] = useState<MovieCollection | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Episode navigation — track which episode is actively selected/playing
  const [selectedEpisodeIdx, setSelectedEpisodeIdx] = useState<number>(0);
  // Per-episode watch progress (episode_number → 0..1 ratio)
  const [episodeProgresses, setEpisodeProgresses] = useState<Record<number, number>>({});
  // TMDB live data
  const [tmdbDetail, setTmdbDetail] = useState<TMDBDetail | null>(null);
  const [tmdbEpisodes, setTmdbEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Firebase movie links (vegamovies, fzmovies, xprime)
  const [movieLinks, setMovieLinks] = useState<MovieLinks | null>(null);

  // Cast
  const [cast, setCast] = useState<TMDBCastMember[]>([]);
  const [loadingCast, setLoadingCast] = useState(false);

  // More Like This
  const [recommendations, setRecommendations] = useState<ReturnType<typeof tmdbToCard>[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // isTV: first honours the explicit `type` URL param, then falls back to heuristics
  const [isTV, setIsTV] = useState<boolean>(() => {
    if (typeParam === "tv") return true;
    if (typeParam === "movie") return false;
    if (!staticMovie) return false;
    const mt = (staticMovie as any).mediaType as string | undefined;
    if (mt) return mt === "tv";
    if ((staticMovie.episodes?.length ?? 0) > 0) return true;
    // Detect TV shows by duration string: "4 Seasons", "5 Parts", "Limited Series", etc.
    if (/\b(seasons?|parts?|limited[\s-]series|episode|series)\b/i.test(staticMovie.duration ?? "")) return true;
    return false;
  });

  // tmdbId: prefer stored field, fall back to numeric from route param
  const tmdbId = (() => {
    const raw = (movie as any)?.tmdbId as number | undefined;
    if (raw) return raw;
    return numericTmdbId;
  })();
  const currentGenreIds = useMemo(
    () => (tmdbDetail?.genres ?? []).map((genre) => genre.id),
    [tmdbDetail?.genres],
  );


  // ── Dark Knight blacklist: ID 155 must never render ──────────────────────
  const isDarkKnight = (
    numericTmdbId === 155 ||
    (movie as any)?.tmdbId === 155 ||
    movie?.id === "155" ||
    movie?.title === "The Dark Knight"
  );

  const tmdbSeasonMeta = useMemo(
    () => (tmdbDetail?.seasons ?? []).filter((s) => (s.episode_count ?? 0) > 0),
    [tmdbDetail],
  );
  const hasTmdbSeasonMeta = tmdbSeasonMeta.length > 0;
  const seasonNumbers = useMemo(
    () =>
      hasTmdbSeasonMeta
        ? tmdbSeasonMeta.map((s) => s.season_number)
        : Array.from(
            { length: Math.max(1, tmdbDetail?.number_of_seasons ?? (movie as any)?.seasons ?? (isTV ? 1 : 0)) },
            (_, i) => i + 1,
          ),
    [hasTmdbSeasonMeta, tmdbSeasonMeta, tmdbDetail, movie, isTV],
  );

  // Detect unreleased / Coming Soon titles from TMDB detail
  const isComingSoon = useMemo(() => {
    const dateStr = tmdbDetail?.release_date ?? tmdbDetail?.first_air_date;
    if (!dateStr || dateStr.length < 4) return false;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      return d > today;
    } catch { return false; }
  }, [tmdbDetail]);

  // Render the catalog certification immediately, then replace it with the
  // regional TMDB value when that request finishes.
  const displayCertification = useMemo(
    () => contentCertification ?? mapCertification(movie?.rating),
    [contentCertification, movie?.rating],
  );

  const titleMetadata = useMemo(
    () =>
      buildTitleMetadata({
        movie,
        detail: tmdbDetail,
        isTV,
        certification: displayCertification,
        episodeCount: tmdbEpisodes.length || movie?.episodes?.length,
      }),
    [displayCertification, isTV, movie, tmdbDetail, tmdbEpisodes.length],
  );

  const highlightStatus = useMemo(() => {
    const announcement = getTitleAnnouncement(movie, tmdbDetail, isTV);
    const formattedAnnouncement = formatTitleAnnouncement(announcement);
    if (formattedAnnouncement) return formattedAnnouncement;
    if (tmdbDetail?.status === "Post Production") return "Coming soon";
    if (isComingSoon) {
      const date = tmdbDetail?.release_date ?? tmdbDetail?.first_air_date;
      const formattedDate = formatEpisodeDate(date);
      return formattedDate ? `Coming on ${formattedDate}` : "Coming soon";
    }
    return null;
  }, [isComingSoon, isTV, movie, tmdbDetail]);

  // Download action label — mirrors active season + episode selector
  const downloadActionLabel = useMemo(() => {
    if (!isTV) return "Download";
    const sNum = seasonNumbers[selectedSeason] ?? 1;
    const eNum = (selectedEpisodeIdx ?? 0) + 1;
    return `Download S${sNum}:E${eNum}`;
  }, [isTV, seasonNumbers, selectedSeason, selectedEpisodeIdx]);

  // Short label for the icon-row download button
  const downloadIconLabel = useMemo(() => {
    if (!isTV) return "Download";
    const sNum = seasonNumbers[selectedSeason] ?? 1;
    return `Download Season ${sNum}`;
  }, [isTV, seasonNumbers, selectedSeason]);

  // ─── Auth gate ─────────────────────────────────────────────────────────────
  // Mark the page as ready to render once Firebase confirms auth state.
  // We do NOT redirect unauthenticated users here — the home screen is
  // accessible without sign-in, so the detail/browse page must be too.
  // Only the actual streaming/play action should gate on auth.
  // A 3-second safety timeout ensures the page always renders even if
  // Firebase is misconfigured, offline, or slow to respond.
  useEffect(() => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setAuthChecked(true);
    };
    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthStateChanged(firebaseAuth, settle);
    } catch {
      settle();
    }
    const timer = setTimeout(settle, 3000);
    return () => {
      unsub?.();
      clearTimeout(timer);
    };
  }, []);

  // Load movie data from TMDB when it's not in the local catalogue
  useEffect(() => {
    if (staticMovie || !numericTmdbId) return;
    let cancelled = false;
    setLoadingDynamic(true);
    const tryLoad = async () => {
      // Honour the type URL param to avoid fetching the wrong endpoint
      const typeOrder: ("movie" | "tv")[] = typeParam === "tv"
        ? ["tv", "movie"]
        : typeParam === "movie"
          ? ["movie", "tv"]
          : ["movie", "tv"];

      // Hydrate the page from the last successful detail response first.
      // The network request below still runs so the cache is refreshed when
      // connectivity is available.
      for (const type of typeOrder) {
        const cached = await loadDetailCache<CachedTMDBDetail>(
          getDetailCacheKey(type, numericTmdbId),
        );
        if (cancelled) return;
        if (cached?.detail) {
          setDynamicMovie(buildDynamicMovie(id ?? "", cached));
          setTmdbDetail(cached.detail);
          if (cached.type === "tv") setIsTV(true);
          break;
        }
      }

      for (const type of typeOrder) {
        try {
          const detail = await tmdb.detail(type, numericTmdbId);
          if (cancelled) return;
          const poster_path = detail.poster_path;
          const backdrop_path = detail.backdrop_path;
          // Detail-page poster: uses images[1] (getDetailPoster logic) so the
          // detail screen shows DIFFERENT artwork than the home screen (which
          // uses rotation_key-based selection from the same pool).
          const detailPosterUri = await fetchDetailPosterUri(numericTmdbId, type, poster_path).catch(() => null);
          const posterUri = detailPosterUri ?? tmdbImg(poster_path, "w500");
           // Use a large backdrop for the 16:9 detail frame. w500 poster
           // assets look soft when stretched across modern phone/web previews.
           const heroUri = tmdbImg(backdrop_path, "w1280");
          const cachedPayload: CachedTMDBDetail = {
            detail,
            type,
            posterUri,
            heroUri,
          };
          saveDetailCache(
            getDetailCacheKey(type, numericTmdbId),
            cachedPayload,
          ).catch(() => {});
          setDynamicMovie(buildDynamicMovie(id ?? "", cachedPayload));
          setTmdbDetail(detail);
          if (type === "tv") setIsTV(true);
          return;
        } catch {
          continue;
        }
      }
    };
    tryLoad()
      .then(() => {
        // tryLoad sets dynamicMovie on success; if it returns without setting
        // (all types failed), mark as failed so the UI can show a retry option.
        if (!cancelled) {
          setDynamicMovie((prev) => {
            if (!prev) setDynamicLoadFailed(true);
            return prev;
          });
        }
      })
      .finally(() => { if (!cancelled) setLoadingDynamic(false); });
    return () => { cancelled = true; };
  // dynamicRetryKey is incremented by the "Retry" button to re-trigger this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericTmdbId, staticMovie, dynamicRetryKey]);

  // Save to watch history + track genre preference whenever we have a valid movie
  useEffect(() => {
    if (!movie) return;
    const posterUri = (() => {
      const p = movie.poster;
      if (typeof p === "object" && "uri" in p && typeof (p as any).uri === "string") return (p as any).uri as string;
      return "";
    })();
    if (!movie.id || !movie.title) return;
    const genreIds = currentGenreIds;
    addToWatchHistory({
      id: movie.id,
      title: movie.title,
      posterUri,
      tmdbId: (movie as any).tmdbId ?? numericTmdbId ?? undefined,
      mediaType: (movie as any).mediaType ?? (isTV ? "tv" : "movie"),
      genreIds,
    }).catch(() => {});
    // Silent background genre tracking — fire-and-forget, never awaited
    // Prefer numeric genre IDs from tmdbDetail; this reruns when detail data arrives.
    if (genreIds.length > 0) {
      trackContentView(movie.id, genreIds).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, tmdbDetail?.id, currentGenreIds]);

  // Load persisted user rating from AsyncStorage on mount / id change
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`smovie_rating_${id}`)
      .then((r) => { if (r === "up" || r === "down") setUserRating(r); })
      .catch(() => {});
  }, [id]);

  // Fetch TMDB detail for static movies that have a known tmdbId
  useEffect(() => {
    if (!tmdbId || dynamicMovie) return; // dynamicMovie already has detail pre-loaded
    let cancelled = false;
    const fetchDetail = async () => {
      // Try current type, then the other type as fallback
      const types: Array<"movie" | "tv"> = isTV ? ["tv", "movie"] : ["movie", "tv"];

      // Show the last successful response immediately when the network is
      // unavailable, then continue with the normal fresh request.
      for (const type of types) {
        const cached = await loadDetailCache<CachedTMDBDetail>(
          getDetailCacheKey(type, tmdbId),
        );
        if (cancelled) return;
        if (cached?.detail) {
          setTmdbDetail(cached.detail);
          if (cached.type === "tv") setIsTV(true);
          break;
        }
      }

      for (const type of types) {
        try {
          const d = await tmdb.detail(type, tmdbId);
          if (cancelled) return;
          saveDetailCache(getDetailCacheKey(type, tmdbId), {
            detail: d,
            type,
            posterUri: null,
            heroUri: null,
          } satisfies CachedTMDBDetail).catch(() => {});
          setTmdbDetail(d);
          if ((d.number_of_seasons ?? 0) > 0) setIsTV(true);
          return;
        } catch {
          continue;
        }
      }
    };
    fetchDetail();
    return () => { cancelled = true; };
  }, [tmdbId, dynamicMovie, isTV]);

  useEffect(() => {
    if (selectedSeason < seasonNumbers.length) return;
    setSelectedSeason(0);
  }, [selectedSeason, seasonNumbers.length]);

  // For movies (non-TV), auto-switch default tab to "Trailers & More" (or "More Like This" if no videos)
  useEffect(() => {
    if (!isTV && tmdbEpisodes.length === 0 && activeSection === "episodes") {
      setActiveSection("trailers");
    }
  }, [isTV, tmdbEpisodes.length, activeSection]);

  // Fetch episodes when season changes (only once isTV is confirmed)
  useEffect(() => {
    if (!tmdbId || !isTV) return;
    let cancelled = false;
    const seasonNumber = seasonNumbers[selectedSeason] ?? seasonNumbers[0] ?? 1;
    const cacheKey = getDetailCacheKey(
      "tv",
      tmdbId,
      `season-${seasonNumber}`,
    );

    setLoadingEpisodes(true);
    setTmdbEpisodes([]);

    (async () => {
      const cached = await loadDetailCache<TMDBEpisode[]>(cacheKey);
      if (cancelled) return;
      const hasCachedEpisodes = Array.isArray(cached);
      if (hasCachedEpisodes) {
        setTmdbEpisodes(cached);
        setLoadingEpisodes(false);
      }

      try {
        const data = await tmdb.seasonDetail(tmdbId, seasonNumber);
        if (cancelled) return;
        const episodes = data.episodes ?? [];
        setTmdbEpisodes(episodes);
        saveDetailCache(cacheKey, episodes).catch(() => {});
      } catch {
        // Keep the cached episode list on network failure.
        if (!cancelled && !hasCachedEpisodes) setTmdbEpisodes([]);
      } finally {
        if (!cancelled) setLoadingEpisodes(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tmdbId, isTV, selectedSeason, seasonNumbers]);

  // Fetch "More Like This" recommendations (merge recs + similar, dedupe by id)
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    const type = isTV ? "tv" : "movie";
    setLoadingRecs(true);
    Promise.allSettled([
      tmdb.recommendations(type, tmdbId),
      tmdb.similar(type, tmdbId),
    ]).then((results) => {
      if (cancelled) return;
      const seen = new Set<number>();
      const merged: TMDBMovie[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const item of r.value.results ?? []) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              // Tag mediaType so tmdbToCard resolves correctly
              merged.push({ ...item, media_type: type });
            }
          }
        }
      }
      setRecommendations(merged.slice(0, 24).map(tmdbToCard));
    }).catch(() => {
      if (!cancelled) setRecommendations([]);
    }).finally(() => {
      if (!cancelled) setLoadingRecs(false);
    });
    return () => { cancelled = true; };
  }, [tmdbId, isTV]);

  // Fetch cast credits (top 15 billed actors)
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    setLoadingCast(true);
    const type = isTV ? "tv" : "movie";
    tmdb.credits(type, tmdbId)
      .then(({ cast: c }) => {
        if (!cancelled) {
          setCast(c.filter((m) => m.order < 20).slice(0, 15));
        }
      })
      .catch(() => { if (!cancelled) setCast([]); })
      .finally(() => { if (!cancelled) setLoadingCast(false); });
    return () => { cancelled = true; };
  }, [tmdbId, isTV]);

  // Fetch trailer from TMDB only — Hindi highest priority:
  //   1. Hindi Trailer (TMDB)  2. Hindi Teaser (TMDB)  3. Hindi Promo (TMDB)
  //   4. English Trailer/Teaser (TMDB)
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    const mt = isTV ? "tv" : "movie";
    tmdb.videos(mt, tmdbId)
      .then(({ results }) => {
        if (cancelled) return;
        const ytVideos = (results as any[]).filter((v) => v.site === "YouTube");
        // Full list for Trailers & More tab — each item knows if it's Hindi
        setAllVideos(ytVideos.map((v) => ({
          key: v.key, name: v.name, type: v.type, site: v.site,
          isHindi: v.iso_639_1 === "hi",
        })));
        // Pick the highest-priority trailer from TMDB
        const fromTmdb = pickHindiFromVideos(ytVideos);
        if (fromTmdb?.isHindi) {
          setTrailerKey(fromTmdb.key);
          setIsTrailerHindi(true);
          return;
        }
        // Fallback: best English trailer/teaser returned by TMDB
        if (!cancelled && fromTmdb) {
          setTrailerKey(fromTmdb.key);
          setIsTrailerHindi(false);
          return;
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAllVideos([]);
        setTrailerKey(null);
      })
      .finally(() => { if (!cancelled) setLoadingVideos(false); });
    return () => { cancelled = true; };
  }, [tmdbId, isTV]);

  useEffect(() => {
    setHeroTrailerFailed(false);
  }, [trailerKey]);

  // Fetch JustWatch watch providers + IMDb ID via TMDb
  useEffect(() => {
    if (!numericTmdbId) return;
    let cancelled = false;
    const mt = isTV ? "tv" : "movie";
    // Watch providers (JustWatch data) — via server proxy
    tmdbGet<{ results?: Record<string, { flatrate?: Array<{ logo_path: string; provider_name: string; provider_id: number }> }> }>(
      `/${mt}/${numericTmdbId}/watch/providers`,
    )
      .then((data) => {
        if (cancelled) return;
        const results = data?.results ?? {};
        const region = results.IN ?? results.US ?? (Object.values(results)[0] as any);
        const flatrate: Array<{ logo_path: string; provider_name: string; provider_id: number }> =
          region?.flatrate ?? [];
        setWatchProviders(flatrate.slice(0, 6));
      })
      .catch(() => {});

    // IMDb external ID — via server proxy
    const externalPath = mt === "tv"
      ? `/${mt}/${numericTmdbId}/external_ids`
      : `/${mt}/${numericTmdbId}`;
    const externalParams: Record<string, string> = mt === "movie" ? { append_to_response: "external_ids" } : {};
    tmdbGet<{ imdb_id?: string; external_ids?: { imdb_id?: string } }>(externalPath, externalParams)
      .then((data) => {
        if (cancelled) return;
        const iid = data?.imdb_id ?? data?.external_ids?.imdb_id ?? null;
        if (iid) setImdbId(iid);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [numericTmdbId, isTV]);

  // Fetch the regional content certification for the metadata pill.
  useEffect(() => {
    if (!tmdbId) {
      setContentCertification(null);
      return;
    }
    let cancelled = false;
    const mediaType = isTV ? "tv" : "movie";
    setContentCertification(null);
    tmdb.certifications(mediaType, tmdbId)
      .then((data) => {
        if (!cancelled) setContentCertification(pickCertification(data, mediaType));
      })
      .catch(() => {
        if (!cancelled) setContentCertification(mapCertification(movie?.rating));
      });
    return () => { cancelled = true; };
  }, [isTV, movie?.rating, tmdbId]);

  // Fetch the official movie franchise collection when tmdbDetail resolves.
  // Collection data is cached separately so a previously opened franchise
  // remains usable when the device is offline.
  useEffect(() => {
    const col = tmdbDetail?.belongs_to_collection;
    if (!col?.id || isTV) {
      setCollectionData(null);
      setCollectionLoading(false);
      return;
    }
    let cancelled = false;
    setCollectionLoading(true);

    (async () => {
      try {
        const cached = await AsyncStorage.getItem(collectionCacheKey(col.id));
        if (!cancelled && cached) {
          const parsed = JSON.parse(cached) as MovieCollection;
          if (parsed?.id === col.id && Array.isArray(parsed.parts)) {
            setCollectionData(parsed);
          }
        }
      } catch {}

      try {
        const data = await tmdbGet<MovieCollection>(`/collection/${col.id}`);
        if (!cancelled && data?.id === col.id && Array.isArray(data.parts)) {
          setCollectionData(data);
          AsyncStorage.setItem(collectionCacheKey(col.id), JSON.stringify(data)).catch(() => {});
        }
      } catch {
        // Keep the cached collection, if one was available.
      } finally {
        if (!cancelled) setCollectionLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isTV, tmdbDetail]);

  // Load per-episode watch progress when season episodes load
  useEffect(() => {
    if (!tmdbEpisodes.length || !movie?.id) return;
    let cancelled = false;
    const seasonNum = seasonNumbers[selectedSeason] ?? 1;
    (async () => {
      const progMap: Record<number, number> = {};
      await Promise.all(
        tmdbEpisodes.map(async (ep) => {
          const key = `${movie.id}_s${seasonNum}_e${ep.episode_number}`;
          const p = await loadProgress(key).catch(() => null);
          if (p && p.durationSec > 0 && p.positionSec > 5) {
            progMap[ep.episode_number] = Math.min(p.positionSec / p.durationSec, 1);
          }
        }),
      );
      if (!cancelled) setEpisodeProgresses(progMap);
    })();
    return () => { cancelled = true; };
  }, [tmdbEpisodes, movie?.id, selectedSeason, seasonNumbers]);

  useEffect(() => {
    if (movie?.id) {
      getDownloadRecord(movie.id).then((rec) => {
        if (rec) { setDlStatus(rec.status); setDlProgress(rec.progress); }
      });
    }
  }, [movie?.id]);

  // Fetch Firebase streaming links for this TMDB ID
  useEffect(() => {
    if (!tmdbId) return;
    setMovieLinks(null);
    fetchMovieLinks(tmdbId).then((links) => {
      setMovieLinks(links);
    }).catch(() => {});
  }, [tmdbId]);


  const handleDownload = useCallback(async () => {
    if (!movie) return;
    haptic.medium();
    if (dlStatus === "complete") {
      Alert.alert(
        `"${movie.title}" is downloaded`,
        "You can watch it offline anytime.",
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Delete download",
            style: "destructive",
            onPress: async () => {
              await deleteDownload(movie.id);
              setDlStatus("idle");
              setDlProgress(0);
            },
          },
        ],
      );
      return;
    }
    if (dlStatus === "downloading") return;
    setDlStatus("downloading");
    setDlProgress(0);
    try {
      const stream = await routeStream({
        tmdbId: numericTmdbId ?? (Number((movie as any).tmdbId) || null),
        type: isTV ? "tv" : "movie",
        title: movie.title,
        season: seasonNumbers[selectedSeason] ?? 1,
        episode: selectedEpisodeIdx + 1,
      });
      if (!stream.url) throw new Error("No downloadable stream was found.");
      await downloadVideo(movie.id, stream.url, (p) => setDlProgress(p));
      setDlStatus("complete");
      setDlProgress(1);
      Alert.alert("Download complete", `"${movie.title}" is saved for offline viewing.`);
    } catch {
      setDlStatus("error");
      Alert.alert("Download failed", "Please check your connection and try again.");
    }
  }, [
    movie,
    dlStatus,
    numericTmdbId,
    isTV,
    seasonNumbers,
    selectedSeason,
    selectedEpisodeIdx,
  ]);

  const getSharePosterUri = () => {
    if (!movie) return null;
    if (typeof movie.poster === "object" && movie.poster && "uri" in movie.poster) {
      return (movie.poster as any).uri as string;
    }
    return null;
  };

  const getShareUrl = () =>
    `https://s-movie.com/movie/${encodeURIComponent(String(id ?? movie?.id ?? ""))}`;

  const handleShare = () => {
    haptic.light();
    setShowShareSheet(true);
  };

  const handleShareTarget = async (target: ShareTarget) => {
    if (!movie) return;
    const url = getShareUrl();
    const message = `Check out "${movie.title}" on S-MOVIE ORIGINAL: ${url}`;
    setShowShareSheet(false);
    haptic.light();

    if (target === "instagram") {
      const posterUri = getSharePosterUri();
      if (posterUri) {
        const result = await shareToInstagramStory({ posterUri, title: movie.title, contentUrl: url });
        if (result.file && result.status !== "shared") {
          Alert.alert(
            result.status === "cancelled" ? "Share cancelled" : "Story poster ready",
            "Download the generated S-MOVIE ORIGINAL poster and upload it to Instagram Stories.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Download PNG", onPress: () => downloadStoryPoster(result.file!, movie.title) },
            ],
          );
        }
      } else {
        await Share.share({ title: movie.title, message, url } as any);
      }
      return;
    }

    if (target === "more") {
      await Share.share({ title: movie.title, message, url } as any);
      return;
    }

    const appUrl =
      target === "whatsapp" ? `whatsapp://send?text=${encodeURIComponent(message)}` :
      target === "messages" ? `sms:?body=${encodeURIComponent(message)}` :
      target === "messenger" ? `fb-messenger://share/?link=${encodeURIComponent(url)}` :
      `snapchat://creative-kit/preview?attachmentUrl=${encodeURIComponent(url)}`;

    try {
      if (await Linking.canOpenURL(appUrl)) {
        await Linking.openURL(appUrl);
      } else {
        await Share.share({ title: movie.title, message, url } as any);
      }
    } catch {
      await Share.share({ title: movie.title, message, url } as any);
    }
  };

  const handleRate = useCallback(async (type: "down" | "up" | "love") => {
    const next = userRating === type ? null : type;
    setUserRating(next);
    setShowRatingModal(false);
    haptic.medium();
    try {
      if (next) {
        await AsyncStorage.setItem(`smovie_rating_${id}`, next);
      } else {
        await AsyncStorage.removeItem(`smovie_rating_${id}`);
      }
    } catch { }
    const genreIds = (tmdbDetail?.genres ?? []).map((genre) => genre.id);
    trackContentFeedback(movie?.id ?? id ?? "", genreIds, type).catch(() => {});
  }, [userRating, id]);

  // Trigger playback for episodes and the main Play button
  const handlePlay = (episodeId?: string, seasonNum?: number, episodeNum?: number, epIdx?: number) => {
    if (epIdx !== undefined) setSelectedEpisodeIdx(epIdx);
    haptic.medium();
    router.push({
      pathname: "/player",
      params: {
        id: movie?.id ?? "",
        type: isTV ? "tv" : "movie",
        title_param: movie?.title ?? "",
        ...(
          (tmdbDetail?.genres ?? []).length > 0
            ? { genre_ids: currentGenreIds.join(",") }
            : {}
        ),
        ...(seasonNum != null ? { season: String(seasonNum) } : {}),
        ...(episodeNum != null ? { episode: String(episodeNum) } : {}),
      },
    });
  };

  // Wait for Firebase to confirm the session before rendering anything.
  // Without this, the screen renders for a frame then bounces to onboarding.
  if (!authChecked) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#e50914" />
      </View>
    );
  }

  // Block The Dark Knight (ID 155) from rendering in the detail screen
  if (isDarkKnight) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Content unavailable</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!movie) {
    // Only show "Movie not found" when:
    //   - We are not currently loading, AND
    //   - There is no valid TMDB ID we could still retry (genuinely invalid route), OR
    //   - All TMDB fetch attempts have been exhausted and explicitly failed.
    // This prevents the error screen from flashing during inter-render gaps or
    // transient network failures while nav-param data (poster, title) is available.
    const genuinelyMissing = !loadingDynamic && (numericTmdbId === null || dynamicLoadFailed);
    if (genuinelyMissing) {
      return (
        <View style={[styles.container, styles.centerContent]}>
          <Text style={styles.errorText}>
            {dynamicLoadFailed ? "Unable to load — check your connection" : "Movie not found"}
          </Text>
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              if (dynamicLoadFailed) {
                // Reset failed state and re-trigger the load effect via retryKey
                setDynamicLoadFailed(false);
                setLoadingDynamic(true);
                setDynamicRetryKey((k) => k + 1);
              } else {
                router.back();
              }
            }}
          >
            <Text style={styles.backBtnText}>{dynamicLoadFailed ? "Retry" : "Go back"}</Text>
          </Pressable>
          <Pressable style={[styles.backBtn, { marginTop: 8, backgroundColor: "transparent" }]} onPress={() => router.back()}>
            <Text style={[styles.backBtnText, { color: "#737373" }]}>Go back</Text>
          </Pressable>
        </View>
      );
    }

    // Data is still loading — show the nav-param poster immediately (no blank screen).
    // If no poster was passed, show a centred spinner so the screen is never pure black.
    // Keep the detail hero frame at a true 16:9 ratio (approximately 691 × 387
    // on the large preview), matching the supplied poster/hero dimensions.
    const instantHeroH = DETAIL_HERO_HEIGHT;

    // Shared loading body — title + Play + Download visible immediately
    const loadingBody = (
      <View style={styles.body}>
        {!!title_param && <Text style={styles.title}>{title_param}</Text>}
        {/* Play button — functional even during load (we have id + type from params) */}
        <Pressable
          onPress={() => {
            haptic.medium();
            router.push({
              pathname: "/player",
              params: {
                id: id ?? "",
                type: typeParam ?? "movie",
                title_param: title_param ?? "",
                ...(currentGenreIds.length ? { genre_ids: currentGenreIds.join(",") } : {}),
              },
            });
          }}
          style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.88 }]}
        >
          <Ionicons name="play" size={20} color="#000" />
          <Text style={styles.playBtnText}>Play</Text>
        </Pressable>
        {/* Download button — shows skeleton during load */}
        <Pressable
          onPress={() => haptic.light()}
          style={styles.downloadBtn}
        >
          <Feather name="arrow-down-circle" size={20} color="#fff" />
          <Text style={styles.downloadBtnText}>Download</Text>
        </Pressable>
        {/* Subtle loading indicator below buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
          <ActivityIndicator size="small" color="#E50914" />
          <Text style={{ color: "#666", fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading details…</Text>
        </View>
      </View>
    );

    if (!navPosterSource) {
      return (
        <View style={styles.container}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.heroCloseBtn, { top: insets.top > 0 ? insets.top + 6 : 18, position: "absolute", zIndex: 20 }]}
          >
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View style={[styles.hero, { height: instantHeroH, backgroundColor: "#0d0d0d", alignItems: "center", justifyContent: "center" }]}>
            <LinearGradient colors={["#1a1a2e", "#0d0d0d"]} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color="#E50914" />
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {loadingBody}
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { height: instantHeroH, backgroundColor: "#0d0d0d" }]}>
            {/* Poster visible immediately while TMDB details load */}
            <SmartImage
              source={navPosterSource}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
              priority="high"
              title={title_param ?? "Movie"}
            />
            {/* Gradient: strong top shadow for back button + fade to black at bottom */}
            <LinearGradient
              colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.72)", "#000"]}
              locations={[0, 0.40, 0.80, 1]}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={[styles.heroCloseBtn, { top: insets.top > 0 ? insets.top + 6 : 18 }]}
            >
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
          {loadingBody}
        </ScrollView>
      </View>
    );
  }

  // Detail poster/hero frame — exact 16:9 ratio across phone and web previews.
  const heroHeight = DETAIL_HERO_HEIGHT;
  const seasonList = hasTmdbSeasonMeta
    ? tmdbSeasonMeta.map((season) => season.name || `Season ${season.season_number}`)
    : buildSeasons(seasonNumbers.length);

  const episodesToShow: Array<TMDBEpisode | NonNullable<typeof movie.episodes>[number]> =
    tmdbEpisodes.length > 0 ? tmdbEpisodes : (movie.episodes ?? []);

  const isTMDBEp = (ep: any): ep is TMDBEpisode =>
    typeof ep.episode_number === "number";

  const firstEpLabel = isTV ? "S1:E1" : null;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — poster/hero frame at 16:9 ──────────────────────────────── */}
        <View style={[styles.hero, { height: heroHeight }]}>

          {/* High-resolution TMDB backdrop stays underneath as the reliable
              fallback while the teaser/trailer loads or if the video fails. */}
          <SmartImage
            source={(movie?.hero ?? navPosterSource ?? movie?.poster ?? require("@/assets/images/hero.png")) as any}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            transition={0}
            cachePolicy="disk"
            priority="high"
            title={movie.title}
          />

          {/* Mobile browsers can leave an autoplay iframe black even though
              it reports as loaded. Keep the premium TMDB artwork visible on
              web; native Android can autoplay the muted TMDB teaser reliably.
              The Trailer chip still opens the full player on every platform. */}
          {Platform.OS !== "web" && trailerKey && !heroTrailerFailed && (
            <View style={StyleSheet.absoluteFill}>
              <YoutubeEmbed
                videoKey={trailerKey}
                muted
                controls={false}
                loop
                style={StyleSheet.absoluteFill}
                onError={() => setHeroTrailerFailed(true)}
              />
              {/* The teaser is intentionally non-interactive in the hero;
                  tapping it opens the existing full trailer player. */}
              <Pressable
                onPress={() => {
                  haptic.light();
                  setShowTrailerModal(true);
                }}
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel="Open trailer"
              />
            </View>
          )}

          {/* Gradient: strong top shadow to keep back button readable, fades to black at bottom */}
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.10)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.72)", "#000"]}
            locations={[0, 0.12, 0.50, 0.82, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* X close button — top right */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.heroCloseBtn, { top: insets.top > 0 ? insets.top + 6 : 18 }]}
          >
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>


          {/* Bottom row: Trailer chip only */}
          <View style={styles.heroBottomRow}>
            <Pressable
              onPress={() => {
                if (allVideos.length > 0) {
                  haptic.light();
                  setTrailerKey(allVideos[0].key);
                  setShowTrailerModal(true);
                } else if (trailerKey) {
                  haptic.light();
                  setShowTrailerModal(true);
                }
              }}
              style={styles.heroTrailerChip}
            >
              <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="play-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.heroTrailerText}>Trailer</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Body — seamless Netflix layout ───────────────────────── */}
        <View style={styles.body}>

          {/* S SERIES / S MOVIE type label */}
          <View style={styles.typeLabelRow}>
            <Text style={styles.sLogo}>S</Text>
            <Text style={styles.typeLabel}>{isTV ? "SERIES" : "FILM"}</Text>
          </View>

          {/* Title */}
           <Text style={styles.title}>{movie?.title ?? title_param ?? ""}</Text>

          <TitleMetadataRow data={titleMetadata} />

          {highlightStatus ? (
            <Text style={styles.highlightStatus}>{highlightStatus}</Text>
          ) : null}


          {/* Play — solid red / Coming Soon badge */}
          {isComingSoon ? (
            <View style={styles.comingSoonBtn}>
              <Ionicons name="time-outline" size={20} color="#fff" />
              <Text style={styles.comingSoonBtnText}>Coming Soon</Text>
            </View>
          ) : (
          <Pressable
            onPress={() => {
              haptic.medium();
              router.push({
                pathname: "/player",
                params: {
                  id: movie?.id ?? "",
                  type: isTV ? "tv" : "movie",
                  title_param: movie?.title ?? "",
                  ...(currentGenreIds.length ? { genre_ids: currentGenreIds.join(",") } : {}),
                },
              });
            }}
            style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.88 }]}
          >
            <Ionicons name="play" size={20} color="#000" />
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>
          )}

          {/* Download — dark gray */}
          <Pressable
            onPress={handleDownload}
            disabled={dlStatus === "downloading"}
            style={({ pressed }) => [
              styles.downloadBtn,
              dlStatus === "complete" && styles.downloadBtnDone,
              pressed && dlStatus !== "downloading" && { opacity: 0.85 },
            ]}
          >
            {dlStatus === "downloading" ? (
              <>
                <Feather name="download-cloud" size={20} color="#fff" />
                <Text style={styles.downloadBtnText}>Downloading… {Math.round(dlProgress * 100)}%</Text>
              </>
            ) : dlStatus === "complete" ? (
              <>
                <Feather name="check-circle" size={20} color="#34D399" />
                <Text style={[styles.downloadBtnText, { color: "#34D399" }]}>Downloaded</Text>
              </>
            ) : (
              <>
                <Feather name="arrow-down-circle" size={20} color="#fff" />
                <Text style={styles.downloadBtnText}>{downloadActionLabel}</Text>
              </>
            )}
          </Pressable>

          {/* ── Firebase Streaming Links ────────────────────────────────── */}
          {movieLinks && (Object.keys(movieLinks).length > 0) && (
            <View style={styles.firebaseLinksSection}>
              <Text style={styles.firebaseLinksTitle}>Watch / Download On</Text>
              <View style={styles.firebaseLinksRow}>
                {movieLinks.vegamovies ? (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      Linking.openURL(movieLinks.vegamovies!).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.linkChip, styles.linkChipVega, pressed && { opacity: 0.75 }]}
                  >
                    <Ionicons name="play-circle-outline" size={16} color="#fff" />
                    <Text style={styles.linkChipText}>VegaMovies</Text>
                  </Pressable>
                ) : null}
                {movieLinks.fzmovies ? (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      Linking.openURL(movieLinks.fzmovies!).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.linkChip, styles.linkChipFZ, pressed && { opacity: 0.75 }]}
                  >
                    <Ionicons name="play-circle-outline" size={16} color="#fff" />
                    <Text style={styles.linkChipText}>FZMovies</Text>
                  </Pressable>
                ) : null}
                {movieLinks.xprime ? (
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      Linking.openURL(movieLinks.xprime!).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.linkChip, styles.linkChipXP, pressed && { opacity: 0.75 }]}
                  >
                    <Ionicons name="play-circle-outline" size={16} color="#fff" />
                    <Text style={styles.linkChipText}>XPrime</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}

          {/* Synopsis */}
          {movie?.synopsis ? (
            <Text style={styles.synopsis}>{movie.synopsis}</Text>
          ) : null}

          {/* Starring */}
          {cast.length > 0 && (
            <Text style={styles.starring} numberOfLines={2}>
              <Text style={styles.starringLabel}>Starring: </Text>
              {cast.slice(0, 5).map((c) => c.name).join(", ")}
              {cast.length > 5 ? "… more" : ""}
            </Text>
          )}

          {/* Director / Creator */}
          {movie?.director && movie.director !== "—" && (
            <Text style={[styles.starring, { marginTop: 4 }]} numberOfLines={1}>
              <Text style={styles.starringLabel}>{isTV ? "Creator: " : "Director: "}</Text>
              {movie.director}
            </Text>
          )}

          {/* ── Gemini AI Panel — background enrichment ─────────────────── */}
          {tmdbId && movie?.title && (
            <MovieAIPanel
              title={movie.title}
              overview={movie.synopsis ?? ""}
              genres={movie.genres ?? []}
              year={movie.year}
              tmdbId={tmdbId}
              mediaType={isTV ? "tv" : "movie"}
            />
          )}

          {/* Secondary action row */}
          <View style={styles.actionIconRow}>
            <Pressable
              onPress={() => { haptic.medium(); toggle(movie.id); }}
              style={({ pressed }) => [styles.actionIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name={inList ? "check" : "plus"} size={26} color={inList ? "#E50914" : "#fff"} />
              <Text style={[styles.actionIconLabel, inList && { color: "#E50914" }]}>My List</Text>
            </Pressable>

            <Pressable
              onPress={() => { haptic.light(); setShowRatingModal(true); }}
              style={({ pressed }) => [styles.actionIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather
                name={userRating === "down" ? "thumbs-down" : "thumbs-up"}
                size={24}
                color={userRating ? "#E50914" : "#fff"}
              />
              <Text style={[styles.actionIconLabel, userRating ? { color: "#E50914" } : undefined]}>
                {userRating === "love" ? "Loved" : userRating === "up" ? "Liked" : userRating === "down" ? "Nope" : "Rate"}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.actionIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="share-2" size={24} color="#fff" />
              <Text style={styles.actionIconLabel}>Share</Text>
            </Pressable>

            <Pressable
              onPress={handleDownload}
              disabled={dlStatus === "downloading"}
              style={({ pressed }) => [styles.actionIconBtn, pressed && dlStatus !== "downloading" && { opacity: 0.6 }]}
            >
              <Feather name={dlStatus === "complete" ? "check-circle" : "arrow-down-circle"} size={24} color={dlStatus === "complete" ? "#34D399" : "#fff"} />
              <Text style={[styles.actionIconLabel, dlStatus === "complete" && { color: "#34D399" }]}>
                {dlStatus === "complete" ? "Saved" : downloadIconLabel}
              </Text>
            </Pressable>
          </View>


          {/* ── Tabs + content ── */}
          {(isTV || episodesToShow.length > 0 || recommendations.length > 0 || loadingRecs) && (
            <>
              <View style={styles.sectionTabsOuter}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sectionTabsScroll}
                  style={styles.sectionTabsScrollView}
                >
                  {(isTV || episodesToShow.length > 0) && (
                    <Pressable
                      onPress={() => setActiveSection("episodes")}
                      style={[styles.sectionTab, activeSection === "episodes" && styles.sectionTabActive]}
                    >
                      <Text style={[styles.sectionTabText, activeSection === "episodes" && styles.sectionTabTextActive]}>
                        Episodes
                      </Text>
                    </Pressable>
                  )}
                  {(collectionLoading || Boolean(collectionData?.parts?.length)) && (
                    <Pressable
                      onPress={() => setActiveSection("collection")}
                      style={[styles.sectionTab, activeSection === "collection" && styles.sectionTabActive]}
                    >
                      <Text style={[styles.sectionTabText, activeSection === "collection" && styles.sectionTabTextActive]}>
                        Collection
                      </Text>
                    </Pressable>
                  )}
                  {(loadingVideos || allVideos.length > 0) && (
                  <Pressable
                    onPress={() => setActiveSection("trailers")}
                    style={[styles.sectionTab, activeSection === "trailers" && styles.sectionTabActive]}
                  >
                    <Text style={[styles.sectionTabText, activeSection === "trailers" && styles.sectionTabTextActive]}>
                      Trailers & More
                    </Text>
                  </Pressable>
                  )}
                  <Pressable
                    onPress={() => setActiveSection("more")}
                    style={[styles.sectionTab, activeSection === "more" && styles.sectionTabActive]}
                  >
                    <Text style={[styles.sectionTabText, activeSection === "more" && styles.sectionTabTextActive]}>
                      More Like This
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>

              {activeSection === "episodes" && seasonList.length >= 1 && (
                <View style={styles.seasonDropRow}>
                  <Pressable
                    onPress={() => { haptic.light(); setShowSeasonPicker(true); }}
                    style={styles.seasonDropBtn}
                  >
                    <Text style={styles.seasonDropText}>{seasonList[selectedSeason] ?? "Season 1"}</Text>
                    <Feather name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                </View>
              )}

              {activeSection === "trailers" && (
                <View style={styles.trailersSection}>
                  {allVideos.length === 0 ? (
                    <View style={styles.recEmpty}>
                      <Feather name="film" size={32} color="#333" style={{ marginBottom: 12 }} />
                      <Text style={styles.recEmptyText}>No videos available</Text>
                    </View>
                  ) : (
                    allVideos.map((vid) => {
                      const thumbUri = `https://wsrv.nl/?url=${encodeURIComponent(`https://img.youtube.com/vi/${vid.key}/mqdefault.jpg`)}&output=webp&q=85`;
                      return (
                        <TouchableOpacity
                          key={vid.key}
                          activeOpacity={0.78}
                          style={styles.trailerRow}
                          onPress={() => {
                            haptic.light();
                            setTrailerKey(vid.key);
                            mainScrollRef.current?.scrollTo({ y: 0, animated: true });
                          }}
                        >
                          <View style={styles.trailerThumbWrap}>
                            <SmartImage
                              source={{ uri: thumbUri }}
                              style={styles.trailerThumb}
                              contentFit="cover"
                              transition={200}
                              cachePolicy="disk"
                              priority="high"
                            />
                            <View style={styles.trailerPlayOverlay}>
                              <Ionicons name="play-circle" size={38} color="rgba(255,255,255,0.92)" />
                            </View>
                          </View>
                          <View style={styles.trailerMeta}>
                            <Text style={styles.trailerRowName} numberOfLines={2}>{vid.name}</Text>
                            <View style={styles.trailerTypePill}>
                              <Text style={styles.trailerTypeText}>{vid.type}</Text>
                            </View>
                            {vid.isHindi && (
                              <View style={styles.trailerHindiBadge}>
                                <Text style={styles.trailerHindiBadgeText}>Hindi</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}

              {activeSection === "collection" && (
                <View style={styles.collectionSection}>
                  {collectionLoading && !collectionData ? (
                    <View style={styles.recEmpty}>
                      <ActivityIndicator size="small" color="#E50914" />
                      <Text style={styles.recEmptyText}>Loading collection…</Text>
                    </View>
                  ) : collectionData?.parts?.length ? (
                    <>
                      {collectionData.overview ? (
                        <Text style={styles.collectionOverview} numberOfLines={3}>{collectionData.overview}</Text>
                      ) : null}
                      {collectionData.parts
                        .slice()
                        .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""))
                        .map((part) => {
                          const posterUri = part.poster_path
                            ? `https://wsrv.nl/?url=${encodeURIComponent(`https://image.tmdb.org/t/p/w342${part.poster_path}`)}&output=webp&q=85`
                            : null;
                          const year = part.release_date ? part.release_date.slice(0, 4) : "";
                          const isCurrent = part.id === (numericTmdbId ?? -1);
                          return (
                            <TouchableOpacity
                              key={part.id}
                              activeOpacity={0.78}
                              style={[styles.collectionRow, isCurrent && styles.collectionRowActive]}
                              onPress={() => {
                                haptic.light();
                                router.push({ pathname: "/movie/[id]", params: { id: `tmdb-${part.id}`, type: "movie", poster_path: posterUri ?? "", title_param: part.title } });
                              }}
                            >
                              <View style={styles.collectionPosterWrap}>
                                {posterUri ? (
                            <SmartImage source={{ uri: posterUri }} style={styles.collectionPoster} contentFit="cover" transition={250} cachePolicy="disk" priority="high" title={part.title} />
                                ) : (
                                  <View style={[styles.collectionPoster, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                                    <Feather name="film" size={20} color="#333" />
                                  </View>
                                )}
                                {isCurrent && (
                                  <View style={styles.collectionCurrentBadge}>
                                    <Text style={styles.collectionCurrentText}>Now</Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.collectionMeta}>
                                <Text style={styles.collectionTitle} numberOfLines={2}>{part.title}</Text>
                                <Text style={styles.collectionYear}>{year}</Text>
                                {part.overview ? <Text style={styles.collectionDesc} numberOfLines={2}>{part.overview}</Text> : null}
                              </View>
                              <Feather name="chevron-right" size={18} color="#404040" />
                            </TouchableOpacity>
                          );
                        })}
                    </>
                  ) : (
                    <View style={styles.recEmpty}>
                      <Feather name="layers" size={32} color="#333" style={{ marginBottom: 12 }} />
                      <Text style={styles.recEmptyText}>No collection data</Text>
                    </View>
                  )}
                </View>
              )}

              {activeSection === "more" && (
                <>
                  <View style={styles.recGrid}>
                    {loadingRecs ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <View key={i} style={styles.recCardSkeleton} />
                      ))
                    ) : recommendations.length === 0 ? (
                      <View style={styles.recEmpty}>
                        <Text style={styles.recEmptyText}>No recommendations found</Text>
                      </View>
                    ) : (
                      recommendations.map((rec) => (
                        <TouchableOpacity
                          key={rec.id}
                          activeOpacity={0.75}
                          style={styles.recCard}
                          onPress={() => {
                            haptic.light();
                            router.push({ pathname: "/movie/[id]", params: { id: rec.id, type: (rec as any).mediaType ?? "", poster_path: (rec.poster as any)?.uri ?? "", title_param: rec.title } });
                          }}
                        >
                          <SmartImage source={rec.poster ?? require("@/assets/images/hero.png")} style={styles.recPoster} contentFit="cover" transition={300} cachePolicy="disk" priority="high" title={rec.title} />
                          <Text style={styles.recTitle} numberOfLines={2}>
                            {rec.title}
                          </Text>
                          <Text style={styles.recYear}>{rec.year}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                  {tmdbId && movie?.title && (
                    <GeminiRecommender
                      movieTitle={movie.title}
                      genres={movie.genres ?? []}
                      tmdbId={tmdbId}
                      mediaType={isTV ? "tv" : "movie"}
                    />
                  )}
                </>
              )}

              {activeSection === "episodes" && (
                <>
                  {loadingEpisodes ? (
                    <View style={styles.episodeList}>
                      {[0, 1, 2, 3].map((i) => (
                        <SkeletonEpisodeRow key={i} />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.episodeList}>
                      {episodesToShow.length > 0 && (
                        <View style={styles.epCountRow}>
                          <Text style={styles.epCountText}>
                            {episodesToShow.length} Episode{episodesToShow.length !== 1 ? "s" : ""}
                            {seasonList.length <= 1 ? ` · ${seasonList[selectedSeason] ?? "Season 1"}` : ""}
                          </Text>
                        </View>
                      )}
                      {episodesToShow.map((ep, idx) => {
                        const isTMDB = isTMDBEp(ep as any);
                        const seasonNum  = seasonNumbers[selectedSeason] ?? 1;
                        const episodeNum = isTMDB ? (ep as any).episode_number : idx + 1;
                        const epProgress = isTMDB ? (episodeProgresses[(ep as any).episode_number] ?? 0) : 0;
                        const rowKey = String(isTMDB ? (ep as any).id : (ep as any).id ?? idx);
                        return (
                          <EpisodeRow
                            key={rowKey}
                            ep={ep}
                            idx={idx}
                            isSelected={idx === selectedEpisodeIdx}
                            epProgress={epProgress}
                            movieId={movie?.id ?? ""}
                            isTV={isTV}
                            seasonNum={seasonNum}
                            episodeNum={episodeNum}
                            movieTitle={movie?.title ?? ""}
                            genreIds={currentGenreIds}
                          />
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Full-Screen Trailer Modal ───────────────────────────────────── */}
      <Modal
        visible={showTrailerModal}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowTrailerModal(false)}
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.trailerModal}>
          {/* Close button — absolute top-right */}
          <Pressable
            onPress={() => setShowTrailerModal(false)}
            style={[styles.trailerCloseBtn, { top: insets.top + 12 }]}
            hitSlop={12}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Feather name="x" size={22} color="#fff" />
          </Pressable>

          {/* Title bar */}
          <View style={[styles.trailerTitleRow, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.trailerTitle} numberOfLines={1}>
              {movie?.title ?? ""} — Trailer
            </Text>
          </View>

          {/* Full-screen YouTube embed — sound on, controls on */}
          <YoutubeEmbed
            videoKey={trailerKey ?? ""}
            muted={false}
            controls
            loop={false}
            style={styles.trailerWebView}
            onError={() => setShowTrailerModal(false)}
          />

          {/* Bottom safe area padding */}
          <View style={{ height: insets.bottom }} />
        </View>
      </Modal>

      {/* ── Rating Modal — Netflix floating pill style ────────────────── */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingModal(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.ratingOverlay} onPress={() => setShowRatingModal(false)}>
          <View style={styles.ratingModalPill}>
            {/* Not for me */}
            <Pressable
              onPress={() => handleRate("down")}
              style={styles.ratingOption}
            >
              <View style={[styles.ratingCircle, userRating === "down" && styles.ratingCircleActive]}>
                <Feather name="thumbs-down" size={26} color={userRating === "down" ? "#fff" : "#ccc"} />
              </View>
              <Text style={[styles.ratingOptionLabel, userRating === "down" && { color: "#fff" }]}>Not for me</Text>
            </Pressable>

            {/* I like this */}
            <Pressable
              onPress={() => handleRate("up")}
              style={styles.ratingOption}
            >
              <View style={[styles.ratingCircle, userRating === "up" && styles.ratingCircleActive]}>
                <Feather name="thumbs-up" size={26} color={userRating === "up" ? "#fff" : "#ccc"} />
              </View>
              <Text style={[styles.ratingOptionLabel, userRating === "up" && { color: "#fff" }]}>I like this</Text>
            </Pressable>

            {/* Love this — two thumbs icons */}
            <Pressable
              onPress={() => handleRate("love")}
              style={styles.ratingOption}
            >
              <View style={[styles.ratingCircle, userRating === "love" && styles.ratingCircleActive]}>
                <View style={{ flexDirection: "row" }}>
                  <Feather name="thumbs-up" size={18} color={userRating === "love" ? "#fff" : "#ccc"} style={{ marginRight: -4 }} />
                  <Feather name="thumbs-up" size={18} color={userRating === "love" ? "#fff" : "#ccc"} />
                </View>
              </View>
              <Text style={[styles.ratingOptionLabel, userRating === "love" && { color: "#fff" }]}>Love this</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Netflix-style Season Picker Modal ─────────────────────────── */}
      <Modal
        visible={showSeasonPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSeasonPicker(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.spBackdrop}
          onPress={() => setShowSeasonPicker(false)}
        />
        <View style={styles.spSheet}>
          <View style={styles.spHandle} />
          <Text style={styles.spTitle}>Season</Text>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 320 }}
          >
            {seasonList.map((s, i) => {
              const active = i === selectedSeason;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    haptic.medium();
                    setSelectedSeason(i);
                    setShowSeasonPicker(false);
                  }}
                  style={[styles.spRow, active && styles.spRowActive]}
                >
                  <Text style={[styles.spRowText, active && styles.spRowTextActive]}>
                    {s}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={20} color="#0EA5E9" />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={() => setShowSeasonPicker(false)}
            style={styles.spClose}
          >
            <Text style={styles.spCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
      {movie && (
        <MovieShareBottomSheet
          visible={showShareSheet}
          title={movie.title}
          posterUri={getSharePosterUri()}
          url={getShareUrl()}
          onClose={() => setShowShareSheet(false)}
          onShare={handleShareTarget}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scroll: { flex: 1 },
  centerContent: { alignItems: "center", justifyContent: "center" },
  errorText: { color: "#fff", fontSize: 18, fontFamily: "Inter_500Medium" },
  backBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#E50914",
    borderRadius: 4,
  },
  backBtnText: { color: "#fff", fontFamily: "Inter_700Bold" },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: { width: "100%", backgroundColor: "#0a0a0a" },

  // X close button — top-right frosted circle
  heroCloseBtn: {
    position: "absolute",
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // Center play button — translucent circle, centered via left/marginLeft
  heroPlayBtn: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    left: "50%" as any,
    marginLeft: -31,
    top: "33%" as any,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },

  // Bottom row: Trailer chip + Recently Added badge
  heroBottomRow: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  heroTrailerChip: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroTrailerText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heroRecentBadge: {
    backgroundColor: "#E50914",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroRecentText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  // Kept for any remaining refs
  heroBackBtn: {
    position: "absolute",
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // S SERIES / S FILM label row
  typeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  sLogo: {
    color: "#E50914",
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -1,
  },
  typeLabel: {
    color: "#a0a0a0",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2.5,
  },

  // ── Body — seamless, no gap from poster, pure Netflix black ──────────────
  body: {
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  // Kept in sheet for backward compat but never rendered in main flow
  redAccentLine: { height: 0 },

  // Title — Netflix uses heavy weight, large, tight tracking
  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    letterSpacing: -0.45,
    lineHeight: 33,
    marginBottom: 11,
  },
  imdbBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(245,197,24,0.15)",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(245,197,24,0.3)",
  },
  imdbText: { color: "#f5c518", fontSize: 11, fontFamily: "Inter_700Bold" },
  highlightStatus: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  metaBadgeHindi: {
    backgroundColor: "rgba(255, 103, 0, 0.15)",
    borderColor: "rgba(255, 103, 0, 0.55)",
  },
  metaBadgeHindiText: { color: "#FF8533" },

  // Hero Hindi badge — bottom-left, above the progress bar
  heroHindiBadge: {
    position: "absolute",
    bottom: 20,
    left: 16,
    backgroundColor: "rgba(255, 103, 0, 0.88)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 20,
  },
  heroHindiBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },

  // Trailer list Hindi badge
  trailerHindiBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 103, 0, 0.88)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 3,
    marginTop: 5,
  },
  trailerHindiBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },

  // Genres — muted, dot-separated
  genresLine: {
    color: "#737373",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
    lineHeight: 18,
  },

  // ── Primary action buttons ────────────────────────────────────────────────
  // Netflix Play: bright white, large, full-width, rounded
  playBtn: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
    marginBottom: 8,
  },
  playBtnText: { color: "#000", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },

  comingSoonBtn: {
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
    marginBottom: 8,
  },
  comingSoonBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },

  // Netflix Download: slightly lighter than before, rounded same as Play
  downloadBtn: {
    backgroundColor: "#2a2a2a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
    marginBottom: 4,
  },
  downloadBtnDone: {
    backgroundColor: "rgba(52,211,153,0.08)",
    borderColor: "rgba(52,211,153,0.3)",
    borderWidth: 1,
  },
  downloadBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },

  // ── Firebase Streaming Links ──────────────────────────────────────────────
  firebaseLinksSection: {
    marginTop: 16,
    marginBottom: 4,
  },
  firebaseLinksTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#555",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  firebaseLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  linkChipVega: {
    backgroundColor: "#15803d",
  },
  linkChipFZ: {
    backgroundColor: "#1d4ed8",
  },
  linkChipXP: {
    backgroundColor: "#b45309",
  },
  linkChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Content text ──────────────────────────────────────────────────────────
  synopsis: {
    color: "#d4d4d4",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 10,
  },

  // Starring / Director — Netflix shows these as small muted lines
  starring: {
    color: "#9a9a9a",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginTop: 3,
  },
  starringLabel: {
    color: "#595959",
    fontFamily: "Inter_600SemiBold",
  },

  // ── Secondary action row — My List / Rate / Share ─────────────────────────
  actionIconRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  actionIconBtn: {
    alignItems: "center",
    gap: 7,
    flex: 1,
    paddingHorizontal: 4,
  },
  actionIconLabel: {
    color: "#a3a3a3",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 14,
  },

  // Watch Trailer button — ghost style, matches Netflix "Watch in a Group"
  trailerBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 6,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.20)",
  },
  trailerBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },

  // ── JustWatch / Watch Providers ───────────────────────────────────────────
  providersSection: { marginTop: 20, marginBottom: 4 },
  providersHeading: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  providersRow: { flexDirection: "row", gap: 12, paddingBottom: 4 },
  providerCard: { alignItems: "center", width: 64, gap: 6 },
  providerLogo: { width: 52, height: 52, borderRadius: 12, backgroundColor: "#1a1a2e" },
  providerName: { color: "#a3a3a3", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  providersPowered: { color: "#525252", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 8 },

  // ── Full-screen Trailer Modal ─────────────────────────────────────────────
  trailerModal: { flex: 1, backgroundColor: "#000" },
  trailerTitleRow: { paddingHorizontal: 56, paddingBottom: 10 },
  trailerTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  trailerCloseBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  trailerWebView: { flex: 1, backgroundColor: "#000" },

  // ── Section tabs — Netflix underline style ────────────────────────────────
  sectionTabsOuter: {
    marginTop: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    marginHorizontal: -16,
  },
  sectionTabsScrollView: { flexGrow: 0 },
  sectionTabsScroll: { paddingHorizontal: 16, flexDirection: "row", gap: 24 },
  sectionTab: { paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  sectionTabActive: { borderBottomColor: "rgba(255,255,255,0.82)" },
  sectionTabText: { color: "#737373", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sectionTabTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },

  // ── Season dropdown ───────────────────────────────────────────────────────
  seasonDropRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  seasonDropBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  seasonDropText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // ── Season Picker Modal ───────────────────────────────────────────────────
  spBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.65)" },
  spSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#141414",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 36,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  spHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 14,
  },
  spTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: 4,
  },
  spRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  spRowActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  spRowText: { color: "#d4d4d4", fontSize: 15, fontFamily: "Inter_400Regular" },
  spRowTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  spClose: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: "#222",
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: "center",
  },
  spCloseText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // ── Episode list ──────────────────────────────────────────────────────────
  loadingRow: { paddingVertical: 24, alignItems: "center" },
  loadingText: { color: "#737373", fontSize: 14, fontFamily: "Inter_500Medium" },
  episodeList: { marginTop: 8 },
  epCard: { paddingTop: 14 },
  epTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 0,
  },
  epThumbWrap: {
    width: 130,
    height: 74,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    flexShrink: 0,
  },
  epThumb: { width: "100%", height: "100%" },
  epPlayCircle: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  epMeta: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 2,
    gap: 4,
  },
  epTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  epDuration: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  epDownloadBtn: {
    paddingTop: 4,
    paddingLeft: 8,
  },
  epDesc: {
    color: "#A3A3A3",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  epDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 14,
  },

  // ── More Like This grid ───────────────────────────────────────────────────
  recGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  recCard: {
    width: (SCREEN_W - 32 - 20) / 3,
  },
  recCardSkeleton: {
    width: (SCREEN_W - 32 - 20) / 3,
    height: ((SCREEN_W - 32 - 20) / 3) * 1.5,
    borderRadius: 6,
    backgroundColor: "#1c1c1c",
  },
  recPoster: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: "#1a1a1a",
  },
  recRatingBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recRatingText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  recTitle: {
    color: "#e5e5e5",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
    lineHeight: 16,
  },
  recYear: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  recEmpty: {
    flex: 1,
    paddingVertical: 40,
    alignItems: "center",
  },
  recEmptyText: {
    color: "#737373",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // ── Season horizontal pills ───────────────────────────────────────────────
  seasonPillsScroll: {
    marginTop: 14,
    marginBottom: 2,
    marginHorizontal: -16,
  },
  seasonPillsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  seasonPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  seasonPillActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  seasonPillText: {
    color: "#d4d4d4",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  seasonPillTextActive: {
    color: "#000",
    fontFamily: "Inter_700Bold",
  },

  // ── Episode count header ──────────────────────────────────────────────────
  epCountRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  epCountText: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  // ── Next Episode quick-play button ────────────────────────────────────────
  nextEpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#e5e5e5",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  nextEpText: {
    flex: 1,
    color: "#111",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Episode card — active (currently selected) ────────────────────────────
  epCardActive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  epActiveStripe: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.82)",
  },

  // ── Episode play circle — active state ────────────────────────────────────
  epPlayCircleActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  // ── Episode thumbnail progress bar ────────────────────────────────────────
  epThumbProgress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  epThumbProgressFill: {
    height: "100%",
    backgroundColor: "#E50914",
    borderRadius: 2,
  },

  // ── Episode title row (title + NEW badge) ─────────────────────────────────
  epTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    flexWrap: "wrap",
  },
  epTitleActive: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },

  // ── Episode meta bottom row ───────────────────────────────────────────────
  epMetaBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  epDate: {
    color: "#a3a3a3",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  // ── NEW badge ─────────────────────────────────────────────────────────────
  epNewBadge: {
    backgroundColor: "#E50914",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  epNewBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },

  // ── Watched badge ─────────────────────────────────────────────────────────
  epWatchedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  epWatchedText: {
    color: "#34D399",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },

  // ── Collection (franchise) section ───────────────────────────────────────
  collectionSection: {
    marginTop: 12,
  },
  collectionOverview: {
    color: "#a3a3a3",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 16,
  },
  collectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  collectionRowActive: {
    backgroundColor: "rgba(14,165,233,0.05)",
    borderRadius: 6,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  collectionPosterWrap: {
    width: 64,
    height: 96,
    borderRadius: 4,
    overflow: "hidden",
    flexShrink: 0,
  },
  collectionPoster: {
    width: "100%",
    height: "100%",
  },
  collectionCurrentBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  collectionCurrentText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  collectionMeta: {
    flex: 1,
    gap: 4,
  },
  collectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  collectionYear: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  collectionRating: {
    color: "#f5c518",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  collectionDesc: {
    color: "#737373",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 2,
  },

  // ── Trailers & More section ────────────────────────────────────────────────
  trailersSection: {
    marginTop: 12,
    gap: 0,
  },
  trailerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  trailerThumbWrap: {
    width: 154,
    height: 87,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    flexShrink: 0,
  },
  trailerThumb: { width: "100%", height: "100%" },
  trailerPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  trailerMeta: {
    flex: 1,
    gap: 8,
  },
  trailerRowName: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  trailerTypePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  trailerTypeText: {
    color: "#a3a3a3",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },

  // ── Rating Modal ──────────────────────────────────────────────────────────
  ratingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Legacy — kept so any stale ref doesn't crash
  ratingSheet: { display: "none" },
  ratingSheetTitle: { display: "none" },
  ratingSheetRow: { display: "none" },

  // Netflix floating pill — dark rounded capsule with 3 options
  ratingModalPill: {
    flexDirection: "row",
    backgroundColor: "#1c1c1c",
    borderRadius: 56,
    paddingVertical: 20,
    paddingHorizontal: 28,
    gap: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 18,
  },
  ratingOption: {
    alignItems: "center",
    gap: 8,
  },
  ratingCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  ratingCircleActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderColor: "rgba(255,255,255,0.5)",
  },
  ratingOptionLabel: {
    color: "#a3a3a3",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

});
