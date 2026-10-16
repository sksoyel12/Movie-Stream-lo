import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import Header, { type Tab } from "@/components/Header";
import HeroBannerCarousel from "@/components/HeroBannerCarousel";
import MovieRow from "@/components/MovieRow";
import Top10Row from "@/components/Top10Row";
import MyListRow from "@/components/MyListRow";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

import {
  isHeroBannerMovie,
  type Movie,
  type HeroBannerMovie,
} from "@/data/movies";
import {
  tmdb,
  tmdbToCard,
  tmdbImg,
} from "@/lib/tmdb";
import { clearExpiredPosterLocks } from "@/lib/posterAlgorithm";
import { HOME_CATEGORIES } from "@/lib/categoryMap";
import { hasUnread as checkHasUnread } from "@/lib/notificationPrefs";
import {
  HOME_CACHE_TTL_MS,
  loadHeroCacheSnapshot,
  saveHeroCache,
  HERO_CACHE_KEY,
} from "@/lib/homeCache";
import { LATEST_NOTIF_AT } from "@/data/notifications";
import { getDailyGradient } from "@/lib/dailyGradient";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import {
  detectContentRegion,
  getCurrentContentRegion,
} from "@/lib/region";

// Stagger row fetches — first 8 rows load almost immediately, rest spread out.
const ROW_LOAD_STAGGER_MS = 60;

const { width: W } = Dimensions.get("window");

const CAROUSEL_CARD_W    = Math.round(W * 0.62);
const CAROUSEL_CARD_H    = Math.round(CAROUSEL_CARD_W * 1.52);
const HERO_SECTION_MIN_H = CAROUSEL_CARD_H + 318;

/* HERO_LOCK_START: home hero mapping */
// ─── Hero data helper ─────────────────────────────────────────────────────────
function toMovieCard(raw: ReturnType<typeof tmdbToCard>): HeroBannerMovie {
  const heroSource = raw.heroSource;
  if (
    heroSource !== "netflix" &&
    heroSource !== "viki"
  ) {
    throw new Error("Hero title is missing an approved source marker.");
  }
  const rawBackdrop = raw.backdrop_path;
  const highResolutionBackdrop = rawBackdrop
    ? tmdbImg(rawBackdrop, "w1280")
    : (raw.hero as { uri?: string } | undefined)?.uri;
  return {
    id:            raw.id,
    title:         raw.title,
    poster:        raw.poster_path
      ? { uri: tmdbImg(raw.poster_path, "w780") ?? "" }
      : raw.poster ?? { uri: "" },
    hero:          highResolutionBackdrop ? { uri: highResolutionBackdrop } : undefined,
    year:          raw.year,
    rating:        raw.rating,
    duration:      "—",
    genres:        raw.genres,
    cast:          [],
    director:      "—",
    synopsis:      raw.synopsis,
    dominantColor: "#1a1a2e",
    tmdbRating:    raw.tmdbRating,
    tmdbId:        raw.tmdbId,
    mediaType:     raw.mediaType,
    heroSource,
  } as HeroBannerMovie;
}

function latestHeroSelection(movies: Movie[]): Movie[] {
  return movies.slice(0, 3);
}

function scheduleDailyHeroRefresh(refresh: () => Promise<void>): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const retryMs = 60 * 60 * 1000;
  const schedule = async () => {
    const region = await detectContentRegion();
    const snapshot = await loadHeroCacheSnapshot<Movie[]>(
      `${HERO_CACHE_KEY}_${region.code}`,
      HOME_CACHE_TTL_MS,
    );
    const now = Date.now();
    const delay =
      snapshot.savedAt === null
        ? HOME_CACHE_TTL_MS
        : snapshot.fresh
          ? Math.max(250, snapshot.savedAt + HOME_CACHE_TTL_MS - now + 250)
          : retryMs;
    timer = setTimeout(async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      void schedule();
    }, delay);
  };
  void schedule();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

// ─── Memoized hero section ────────────────────────────────────────────────────
const StableHero = React.memo(function StableHero({
  movies,
  refreshing,
}: {
  movies: Movie[];
  refreshing: boolean;
}) {
  return (
    <View style={{ minHeight: HERO_SECTION_MIN_H, backgroundColor: "transparent", borderWidth: 0, outlineWidth: 0 } as any}>
      <HeroBannerCarousel movies={movies} refreshing={refreshing} />
    </View>
  );
});
/* HERO_LOCK_END: home hero mapping */

