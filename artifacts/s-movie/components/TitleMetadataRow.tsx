import { Ionicons } from "@expo/vector-icons";
import React, { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export type TitleMetadataRowData = {
  year?: string | null;
  ageRating?: string | null;
  contentLabel?: string | null;
  quality?: string | null;
  spatialAudio?: boolean;
  audioDescription?: boolean;
  subtitles?: boolean;
};

type MetadataItem = {
  key: string;
  content: ReactNode;
  accessibilityLabel?: string;
};

function isVisibleText(value?: string | null): value is string {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "—" && normalized !== "-";
}

export default function TitleMetadataRow({
  data,
}: {
  data: TitleMetadataRowData;
}) {
  const items: MetadataItem[] = [];

  if (isVisibleText(data.year)) {
    items.push({
      key: "year",
      content: <Text style={styles.textValue}>{data.year}</Text>,
    });
  }

  if (isVisibleText(data.ageRating)) {
    items.push({
      key: "rating",
      content: (
        <View style={styles.ratingPill}>
          <Text style={styles.ratingText}>{data.ageRating}</Text>
        </View>
      ),
      accessibilityLabel: `Age rating ${data.ageRating}`,
    });
  }

  if (isVisibleText(data.contentLabel)) {
    items.push({
      key: "content",
      content: <Text style={styles.textValue}>{data.contentLabel}</Text>,
    });
  }

  if (isVisibleText(data.quality)) {
    items.push({
      key: "quality",
      content: (
        <View style={styles.outlineBadge}>
          <Text style={styles.outlineBadgeText}>{data.quality}</Text>
        </View>
      ),
      accessibilityLabel: `${data.quality} video`,
    });
  }

  if (data.spatialAudio) {
    items.push({
      key: "spatial-audio",
      content: (
        <View style={styles.audioBadge}>
          <Ionicons name="radio-outline" size={17} color="#bcbcbc" />
          <Text style={styles.audioText}>Spatial{"\n"}Audio</Text>
        </View>
      ),
      accessibilityLabel: "Spatial Audio available",
    });
  }

  if (data.audioDescription) {
    items.push({
      key: "audio-description",
      content: (
        <View style={styles.accessibilityBadge}>
          <Ionicons name="accessibility-outline" size={16} color="#bcbcbc" />
          <Text style={styles.accessibilityText}>AD</Text>
        </View>
      ),
      accessibilityLabel: "Audio description available",
    });
  }

  if (data.subtitles) {
    items.push({
      key: "subtitles",
      content: (
        <View style={styles.captionBadge}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color="#bcbcbc" />
          <Text style={styles.accessibilityText}>CC</Text>
        </View>
      ),
      accessibilityLabel: "Subtitles and captions available",
    });
  }

  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      accessibilityRole="text"
      accessibilityLabel="Title metadata"
    >
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? <Text style={styles.separator}>•</Text> : null}
          <View accessible accessibilityLabel={item.accessibilityLabel}>
            {item.content}
          </View>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 10,
  },
  content: {
    alignItems: "center",
    paddingRight: 16,
  },
  separator: {
    color: "#737373",
    fontSize: 13,
    marginHorizontal: 8,
  },
  textValue: {
    color: "#bcbcbc",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  ratingPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(128,128,128,0.55)",
    borderRadius: 2,
  },
  ratingText: {
    color: "#eeeeee",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  outlineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    borderRadius: 3,
  },
  outlineBadgeText: {
    color: "#bcbcbc",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  audioBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  audioText: {
    color: "#bcbcbc",
    fontSize: 9,
    lineHeight: 10,
    fontFamily: "Inter_600SemiBold",
  },
  accessibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  captionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 3,
  },
  accessibilityText: {
    color: "#bcbcbc",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});