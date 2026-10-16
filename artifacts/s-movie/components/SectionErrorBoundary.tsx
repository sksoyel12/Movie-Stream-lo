import React, { type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { ErrorFallbackProps } from "@/components/ErrorFallback";
import { SkeletonCard } from "@/components/Skeleton";

type SectionFallbackProps = ErrorFallbackProps & {
  kind: "row" | "hero" | "player";
};

function SectionFallback({ resetError, kind }: SectionFallbackProps) {
  if (kind === "player") {
    return (
      <View style={styles.playerFallback}>
        <Text style={styles.playerTitle}>Playback paused</Text>
        <Text style={styles.playerMessage}>This player section could not load.</Text>
        <Pressable accessibilityRole="button" onPress={resetError} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (kind === "hero") {
    return (
      <View style={styles.heroFallback}>
        <SkeletonCard width={128} height={192} />
        <View style={styles.heroCopy}>
          <View style={styles.copyLine} />
          <View style={[styles.copyLine, styles.shortLine]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowFallback}>
      <View style={styles.rowTitle} />
      <View style={styles.rowCards}>
        {[0, 1, 2, 3].map((index) => (
          <SkeletonCard key={index} width={110} height={165} />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={resetError} style={styles.rowRetry}>
        <Text style={styles.retryText}>Retry section</Text>
      </Pressable>
    </View>
  );
}

export function SectionErrorBoundary({
  children,
  kind = "row",
}: PropsWithChildren<{ kind?: "row" | "hero" | "player" }>) {
  const FallbackComponent = React.useMemo(
    () => (props: ErrorFallbackProps) => <SectionFallback {...props} kind={kind} />,
    [kind],
  );

  return (
    <ErrorBoundary FallbackComponent={FallbackComponent}>
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  rowFallback: { marginTop: 22, minHeight: 210, backgroundColor: "transparent" },
  rowTitle: {
    width: 142,
    height: 15,
    borderRadius: 4,
    marginLeft: 16,
    marginBottom: 10,
    backgroundColor: "#1c1c1c",
  },
  rowCards: { flexDirection: "row", paddingHorizontal: 12, gap: 8 },
  rowRetry: { alignSelf: "flex-start", marginLeft: 16, marginTop: 8, paddingVertical: 4 },
  retryText: { color: "#9ca3af", fontSize: 12 },
  heroFallback: {
    minHeight: 360,
    paddingHorizontal: 20,
    paddingTop: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: "#050505",
  },
  heroCopy: { flex: 1, gap: 10 },
  copyLine: { height: 12, width: "88%", borderRadius: 6, backgroundColor: "#1c1c1c" },
  shortLine: { width: "56%" },
  playerFallback: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    padding: 24,
  },
  playerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  playerMessage: { color: "#9ca3af", marginTop: 8, textAlign: "center" },
  retry: {
    marginTop: 16,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: "#E50914",
  },
});
