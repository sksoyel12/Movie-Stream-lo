import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type PlaybackSpecification = {
  id: string;
  label: string;
  detail: string;
};

const drmSpecifications: PlaybackSpecification[] = [
  {
    id: "widevine",
    label: "Widevine DRM",
    detail:
      "Widevine security level is provided by the native DRM API, which this app runtime does not expose.",
  },
  {
    id: "version",
    label: "DRM Version",
    detail: "The installed app runtime cannot read the device's DRM system version.",
  },
  {
    id: "system-id",
    label: "System ID",
    detail: "The DRM system identifier is not available to this app runtime.",
  },
];

const playbackSpecifications: PlaybackSpecification[] = [
  {
    id: "resolution",
    label: "Maximum Playback Resolution",
    detail:
      "Screen resolution does not determine the maximum protected-video resolution. A native decoder capability API is needed for that value.",
  },
  {
    id: "codecs",
    label: "Supported Hardware Codecs",
    detail:
      "Hardware decoder capabilities are not exposed to this app runtime, so codec support is not guessed.",
  },
  {
    id: "hdr",
    label: "HDR Capabilities",
    detail:
      "Pixel density alone cannot confirm HDR support. The current runtime does not expose display HDR metadata.",
  },
];

const unavailableValue = "Not exposed";

export default function PlaybackSpecificationScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const bottomInset = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const openHelpCentre = () => {
    const showError = () =>
      Alert.alert(
        "Unable to open Help Centre",
        "Open https://t.me/+hEvMXwMCBwUyMDI1 in your browser to contact support.",
      );
    try {
      void Linking.openURL("https://t.me/+hEvMXwMCBwUyMDI1").catch(showError);
    } catch {
      showError();
    }
  };

  const renderSpecification = (item: PlaybackSpecification) => (
    <Pressable
      key={item.id}
      testID={`playback-spec-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}: ${unavailableValue}`}
      accessibilityHint="Tap to learn why this value is unavailable"
      onPress={() => Alert.alert(item.label, item.detail)}
      style={({ pressed }) => [
        styles.specificationRow,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.secondary },
      ]}
    >
      <View style={styles.specificationText}>
        <Text style={[styles.specificationLabel, { color: colors.foreground }]}>
          {item.label}
        </Text>
        <Text style={[styles.specificationValue, { color: colors.mutedForeground }]}>
          {unavailableValue}
        </Text>
      </View>
      <View style={[styles.infoBadge, { borderColor: colors.border }]}>
        <Text style={[styles.infoGlyph, { color: colors.mutedForeground }]}>i</Text>
      </View>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: insets.top || 12 },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="playback-spec-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { backgroundColor: colors.secondary, opacity: 0.85 },
          ]}
        >
          <Text style={[styles.backGlyph, { color: colors.foreground }]}>←</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
          Playback Specification
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomInset + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
          DEVICE PLAYBACK DETAILS
        </Text>
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Digital Rights Management
            </Text>
          </View>
          <View
            style={[
              styles.specificationCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {drmSpecifications.map(renderSpecification)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Playback
            </Text>
          </View>
          <View
            style={[
              styles.specificationCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {playbackSpecifications.map(renderSpecification)}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Contact Help Centre"
          accessibilityHint="Opens the S Movie Help Centre on Telegram"
          testID="playback-help-centre"
          onPress={openHelpCentre}
          style={({ pressed }) => [
            styles.helpButton,
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
            },
            pressed && { backgroundColor: colors.muted, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.foreground }]}>
            Help Centre
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    position: "relative",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 14,
  },
  backButton: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: {
    fontSize: 25,
    lineHeight: 30,
  },
  title: {
    flex: 1,
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 20,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 0,
  },
  infoBadge: {
    width: 21,
    height: 21,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  infoGlyph: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  sectionAccent: {
    width: 3,
    height: 17,
    borderRadius: 2,
  },
  section: {
    gap: 11,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.25,
  },
  specificationCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  specificationRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  specificationText: {
    flex: 1,
    gap: 4,
  },
  specificationLabel: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
  specificationValue: {
    fontSize: 13,
    lineHeight: 18,
  },
  helpButton: {
    alignSelf: "center",
    minWidth: 190,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  helpText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
