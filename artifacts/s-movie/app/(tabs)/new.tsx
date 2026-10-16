import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SmartImage from "@/components/SmartImage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/lib/haptics";
import { tmdb, tmdbImg, type TMDBMovie } from "@/lib/tmdb";
import YoutubeEmbed from "@/components/YoutubeEmbed";
import { detectContentRegion, getCurrentContentRegion } from "@/lib/region";
import { useNetworkStatus } from "@/contexts/NetworkContext";

const NEW_HOT_CACHE_KEY = "smovie_new_hot_v6";
const NEW_HOT_TOP10_CACHE_KEY = "smovie_new_hot_top10_v1_";
const REMIND_KEY_PREFIX = "smovie_remind_v2_";
const { width: SCREEN_W } = Dimensions.get("window");
const BACKDROP_HEIGHT = Math.round((SCREEN_W - 28) * 9 / 16);
const TODAY = new Date().toISOString().slice(0, 10);
const FRESH_CUTOFF = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const UPCOMING_LIMIT = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

type Filter = "comingSoon" | "everyonesWatching" | "games" | "top10";
type Top10Type = "movie" | "tv";

type FeedItem = {
  id: string;
  tmdbId: number;
  title: string;
  overview: string;
  backdropUri: string;
  releaseDate: string;
  mediaType: "movie" | "tv";
  rating: string;
  source: "Netflix" | "Viki" | "Netflix · Viki";
  rank?: number;
  regionName?: string;
};

function getFriendlyDate(date?: string): string {
  if (!date) return "Coming soon";
  const parsed = new Date(date);
  const today = new Date();
  parsed.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "Available now";
  if (days === 1) return "Coming tomorrow";
  if (days < 7) return `Coming in ${days} days`;
  return `Coming on ${parsed.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`;
}

function toFeedItem(item: TMDBMovie, defaultType?: Top10Type): FeedItem | null {
  const backdropUri = tmdbImg(item.backdrop_path, "w780");
  if (!backdropUri) return null;
  const releaseDate = item.first_air_date ?? item.release_date ?? "";
  const mediaType: "movie" | "tv" =
    item.media_type === "movie" || item.media_type === "tv"
      ? item.media_type
      : defaultType ?? (item.name && !item.title ? "tv" : "movie");
  return {
    id: `tmdb-${item.id}`,
    tmdbId: item.id,
    title: item.title ?? item.name ?? "Untitled",
    overview: item.overview?.trim() || "More details coming soon.",
    backdropUri,
    releaseDate,
    mediaType,
    rating: "U/A 16+",
    source: item.hero_source === "viki" ? "Viki" : "Netflix",
  };
}

