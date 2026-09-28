import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getCategoryCacheKey,
  HOME_CACHE_TTL_MS,
  loadHomeCacheSnapshot,
  saveHomeCache,
} from "@/lib/homeCache";
import { prefetchStream } from "@/lib/backgroundPrefetch";
import { scoreAndSortByGemini } from "@/lib/geminiScore";
import { scoreForUser, type UserPrefs } from "@/lib/userPreferences";
import { fetchContextualArtworkUri } from "@/lib/tmdb";

// Splits "👍 Some Title" → { emoji: "👍 ", text: "Some Title" }
// Needed because Inter font has no emoji glyphs — emoji must render in system font.
function splitEmoji(title: string): { emoji: string; text: string } {
  const m = title.match(/^((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?\s*)/u);
  if (m) return { emoji: m[1], text: title.slice(m[1].length) };
  return { emoji: "", text: title };
}

function RowTitleText({ title, style }: { title: string; style: any }) {
  const { emoji, text } = splitEmoji(title);
  if (!emoji) return <Text style={style}>{title}</Text>;
  return (
    <Text style={style}>
      <Text style={{ fontFamily: undefined, fontSize: style.fontSize }}>{emoji}</Text>
      {text}
    </Text>
  );
}

import type { HDHubMovie } from "@/lib/hdhub";
import type { Movie } from "@/data/movies";
import { haptic } from "@/lib/haptics";
import { tmdb, tmdbToCard, tmdbImg, proxyUrl, fetchRandomPosterUri, type TMDBPage } from "@/lib/tmdb";
import { API_HOST } from "@/lib/apiBase";
import { sortByPopularityDesc, weightedShuffleByPopularity } from "@/lib/badgeUtils";
import HindiBadge from "@/components/HindiBadge";
import { Skeleton } from "@/components/Skeleton";
import SmartImage, { prefetchImages } from "@/components/SmartImage";

const CARD_W = 120;
const CARD_H = 180;
const CARD_GAP = 10;
const ITEM_STRIDE = CARD_W + CARD_GAP;


// ─── Content badge helpers ─────────────────────────────────────────────────────
// Priority order: NEW EPISODE > NEW SEASON > RECENTLY ADDED > TRENDING
// Only ONE bottom badge per poster. TOP 10 is separate (top-right corner).
const SEVEN_DAYS_MS    = 7  * 24 * 60 * 60 * 1000;
const THIRTEEN_DAYS_MS = 13 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS   = 30 * 24 * 60 * 60 * 1000;

function getFreshBadge(m: any): "NEW EPISODE" | null {
  const now = Date.now();
  if (m.last_air_date) {
    const d = new Date(m.last_air_date).getTime();
    if (!isNaN(d) && now - d <= SEVEN_DAYS_MS && d <= now) return "NEW EPISODE";
  }
  return null;
}

/**
 * Returns the single highest-priority ribbon badge label for a card.
 * Red bar placed at the bottom edge of the poster (centered, full-width).
 * Priority: NEW EPISODE > NEW SEASON > RECENTLY ADDED > TRENDING
 */
function getContentBadge(m: any): "NEW EPISODE" | "NEW SEASON" | "RECENTLY ADDED" | "TRENDING" | null {
  const now = Date.now();
  // 1. NEW EPISODE — last_air_date within 7 days
  if (m.last_air_date) {
    const d = new Date(m.last_air_date).getTime();
    if (!isNaN(d) && now - d <= SEVEN_DAYS_MS && d <= now) return "NEW EPISODE";
  }
  // 2. NEW SEASON — series with >1 season and first_air_date within 30 days
  if (m.first_air_date && (m.number_of_seasons ?? 1) > 1) {
    const d = new Date(m.first_air_date).getTime();
    if (!isNaN(d) && now - d <= THIRTY_DAYS_MS && d <= now) return "NEW SEASON";
  }
  // 3. RECENTLY ADDED — release_date or first_air_date within last 13 days
  const recentDate = m.release_date ?? m.first_air_date;
  if (recentDate) {
    const d = new Date(recentDate).getTime();
    if (!isNaN(d) && now - d <= THIRTEEN_DAYS_MS && d <= now) return "RECENTLY ADDED";
  }
  // 4. TRENDING — popularity above threshold (TMDB's score, typically 100+ = trending)
  if ((m.popularity ?? 0) > 150) return "TRENDING";
  return null;
}

// ─── Netflix-style animated card with spring press + glow ring ─────────────
interface GlowCardProps {
  m: CardItem;
  index: number;
  showTop10Badge: boolean;
  rowTitle: string;
}
const GlowCard = React.memo(function GlowCard({ m, index, showTop10Badge, rowTitle }: GlowCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  const posterUri = (m.poster as { uri?: string })?.uri ?? undefined;

  const onPressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(glow, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start();
  }, []);

  const onPressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }),
      Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const glowCardType: "movie" | "tv" =
    (m as any).mediaType ?? (rowTitle.toLowerCase().includes("shows") ? "tv" : "movie");
  const glowCardTmdbId = (m as any).tmdbId as number | undefined;

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        // Background-prefetch stream sources as user navigates to detail
        if (glowCardTmdbId) {
          prefetchStream(glowCardTmdbId, glowCardType);
        }
        router.push({
          pathname: "/movie/[id]",
          params: {
            id: String(m.id),
            type: glowCardType,
            ...(m.hdhubUrl ? { hdhubUrl: m.hdhubUrl } : {}),
            poster_path: posterUri ?? "",
            title_param: m.title ?? "",
          },
        });
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.cardOuter, index === 0 && styles.cardFirst]}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <SmartImage
          source={
            (m as any).poster_path
              ? { uri: tmdbImg((m as any).poster_path, "w500") ?? "" }
              : posterUri
              ? { uri: posterUri }
              : null
          }
          tmdbId={(m as any).tmdbId}
          mediaType={((m as any).mediaType === "tv" ? "tv" : "movie")}
          style={styles.thumb}
          contentFit="cover"
          title={m.title}
          cachePolicy="disk"
          priority="high"
          recyclingKey={m.id}
        />
        {/* Glow border ring on press */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 10, borderWidth: 2, borderColor: "#3b82f6", opacity: glow },
          ]}
        />
        {showTop10Badge && (m as CardItem & { isTop10?: boolean }).isTop10 ? (
          <View style={styles.top10Badge}>
            <Text style={styles.top10Text}>TOP{"\n"}10</Text>
          </View>
        ) : null}
        {/* Hindi badge — only rendered when TMDB confirms Hindi audio exists */}
        <HindiBadge
          tmdbId={(m as any).tmdbId ?? m.id}
          mediaType={glowCardType}
          style={styles.hindiBadge}
          textStyle={styles.hindiBadgeText}
        />
      </Animated.View>
    </Pressable>
  );
});

