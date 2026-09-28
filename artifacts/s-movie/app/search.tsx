import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, Ionicons } from "@expo/vector-icons";
import SmartImage from "@/components/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tmdb, tmdbImg, tmdbToCard, type TMDBMovie } from "@/lib/tmdb";
import { ALL_MOVIES, type Movie } from "@/data/movies";
import DynamicPoster from "@/components/DynamicPoster";
import { trackSearchQuery } from "@/lib/userPreferences";

const { width: SCREEN_W } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const CARD_GAP = 8;
const CARD_W = (SCREEN_W - 32 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const CARD_H = Math.round(CARD_W * 1.5);

const HISTORY_KEY = "@smovie_search_history";
const MAX_HISTORY = 12;

type Filter = "All" | "Movies" | "TV Shows";

interface GenreDef {
  label: string;
  type: "movie" | "tv";
  genreId?: number;
  special?: "kdrama" | "anime" | "bollywood" | "trending";
}

const GENRES: GenreDef[] = [
  { label: "Trending",    type: "movie", special: "trending" },
  { label: "Action",      type: "movie", genreId: 28 },
  { label: "Horror",      type: "movie", genreId: 27 },
  { label: "Comedy",      type: "movie", genreId: 35 },
  { label: "K-Drama",     type: "tv",    special: "kdrama" },
  { label: "Romance",     type: "movie", genreId: 10749 },
  { label: "Sci-Fi",      type: "movie", genreId: 878 },
  { label: "Thriller",    type: "movie", genreId: 53 },
  { label: "Crime",       type: "movie", genreId: 80 },
  { label: "Anime",       type: "tv",    special: "anime" },
  { label: "Documentary", type: "movie", genreId: 99 },
  { label: "Bollywood",   type: "movie", special: "bollywood" },
];

interface SearchResult {
  id: string;
  tmdbId?: number;
  title: string;
  poster: { uri: string } | null;
  backdrop: { uri: string } | null;
  year: number;
  rating: number;
  mediaType: "movie" | "tv";
  genres: string[];
  releaseDate?: string | null; // ISO date string — used for "Coming Soon" badge
}

// ─── Search history hook ───────────────────────────────────────────────────────

function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => { if (raw) setHistory(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const add = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const remove = useCallback(async (q: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== q);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    setHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  return { history, add, remove, clear };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function staticFallback(q: string, filter: Filter): SearchResult[] {
  const lq = q.toLowerCase();
  return ALL_MOVIES
    .filter((m) => {
      const match = [m.title, ...m.genres, ...m.cast, m.director]
        .join(" ").toLowerCase().includes(lq);
      if (!match) return false;
      if (filter === "Movies") return !(m as any).mediaType || (m as any).mediaType === "movie";
      if (filter === "TV Shows") return (m as any).mediaType === "tv" || Boolean(m.episodes?.length);
      return true;
    })
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster: m.poster as { uri: string } | null,
      backdrop: null,
      year: m.year,
      rating: (m as any).tmdbRating ?? 0,
      mediaType: ((m as any).mediaType ?? "movie") as "movie" | "tv",
      genres: m.genres,
      releaseDate: null,
    }));
}

function tmdbResultToItem(m: TMDBMovie): SearchResult {
  const card = tmdbToCard(m);
  return {
    id: card.id,
    tmdbId: card.tmdbId,
    title: card.title,
    poster: card.poster,
    backdrop: card.hero ?? null,
    year: card.year,
    rating: card.tmdbRating,
    mediaType: card.mediaType,
    genres: card.genres,
    releaseDate: (m as any).release_date ?? (m as any).first_air_date ?? null,
  };
}

function isComingSoonDate(dateStr?: string | null): boolean {
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

// ─── Trending hook ─────────────────────────────────────────────────────────────

function useTrending() {
  const [movies, setMovies] = useState<SearchResult[]>([]);
  const [tvShows, setTvShows] = useState<SearchResult[]>([]);
  useEffect(() => {
    tmdb.trendingMovies(1).then((d) => setMovies(d.results.slice(0, 10).map(tmdbResultToItem))).catch(() => {});
    tmdb.trendingTV(1).then((d) => setTvShows(d.results.slice(0, 10).map(tmdbResultToItem))).catch(() => {});
  }, []);
  return { movies, tvShows };
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [tmdbPage, setTmdbPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<GenreDef | null>(null);
  const [genreResults, setGenreResults] = useState<SearchResult[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genrePage, setGenrePage] = useState(1);
  const [genreTotalPages, setGenreTotalPages] = useState(1);
  const [genreLoadingMore, setGenreLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef("");
  const inputRef = useRef<TextInput>(null);
  const { movies: trendingMovies, tvShows: trendingTV } = useTrending();
  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();

  const searchTMDB = useCallback(async (q: string, f: Filter, page = 1, append = false) => {
    if (!q.trim()) return;
    const isFirst = !append;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const data = await tmdb.search(q.trim(), page);
      const items = data.results
        .filter((m) => {
          if (!m.poster_path) return false;
          if (f === "Movies") return m.media_type !== "tv" && !m.name;
          if (f === "TV Shows") return m.media_type === "tv" || Boolean(m.name);
          return true;
        })
        .map(tmdbResultToItem);
      if (q !== latestQuery.current) return;
      setResults((prev) => {
        if (!append) return items;
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...items.filter((r) => !ids.has(r.id))];
      });
      setTmdbPage(page);
      setTotalPages(data.total_pages);
    } catch {
      if (!append && q === latestQuery.current) setResults(staticFallback(q, f));
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    latestQuery.current = query;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => searchTMDB(query, filter, 1, false), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, searchTMDB]);

  const loadNextPage = useCallback(() => {
    if (loadingMore || loading || !query.trim() || tmdbPage >= totalPages) return;
    searchTMDB(query, filter, tmdbPage + 1, true);
  }, [loadingMore, loading, query, filter, tmdbPage, totalPages, searchTMDB]);

  const fetchByGenre = useCallback(async (genre: GenreDef, page = 1, append = false) => {
    if (!append) setGenreLoading(true); else setGenreLoadingMore(true);
    try {
      let data;
      if (genre.special === "trending") {
        data = await tmdb.trendingToday(page);
      } else if (genre.special === "kdrama") {
        data = await tmdb.koreanDramas(page);
      } else if (genre.special === "anime") {
        data = await tmdb.discover("tv", 16, page);
      } else if (genre.special === "bollywood") {
        data = await tmdb.discover("movie", 28, page);
      } else if (genre.genreId) {
        data = await tmdb.discover(genre.type, genre.genreId, page);
      } else return;

      const items = (data.results as any[])
        .filter((m: any) => m.poster_path)
        .map((m: any) => tmdbResultToItem(m));

      setGenreResults((prev) => {
        if (!append) return items;
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...items.filter((r) => !ids.has(r.id))];
      });
      setGenrePage(page);
      setGenreTotalPages(data.total_pages ?? 1);
    } catch { } finally {
      if (!append) setGenreLoading(false); else setGenreLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedGenre) { setGenreResults([]); return; }
    fetchByGenre(selectedGenre, 1, false);
  }, [selectedGenre, fetchByGenre]);

  const loadNextGenrePage = useCallback(() => {
    if (!selectedGenre || genreLoadingMore || genreLoading || genrePage >= genreTotalPages) return;
    fetchByGenre(selectedGenre, genrePage + 1, true);
  }, [selectedGenre, genreLoadingMore, genreLoading, genrePage, genreTotalPages, fetchByGenre]);

  const onPressResult = (item: SearchResult) => {
    addHistory(item.title);
    trackSearchQuery(item.title).catch(() => {});
    router.push({
      pathname: "/movie/[id]",
      params: {
        id: item.id,
        type: item.mediaType,
        poster_path: item.poster?.uri ?? "",
        title_param: item.title ?? "",
      },
    });
  };

  const onSelectHistory = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  // ── Grid card ────────────────────────────────────────────────────────────────
  const renderGridItem = ({ item, index }: { item: SearchResult; index: number }) => {
    const isLast = (index + 1) % NUM_COLUMNS === 0;
    const comingSoon = isComingSoonDate(item.releaseDate);
    return (
      <Pressable
        onPress={() => onPressResult(item)}
        style={({ pressed }) => [
          styles.gridCard,
          { marginRight: isLast ? 0 : CARD_GAP },
          pressed && { opacity: 0.78, transform: [{ scale: 0.96 }] },
        ]}
      >
        {item.poster?.uri ? (
          <DynamicPoster
            tmdbId={item.tmdbId}
            mediaType={item.mediaType}
            fallback={{ uri: item.poster.uri.replace(/\/w\d+\//, "/w500/") }}
            title={item.title}
            style={[styles.gridPoster, comingSoon && { opacity: 0.55 }]}
            contentFit="cover"
            transition={300}
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.gridPoster, styles.gridPosterPlaceholder]}>
            <Feather name="film" size={28} color="#2a2a2a" />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.88)"]}
          style={styles.gridGradient}
        />

        {/* Coming Soon overlay */}
        {comingSoon && (
          <View style={styles.comingSoonOverlay}>
            <View style={styles.comingSoonBadge}>
              <Ionicons name="time-outline" size={10} color="#fff" />
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
          </View>
        )}

        <View style={[styles.typeBadge, item.mediaType === "tv" ? styles.typeBadgeTV : styles.typeBadgeMovie]}>
          <Text style={styles.typeBadgeText}>{item.mediaType === "tv" ? "TV" : "MV"}</Text>
        </View>
        <View style={styles.gridInfo}>
          <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.gridMeta}>
            <Text style={styles.gridYear}>{item.year}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Trending list row ─────────────────────────────────────────────────────────
  const renderTrendingRow = (item: SearchResult) => (
    <Pressable
      key={item.id}
      onPress={() => onPressResult(item)}
      style={({ pressed }) => [styles.trendRow, pressed && { backgroundColor: "#111" }]}
    >
      <View style={styles.trendThumbWrap}>
        {item.poster?.uri ? (
          <SmartImage
            source={{ uri: item.poster.uri }}
            style={styles.trendThumb}
            contentFit="cover"
            cachePolicy="disk"
            title={item.title}
          />
        ) : (
          <View style={[styles.trendThumb, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={16} color="#333" />
          </View>
        )}
      </View>
      <View style={styles.trendInfo}>
        <Text style={styles.trendTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.trendMeta}>
          <View style={[styles.trendTypePill, item.mediaType === "tv" ? styles.trendTypeTV : styles.trendTypeMovie]}>
            <Text style={styles.trendTypeText}>
              {item.mediaType === "tv" ? "TV Show" : "Movie"}
            </Text>
          </View>
          <Text style={styles.trendYear}>{item.year}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={17} color="#2a2a2a" />
    </Pressable>
  );

  // ── Empty state content ───────────────────────────────────────────────────────
  const renderEmptyState = () => (
    <View>
      {/* ── Genre chips ── */}
      <View style={styles.genreSection}>
        <Text style={styles.genreSectionTitle}>Browse by Genre</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genreRow}
        >
          {GENRES.map((g) => {
            const active = selectedGenre?.label === g.label;
            return (
              <Pressable
                key={g.label}
                onPress={() => setSelectedGenre(active ? null : g)}
                style={[styles.genreChip, active && styles.genreChipActive]}
              >
                <Text style={[styles.genreChipText, active && styles.genreChipTextActive]}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Recent searches ── */}
      {history.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLeft}>
              <Feather name="clock" size={15} color="#737373" />
              <Text style={styles.sectionTitle}>Recent Searches</Text>
            </View>
            <Pressable onPress={clearHistory} hitSlop={8}>
              <Text style={styles.clearAll}>Clear all</Text>
            </Pressable>
          </View>
          <View style={styles.historyList}>
            {history.map((term) => (
              <View key={term} style={styles.histRow}>
                <Pressable
                  onPress={() => onSelectHistory(term)}
                  style={({ pressed }) => [styles.histItem, pressed && { opacity: 0.7 }]}
                >
                  <Feather name="search" size={14} color="#404040" />
                  <Text style={styles.histText} numberOfLines={1}>{term}</Text>
                </Pressable>
                <Pressable onPress={() => removeHistory(term)} hitSlop={10} style={styles.histDelete}>
                  <Feather name="x" size={14} color="#404040" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Trending section ── */}
      {trendingMovies.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLeft}>
              <Ionicons name="trending-up" size={16} color="#e5e5e5" />
              <Text style={styles.sectionTitle}>Trending Movies</Text>
            </View>
          </View>
          {trendingMovies.slice(0, 8).map(renderTrendingRow)}
        </View>
      )}

      {trendingTV.length > 0 && (
        <View style={[styles.section, { marginTop: 8 }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLeft}>
              <Ionicons name="tv-outline" size={16} color="#e5e5e5" />
              <Text style={styles.sectionTitle}>Trending TV Shows</Text>
            </View>
          </View>
          {trendingTV.slice(0, 8).map(renderTrendingRow)}
        </View>
      )}

      <View style={{ height: 80 }} />
    </View>
  );

  const isSearching = query.trim().length > 0;
  const isGenreBrowsing = !isSearching && selectedGenre !== null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={["top"]}>

        {/* ── Title row: Search + Downloads + Notifications ────────────────── */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Search</Text>
          <View style={styles.titleIconsRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
              accessibilityLabel="Downloads"
            >
              <Feather name="download" size={22} color="#e5e5e5" />
            </Pressable>
            <Pressable
              onPress={() => { router.push("/notifications"); }}
              hitSlop={10}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={22} color="#e5e5e5" />
            </Pressable>
          </View>
        </View>

        {/* ── Search bar ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={18} color="#8a8a8a" />
            <TextInput
              ref={inputRef}
              autoFocus
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => { if (query.trim()) addHistory(query.trim()); }}
              placeholder="Search shows, movies, games…"
              placeholderTextColor="#8a8a8a"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="never"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <View style={styles.clearBtn}>
                  <Feather name="x" size={12} color="#737373" />
                </View>
              </Pressable>
            ) : (
              <Feather name="mic" size={18} color="#8a8a8a" />
            )}
          </View>
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={8}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {/* ── Filter chips ──────────────────────────────────────────────── */}
        {isSearching && (
          <View style={styles.filterRow}>
            {(["All", "Movies", "TV Shows"] as Filter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, filter === f && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                  {f}
                </Text>
              </Pressable>
            ))}
            {loading && <ActivityIndicator size="small" color="#737373" style={{ marginLeft: 4 }} />}
          </View>
        )}

        {/* ── Content ───────────────────────────────────────────────────── */}
        {isGenreBrowsing ? (
          /* Genre browse grid */
          genreLoading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 9 }).map((_, i) => <View key={i} style={styles.skeletonCard} />)}
            </View>
          ) : (
            <FlatList
              data={genreResults}
              keyExtractor={(r) => r.id}
              renderItem={renderGridItem}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.gridRow}
              keyboardShouldPersistTaps="handled"
              onEndReached={loadNextGenrePage}
              onEndReachedThreshold={0.4}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.genreBrowseHeader}>
                  <Text style={styles.genreBrowseTitle}>{selectedGenre?.label}</Text>
                  <Pressable onPress={() => setSelectedGenre(null)} hitSlop={10}>
                    <Feather name="x" size={16} color="#525252" />
                  </Pressable>
                </View>
              }
              ListFooterComponent={
                genreLoadingMore ? (
                  <View style={styles.loadMoreRow}>
                    <ActivityIndicator size="small" color="#E50914" />
                    <Text style={styles.loadMoreText}>Loading more…</Text>
                  </View>
                ) : null
              }
            />
          )
        ) : !isSearching ? (
          <FlatList
            data={[]}
            renderItem={null}
            keyExtractor={() => "k"}
            ListHeaderComponent={renderEmptyState}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        ) : loading && results.length === 0 ? (
          /* Instant skeleton grid while waiting for debounce + TMDB */
          <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="search" size={42} color="#1f1f1f" />
            <Text style={styles.emptyTitle}>No results for "{query}"</Text>
            <Text style={styles.emptyHint}>Try a different title, actor or genre</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.id}
            renderItem={renderGridItem}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridRow}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadNextPage}
            onEndReachedThreshold={0.4}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={styles.resultCount}>
                {results.length}+ results for "{query}"
              </Text>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.loadMoreRow}>
                  <ActivityIndicator size="small" color="#E50914" />
                  <Text style={styles.loadMoreText}>Loading more…</Text>
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  safe: { flex: 1 },

  // ── Title row
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  pageTitle: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  titleIconsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },

  // ── Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a1a1a",
  },
  backBtn: { padding: 4 },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { color: "#737373", fontSize: 14, fontFamily: "Inter_500Medium" },

  // ── Filters
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#141414",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#232323",
  },
  filterChipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterChipText: { color: "#737373", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: "#000" },

  // ── Skeleton
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: CARD_GAP,
  },
  skeletonCard: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    backgroundColor: "#111",
  },

  // ── Grid results
  gridContent: { paddingHorizontal: 16, paddingBottom: 80 },
  gridRow: { gap: CARD_GAP, marginBottom: CARD_GAP },
  resultCount: {
    color: "#404040",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    paddingVertical: 10,
    letterSpacing: 0.3,
  },
  gridCard: {
    width: CARD_W,
    height: CARD_H,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0d0d0d",
  },
  gridPoster: { width: "100%", height: "100%", aspectRatio: 2 / 3 },
  gridPosterPlaceholder: { alignItems: "center", justifyContent: "center" },
  gridGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "55%" },
  typeBadge: { position: "absolute", top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  typeBadgeTV: { backgroundColor: "rgba(80,80,80,0.90)" },
  typeBadgeMovie: { backgroundColor: "rgba(229,9,20,0.8)" },
  typeBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  gridInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  gridTitle: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold", lineHeight: 14 },
  gridMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  gridYear: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "Inter_400Regular" },
  gridRatingBadge: {
    backgroundColor: "rgba(0,0,0,0.60)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  gridRatingText: { color: "#f5c518", fontSize: 9, fontFamily: "Inter_600SemiBold" },

  // ── Coming Soon overlay
  comingSoonOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  comingSoonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  comingSoonText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },

  // ── Empty state sections
  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { color: "#e5e5e5", fontSize: 15, fontFamily: "Inter_700Bold" },
  clearAll: { color: "#737373", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // ── History
  historyList: { paddingHorizontal: 16, gap: 2 },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  histItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  histText: {
    color: "#a3a3a3",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  histDelete: { padding: 4 },

  // ── Trending rows
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 12,
    borderRadius: 4,
  },
  trendThumbWrap: {},
  trendThumb: { width: 70, height: 44, borderRadius: 5, backgroundColor: "#111" },
  trendInfo: { flex: 1 },
  trendTitle: { color: "#e5e5e5", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  trendMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 },
  trendTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  trendTypeTV: {},
  trendTypeMovie: {},
  trendTypeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#a3a3a3" },
  trendYear: { color: "#404040", fontSize: 10, fontFamily: "Inter_400Regular" },
  trendRating: { color: "#f5c518", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // ── Loading / empty
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyTitle: { color: "#737373", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { color: "#333", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  loadMoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  loadMoreText: { color: "#525252", fontSize: 13, fontFamily: "Inter_500Medium" },

  // ── Genre browser
  genreSection: { marginTop: 16, marginBottom: 4 },
  genreSectionTitle: {
    color: "#e5e5e5",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  genreRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 4 },
  genreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#232323",
  },
  genreChipActive: { backgroundColor: "#E50914", borderColor: "#E50914" },
  genreEmoji: { fontSize: 14 },
  genreChipText: { color: "#a3a3a3", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  genreChipTextActive: { color: "#fff" },
  genreBrowseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  genreBrowseTitle: { flex: 1, color: "#e5e5e5", fontSize: 16, fontFamily: "Inter_700Bold" },
});