function uniqueFeed(
  items: TMDBMovie[],
  requireFutureDate = false,
  defaultType?: Top10Type,
): FeedItem[] {
  const seen = new Set<number>();
  return items
    .filter((item) => {
      if (seen.has(item.id) || !item.backdrop_path) return false;
      const date = item.first_air_date ?? item.release_date ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      if (
        requireFutureDate
          ? date < TODAY || date > UPCOMING_LIMIT
          : date < FRESH_CUTOFF || date > TODAY
      ) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .map((item) => toFeedItem(item, defaultType))
    .filter((item): item is FeedItem => item !== null)
    .slice(0, 24);
}

function ChipHeader({
  activeFilter,
  onChange,
  top10Type,
  onTop10TypeChange,
  regionName,
  topInset,
  isOffline,
  showCachedNotice,
}: {
  activeFilter: Filter;
  onChange: (filter: Filter) => void;
  top10Type: Top10Type;
  onTop10TypeChange: (type: Top10Type) => void;
  regionName: string;
  topInset: number;
  isOffline: boolean;
  showCachedNotice: boolean;
}) {
  const filters: Array<{ value: Filter; label: string }> = [
    { value: "comingSoon", label: "🍿 Coming Soon" },
    { value: "everyonesWatching", label: "🔥 Everyone’s Watching" },
    { value: "games", label: "🎮 Games" },
    { value: "top10", label: "Top 10" },
  ];
  return (
    <View style={[styles.stickyHeader, { paddingTop: topInset + 12 }]}>
      <Text style={styles.pageTitle}>New &amp; Hot</Text>
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
            <Text
              style={[
                styles.filterChipText,
                activeFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {activeFilter === "top10" && (
        <View style={styles.top10Header}>
          <Text style={styles.top10Title}>
            Top 10 {top10Type === "movie" ? "Movies" : "Shows"} in {regionName} Today
          </Text>
          <View style={styles.top10Tabs}>
            {(["movie", "tv"] as const).map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected: top10Type === type }}
                onPress={() => {
                  haptic.selection();
                  onTop10TypeChange(type);
                }}
                style={[
                  styles.top10Tab,
                  top10Type === type && styles.top10TabActive,
                ]}
              >
                <Text
                  style={[
                    styles.top10TabText,
                    top10Type === type && styles.top10TabTextActive,
                  ]}
                >
                  {type === "movie" ? "Movies" : "Shows"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {showCachedNotice && (
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
    <View style={styles.card}>
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
  previewActive,
  onPreviewChange,
}: {
  item: FeedItem;
  reminded: boolean;
  onToggleReminder: (item: FeedItem) => void;
  previewActive: boolean;
  onPreviewChange: (id: string | null) => void;
}) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerFailed, setTrailerFailed] = useState(false);
  const [muted, setMuted] = useState(true);

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
  const releaseLabel = item.rank
    ? `#${item.rank} in Top 10 · ${item.regionName ?? "your region"}`
    : item.releaseDate > TODAY
      ? getFriendlyDate(item.releaseDate)
      : `Released ${new Date(item.releaseDate).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
        })}`;

  return (
    <View style={styles.card}>
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
          <Text style={styles.ageBadgeText}>{item.rating}</Text>
        </View>
        {item.rank ? (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>{String(item.rank).padStart(2, "0")}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previewActive ? `Pause preview for ${item.title}` : `Play preview for ${item.title}`}
          onPress={() => {
            haptic.light();
            onPreviewChange(previewActive ? null : item.id);
          }}
          style={styles.previewButton}
        >
          <Ionicons
            name={previewActive ? "pause" : "play"}
            size={24}
            color="#fff"
          />
        </Pressable>
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
        <Pressable accessibilityRole="button" onPress={openDetails}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </Pressable>
        <Text style={styles.schedule}>
          {releaseLabel} · {item.source}
        </Text>
        <Text style={styles.overview} numberOfLines={3}>{item.overview}</Text>
        <View style={styles.cardActions}>
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
              size={19}
              color={reminded ? "#fff" : "#000"}
            />
            <Text style={[styles.remindButtonText, reminded && styles.remindButtonTextActive]}>
              {reminded ? "Reminded" : "Remind Me"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${item.title}`}
            onPress={() => {
              void Share.share({
                title: item.title,
                message: `${item.title}\n\n${item.overview}`,
              }).catch(() => {});
            }}
            style={styles.shareButton}
          >
            <Ionicons name="share-outline" size={19} color="#fff" />
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function NewAndHotScreen() {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const topInset = Math.max(insets.top, 12);
  const [activeFilter, setActiveFilter] = useState<Filter>("comingSoon");
  const [top10Type, setTop10Type] = useState<Top10Type>("movie");
  const [top10Region, setTop10Region] = useState(getCurrentContentRegion);
  const [comingSoon, setComingSoon] = useState<FeedItem[]>([]);
  const [everyonesWatching, setEveryonesWatching] = useState<FeedItem[]>([]);
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
  const hasManuallySelectedFilter = useRef(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ isViewable: boolean; item: FeedItem | null }>;
    }) => {
      const visiblePreview = viewableItems.find(
        (token) => token.isViewable && token.item && !token.item.rank,
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
      const [comingResult, trendingResult] = await Promise.allSettled([
        tmdb.newHotComingSoon(1, region.code),
        tmdb.netflixTrending(1, region.code),
      ]);
      const coming =
        comingResult.status === "fulfilled"
          ? uniqueFeed(comingResult.value.results ?? [], true)
          : null;
      const trending =
        trendingResult.status === "fulfilled"
          ? uniqueFeed(trendingResult.value.results ?? []).slice(0, 24)
          : null;

      if (coming === null && trending === null) {
        throw new Error("Both New & Hot feeds failed to load.");
      }

      if (coming !== null) setComingSoon(coming);
      if (trending !== null) setEveryonesWatching(trending);
      if (
        !hasManuallySelectedFilter.current &&
        (!coming || coming.length === 0) &&
        (trending?.length ?? 0) > 0
      ) {
        setActiveFilter("everyonesWatching");
      }

      const partialFailure = coming === null || trending === null;
      setError(
        partialFailure
          ? "Some content couldn’t be refreshed. Pull down to try again."
          : null,
      );
      setUsingCachedFeed(partialFailure);

      if (coming !== null && trending !== null) {
        await AsyncStorage.setItem(
          NEW_HOT_CACHE_KEY,
          JSON.stringify({
            comingSoon: coming,
            everyonesWatching: trending,
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
          savedAt?: number;
        };
        const cachedFresh = (items?: FeedItem[], futureOnly = false) =>
          (items ?? []).filter((item) =>
            /^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate) &&
            (futureOnly
              ? item.releaseDate >= TODAY && item.releaseDate <= UPCOMING_LIMIT
              : item.releaseDate >= FRESH_CUTOFF && item.releaseDate <= TODAY),
          );
        // Stale data is still useful when the device is offline. The network
        // request below revalidates it when possible.
        const cachedComing = cachedFresh(cached.comingSoon, true);
        const cachedTrending = cachedFresh(cached.everyonesWatching);
        if (cachedComing.length) setComingSoon(cachedComing);
        if (cachedTrending.length) {
          setEveryonesWatching(cachedTrending);
          if (!cachedComing.length && !hasManuallySelectedFilter.current) {
            setActiveFilter("everyonesWatching");
          }
        }
        if (cachedComing.length || cachedTrending.length) {
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
    if (activeFilter !== "top10") return;
    let active = true;
    const cacheKey = `${NEW_HOT_TOP10_CACHE_KEY}${top10Region.code}`;
    setLoadingTop10(true);
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!active || !raw) return;
        const cached = JSON.parse(raw) as {
          movies?: FeedItem[];
          shows?: FeedItem[];
        };
        const freshCachedItems = (items?: FeedItem[]) =>
          (items ?? []).filter(
            (item) =>
              /^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate) &&
              item.releaseDate >= FRESH_CUTOFF &&
              item.releaseDate <= TODAY,
          );
        if (cached.movies) setTop10Movies(freshCachedItems(cached.movies).slice(0, 10));
        if (cached.shows) setTop10Shows(freshCachedItems(cached.shows).slice(0, 10));
      })
      .catch(() => {});

    if (isOffline) {
      setLoadingTop10(false);
      setUsingCachedFeed(true);
      return () => {
        active = false;
      };
    }

    Promise.allSettled([
      tmdb.top10MoviesByRegion(top10Region.code, 1),
      tmdb.top10ShowsByRegion(top10Region.code, 1),
    ])
      .then(async ([moviesResult, showsResult]) => {
        if (!active) return;
        const toRankedItems = (
          result: PromiseSettledResult<{ results: TMDBMovie[] }>,
          mediaType: Top10Type,
        ): FeedItem[] | null => {
          if (result.status !== "fulfilled") return null;
          const items = uniqueFeed(
            result.value.results.map((item) => ({
              ...item,
              media_type: mediaType,
            })),
            false,
            mediaType,
          );
          return items.slice(0, 10).map((item, index) => ({
            ...item,
            rank: index + 1,
            regionName: top10Region.name,
            source: "Netflix · Viki",
          }));
        };
        const movies = toRankedItems(moviesResult, "movie");
        const shows = toRankedItems(showsResult, "tv");
        if (movies === null && shows === null) {
          setError("Couldn’t load the regional Top 10. Pull down to try again.");
          setUsingCachedFeed(true);
          return;
        }
        const nextMovies = movies ?? [];
        const nextShows = shows ?? [];
        setTop10Movies(nextMovies);
        setTop10Shows(nextShows);
        setError(null);
        setUsingCachedFeed(false);
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ movies: nextMovies, shows: nextShows }),
        ).catch(() => {});
      })
      .catch(() => {
        if (active) setError("Couldn’t load the regional Top 10.");
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

  const items = useMemo(
    () => {
      if (activeFilter === "comingSoon") return comingSoon;
      if (activeFilter === "everyonesWatching") return everyonesWatching;
      if (activeFilter === "top10") {
        return top10Type === "movie" ? top10Movies : top10Shows;
      }
      return [];
    },
    [activeFilter, comingSoon, everyonesWatching, top10Movies, top10Shows, top10Type],
  );
  const activeLoading = activeFilter === "top10" ? loadingTop10 : loading;
  const data: Array<FeedItem | null> =
    activeLoading && items.length === 0 && activeFilter !== "games"
      ? [null, null, null]
      : items;

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        extraData={activePreviewId}
        renderItem={({ item }) =>
          item ? (
            <FeedCard
              item={item}
              reminded={reminders.has(item.id)}
              onToggleReminder={toggleReminder}
              previewActive={item.id === activePreviewId && !item.rank}
              onPreviewChange={setActivePreviewId}
            />
          ) : <LoadingCard />
        }
        ListHeaderComponent={
          <ChipHeader
            activeFilter={activeFilter}
            onChange={(filter) => {
              hasManuallySelectedFilter.current = true;
              setActivePreviewId(null);
              setError(null);
              setActiveFilter(filter);
            }}
            top10Type={top10Type}
            onTop10TypeChange={setTop10Type}
            regionName={top10Region.name}
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
              if (activeFilter === "top10") {
                setTop10RefreshKey((current) => current + 1);
              }
            }}
            tintColor="#fff"
            colors={["#fff"]}
          />
        }
        ListEmptyComponent={
          activeFilter === "games" ? (
            <View style={styles.emptyState}>
              <Ionicons name="game-controller-outline" size={44} color="#777" />
              <Text style={styles.emptyTitle}>Netflix Games</Text>
              <Text style={styles.emptyBody}>
                Browse the games available with your Netflix membership.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL("https://www.netflix.com/games").catch(() => {});
                }}
                style={styles.gamesButton}
              >
                <Text style={styles.gamesButtonText}>Browse Games</Text>
                <Ionicons name="open-outline" size={17} color="#111" />
              </Pressable>
            </View>
          ) : !activeLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={44} color="#555" />
              <Text style={styles.emptyTitle}>
                {error
                  ? "Couldn’t load content"
                  : activeFilter === "top10"
                    ? "No recent titles in this Top 10"
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
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  pageTitle: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  chipsContent: { gap: 8, paddingRight: 16 },
  top10Header: { marginTop: 12, gap: 10 },
  top10Title: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  top10Tabs: { flexDirection: "row", gap: 8 },
  top10Tab: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#555",
  },
  top10TabActive: { backgroundColor: "#f1f1f1", borderColor: "#f1f1f1" },
  top10TabText: { color: "#ccc", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  top10TabTextActive: { color: "#111" },
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
    backgroundColor: "#2a2a2a",
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  filterChipActive: { backgroundColor: "#fff" },
  filterChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  filterChipTextActive: { color: "#111" },
  feedContent: { paddingTop: 10, paddingHorizontal: 14 },
  card: {
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
  rankBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#e50914",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rankBadgeText: { color: "#fff", fontSize: 13, fontFamily: "Inter_800ExtraBold" },
  ageBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardContent: { padding: 15 },
  title: {
    color: "#fff",
    fontSize: 21,
    lineHeight: 26,
    fontFamily: "Inter_800ExtraBold",
  },
  schedule: {
    color: "#bdbdbd",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  overview: {
    color: "#d0d0d0",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginTop: 9,
  },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  remindButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f1f1f1",
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 15,
  },
  remindButtonActive: {
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#555",
  },
  remindButtonText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  remindButtonTextActive: { color: "#fff" },
  shareButton: {
    minHeight: 48,
    minWidth: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 15,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#444",
  },
  shareButtonText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  gamesButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#f1f1f1",
  },
  gamesButtonText: { color: "#111", fontSize: 14, fontFamily: "Inter_700Bold" },
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