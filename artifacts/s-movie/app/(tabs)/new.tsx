import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SmartImage from "@/components/SmartImage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { useMyList } from "@/contexts/MyListContext";
import { tmdb, tmdbGet, tmdbImg, type TMDBMovie, type TMDBPage } from "@/lib/tmdb";
import YoutubeEmbed from "@/components/YoutubeEmbed";
import { detectContentRegion, getCurrentContentRegion } from "@/lib/region";
import { useNetworkStatus } from "@/contexts/NetworkContext";
import { useColors } from "@/hooks/useColors";

const NEW_HOT_CACHE_KEY = "smovie_new_hot_v8";
const NEW_HOT_TOP10_CACHE_KEY = "smovie_new_hot_top10_v2_";
const REMIND_KEY_PREFIX = "smovie_remind_v2_";
const { width: SCREEN_W } = Dimensions.get("window");
const BACKDROP_HEIGHT = Math.round((SCREEN_W - 24) * 9 / 16);
const TRENDING_FRESHNESS_DAYS = 365;
const TODAY = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
})();
const TRENDING_CUTOFF = (() => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRENDING_FRESHNESS_DAYS);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(
    cutoff.getDate(),
  ).padStart(2, "0")}`;
})();

type Filter = "comingSoon" | "everyonesWatching" | "halloween" | "top10Shows" | "top10Movies";
type Top10Type = "movie" | "tv";

type FeedItem = {
  id: string;
  tmdbId: number;
  title: string;
  overview: string;
  backdropUri: string;
  posterUri: string;
  releaseDate: string;
  nextEpisodeDate?: string;
  mediaType: "movie" | "tv";
  rating: string;
  rank?: number;
};

type TMDBLogoResponse = {
  logos?: Array<{
    file_path: string;
    iso_639_1?: string | null;
    vote_average?: number;
    vote_count?: number;
  }>;
};
type TMDBLogo = NonNullable<TMDBLogoResponse["logos"]>[number];

const titleLogoCache = new Map<string, string | null>();
const titleLogoRequests = new Map<string, Promise<string | null>>();

function fetchTitleLogo(mediaType: "movie" | "tv", tmdbId: number): Promise<string | null> {
  const cacheKey = `${mediaType}:${tmdbId}`;
  if (titleLogoCache.has(cacheKey)) return Promise.resolve(titleLogoCache.get(cacheKey) ?? null);
  const inFlight = titleLogoRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = tmdbGet<TMDBLogoResponse>(`/${mediaType}/${tmdbId}/images`, {
    include_image_language: "en,null",
  })
    .then(({ logos = [] }) => {
      const selected = [...logos]
        .filter((logo) => logo.file_path?.startsWith("/"))
        .sort((a, b) => {
          const langPriority = (logo: TMDBLogo) =>
            logo.iso_639_1 === "en" ? 0 : logo.iso_639_1 == null ? 1 : 2;
          return langPriority(a) - langPriority(b) || (b.vote_count ?? 0) - (a.vote_count ?? 0);
        })[0];
      const uri = tmdbImg(selected?.file_path, "w500");
      titleLogoCache.set(cacheKey, uri);
      return uri;
    })
    .catch(() => {
      titleLogoCache.set(cacheKey, null);
      return null;
    })
    .finally(() => titleLogoRequests.delete(cacheKey));
  titleLogoRequests.set(cacheKey, request);
  return request;
}

function getFriendlyDate(date?: string): string {
  if (!date) return "Coming soon";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Coming soon";
  return `Coming on ${parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  })}`;
}

function isRecentDate(date?: string): boolean {
  return Boolean(
    date &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      date >= TRENDING_CUTOFF &&
      date <= TODAY,
  );
}

function isRecentTrendingItem(item: TMDBMovie): boolean {
  const schedule = item as TMDBMovie & {
    next_episode_to_air?: { air_date?: string | null } | null;
  };
  const mediaType = item.media_type === "tv" ? "tv" : "movie";
  const date =
    mediaType === "tv"
      ? schedule.next_episode_to_air?.air_date ?? item.first_air_date
      : item.release_date ?? item.first_air_date;
  return isRecentDate(date);
}

function keepRecentTrendingItems(items: FeedItem[]): FeedItem[] {
  return items.filter((item) => isRecentDate(item.nextEpisodeDate ?? item.releaseDate));
}

function isFutureDate(date?: string): boolean {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date > TODAY);
}

function getReleaseLabel(item: FeedItem, activeFilter: Filter): string {
  if (item.nextEpisodeDate && isFutureDate(item.nextEpisodeDate)) {
    const nextEpisode = new Date(`${item.nextEpisodeDate}T12:00:00`);
    return `New Episode coming on ${nextEpisode.toLocaleDateString(undefined, {
      weekday: "long",
    })}`;
  }
  if (activeFilter === "comingSoon" && isFutureDate(item.releaseDate)) {
    const date = getFriendlyDate(item.releaseDate).replace(/^Coming on /, "");
    return item.mediaType === "tv"
      ? `Limited Series coming on ${date}`
      : `Coming on ${date}`;
  }
  if (activeFilter === "comingSoon" && !item.releaseDate) return "Coming soon";
  return item.mediaType === "tv" ? "Watch the Limited Series now" : "Watch now";
}

function toFeedItem(item: TMDBMovie, defaultType?: Top10Type): FeedItem | null {
  const backdropUri = tmdbImg(item.backdrop_path, "w780");
  if (!backdropUri) return null;
  const mediaType: "movie" | "tv" =
    item.media_type === "movie" || item.media_type === "tv"
      ? item.media_type
      : defaultType ?? (item.name && !item.title ? "tv" : "movie");
  const schedule = item as TMDBMovie & {
    adult?: boolean;
    next_episode_to_air?: { air_date?: string | null } | null;
  };
  const nextEpisodeDate = schedule.next_episode_to_air?.air_date ?? undefined;
  const releaseDate =
    mediaType === "tv"
      ? nextEpisodeDate ?? item.first_air_date ?? item.release_date ?? ""
      : item.release_date ?? item.first_air_date ?? "";
  const posterUri = tmdbImg(item.poster_path, "w500") ?? backdropUri;
  return {
    id: `tmdb-${item.id}`,
    tmdbId: item.id,
    title: item.title ?? item.name ?? "Untitled",
    overview: item.overview?.trim() || "More details coming soon.",
    backdropUri,
    posterUri,
    releaseDate,
    nextEpisodeDate,
    mediaType,
    rating: schedule.adult ? "18+" : "U/A 16+",
  };
}

function uniqueFeed(
  items: TMDBMovie[],
  defaultType?: Top10Type,
  limit = 24,
): FeedItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!item.backdrop_path) return false;
      const mediaType =
        item.media_type === "movie" || item.media_type === "tv"
          ? item.media_type
          : defaultType ?? (item.name && !item.title ? "tv" : "movie");
      const key = `${mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => toFeedItem(item, defaultType))
    .filter((item): item is FeedItem => item !== null)
    .slice(0, limit);
}

