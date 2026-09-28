import { Feather, Ionicons } from "@expo/vector-icons";
import SmartImage from "@/components/SmartImage";
import { useFocusEffect, router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDownloads, type ManagedDownload } from "@/contexts/DownloadContext";
import { useNetworkStatus } from "@/contexts/NetworkContext";
import { haptic } from "@/lib/haptics";
import { getStorageInfo, formatBytes, formatGB, type StorageInfo } from "@/lib/storage";

const BYTES_IN_GB = 1024 * 1024 * 1024;
const THUMB_W = 130;
const THUMB_H = 73;

// ─── Progress bar (animated) ────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [anim, progress]);

  return (
    <View style={pbStyles.track}>
      <Animated.View
        style={[
          pbStyles.fill,
          {
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
      <View style={pbStyles.glow} />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
    marginTop: 6,
    position: "relative",
  },
  fill: {
    height: "100%",
    backgroundColor: "#0EA5E9",
    borderRadius: 2,
  },
  glow: {
    position: "absolute",
    right: 0,
    top: -1,
    bottom: -1,
    width: 8,
    backgroundColor: "rgba(229,9,20,0.4)",
    borderRadius: 4,
  },
});

// ─── Storage bar ────────────────────────────────────────────────────────────

function StorageBar({ info }: { info: StorageInfo }) {
  const appFraction = Math.min(info.usedFraction, 1);
  const systemFraction = 0.42;
  const otherFraction = Math.max(0, 1 - systemFraction - appFraction);

  return (
    <View style={barStyles.wrap}>
      <View style={barStyles.header}>
        <View style={barStyles.titleRow}>
          <Feather name="hard-drive" size={14} color="#737373" />
          <Text style={barStyles.title}>Device Storage</Text>
        </View>
        <Text style={barStyles.free}>{formatGB(info.freeBytes)} free</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.seg, { flex: systemFraction, backgroundColor: "#2a2a2a" }]} />
        {appFraction > 0.001 && (
          <View style={[barStyles.seg, { flex: appFraction, backgroundColor: "#0EA5E9" }]} />
        )}
        {otherFraction > 0 && (
          <View style={[barStyles.seg, { flex: otherFraction, backgroundColor: "#141414" }]} />
        )}
      </View>
      <View style={barStyles.legend}>
        <LegendDot color="#2a2a2a" label="System" value={`${(16 * 0.42).toFixed(1)} GB`} />
        <LegendDot
          color="#0EA5E9"
          label="S Movie Original"
          value={info.usedBytes > 0 ? formatBytes(info.usedBytes) : "0 MB"}
        />
        <LegendDot color="#141414" label="Free" value={formatGB(info.freeBytes)} border />
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  value,
  border,
}: {
  color: string;
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <View style={barStyles.legendItem}>
      <View style={[barStyles.dot, { backgroundColor: color }, border && barStyles.dotBorder]} />
      <Text style={barStyles.legendLabel}>{label}</Text>
      <Text style={barStyles.legendValue}>{value}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#1e1e1e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: "#a3a3a3", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  free: { color: "#34D399", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  track: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#141414",
    gap: 1,
    marginBottom: 10,
  },
  seg: { height: "100%" },
  legend: { flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotBorder: { borderWidth: 1, borderColor: "#333" },
  legendLabel: { color: "#525252", fontSize: 10, fontFamily: "Inter_400Regular" },
  legendValue: { color: "#737373", fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

// ─── Download row ────────────────────────────────────────────────────────────

function DownloadRow({
  item,
  onPlay,
  onDelete,
}: {
  item: ManagedDownload;
  onPlay: (item: ManagedDownload) => void;
  onDelete: (item: ManagedDownload) => void;
}) {
  const isDownloading = item.status === "downloading";
  const isError = item.status === "error";
  const sizeMB = item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : null;
  const date = item.downloadedAt
    ? new Date(item.downloadedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: "#0a0a0a" }]}
      onPress={() => !isDownloading && onPlay(item)}
      onLongPress={() => onDelete(item)}
    >
      {/* Thumbnail */}
      <View style={styles.thumbWrap}>
        {item.posterUri ? (
          <SmartImage
            source={{ uri: item.posterUri }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="disk"
            title={item.title}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Feather name="film" size={20} color="#2a2a2a" />
          </View>
        )}

        {/* Overlay */}
        {isDownloading ? (
          <View style={styles.thumbOverlay}>
            <Ionicons name="cloud-download" size={20} color="#0EA5E9" />
          </View>
        ) : isError ? (
          <View style={styles.thumbOverlay}>
            <Ionicons name="alert-circle" size={20} color="#0EA5E9" />
          </View>
        ) : (
          <View style={styles.thumbOverlay}>
            <Ionicons name="play" size={18} color="#fff" />
          </View>
        )}

        <View style={styles.qualityBadge}>
          <Text style={styles.qualityText}>HD</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.metaRow}>
          {item.year ? <Text style={styles.metaText}>{item.year}  ·</Text> : null}
          <View style={styles.qualityPill}>
            <Text style={styles.qualityPillText}>HD</Text>
          </View>
        </View>

        {isDownloading ? (
          <>
            <View style={styles.progressLabelRow}>
              <Ionicons name="cloud-download" size={11} color="#0EA5E9" />
              <Text style={styles.progressLabel}>
                {Math.round(item.progress * 100)}% downloaded
              </Text>
            </View>
            <ProgressBar progress={item.progress} />
          </>
        ) : isError ? (
          <Text style={styles.errorText}>Download failed — tap to retry</Text>
        ) : (
          <View style={styles.sizeRow}>
            <Feather name="download-cloud" size={11} color="#34D399" />
            {sizeMB ? <Text style={styles.sizeText}>{sizeMB}</Text> : null}
            {date ? <Text style={styles.dateText}> · {date}</Text> : null}
          </View>
        )}
      </View>

      {/* Action */}
      <View style={styles.actionsCol}>
        {isDownloading ? (
          <Pressable
            onPress={() => onDelete(item)}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle" size={30} color="#404040" />
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => onPlay(item)}
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="play-circle" size={36} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onDelete(item)}
              hitSlop={8}
              style={({ pressed }) => [styles.trashBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="trash-2" size={16} color="#404040" />
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const topPad =
    (Platform.OS === "web" ? Math.max(insets.top, 12) : insets.top) + 12;

  const { downloads, removeDownload, refreshDownloads } = useDownloads();
  const { isOffline } = useNetworkStatus();
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [storage] = await Promise.all([
        getStorageInfo(),
        refreshDownloads(),
      ]);
      setStorageInfo(storage);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [refreshDownloads]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh();
    }, [refresh]),
  );

  const handleDelete = useCallback(
    (rec: ManagedDownload) => {
      haptic.warning();
      Alert.alert(
        rec.status === "downloading" ? "Cancel Download" : "Remove Download",
        rec.status === "downloading"
          ? `Cancel download of "${rec.title}"?`
          : `Remove "${rec.title}" from your downloads?`,
        [
          { text: "Keep", style: "cancel" },
          {
            text: rec.status === "downloading" ? "Cancel Download" : "Remove",
            style: "destructive",
            onPress: async () => {
              haptic.error();
              await removeDownload(rec.movieId);
            },
          },
        ],
      );
    },
    [removeDownload],
  );

  const handlePlay = useCallback((rec: ManagedDownload) => {
    haptic.medium();
    router.push({ pathname: "/player", params: { id: rec.movieId } });
  }, []);

  const handleDeleteAll = useCallback(() => {
    const completed = downloads.filter((d) => d.status === "complete");
    if (completed.length === 0) return;
    haptic.warning();
    Alert.alert(
      "Delete All",
      `Remove all ${completed.length} downloaded title${completed.length > 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            haptic.error();
            await Promise.all(completed.map((i) => removeDownload(i.movieId)));
          },
        },
      ],
    );
  }, [downloads, removeDownload]);

  const renderItem = useCallback(
    ({ item }: { item: ManagedDownload }) => (
      <DownloadRow item={item} onPlay={handlePlay} onDelete={handleDelete} />
    ),
    [handlePlay, handleDelete],
  );

  const completedCount = downloads.filter((d) => d.status === "complete").length;
  const downloadingCount = downloads.filter((d) => d.status === "downloading").length;

  let subtitle = "Nothing saved yet";
  if (loading) subtitle = "Loading…";
  else if (downloadingCount > 0 && completedCount > 0)
    subtitle = `${completedCount} saved · ${downloadingCount} downloading`;
  else if (downloadingCount > 0) subtitle = `${downloadingCount} downloading…`;
  else if (completedCount > 0)
    subtitle = `${completedCount} title${completedCount !== 1 ? "s" : ""} saved`;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Downloads</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        {completedCount > 0 && (
          <Pressable
            onPress={handleDeleteAll}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.clearBtnText}>Edit</Text>
          </Pressable>
        )}
      </View>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={15} color="#FBBF24" />
          <Text style={styles.offlineBannerText}>
            Offline mode · Downloaded titles remain available
          </Text>
        </View>
      )}

      {storageInfo && <StorageBar info={storageInfo} />}

      {downloads.length === 0 && !loading ? (
        <EmptyState />
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={(item) => item.movieId}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={<View style={{ height: 60 }} />}
        />
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="cloud-download-outline" size={48} color="#2a2a2a" />
      </View>
      <Text style={styles.emptyTitle}>No Downloads</Text>
      <Text style={styles.emptySub}>
        Tap the download icon on any title to save it.{"\n"}Watch offline, anywhere.
      </Text>

      {/* Settings — glassmorphism pill */}
      <Pressable
        style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.75 }]}
        onPress={() => {
          haptic.light();
          router.push("/profile");
        }}
      >
        <Ionicons name="settings-outline" size={14} color="#fff" style={{ marginRight: 7 }} />
        <Text style={styles.settingsBtnText}>Download Settings</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
        onPress={() => {
          haptic.light();
          router.push("/");
        }}
      >
        <Text style={styles.browseBtnText}>Find Something to Download</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  h1: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  sub: {
    color: "#525252",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.28)",
  },
  offlineBannerText: {
    flex: 1,
    color: "#D4D4D4",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#111",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
  },
  clearBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },

  listContent: { paddingTop: 4, paddingBottom: 20 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#111",
    marginLeft: 16 + THUMB_W + 12,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: "#000",
  },
  thumbWrap: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#111",
    flexShrink: 0,
    position: "relative",
  },
  thumb: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  thumbOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  qualityBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  qualityText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },

  itemInfo: { flex: 1, paddingVertical: 2 },
  itemTitle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  metaText: { color: "#525252", fontSize: 12, fontFamily: "Inter_400Regular" },
  qualityPill: {
    backgroundColor: "rgba(79,195,247,0.08)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(79,195,247,0.15)",
  },
  qualityPillText: { color: "#4FC3F7", fontSize: 10, fontFamily: "Inter_700Bold" },

  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressLabel: { color: "#0EA5E9", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  sizeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sizeText: { color: "#34D399", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dateText: { color: "#333", fontSize: 11, fontFamily: "Inter_400Regular" },
  errorText: { color: "#0EA5E9", fontSize: 11, fontFamily: "Inter_400Regular" },

  actionsCol: { alignItems: "center", gap: 12 },
  trashBtn: { padding: 4 },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#0d0d0d",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#1a1a1a",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  emptySub: {
    color: "#525252",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  settingsBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  browseBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 6,
  },
  browseBtnText: { color: "#000", fontSize: 14, fontFamily: "Inter_700Bold" },
});