// ─── Home Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [accentTop, accentMid] = getDailyGradient();
  const [activeTab, setActiveTab]           = useState<Tab>("Shows");
  const [heroMovies, setHeroMovies]         = useState<Movie[]>([]);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  // Feed-window refresh marker. Rows still consult the strict 24-hour cache,
  // so pull-to-refresh can redraw local data but cannot reshuffle content
  // before the current region/date window expires.
  const [rowRefreshKey, setRowRefreshKey]   = useState(0);

  // ── AI Personalization — loads silently in background, never blocks render ──
  const {
    topGenres,
    personalImageMode,
    personalRowTitle,
    prefs,
    ready: prefsReady,
  } = useUserPreferences();

  // Personalised fetcher — rebuilds only when topGenres changes (memoised).
  // Falls back to weekly trending until user has enough watch data.
  const personalFetcher = useMemo(
    () => tmdb.personalizedByGenres(topGenres, "tv"),
    [topGenres.join(",")], // stable key so MovieRow doesn't remount needlessly
  );

  const [top10Region, setTop10Region] = useState(getCurrentContentRegion);
  useFocusEffect(useCallback(() => {
    let active = true;
    void detectContentRegion()
      .then((region) => {
        if (active) setTop10Region(region);
      })
      .catch(() => {
        // Keep the locale/timezone region if the client lookup is unavailable.
      });
    return () => {
      active = false;
    };
  }, []));

  const regionalCategories = useMemo(
    () =>
      HOME_CATEGORIES.map((category) => {
        if (category.kind !== "top10") return category;
        const titleSuffix = category.title.endsWith(" Today") ? " Today" : "";
        const mediaLabel = category.mediaType === "movie" ? "Movies" : "Shows";

        return {
          ...category,
          title: `Top 10 ${mediaLabel} in ${top10Region.name}${titleSuffix}`,
          fetcher: async (page: number) => {
            const region = await detectContentRegion();
            return category.mediaType === "movie"
              ? tmdb.top10MoviesByRegion(region.code, page)
              : tmdb.top10ShowsByRegion(region.code, page);
          },
        };
      }),
    [top10Region],
  );

  const scrollY      = useRef(new Animated.Value(0)).current;

  // Cross-row de-duplication: MovieRow instances share this set so the same
  // title never appears twice across the ~50 category rows below the hero.
  const seenIds = useRef<Set<string>>(new Set());

  /* HERO_LOCK_START: home hero fetch */
  // ── Hero Banner: recent Netflix and Rakuten Viki releases in this region ────
  const fetchHero = useCallback(async () => {
    try {
      const region = await detectContentRegion();
      const cacheKey = `${HERO_CACHE_KEY}_${region.code}`;
      const cached = await loadHeroCacheSnapshot<Movie[]>(
        cacheKey,
        HOME_CACHE_TTL_MS,
      );
      const cachedHero = cached.data?.filter(isHeroBannerMovie) ?? [];
      if (cachedHero.length > 0) {
        setHeroMovies(latestHeroSelection(cachedHero));
      }
      if (cached.fresh && cachedHero.length) {
        return;
      }

      const pageOne = await tmdb.heroBanner(1, region.code);
      const raw = (pageOne.results ?? []).filter(
        (movie) =>
          (movie.hero_source === "netflix" || movie.hero_source === "viki") &&
          movie.poster_path &&
          movie.backdrop_path,
      );

      const now = Date.now();
      const lookback = now - 365 * 24 * 60 * 60 * 1000;
      const releaseTime = (m: (typeof raw)[number]): number => {
        const value = m.release_date ?? m.first_air_date;
        const time = value ? Date.parse(value) : Number.NaN;
        return Number.isFinite(time) ? time : 0;
      };
      const freshReleases = raw.filter((m) => {
        const time = releaseTime(m);
        return time >= lookback && time <= now;
      });
      const releasePool = freshReleases.sort(
        (a, b) => releaseTime(b) - releaseTime(a),
      );

      const seen = new Set<number>();
      const qualified = releasePool.filter((m) => {
        if (m.id === 155) return false;
        const t = (m.title ?? m.name ?? "").toLowerCase();
        if (t.includes("dark knight")) return false;
        if (!m.poster_path) return false;
        if (!m.backdrop_path) return false;
        if (seen.has(m.id)) return false;
        if (!m.overview || m.overview.length < 8) return false;
        seen.add(m.id);
        return true;
      });

      if (qualified.length === 0) return;

      const baseCards = qualified
        .slice(0, 3)
        .map((m) => toMovieCard(tmdbToCard(m)));

      // Show and cache the source-qualified artwork immediately.
      setHeroMovies(latestHeroSelection(baseCards));
      await saveHeroCache(cacheKey, baseCards, now);
    } catch {
      // keep current state on error
    }
  }, []);
  /* HERO_LOCK_END: home hero fetch */

  /* HERO_LOCK_START: hero 24-hour refresh behavior */
  // On focus, read the cache only. A network request is allowed only after the
  // exact 24-hour TTL has elapsed; switching tabs never forces a reload.
  useFocusEffect(
    useCallback(() => {
      clearExpiredPosterLocks().catch(() => {});
      checkHasUnread(LATEST_NOTIF_AT).then(setHasUnreadNotifs);
      let cancelled = false;
      let cancelDailyRefresh: (() => void) | undefined;
      const refreshThenSchedule = async () => {
        await fetchHero();
        if (!cancelled) {
          cancelDailyRefresh = scheduleDailyHeroRefresh(fetchHero);
        }
      };
      void refreshThenSchedule();
      return () => {
        cancelled = true;
        cancelDailyRefresh?.();
      };
    }, [fetchHero]),
  );
  /* HERO_LOCK_END: hero 24-hour refresh behavior */

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reset cross-row dedup so a fresh refetch isn't filtered against IDs
    // registered during the previous load.
    seenIds.current.clear();
    await fetchHero();
    // Bumping the key lets rows redraw their frozen cache snapshot. Their
    // cache guard prevents a network refresh inside the 24-hour window.
    setRowRefreshKey((k) => k + 1);
    setRefreshing(false);
  }, [fetchHero]);

  const scrollHandler = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  return (
    <View style={styles.container}>
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasUnread={hasUnreadNotifs}
        scrollY={scrollY}
      />

      <Animated.ScrollView
        style={[styles.scroll, { outlineWidth: 0, borderWidth: 0, outlineColor: "transparent" } as any]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E50914"
            colors={["#E50914"]}
            progressBackgroundColor="#111"
          />
        }
      >
        {/* Background gradient behind hero */}
        <LinearGradient
          colors={[accentTop, accentTop, accentMid, "#000000"]}
          locations={[0, 0.18, 0.45, 0.72]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroGradient}
          pointerEvents="none"
        />

        {/* ── Hero Banner — untouched ── */}
        <SectionErrorBoundary kind="hero">
          <StableHero movies={heroMovies} refreshing={refreshing} />
        </SectionErrorBoundary>

        {/* ── Category rows — driven by lib/categoryMap.ts ── */}
        {regionalCategories.map((cat, index) => {
          const loadDelay = index * ROW_LOAD_STAGGER_MS;

          // ── Personalised "Top Picks For You" row — injected after
          // "Because you liked" (index 8) once prefs are ready ──────────────
          const personalRow = (index === 8 && prefsReady) ? (
            <SectionErrorBoundary key="__topPicksForYou__">
              <MovieRow
                title={personalRowTitle}
                movies={[]}
                tmdbFetcher={personalFetcher}
                loadDelay={loadDelay + ROW_LOAD_STAGGER_MS}
                seenIds={seenIds}
                refreshKey={rowRefreshKey}
                imageMode={personalImageMode}
                preferenceGenres={topGenres}
                personalized
                userPrefs={prefs}
              />
            </SectionErrorBoundary>
          ) : null;

          if (cat.kind === "special") {
            const specialEl = (() => {
              switch (cat.key) {
                case "continueWatching":
                  return (
                    <SectionErrorBoundary key={cat.key}>
                      <ContinueWatchingRow />
                    </SectionErrorBoundary>
                  );
                case "myList":
                  return (
                    <SectionErrorBoundary key={cat.key}>
                      <MyListRow />
                    </SectionErrorBoundary>
                  );
                default:
                  return null;
              }
            })();
            return (
              <React.Fragment key={cat.key}>
                {personalRow}
                {specialEl}
              </React.Fragment>
            );
          }

          if (cat.kind === "top10") {
            return (
              <React.Fragment key={`${index}-${cat.title}`}>
                {personalRow}
                <SectionErrorBoundary key={`top10-${cat.title}`}>
                  <Top10Row
                    title={cat.title}
                    movies={[]}
                    tmdbFetcher={cat.fetcher}
                    loadDelay={loadDelay}
                    refreshKey={rowRefreshKey}
                  />
                </SectionErrorBoundary>
              </React.Fragment>
            );
          }

          // Gemini AI re-sorts Trending and "Because you liked" rows by
          // personalised engagement score after initial data loads.
          const geminiRowId =
            cat.title === "Trending Now" ? "trending" :
            cat.title === "Because you liked" ? "becauseYouLiked" :
            undefined;

          return (
            <React.Fragment key={`${index}-${cat.title}`}>
              {personalRow}
              <SectionErrorBoundary key={`row-${cat.title}`}>
                <MovieRow
                  title={cat.title}
                  movies={[]}
                  tmdbFetcher={cat.fetcher}
                  loadDelay={loadDelay}
                  seenIds={seenIds}
                  refreshKey={rowRefreshKey}
                  imageMode="poster"
                  preferenceGenres={topGenres}
                  geminiRowId={geminiRowId}
                  userPrefs={prefs}
                />
              </SectionErrorBoundary>
            </React.Fragment>
          );
        })}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#000000" },
  heroGradient:  { position: "absolute", top: 0, left: 0, right: 0, height: 720 },
  scroll:        { flex: 1, backgroundColor: "#000000" },
  scrollContent: { paddingBottom: 100 },
});