function ChipHeader({
  activeFilter,
  onChange,
  onBack,
  topInset,
  isOffline,
  showCachedNotice,
}: {
  activeFilter: Filter;
  onChange: (filter: Filter) => void;
  onBack: () => void;
  topInset: number;
  isOffline: boolean;
  showCachedNotice: boolean;
}) {
  const colors = useColors();
  const filters: Array<{ value: Filter; label: string; emoji?: string; badge?: boolean }> = [
    { value: "comingSoon", emoji: "🍿", label: "Coming Soon" },
    { value: "everyonesWatching", emoji: "🔥", label: "Everyone's Watching" },
    { value: "halloween", emoji: "🎃", label: "Halloween" },
    { value: "top10Shows", label: "Top 10 Shows", badge: true },
    { value: "top10Movies", label: "Top 10 Movies", badge: true },
  ];
  return (
    <View style={[styles.stickyHeader, { paddingTop: topInset + 12 }]}>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={10}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.text }]}>New &amp; Hot</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        {filters.map((filter) => (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityState={{ selected: activeFilter === filter.value }}
            onPress={() => {
              haptic.selection();
              onChange(filter.value);
            }}
            style={[
              styles.filterChip,
              activeFilter === filter.value && styles.filterChipActive,
            ]}
          >
            {filter.emoji ? (
              <Text style={styles.filterChipEmoji}>{filter.emoji}</Text>
            ) : null}
            {filter.badge ? (
              <View style={[styles.filterChipBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.filterChipBadgeText}>TOP 10</Text>
              </View>
            ) : null}
            <Text
              style={[
                styles.filterChipText,
                { color: activeFilter === filter.value ? colors.background : colors.text },
                activeFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {showCachedNotice && isOffline && (
        <View style={styles.cacheNotice}>
          <Ionicons name="cloud-offline-outline" size={14} color="#FBBF24" />
          <Text style={styles.cacheNoticeText}>
            {isOffline
              ? "Offline · Showing saved titles"
              : "Couldn’t refresh · Showing saved titles"}
          </Text>
        </View>
      )}
    </View>
  );
}

function LoadingCard() {
  return (
    <View style={styles.loadingCard}>
      <View style={[styles.skeleton, styles.skeletonImage]} />
      <View style={[styles.skeleton, styles.skeletonTitle]} />
      <View style={[styles.skeleton, styles.skeletonLine]} />
      <View style={[styles.skeleton, styles.skeletonLineShort]} />
      <View style={[styles.skeleton, styles.skeletonButton]} />
    </View>
  );
}

function FeedCard({
  item,
  reminded,
  onToggleReminder,
  activeFilter,
  inMyList,
  onToggleMyList,
  previewActive,
  logoActive,
  onPreviewChange,
}: {
  item: FeedItem;
  reminded: boolean;
  onToggleReminder: (item: FeedItem) => void;
  activeFilter: Filter;
  inMyList: boolean;
  onToggleMyList: (item: FeedItem) => void;
  previewActive: boolean;
  logoActive: boolean;
  onPreviewChange: (id: string | null) => void;
}) {
  const colors = useColors();
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerFailed, setTrailerFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [titleLogoUri, setTitleLogoUri] = useState<string | null>(null);

  useEffect(() => {
    if (!logoActive) return;
    let active = true;
    void fetchTitleLogo(item.mediaType, item.tmdbId).then((uri) => {
      if (active && uri) setTitleLogoUri(uri);
    });
    return () => {
      active = false;
    };
  }, [item.mediaType, item.tmdbId, logoActive]);

  useEffect(() => {
    if (!previewActive || trailerKey || trailerFailed) return;
    let active = true;
    tmdb.videos(item.mediaType, item.tmdbId)
      .then(({ results }) => {
        if (!active) return;
        const trailer = (results ?? [])
          .filter((video) => video.site === "YouTube")
          .sort((a, b) => {
            const aIsTrailer = a.type === "Trailer" ? 1 : 0;
            const bIsTrailer = b.type === "Trailer" ? 1 : 0;
            return bIsTrailer - aIsTrailer;
          })[0];
        if (trailer?.key) setTrailerKey(trailer.key);
        else setTrailerFailed(true);
      })
      .catch(() => {
        if (active) setTrailerFailed(true);
      });
    return () => {
      active = false;
    };
  }, [item.mediaType, item.tmdbId, previewActive, trailerFailed, trailerKey]);

  const openDetails = () => {
    haptic.light();
    router.push({
      pathname: "/movie/[id]",
      params: { id: item.id, type: item.mediaType, title_param: item.title },
    });
  };
  const releaseLabel = getReleaseLabel(item, activeFilter);
  const showReminder =
    activeFilter === "comingSoon" &&
    (!item.releaseDate || isFutureDate(item.releaseDate));

  return (
    <View style={[styles.card, item.rank != null && styles.rankedCard]}>
      {item.rank != null ? (
        <Svg width={152} height={110} viewBox="0 0 152 110" style={styles.rankWatermark}>
          <SvgText
            x="0"
            y="96"
            fill="#050505"
            stroke="#fff"
            strokeWidth={1.5}
            fontSize="98"
            fontWeight="900"
            letterSpacing="-4"
          >
            {String(item.rank).padStart(2, "0")}
          </SvgText>
        </Svg>
      ) : null}
      <View style={styles.cardFrame}>
      <View style={styles.backdropWrap}>
        {previewActive && trailerKey ? (
          <YoutubeEmbed
            key={`${item.id}-${trailerKey}`}
            videoKey={trailerKey}
            muted={muted}
            controls={false}
            loop
            style={styles.backdrop}
            onError={() => {
              setTrailerKey(null);
              setTrailerFailed(true);
            }}
          />
        ) : (
          <SmartImage
            source={{ uri: item.backdropUri }}
            style={styles.backdrop}
            contentFit="cover"
            transition={250}
            cachePolicy="disk"
            title={item.title}
            recyclingKey={`new-hot-${item.id}`}
          />
        )}
        <View style={styles.ageBadge}>
          <Text style={[styles.ageBadgeText, { color: colors.text }]}>{item.rating}</Text>
        </View>
        {!(previewActive && trailerKey) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              previewActive
                ? `Pause preview for ${item.title}`
                : `Play preview for ${item.title}`
            }
            onPress={() => {
              haptic.light();
              onPreviewChange(previewActive ? null : item.id);
            }}
            style={styles.previewButton}
          >
            <Ionicons name={previewActive ? "pause" : "play"} size={24} color={colors.text} />
          </Pressable>
        ) : null}
        {item.rank == null ? (
          <View style={styles.brandWatermark}>
            <Text style={[styles.brandLogo, { color: colors.primary }]}>S</Text>
            <Text style={[styles.brandLabel, { color: colors.text }]}>S-MOVIE</Text>
          </View>
        ) : null}
        {previewActive && trailerKey ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute preview" : "Mute preview"}
            onPress={() => setMuted((value) => !value)}
            style={styles.muteButton}
          >
            <Ionicons
              name={muted ? "volume-mute" : "volume-high"}
              size={18}
              color="#fff"
            />
          </Pressable>
        ) : null}
        {trailerFailed && previewActive ? (
          <Text style={styles.previewUnavailable}>Trailer preview unavailable</Text>
        ) : null}
      </View>

      <View style={styles.cardContent}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
          onPress={openDetails}
          style={styles.titleLogoSlot}
        >
          {titleLogoUri ? (
            <SmartImage
              source={{ uri: titleLogoUri }}
              style={styles.titleLogo}
              contentFit="contain"
              transition={180}
              cachePolicy="disk"
              title={`${item.title} title logo`}
            />
          ) : (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          )}
        </Pressable>
        <Text style={[styles.schedule, { color: colors.text }]}>{releaseLabel}</Text>
        <Text style={[styles.overview, { color: colors.mutedForeground }]} numberOfLines={4}>
          {item.overview}
        </Text>
              <View style={styles.cardActions}>
          {showReminder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: reminded }}
              onPress={() => onToggleReminder(item)}
              style={({ pressed }) => [
                styles.remindButton,
                reminded && styles.remindButtonActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons
                name={reminded ? "checkmark" : "notifications-outline"}
                size={18}
                color={colors.background}
              />
              <Text style={[styles.remindButtonText, { color: colors.background }]}>
                {reminded ? "Reminded" : "Remind Me"}
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={openDetails}
                style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.82 }]}
              >
                <Ionicons name="play" size={17} color={colors.background} />
                <Text style={styles.playButtonText}>Play</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: inMyList }}
                onPress={() => onToggleMyList(item)}
                style={({ pressed }) => [styles.myListButton, pressed && { opacity: 0.82 }]}
              >
                <Ionicons
                  name={inMyList ? "checkmark" : "add"}
                  size={19}
                  color={colors.text}
                />
                <Text style={styles.myListButtonText}>
                  {inMyList ? "In My List" : "My List"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
    </View>
  );
}