type CardItem = Movie & { tmdbRating?: number; hdhubUrl?: string };

// Which image asset each card in this row should display.
// "poster"   → standard tall portrait poster_path   (default, 2:3 ratio)
// "backdrop" → wide landscape backdrop_path, cropped to portrait by contentFit="cover"
//              gives a cinematic action-scene crop for thriller/horror/action rows.
export type ImageMode = "poster" | "backdrop";

interface Props {
  title: string;
  movies: CardItem[];
  showTop10Badge?: boolean;
  tmdbFetcher?: (page: number) => Promise<TMDBPage>;
  hdhubFetcher?: (page: number) => Promise<HDHubMovie[]>;
  refreshKey?: number;
  loadDelay?: number;
  activeGenre?: string;
  seenIds?: React.MutableRefObject<Set<string>>;
  imageMode?: ImageMode;
  /** Genre preferences used to personalize poster artwork selection. */
  preferenceGenres?: number[];
  // When true the fetched results are re-sorted by live .popularity (desc)
  // before being stored in state, so the row order always reflects real-time
  // TMDB engagement data without any manual intervention.
  sortByPopularity?: boolean;
  /**
   * When set, Gemini AI scores each item in this row after initial load and
   * re-sorts it by personalised engagement score (0-100). Set to a stable
   * string label (e.g. "trending", "becauseYouLiked") to enable AI sorting.
   */
  geminiRowId?: string;
  /** Apply the signed-in/guest profile before the optional Gemini re-rank. */
  personalized?: boolean;
  userPrefs?: UserPrefs | null;
}


// ── Global content blacklist — checked in every row's mapResults ──────────────
// ID 155 = The Dark Knight (movie). Substring check catches all variants
// ("The Dark Knight Rises", "Batman: The Dark Knight", etc.).
const BLOCKED_IDS = new Set([155]);
function isBanned(m: { id: number; title?: string; name?: string }): boolean {
  if (BLOCKED_IDS.has(m.id)) return true;
  const t = (m.title ?? m.name ?? "").toLowerCase();
  if (t.includes("dark knight")) return true;
  return false;
}

