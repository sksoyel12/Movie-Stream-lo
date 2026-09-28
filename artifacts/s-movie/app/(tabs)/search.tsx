import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import SmartImage from "@/components/SmartImage";
import DynamicPoster from "@/components/DynamicPoster";
import { useColors } from "@/hooks/useColors";
import { tmdb, tmdbImg, type TMDBMovie } from "@/lib/tmdb";

type MediaType = "movie" | "tv";

interface SearchItem {
  id: string;
  tmdbId: number;
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
}

const SEARCH_DEBOUNCE_MS = 280;
const GRID_COLUMNS = 3;
const GRID_GAP = 4;

function getMediaType(item: TMDBMovie): MediaType {
  return item.media_type === "tv" || Boolean(item.name) ? "tv" : "movie";
}

function getTitle(item: TMDBMovie): string {
  return item.title ?? item.name ?? "Untitled";
}

function toSearchItem(item: TMDBMovie): SearchItem {
  return {
    id: `${getMediaType(item)}-${item.id}`,
    tmdbId: item.id,
    title: getTitle(item),
    mediaType: getMediaType(item),
    posterPath: item.poster_path,
    posterUrl: (item as TMDBMovie & { poster_url?: string | null }).poster_url ?? null,
    backdropPath: item.backdrop_path,
  };
}