export default function NewAndHotScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const { isInList, toggle: toggleMyList } = useMyList();
  const topInset = Math.max(insets.top, 12);
  const [activeFilter, setActiveFilter] = useState<Filter>("comingSoon");
  const [top10Region, setTop10Region] = useState(getCurrentContentRegion);
  const [comingSoon, setComingSoon] = useState<FeedItem[]>([]);
  const [everyonesWatching, setEveryonesWatching] = useState<FeedItem[]>([]);
  const [halloween, setHalloween] = useState<FeedItem[]>([]);
  const [top10Movies, setTop10Movies] = useState<FeedItem[]>([]);
  const [top10Shows, setTop10Shows] = useState<FeedItem[]>([]);
  const [loadingTop10, setLoadingTop10] = useState(false);
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedFeed, setUsingCachedFeed] = useState(false);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [top10RefreshKey, setTop10RefreshKey] = useState(0);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ isViewable: boolean; item: FeedItem | null }>;
    }) => {
      const visiblePreview = viewableItems.find(
        (token) => token.isViewable && token.item,
      )?.item;
      setActivePreviewId(visiblePreview?.id ?? null);
    },
  ).current;

  const loadReminders = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      setReminders(
        new Set(
          keys
            .filter((key) => key.startsWith(REMIND_KEY_PREFIX))
            .map((key) => key.slice(REMIND_KEY_PREFIX.length)),
        ),
      );
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    if (isOffline) {
      setLoading(false);
      setRefreshing(false);
      setUsingCachedFeed(true);
      return;
    }
    try {
      const region = await detectContentRegion();
      setTop10Region(region);
      const [
        upcomingMoviesResult,
        onAirShowsResult,
        trendingPageOneResult,
        trendingPageTwoResult,
        halloweenResult,
      ] = await Promise.allSettled([
        tmdbGet<TMDBPage>("/movie/upcoming", { page: 1, region: region.code }),
        tmdbGet<TMDBPage>("/tv/on_the_air", { page: 1, region: region.code }),
        tmdbGet<TMDBPage>("/trending/all/week", { page: 1, region: region.code }),
        tmdbGet<TMDBPage>("/trending/all/week", { page: 2, region: region.code }),
        tmdbGet<TMDBPage>("/discover/movie", {
          with_genres: "27,53",
          sort_by: "popularity.desc",
          page: 1,
          region: region.code,
        }),
      ]);
      const coming =
        upcomingMoviesResult.status === "fulfilled" || onAirShowsResult.status === "fulfilled"
          ? uniqueFeed([
              ...(upcomingMoviesResult.status === "fulfilled"
                ? upcomingMoviesResult.value.results.map((item) => ({
                    ...item,
                    media_type: "movie",
                  }))
                : []),
              ...(onAirShowsResult.status === "fulfilled"
                ? onAirShowsResult.value.results.map((item) => ({
                    ...item,
                    media_type: "tv",
                  }))
                : []),
            ])
          : null;
      const successfulTrendPages = [trendingPageOneResult, trendingPageTwoResult]
        .filter((result): result is PromiseFulfilledResult<TMDBPage> => result.status === "fulfilled")
        .flatMap((result) => result.value.results ?? []);
      const trending =
        successfulTrendPages.length > 0
          ? uniqueFeed(successfulTrendPages.filter(isRecentTrendingItem))
          : null;
      const spooky =
        halloweenResult.status === "fulfilled"
          ? uniqueFeed(halloweenResult.value.results ?? [], "movie")
          : null;

      if (coming === null && trending === null && spooky === null) {
        throw new Error("All New & Hot feeds failed to load.");
      }

      if (coming !== null) setComingSoon(coming);
      if (trending !== null) setEveryonesWatching(trending);
      if (spooky !== null) setHalloween(spooky);

      const partialFailure = coming === null || trending === null || spooky === null;
      setError(
        partialFailure
          ? "Some lists couldn’t be refreshed. Pull down to try again."
          : null,
      );
      setUsingCachedFeed(partialFailure);

      if (coming !== null && trending !== null && spooky !== null) {
        await AsyncStorage.setItem(
          NEW_HOT_CACHE_KEY,
          JSON.stringify({
            comingSoon: coming,
            everyonesWatching: trending,
            halloween: spooky,
            savedAt: Date.now(),
          }),
        ).catch(() => {});
      }
    } catch {
      setError("Couldn’t load content. Pull down to try again.");
      setUsingCachedFeed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadReminders();
    AsyncStorage.getItem(NEW_HOT_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const cached = JSON.parse(raw) as {
          comingSoon?: FeedItem[];
          everyonesWatching?: FeedItem[];
          halloween?: FeedItem[];
          savedAt?: number;
        };
        const cachedItems = (items?: FeedItem[]) =>
          (items ?? []).filter((item) => Boolean(item.backdropUri && item.title));
        // Stale data is still useful when the device is offline. The network
        // request below revalidates it when possible.
        const cachedComing = cachedItems(cached.comingSoon);
        const cachedTrending = keepRecentTrendingItems(cachedItems(cached.everyonesWatching));
        const cachedHalloween = cachedItems(cached.halloween);
        if (cachedComing.length) setComingSoon(cachedComing);
        if (cachedTrending.length) setEveryonesWatching(cachedTrending);
        if (cachedHalloween.length) setHalloween(cachedHalloween);
        if (cachedComing.length || cachedTrending.length || cachedHalloween.length) {
          setUsingCachedFeed(true);
          setLoading(false);
        }
      })
      .catch(() => {});
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, loadReminders]);

  useEffect(() => {
    let active = true;
    void detectContentRegion()
      .then((region) => {
        if (active) setTop10Region(region);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeFilter !== "top10Movies" && activeFilter !== "top10Shows") return;
    let active = true;
    const mediaType: Top10Type = activeFilter === "top10Movies" ? "movie" : "tv";
    const cacheKey = `${NEW_HOT_TOP10_CACHE_KEY}${top10Region.code}_${mediaType}`;
    setLoadingTop10(true);
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!active || !raw) return;
        const cached = JSON.parse(raw) as FeedItem[];
        const cachedItems = cached.filter((item) => Boolean(item.backdropUri && item.title)).slice(0, 10);
        if (mediaType === "movie") setTop10Movies(cachedItems);
        else setTop10Shows(cachedItems);
      })
      .catch(() => {});

    if (isOffline) {
      setLoadingTop10(false);
      setUsingCachedFeed(true);
      return () => {
        active = false;
      };
    }

    tmdbGet<TMDBPage>(mediaType === "movie" ? "/movie/popular" : "/tv/popular", {
      page: 1,
      region: top10Region.code,
    })
      .then(async (result) => {
        if (!active) return;
        const rankedItems = uniqueFeed(
          result.results.map((item) => ({ ...item, media_type: mediaType })),
          mediaType,
          10,
        ).map((item, index) => ({ ...item, rank: index + 1 }));
        if (mediaType === "movie") setTop10Movies(rankedItems);
        else setTop10Shows(rankedItems);
        setError(null);
        setUsingCachedFeed(false);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(rankedItems)).catch(() => {});
      })
      .catch(() => {
        if (active) setError("Couldn’t load this Top 10 list.");
      })
      .finally(() => {
        if (active) setLoadingTop10(false);
      });
    return () => {
      active = false;
    };
  }, [
    activeFilter,
    isOffline,
    top10Region.code,
    top10Region.name,
    top10RefreshKey,
  ]);

  const toggleReminder = useCallback((item: FeedItem) => {
    haptic.selection();
    setReminders((previous) => {
      const next = new Set(previous);
      const key = item.id;
      if (next.has(key)) {
        next.delete(key);
        AsyncStorage.removeItem(REMIND_KEY_PREFIX + key).catch(() => {});
      } else {
        next.add(key);
        AsyncStorage.setItem(REMIND_KEY_PREFIX + key, "1").catch(() => {});
      }
      return next;
    });
  }, []);

  const handleToggleMyList = useCallback((item: FeedItem) => {
    toggleMyList(item.id, {
      title: item.title,
      posterUri: item.posterUri,
      mediaType: item.mediaType,
    });
  }, [toggleMyList]);

  const items = useMemo(
    () => {
      if (activeFilter === "comingSoon") return comingSoon;
      if (activeFilter === "everyonesWatching") return everyonesWatching;
      if (activeFilter === "halloween") return halloween;
      if (activeFilter === "top10Movies") return top10Movies;
      return top10Shows;
    },
    [activeFilter, comingSoon, everyonesWatching, halloween, top10Movies, top10Shows],
  );
  const isTop10Tab = activeFilter === "top10Movies" || activeFilter === "top10Shows";
  const activeLoading = isTop10Tab ? loadingTop10 : loading;
  const data: Array<FeedItem | null> =
    activeLoading && items.length === 0
      ? [null, null, null]
      : items;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        extraData={{ activePreviewId, reminders }}
        renderItem={({ item }) =>
          item ? (
            <FeedCard
              item={item}
              reminded={reminders.has(item.id)}
              onToggleReminder={toggleReminder}
              activeFilter={activeFilter}
              inMyList={isInList(item.id)}
              onToggleMyList={handleToggleMyList}
              previewActive={item.id === activePreviewId}
              logoActive={item.id === activePreviewId}
              onPreviewChange={setActivePreviewId}
            />
          ) : <LoadingCard />
        }
        ListHeaderComponent={
          <ChipHeader
            activeFilter={activeFilter}
            onChange={(filter) => {
              setActivePreviewId(null);
              setError(null);
              setActiveFilter(filter);
            }}
            onBack={() => {
              haptic.light();
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            topInset={topInset}
            isOffline={isOffline}
            showCachedNotice={(isOffline || usingCachedFeed) && items.length > 0}
          />
        }
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchData();
              if (activeFilter === "top10Movies" || activeFilter === "top10Shows") {
                setTop10RefreshKey((current) => current + 1);
              }
            }}
            tintColor="#fff"
            colors={["#fff"]}
          />
        }
        ListEmptyComponent={
          !activeLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={44} color="#555" />
              <Text style={styles.emptyTitle}>
                {error
                  ? "Couldn’t load content"
                  : isTop10Tab
                    ? "No titles in this Top 10"
                    : "Nothing to show yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {error ?? "Pull down to refresh."}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={<View style={{ height: 90 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  stickyHeader: {
    backgroundColor: "#000",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  titleRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  backButton: { width: 28, height: 38, justifyContent: "center" },
  pageTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.6,
  },
  chipsContent: { gap: 8, paddingRight: 16 },
  cacheNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.28)",
  },
  cacheNoticeText: { color: "#D4D4D4", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
  },
  filterChipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterChipBadge: {
    backgroundColor: "#E50914",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 6,
  },
  filterChipBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "900",
  },
  filterChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  filterChipEmoji: { fontSize: 16, lineHeight: 18 },
  filterChipTextActive: { color: "#000", fontFamily: "Inter_700Bold" },
  feedContent: { paddingTop: 8, paddingHorizontal: 12 },
  card: {
    position: "relative",
    overflow: "visible",
    marginBottom: 18,
  },
  rankedCard: { marginTop: 58 },
  cardFrame: {
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
    backgroundColor: "#050505",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#292929",
  },
  loadingCard: {
    overflow: "hidden",
    backgroundColor: "#050505",
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#292929",
  },
  backdropWrap: {
    width: "100%",
    height: BACKDROP_HEIGHT,
    backgroundColor: "#222",
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
  },
  backdrop: { width: "100%", height: "100%" },
  previewButton: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    width: 54,
    height: 54,
    marginTop: -27,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewUnavailable: {
    position: "absolute",
    alignSelf: "center",
    bottom: 12,
    color: "#fff",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  ageBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  brandWatermark: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.64)",
    borderRadius: 5,
  },
  brandLogo: { color: "#E50914", fontSize: 18, fontFamily: "Inter_800ExtraBold" },
  brandLabel: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  rankWatermark: {
    position: "absolute",
    left: 10,
    top: -64,
    zIndex: 0,
  },
  ageBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: { padding: 13 },
  titleLogoSlot: {
    minHeight: 54,
    justifyContent: "flex-start",
    marginBottom: 2,
  },
  titleLogo: {
    width: "100%",
    height: 50,
    alignSelf: "flex-start",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
  },
  schedule: {
    color: "#bdbdbd",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Inter_600SemiBold",
    marginTop: 5,
  },
  overview: {
    color: "#999999",
    fontSize: 13,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  remindButton: {
    width: 150,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  remindButtonActive: {
    borderWidth: 1,
    borderColor: "#fff",
  },
  remindButtonText: {
    color: "#000",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  playButton: {
    width: 96,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  playButtonText: { color: "#000", fontSize: 14, fontFamily: "Inter_700Bold" },
  myListButton: {
    width: 119,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#262626",
  },
  myListButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  skeleton: { backgroundColor: "#252525", borderRadius: 7 },
  skeletonImage: { width: "100%", height: BACKDROP_HEIGHT },
  skeletonTitle: { width: "65%", height: 24, margin: 15 },
  skeletonLine: { width: "90%", height: 13, marginHorizontal: 15, marginBottom: 8 },
  skeletonLineShort: { width: "55%", height: 13, marginHorizontal: 15 },
  skeletonButton: { height: 48, margin: 15, marginTop: 16 },
  emptyState: { alignItems: "center", paddingTop: 90, paddingHorizontal: 28 },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 14,
  },
  emptyBody: {
    color: "#777",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});