function isUnreleased(m: TMDBPage["results"][number]): boolean {
  const dateStr = m.release_date ?? (m as any).first_air_date;
  if (!dateStr || dateStr.length < 4) return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
  } catch { return false; }
}

function mapResults(results: TMDBPage["results"]): CardItem[] {
  return results
    .filter((m) => {
      if (isBanned(m)) return false;
      // A TMDB result is displayable whenever it has poster artwork.
      if (!m.poster_path) return false;
      return true;
    })
    .map((m) => {
      const c = tmdbToCard(m);
      return {
        id:            c.id,
        title:         c.title,
        poster:        c.poster ?? { uri: "" },
        hero:          c.hero ?? undefined,
        year:          c.year,
        rating:        c.rating,
        duration:      "—",
        genres:        c.genres,
        cast:          [],
        director:      "—",
        synopsis:      c.synopsis,
        tmdbRating:    c.tmdbRating,
        dominantColor: "#1a1a2e",
        mediaType:     c.mediaType,
        tmdbId:        c.tmdbId,
        poster_path:   m.poster_path,
        backdrop_path: m.backdrop_path,
        // API-engine pre-proxied image URLs (added by /api/tmdb proxy)
        poster_url:    (m as any).poster_url   ?? null,
        backdrop_url:  (m as any).backdrop_url ?? null,
        // Preserve raw air/release dates so the card can self-evaluate the
        // 30-day badge without any extra network calls.
        release_date:    m.release_date,
        first_air_date:  (m as any).first_air_date,
        last_air_date:   (m as any).last_air_date,
        popularity:      m.popularity,
        genreIds:        m.genre_ids ?? [],
      } as CardItem;
    });
}

// Selects the best image URL for a card based on row mode.
// Priority:
//   1. API-engine pre-proxied URLs (poster_url / backdrop_url) — bypass TMDB CDN
//   2. TMDB path construction
//   3. Stored poster URI from card object
function resolveImageUri(
  m: CardItem,
  activeGenre?: string,
  imageMode?: ImageMode,
  rowTitle?: string,
  preferenceGenres?: number[],
): string | undefined {
  const title = (rowTitle ?? "").toLowerCase();
  const prefersRomance = preferenceGenres?.includes(10749);
  const prefersIntensity = preferenceGenres?.some((id) => [28, 12, 53, 80].includes(id));
  const romanceRow = /love|romance|romantic|swoon|dream|relationship|first sight/.test(title);
  const intensityRow = /action|thrill|suspense|mystery|mind-bending|crime/.test(title);
  const contextualMode =
    (prefersRomance && romanceRow) || (prefersIntensity && intensityRow)
      ? "backdrop"
      : imageMode;

  // Prefer API-engine direct URLs (already proxied through our server)
  if (contextualMode === "backdrop" && (m as any).backdrop_url) {
    return (m as any).backdrop_url;
  }
  if ((m as any).poster_url) return (m as any).poster_url;

  // Prefer a cinematic still for explicit backdrop rows and contextual
  // preference matches. SmartImage keeps it behind the first-party proxy.
  if (contextualMode === "backdrop" && (m as any).backdrop_path) {
    return `https://image.tmdb.org/t/p/w780${(m as any).backdrop_path}`;
  }

  // Fallback: construct the direct TMDB poster URL. SmartImage owns retries.
  if ((m as any).poster_path) {
    return `https://image.tmdb.org/t/p/w500${(m as any).poster_path}`;
  }
  const fallbackUri = (m.poster as { uri?: string })?.uri;
  if (!fallbackUri) return undefined;
  return fallbackUri;
}

function mapHdhub(results: HDHubMovie[]): CardItem[] {
  return results.map((h) => {
    const posterUri = proxyUrl(h.poster) || h.poster;
    return {
      id: `hdhub-${h.id}`,
      title: h.title,
      poster: { uri: posterUri },
      hero: { uri: posterUri },
      year: h.year ?? 2024,
      rating: "HD",
      duration: "—",
      genres: [],
      cast: [],
      director: "—",
      synopsis: "",
      dominantColor: "#1a1a2e",
      hdhubUrl: h.url,
    };
  });
}

