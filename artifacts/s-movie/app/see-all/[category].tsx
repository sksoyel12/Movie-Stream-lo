import { Feather } from "@expo/vector-icons";
import SmartImage from "@/components/SmartImage";
import { router, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Skeleton } from "@/components/Skeleton";
import { haptic } from "@/lib/haptics";
import {
  ROW_FETCHERS,
  mapTMDBToCards,
  mapHDHubToCards,
  type SeeAllCard,
} from "@/lib/rowFetchers";
import { useMyList } from "@/contexts/MyListContext";

const COLUMNS = 3;
const CARD_GAP = 6;
const SIDE_PAD = 12;

export default function SeeAllScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const cardWidth = Math.floor(
    (width - SIDE_PAD * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const cardHeight = Math.floor(cardWidth * 1.5);

  // ── My List — served entirely from context, no TMDB fetch needed ──────────
  const { allItems } = useMyList();
  const isMyList = category === "My List";
  const myListCards = useMemo<SeeAllCard[]>(
    () =>
      allItems
        .filter((item) => item.posterUri)
        .map((item) => ({
          id:        item.id,
          title:     item.title,
          posterUri: item.posterUri,
          mediaType: item.mediaType,
        })),
    [allItems],
  );

  const [cards, setCards] = useState<SeeAllCard[]>([]);
  const [loading, setLoading] = useState(!isMyList);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const pageRef = useRef(0);
  const mountedRef = useRef(true);

  const entry = isMyList ? undefined : (category ? ROW_FETCHERS[category] : undefined);

  /* ── Active card set: My List uses context directly, others use fetched cards ── */
  const activeCards = isMyList ? myListCards : cards;

  /* ── Filtered cards derived from search query ── */
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return activeCards;
    const q = searchQuery.trim().toLowerCase();
    return activeCards.filter((c) => c.title.toLowerCase().includes(q));
  }, [activeCards, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (page: number) => {
      if (!entry) return;
      try {
        if (entry.kind === "tmdb") {
          const data = await entry.fn(page);
          if (!mountedRef.current) return;
          const newCards = mapTMDBToCards(data, entry.mediaType);
          if (page === 1) {
            setCards(newCards);
          } else {
            setCards((prev) => {
              const ids = new Set(prev.map((c) => c.id));
              return [...prev, ...newCards.filter((c) => !ids.has(c.id))];
            });
          }
          setHasMore(page < data.total_pages);
          pageRef.current = page;
        } else {
          const data = await entry.fn(page);
          if (!mountedRef.current) return;
          const newCards = mapHDHubToCards(data);
          if (page === 1) {
            setCards(newCards);
          } else {
            setCards((prev) => {
              const ids = new Set(prev.map((c) => c.id));
              return [...prev, ...newCards.filter((c) => !ids.has(c.id))];
            });
          }
          setHasMore(newCards.length > 0);
          pageRef.current = page;
        }
      } catch {
        if (mountedRef.current) setHasMore(false);
      }
    },
    [entry],
  );

  useEffect(() => {
    pageRef.current = 0;
    setCards([]);
    setLoading(true);
    setHasMore(true);
    setSearchQuery("");
    fetchPage(1).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    // Don't fetch more pages while user is searching
    if (isSearching || loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    await fetchPage(pageRef.current + 1);
    if (mountedRef.current) setLoadingMore(false);
  }, [isSearching, loadingMore, hasMore, loading, fetchPage]);

  const renderCard = useCallback(
    ({ item }: { item: SeeAllCard }) => (
      <Pressable
        onPress={() => {
          haptic.light();
          router.push({
            pathname: "/movie/[id]",
            params: {
              id: item.id,
              type: item.mediaType,
              hdhubUrl: item.hdhubUrl ?? "",
              poster_path: item.posterUri,
              title_param: item.title,
            },
          });
        }}
        style={({ pressed }) => [
          { width: cardWidth, height: cardHeight },
          styles.card,
          pressed && styles.cardPressed,
        ]}
      >
        <SmartImage
          source={{ uri: item.posterUri }}
          style={styles.cardImage}
          contentFit="cover"
          transition={180}
          cachePolicy="disk"
          title={item.title}
          recyclingKey={item.id}
        />
      </Pressable>
    ),
    [cardWidth, cardHeight],
  );

  const keyExtractor = useCallback((c: SeeAllCard) => c.id, []);

  const ItemSeparator = useCallback(
    () => <View style={{ height: CARD_GAP }} />,
    [],
  );

  const ListFooter = useCallback(
    () =>
      loadingMore && !isSearching ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#0EA5E9" />
        </View>
      ) : null,
    [loadingMore, isSearching],
  );

  const SkeletonGrid = () => (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton
          key={`sk-${i}`}
          width={cardWidth}
          height={cardHeight}
          borderRadius={8}
        />
      ))}
    </View>
  );

  /* ── Result label shown under search bar ── */
  const resultLabel = useMemo(() => {
    if (loading) return null;
    if (!isSearching) {
      return activeCards.length > 0
        ? `${activeCards.length} title${activeCards.length !== 1 ? "s" : ""}${!isMyList && hasMore ? " — scroll for more" : ""}`
        : null;
    }
    if (filteredCards.length === 0) return `No results for "${searchQuery.trim()}"`;
    return `${filteredCards.length} result${filteredCards.length !== 1 ? "s" : ""} for "${searchQuery.trim()}"`;
  }, [loading, isSearching, activeCards.length, isMyList, hasMore, filteredCards.length, searchQuery]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { haptic.light(); router.back(); }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
          hitSlop={14}
        >
          <Feather name="chevron-left" size={28} color="#fff" />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={2}>
          {category ?? "Browse"}
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* ── Search bar ── */}
      {!loading && (
        <View style={styles.searchWrap}>
          <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
            <Feather
              name="search"
              size={16}
              color={searchFocused ? "#0EA5E9" : "#666"}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder={`Search in ${category ?? "this category"}…`}
              placeholderTextColor="#4a4a4a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="never"
              selectionColor="#0EA5E9"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => { setSearchQuery(""); inputRef.current?.focus(); }}
                hitSlop={10}
                style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.clearCircle}>
                  <Feather name="x" size={11} color="#000" />
                </View>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ── Result count label ── */}
      {resultLabel ? (
        <Text style={[styles.resultLabel, isSearching && { color: isSearching && filteredCards.length === 0 ? "#0EA5E9" : "#888" }]}>
          {resultLabel}
        </Text>
      ) : null}

      {/* ── Thin divider ── */}
      <View style={styles.divider} />

      {/* ── Content ── */}
      {loading ? (
        <SkeletonGrid />
      ) : isMyList && activeCards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Feather name="bookmark" size={48} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptySubtitle}>
            Tap + My List on any movie or show to save it here
          </Text>
        </View>
      ) : !isMyList && !entry ? (
        <View style={styles.emptyWrap}>
          <Feather name="film" size={48} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>This category isn't available right now</Text>
        </View>
      ) : isSearching && filteredCards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Feather name="search" size={48} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>No matches found</Text>
          <Text style={styles.emptySubtitle}>
            Try a different title or scroll more to load additional content
          </Text>
          <Pressable
            style={({ pressed }) => [styles.clearSearchBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setSearchQuery("")}
          >
            <Text style={styles.clearSearchText}>Clear Search</Text>
          </Pressable>
        </View>
      ) : activeCards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Feather name="inbox" size={48} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>No titles found</Text>
          <Text style={styles.emptySubtitle}>Check back later for updates</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCards}
          keyExtractor={keyExtractor}
          renderItem={renderCard}
          numColumns={COLUMNS}
          contentContainerStyle={[
            styles.gridContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          columnWrapperStyle={styles.columnWrapper}
          ItemSeparatorComponent={ItemSeparator}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={ListFooter}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={6}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    minHeight: 52,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 6,
  },
  headerTitle: {
    flex: 1,
    color: "#ffffff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
    lineHeight: 22,
  },
  headerSpacer: {
    width: 44,
  },

  /* Search bar */
  searchWrap: {
    paddingHorizontal: SIDE_PAD,
    paddingBottom: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    height: 42,
  },
  searchBoxFocused: {
    borderColor: "#0EA5E9",
    backgroundColor: "#1a1a1a",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
    letterSpacing: 0.1,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 2,
  },
  clearCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#666",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Result count label */
  resultLabel: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
    paddingHorizontal: SIDE_PAD + 4,
    paddingBottom: 8,
  },

  /* Divider */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
  },

  /* Grid */
  gridContent: {
    paddingHorizontal: SIDE_PAD,
    paddingTop: 4,
  },
  columnWrapper: {
    gap: CARD_GAP,
    justifyContent: "flex-start",
  },

  /* Card */
  card: {
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  cardImage: {
    width: "100%",
    height: "100%",
    aspectRatio: 2 / 3,
  },

  /* Skeleton */
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SIDE_PAD,
    gap: CARD_GAP,
    paddingTop: 4,
  },

  /* Footer loader */
  footerLoader: {
    paddingVertical: 28,
    alignItems: "center",
  },

  /* Empty / no-search-results state */
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: "#555",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  emptySubtitle: {
    color: "#333",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  clearSearchBtn: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#0EA5E9",
  },
  clearSearchText: {
    color: "#0EA5E9",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