function uniqueItems(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function SearchTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const latestQuery = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recommendations, setRecommendations] = useState<SearchItem[]>([]);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const isSearching = query.trim().length > 0;

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
  }, []);

  const startVoiceSearch = useCallback(() => {
    const SpeechRecognition = (globalThis as any).SpeechRecognition
      ?? (globalThis as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      inputRef.current?.focus();
      return;
    }
    recognitionRef.current?.stop?.();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript?.trim();
      if (spoken) setQuery(spoken);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  useEffect(() => {
    let active = true;

    tmdb
      .trending(1)
      .then((data) => {
        if (!active) return;
        setRecommendations(
          uniqueItems(
            data.results
              .filter((item) => item.backdrop_path)
              .map(toSearchItem),
          ).slice(0, 18),
        );
      })
      .catch(() => {
        if (active) setRecommendations([]);
      })
      .finally(() => {
        if (active) setRecommendationsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const search = useCallback(async (value: string, nextPage = 1, append = false) => {
    const normalizedQuery = value.trim();
    if (!normalizedQuery) return;

    if (append) setLoadingMore(true);
    else setResultsLoading(true);

    try {
      const data = await tmdb.search(normalizedQuery, nextPage);
      const items = uniqueItems(
        data.results
          .filter((item) => {
            const mediaType = getMediaType(item);
            return (mediaType === "movie" || mediaType === "tv") && Boolean(item.poster_path);
          })
          .map(toSearchItem),
      );

      if (normalizedQuery !== latestQuery.current) return;

      setResults((current) => {
        if (!append) return items;
        return uniqueItems([...current, ...items]);
      });
      setPage(nextPage);
      setTotalPages(data.total_pages);
    } catch {
      if (!append && normalizedQuery === latestQuery.current) setResults([]);
    } finally {
      if (append) setLoadingMore(false);
      else if (normalizedQuery === latestQuery.current) setResultsLoading(false);
    }
  }, []);

  useEffect(() => {
    latestQuery.current = query.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setResultsLoading(false);
      setPage(1);
      return;
    }

    setResults([]);
    setResultsLoading(true);
    debounceRef.current = setTimeout(() => {
      void search(query, 1, false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const loadMore = useCallback(() => {
    if (
      loadingMore ||
      resultsLoading ||
      !isSearching ||
      page >= totalPages
    ) {
      return;
    }
    void search(query, page + 1, true);
  }, [isSearching, loadingMore, page, query, resultsLoading, search, totalPages]);

  const openItem = useCallback((item: SearchItem) => {
    router.push({
      pathname: "/movie/[id]",
      params: {
        id: item.id,
        type: item.mediaType,
        poster_path: tmdbImg(item.posterPath, "w500") ?? "",
        title_param: item.title,
      },
    });
  }, []);

  const renderRecommendation = useCallback(
    ({ item }: { item: SearchItem }) => {
      const posterUri = item.posterUrl ?? tmdbImg(item.posterPath, "w500");

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${item.title}`}
          onPress={() => openItem(item)}
          style={({ pressed }) => [
            styles.recommendationRow,
            { borderBottomColor: colors.border },
            pressed && styles.recommendationPressed,
          ]}
        >
          <View style={styles.backdropFrame}>
            {posterUri ? (
              <SmartImage
                source={{ uri: posterUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="disk"
                title={item.title}
              />
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="film" size={18} color={colors.mutedForeground} />
              </View>
            )}
          </View>

          <Text
            numberOfLines={2}
            style={[styles.recommendationTitle, { color: colors.foreground }]}
          >
            {item.title}
          </Text>

          <View
            style={[
              styles.playButton,
              { borderColor: colors.mutedForeground, backgroundColor: colors.card },
            ]}
          >
            <Feather name="play" size={15} color={colors.foreground} />
          </View>
        </Pressable>
      );
    },
    [colors, openItem],
  );

  const renderPoster = useCallback(
    ({ item }: { item: SearchItem }) => {
      const posterUri = item.posterUrl ?? tmdbImg(item.posterPath, "w500");

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onPress={() => openItem(item)}
          style={({ pressed }) => [
            styles.posterCell,
            { backgroundColor: colors.secondary },
            pressed && styles.posterPressed,
          ]}
        >
          {posterUri ? (
            <DynamicPoster
              tmdbId={item.tmdbId}
              mediaType={item.mediaType}
              fallback={posterUri ? { uri: posterUri } : null}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="disk"
              title={item.title}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.secondary }]}>
              <Feather name="film" size={20} color={colors.mutedForeground} />
            </View>
          )}
        </Pressable>
      );
    },
    [colors, openItem],
  );

  const renderRecommendationHeader = (
    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
      Recommended Shows &amp; Movies
    </Text>
  );

  const renderSearchHeader = (
    <Text style={[styles.sectionTitle, styles.searchSectionTitle, { color: colors.foreground }]}>
      Movies &amp; TV
    </Text>
  );

  const renderLoading = (message: string) => (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top > 0 ? 0 : 8, 8),
              backgroundColor: colors.background,
            },
          ]}
        >
          <View style={[styles.searchBar, { backgroundColor: colors.secondary }]}>
            <Feather name="search" size={19} color={colors.mutedForeground} />
            <TextInput
              ref={inputRef}
              autoCorrect={false}
              placeholder="Search shows, movies, game..."
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              value={query}
              onChangeText={setQuery}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            <Pressable
              accessibilityLabel={isSearching ? "Clear search" : "Focus search"}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => {
                if (isSearching) setQuery("");
                else startVoiceSearch();
              }}
              style={styles.trailingIcon}
            >
              <Feather
                name={isSearching ? "x" : "mic"}
                size={18}
                color={isListening ? colors.primary : colors.foreground}
              />
            </Pressable>
          </View>
        </View>

        {!isSearching ? (
          recommendationsLoading ? (
            renderLoading("Finding something to watch")
          ) : (
            <FlatList
              data={recommendations}
              keyExtractor={(item) => item.id}
              renderItem={renderRecommendation}
              ListHeaderComponent={renderRecommendationHeader}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Recommendations are unavailable right now.
                </Text>
              }
              contentContainerStyle={styles.recommendationContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )
        ) : resultsLoading && results.length === 0 ? (
          renderLoading("Searching")
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderPoster}
            numColumns={GRID_COLUMNS}
            ListHeaderComponent={renderSearchHeader}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="search" size={38} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No results for “{query.trim()}”
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
              ) : null
            }
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridRow}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    padding: 0,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
  },
  trailingIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.3,
  },
  searchSectionTitle: {
    paddingBottom: 14,
  },
  recommendationContent: {
    paddingBottom: 100,
  },
  recommendationRow: {
    minHeight: 132,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  recommendationPressed: {
    opacity: 0.72,
  },
  backdropFrame: {
    width: 82,
    height: 112,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#252525",
  },
  recommendationTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 19,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gridContent: {
    paddingHorizontal: GRID_GAP,
    paddingBottom: 100,
  },
  gridRow: {
    gap: 0,
  },
  posterCell: {
    flex: 1,
    aspectRatio: 2 / 3,
    margin: GRID_GAP,
    overflow: "hidden",
    borderRadius: 3,
  },
  posterPressed: {
    opacity: 0.72,
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  emptyState: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  footerLoader: {
    paddingVertical: 20,
  },
});