// ─── Multi-Asset Rotation (Netflix-style) ────────────────────────────────────
// Netflix keeps 10-15 different artistic posters per title and randomly shows
// one per viewer/session to test engagement. TMDB's /images endpoint exposes
// the same kind of pool (see fetchMoviePosters/fetchRandomPosterUri in
// lib/tmdb.ts). Each card independently rolls a random pick from that pool
// when it mounts (and again whenever the row refetches), so the same title
// can show different key art across visits/refreshes. The standard
// poster/backdrop is used instantly as a placeholder; the alt art swaps in
// once resolved (subsequent mounts are instant thanks to the in-memory pool
// cache in lib/tmdb.ts).
const RowCard = React.memo(function RowCard({
  m,
  index,
  activeGenre,
  imageMode,
  preferenceGenres,
  refreshKey,
  showTop10Badge,
  title,
}: {
  m: CardItem;
  index: number;
  activeGenre?: string;
  imageMode?: ImageMode;
  preferenceGenres?: number[];
  refreshKey: number;
  showTop10Badge?: boolean;
  title: string;
}) {
  const posterUri = (m.poster as { uri?: string })?.uri ?? undefined;
  const resolvedUri = resolveImageUri(
    m,
    activeGenre,
    imageMode,
    title,
    preferenceGenres,
  );
  const baseImageUri = resolvedUri ?? (posterUri || undefined);
  const tmdbId = (m as any).tmdbId as number | undefined;
  const mediaType: "movie" | "tv" =
    (m as any).mediaType ?? (title.toLowerCase().includes("shows") ? "tv" : "movie");

  // Rows render the already-available portrait poster immediately. Fetching the
  // full TMDB /images pool for every card made a large home screen fan out into
  // hundreds of requests and caused slow startup/scrolling. Artwork enrichment
  // remains limited to the hero carousel, where it has real visual value.
  const [contextualUri, setContextualUri] = useState<string | null>(null);
  const lowerTitle = title.toLowerCase();
  const contextualMatch = Boolean(
    preferenceGenres?.length &&
    ((preferenceGenres.includes(10749) &&
      /love|romance|romantic|swoon|dream|relationship|first sight/.test(lowerTitle)) ||
      (preferenceGenres.some((id) => [28, 12, 53, 80].includes(id)) &&
        /action|thrill|suspense|mystery|mind-bending|crime/.test(lowerTitle))),
  );

  useEffect(() => {
    let cancelled = false;
    if (!tmdbId || !contextualMatch || index > 2) {
      setContextualUri(null);
      return () => { cancelled = true; };
    }
    fetchContextualArtworkUri(
      tmdbId,
      mediaType,
      (m as any).poster_path ?? null,
      preferenceGenres,
    ).then((uri) => {
      if (!cancelled && uri) setContextualUri(uri);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [tmdbId, mediaType, contextualMatch, index, preferenceGenres?.join(","), m.id]);

  const imageUri = contextualUri ?? baseImageUri;
  const hasTop10 = showTop10Badge && (m as CardItem & { isTop10?: boolean }).isTop10;

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        // Background-prefetch stream sources while user navigates to detail
        if (tmdbId) {
          prefetchStream(tmdbId, mediaType);
        }
        router.push({
          pathname: "/movie/[id]",
          params: {
            id: String(m.id),
            type: mediaType,
            ...(m.hdhubUrl ? { hdhubUrl: m.hdhubUrl } : {}),
            poster_path: posterUri ?? "",
            title_param: m.title ?? "",
          },
        });
      }}
      style={[styles.cardOuter, index === 0 && styles.cardFirst]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            pressed && { opacity: 0.80, transform: [{ scale: 0.965 }] },
          ]}
        >
          <SmartImage
            source={imageUri ? { uri: imageUri } : null}
            style={styles.thumb}
            contentFit="cover"
            title={m.title}
            cachePolicy="disk"
            priority="high"
            transition={250}
            recyclingKey={`${String(m.id)}-${activeGenre ?? "all"}-r${refreshKey}`}
          />
          {/* TOP 10 badge — top-right corner tab */}
          {hasTop10 && (
            <View style={styles.top10Badge}>
              <Text style={styles.top10Text}>TOP{"\n"}10</Text>
            </View>
          )}
          {/* Hindi badge — only rendered when TMDB confirms Hindi audio exists */}
          <HindiBadge
            tmdbId={tmdbId ?? m.id}
            mediaType={mediaType}
            style={styles.hindiBadge}
            textStyle={styles.hindiBadgeText}
          />
        </View>
      )}
    </Pressable>
  );
});

const SKELETON_KEYS = ["sk0", "sk1", "sk2", "sk3", "sk4"];

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      {SKELETON_KEYS.map((k) => (
        <View key={k} style={styles.skeletonItem}>
          <Skeleton
            width={CARD_W}
            height={CARD_H}
            borderRadius={10}
          />
        </View>
      ))}
    </View>
  );
}

// Shown when data loaded but returned empty — keeps the row visually solid
function EmptyPlaceholder() {
  return (
    <View style={styles.emptyRow}>
      {SKELETON_KEYS.map((k) => (
        <View key={k} style={styles.emptyCard} />
      ))}
    </View>
  );
}

export default function MovieRow({
  title,
  movies: initialMovies,
  showTop10Badge,
  tmdbFetcher,
  hdhubFetcher,
  refreshKey = 0,
  loadDelay = 0,
  activeGenre,
  seenIds,
  imageMode = "poster",
  preferenceGenres,
  sortByPopularity = false,
  geminiRowId,
  personalized = false,
  userPrefs,
}: Props) {
  const [movies, setMovies] = useState<CardItem[]>(initialMovies);
  const [initialLoading, setInitialLoading] = useState(Boolean(tmdbFetcher || hdhubFetcher));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(tmdbFetcher || hdhubFetcher));
  const pageRef = useRef(0);
  const mountedRef = useRef(true);
  // Tracks whether at least one successful fetch has ever populated this row.
  // Prevents the "empty → null → disappear" collapse on first-load API failure.
  const hasEverLoadedRef = useRef(initialMovies.length > 0);
  const categoryCacheKey = getCategoryCacheKey(title);

  // ─── Stable refs for fetchers ─────────────────────────────────────────────
  // Inline arrow functions like `(p) => tmdb.koreanDramas(p)` create a NEW
  // function reference on every parent render. If we put them in the effect
  // dependency array the effect re-fires on every hero-banner update, wiping
  // the movies array and flashing the skeleton loaders.
  // Instead we keep the LATEST fetcher in a ref and only use `refreshKey` as
  // the re-fetch trigger (which is the intentional refresh mechanism).
  const tmdbFetcherRef = useRef(tmdbFetcher);
  const hdhubFetcherRef = useRef(hdhubFetcher);
  tmdbFetcherRef.current = tmdbFetcher;
  hdhubFetcherRef.current = hdhubFetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const hasTmdb = Boolean(tmdbFetcherRef.current);
    const hasHdhub = Boolean(hdhubFetcherRef.current);
    if (!hasTmdb && !hasHdhub) {
      setMovies(initialMovies);
      return;
    }

    let cancelled = false;
    setInitialLoading(true);
    setHasMore(true);
    pageRef.current = 0;

    // Auto-retry with exponential backoff when the API is temporarily down.
    // Retries: 3s → 6s → 12s. Stops as soon as data loads or component unmounts.
    const RETRY_DELAYS = [3000, 6000, 12000];

    const run = async (attempt = 0): Promise<void> => {
      if (loadDelay > 0 && attempt === 0) {
        await new Promise((r) => setTimeout(r, loadDelay));
      }
      if (cancelled || !mountedRef.current) return;
      try {
        if (hdhubFetcherRef.current) {
          const data = await hdhubFetcherRef.current(1);
          if (cancelled || !mountedRef.current) return;
          const cards = mapHdhub(data);
          if (cards.length > 0) {
            hasEverLoadedRef.current = true;
            setMovies(cards);
            saveHomeCache(categoryCacheKey, cards).catch(() => {});
          } else {
            setMovies((prev) => prev);
          }
          pageRef.current = 1;
          setHasMore(data.length > 0);
          prefetchImages(cards.slice(0, 16).map((c) => (c.poster as { uri?: string })?.uri));
        } else if (tmdbFetcherRef.current) {
          const data = await tmdbFetcherRef.current(1);
          if (cancelled || !mountedRef.current) return;
          const raw = mapResults(data.results);
          // ── Rank by live popularity so the TOP 10 badge always reflects the
          // real TMDB score, independent of the display shuffle below ────────
           const ranked = sortByPopularityDesc(raw);
           // Normal category rows must never carry Top 10 ranking metadata.
           // Rank numbers belong exclusively to the dedicated Top10Row.
           const categoryCards: CardItem[] = ranked.map((c) => ({
             ...c,
             isTop10: false,
             top10Rank: undefined,
           }));
          // ── Smart Category Poster Refresh: display order is a fresh
          // popularity-weighted shuffle on every mount/pull-refresh (unless
          // the caller explicitly wants strict popularity order) so rows feel
          // newly curated without burying genuinely popular titles ──────────
           const cards: CardItem[] = sortByPopularity
             ? categoryCards
             : weightedShuffleByPopularity<CardItem>(categoryCards);
          const locallyPersonalized = personalized && userPrefs
            ? [...cards].sort((a, b) => {
                const scoreA = scoreForUser(userPrefs, a.tmdbId ?? a.id, (a as any).genreIds);
                const scoreB = scoreForUser(userPrefs, b.tmdbId ?? b.id, (b as any).genreIds);
                return (scoreB - scoreA) || ((b.popularity ?? 0) - (a.popularity ?? 0));
              })
            : cards;

          // ── Cross-row deduplication with multi-page fallback ─────────────
          // Many TMDB endpoints share popular titles (e.g. "Teach You A Lesson"
          // appears on page 1 of almost every Korean/Asian category). We try up
          // to MAX_DEDUP_PAGES extra pages to collect enough unique items rather
          // than ever falling back to showing duplicates.
          const MIN_UNIQUE = 6;
          const MAX_DEDUP_PAGES = 4;

          let uniqueCards: typeof cards = seenIds
            ? locallyPersonalized.filter((c) => !seenIds.current.has(c.id))
            : locallyPersonalized;

          let dedupPage = 1;
          let lastPageData = data;

          while (
            seenIds &&
            uniqueCards.length < MIN_UNIQUE &&
            dedupPage < Math.min(lastPageData.total_pages, MAX_DEDUP_PAGES)
          ) {
            dedupPage++;
            const moreData = await tmdbFetcherRef.current!(dedupPage);
            if (cancelled || !mountedRef.current) return;
            lastPageData = moreData;
            const moreRaw = mapResults(moreData.results);
            const moreSorted = sortByPopularity ? sortByPopularityDesc(moreRaw) : moreRaw;
             const moreCards = moreSorted.map((c) => ({
               ...c,
               isTop10: false,
               top10Rank: undefined,
             }));
            const moreUnique = moreCards.filter(
              (c) => !seenIds.current.has(c.id) && !uniqueCards.some((u) => u.id === c.id),
            );
            uniqueCards = [...uniqueCards, ...moreUnique];
          }

          // Register all unique IDs so later rows skip them
          if (seenIds) uniqueCards.forEach((c) => seenIds.current.add(c.id));

          // Only fall back to unfiltered cards if truly zero unique found
          const toShow = uniqueCards.length > 0 ? uniqueCards : cards.slice(0, 4);

          if (toShow.length > 0) {
            hasEverLoadedRef.current = true;
            setMovies(toShow);
            pageRef.current = dedupPage;
            setHasMore(dedupPage < lastPageData.total_pages);
            prefetchImages(toShow.slice(0, 16).map((c) => (c.poster as { uri?: string })?.uri));
            saveHomeCache(categoryCacheKey, toShow).catch(() => {});
            // Gemini AI re-sort: for designated rows (Trending, Because you liked),
            // score each item and re-sort by personalised engagement score.
            // Fire-and-forget — never blocks the initial render.
            if (geminiRowId) {
              scoreAndSortByGemini(toShow as any[], geminiRowId, userPrefs ?? undefined).then((sorted) => {
                if (!cancelled && mountedRef.current) setMovies(sorted as CardItem[]);
              }).catch(() => {});
            }
          } else {
            // No results at all (API returned empty page) — keep previous
            setMovies((prev) => (prev.length > 0 ? prev : initialMovies));
            setHasMore(false);
          }
        }
        // Success — stop loading indicator
        if (!cancelled) setInitialLoading(false);
      } catch {
        if (cancelled || !mountedRef.current) return;
        if (attempt < RETRY_DELAYS.length) {
          // API temporarily down — retry after backoff delay, keep loading spinner
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          if (!cancelled && mountedRef.current) return run(attempt + 1);
        } else {
          // All retries exhausted — show whatever data we have
          setMovies((prev) => (prev.length > 0 ? prev : initialMovies));
          setHasMore(false);
          setInitialLoading(false);
        }
      }
    };

    // ── Offline-first: load from cache instantly, then fetch fresh ────────────
    // AsyncStorage reads are < 5 ms — the skeleton shows briefly while we check,
    // then cached posters replace it before the user notices.  Fresh data from
    // the network overwrites both state and cache on success, so the row stays
    // up-to-date whenever connectivity is available.
    void (async () => {
      try {
        const cacheSnapshot = await loadHomeCacheSnapshot<CardItem[]>(
          categoryCacheKey,
          HOME_CACHE_TTL_MS,
        );
        const cached = cacheSnapshot.data;
         if (cached && cached.length > 0 && !cancelled && mountedRef.current) {
           // Older cache envelopes may contain the former generic-row rank
           // metadata. Normal rows must never render those Top 10 badges.
           const normalisedCached = cached.map((card) => ({
             ...card,
             isTop10: false,
             top10Rank: undefined,
           }));
           setMovies(normalisedCached);
          hasEverLoadedRef.current = true;
          setInitialLoading(false);
        }
        // A fresh feed is frozen for the full 24-hour window. Pull-to-refresh
        // may remount this effect, but it must not reshuffle or refetch content.
        // An empty snapshot is different: it can come from a transient API
        // outage and must not suppress the first successful category fetch.
        const hasCachedCards = Array.isArray(cached) && cached.length > 0;
        if (!cancelled && (!cacheSnapshot.fresh || !hasCachedCards)) await run();
      } catch {
        // A corrupt/unavailable cache must never strand the row in skeleton
        // state. Let the live fetch fallback decide whether cards are available.
        if (!cancelled && mountedRef.current) {
          setMovies((prev) => (prev.length > 0 ? prev : initialMovies));
          setHasMore(false);
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  // refreshKey is the intentional re-fetch trigger; loadDelay and title are stable.
  // tmdbFetcher/hdhubFetcher are intentionally excluded — we read them via ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, loadDelay, personalized, userPrefs]);

  const loadMore = useCallback(async () => {
    const tFetcher = tmdbFetcherRef.current;
    const hFetcher = hdhubFetcherRef.current;
    if ((!tFetcher && !hFetcher) || loadingMore || !hasMore || initialLoading) return;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      if (hFetcher) {
        const data = await hFetcher(nextPage);
        if (!mountedRef.current) return;
        const newCards = mapHdhub(data);
        setMovies((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...newCards.filter((m) => !ids.has(m.id))];
        });
        pageRef.current = nextPage;
        setHasMore(data.length > 0);
      } else if (tFetcher) {
        const data = await tFetcher(nextPage);
        if (!mountedRef.current) return;
        const newCards = mapResults(data.results);
        setMovies((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...newCards.filter((m) => !ids.has(m.id))];
        });
        pageRef.current = nextPage;
        if (nextPage >= data.total_pages) setHasMore(false);
      }
    } catch {
      if (mountedRef.current) setHasMore(false);
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, initialLoading]);

  const renderFooter = useCallback(
    () =>
      loadingMore ? (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#E50914" />
        </View>
      ) : null,
    [loadingMore],
  );

  const renderItem = useCallback(
    ({ item: m, index }: { item: CardItem; index: number }) => (
      <RowCard
        m={m}
        index={index}
        activeGenre={activeGenre}
        imageMode={imageMode}
        preferenceGenres={preferenceGenres}
        refreshKey={refreshKey}
        showTop10Badge={showTop10Badge}
        title={title}
      />
    ),
    [title, activeGenre, imageMode, preferenceGenres, refreshKey, showTop10Badge],
  );

  const keyExtractor = useCallback(
    (m: CardItem) => `${String(m.id)}-r${refreshKey}`,
    [refreshKey],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ITEM_STRIDE,
      offset: ITEM_STRIDE * index + 16,
      index,
    }),
    [],
  );

  // ── Global image guard: never render a card with no valid image URI ─────────
  // Must come BEFORE any early returns so the hook call count is consistent
  // across all renders — a useMemo after a conditional return violates the
  // Rules of Hooks and produces "Rendered fewer hooks than expected".
  const visibleMovies = React.useMemo(
    () => movies.filter((m) => {
      const uri = resolveImageUri(m, activeGenre, imageMode);
      if (uri) return true;
      // Fallback: accept if the card at least has a stored poster URI
      const stored = (m.poster as { uri?: string })?.uri;
      return Boolean(stored);
    }),
    [movies, activeGenre, imageMode],
  );

  // Collapse only when loading finished with no data AND we have never
  // successfully loaded — i.e. the row is genuinely unavailable, not just
  // failing due to a transient network error.
  if (!initialLoading && movies.length === 0 && !hasEverLoadedRef.current) return null;

  // If loading finished but movies is still empty (first-load API failure),
  // show placeholder cards so the row stays visible rather than disappearing.
  if (!initialLoading && movies.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.titleRow}>
          <RowTitleText title={title} style={styles.rowTitle} />
        </View>
        <EmptyPlaceholder />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <RowTitleText title={title} style={styles.rowTitle} />
      </View>

      {initialLoading ? (
        <SkeletonRow />
      ) : (
        <FlatList
          data={visibleMovies}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          extraData={refreshKey}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          removeClippedSubviews={true}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          decelerationRate="fast"
          snapToInterval={ITEM_STRIDE}
          snapToAlignment="start"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, marginBottom: 0 },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 11,
  },
  rowTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  list: { paddingHorizontal: 16 },

  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  skeletonItem: {
    width: CARD_W,
  },

  emptyRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  emptyCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    backgroundColor: "#1c1c1c",
  },

  // cardOuter is the position:relative anchor for all absolutely-placed badge
  // overlays.  Explicit height is required so badges anchored to bottom/top
  // know the bounding box even before the card image has painted.
  cardOuter: {
    width:       CARD_W,
    height:      CARD_H,
    aspectRatio: 2 / 3,
    marginRight: CARD_GAP,
  },
  cardFirst: {},
  cardTitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
    width: CARD_W,
    textAlign: "center",
    letterSpacing: 0.1,
  },

  card: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1c1c1c",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  thumb: {
    width: "100%",
    height: "100%",
    aspectRatio: 2 / 3,
  },

  // ── "TOP 10" square sticker — top-RIGHT corner ────────────────────────────
  // Outside overflow:hidden so the corner is never clipped by the card radius.
  // borderBottomLeftRadius creates the signature cut-corner tab shape.
  top10Badge: {
    position:            "absolute",
    top:                 0,
    right:               0,
    backgroundColor:     "#E50914",
    paddingHorizontal:   5,
    paddingVertical:     3,
    borderBottomLeftRadius: 7,
    zIndex:              10,
    shadowColor:         "#000",
    shadowOffset:        { width: -1, height: 2 },
    shadowOpacity:       0.45,
    shadowRadius:        3,
    elevation:           4,
  },
  top10Text: {
    color:         "#fff",
    fontFamily:    "Inter_700Bold",
    fontSize:      8,
    lineHeight:    9,
    textAlign:     "center",
    letterSpacing: 0.3,
  },


  ratingBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ratingText: {
    color: "#FFD700",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },

  loader: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── "Hindi" badge — top-right corner, semi-transparent ───────────────────────
  hindiBadge: {
    position:          "absolute",
    top:               6,
    right:             6,
    backgroundColor:   "rgba(0,0,0,0.72)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.22)",
    paddingHorizontal: 6,
    paddingVertical:   3,
    borderRadius:      4,
    zIndex:            5,
  },
  hindiBadgeText: {
    color:         "#fff",
    fontSize:      9,
    fontFamily:    "Inter_700Bold",
    letterSpacing: 0.5,
  },

  // ── Red ribbon badge — bottom-center edge (Netflix spec) ─────────────────
  // Full-width #E50914 red bar at the bottom edge of the poster,
  // centered white bold text. ONE badge per poster.
  ribbonBadge: {
    position:        "absolute",
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: "#E50914",
    paddingVertical: 4,
    alignItems:      "center" as const,
    justifyContent:  "center" as const,
    zIndex:          10,
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: -1 },
    shadowOpacity:   0.35,
    shadowRadius:    3,
    elevation:       5,
  },
  ribbonBadgeText: {
    color:         "#fff",
    fontFamily:    "Inter_700Bold",
    fontSize:      8,
    letterSpacing: 0.5,
  },
});
