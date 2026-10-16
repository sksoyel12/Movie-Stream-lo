import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
          hitSlop={14}
        >
          <Feather name="chevron-left" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Terms</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Page heading card */}
        <LinearGradient
          colors={["rgba(14,165,233,0.14)", "rgba(14,165,233,0.05)", "rgba(0,0,0,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headingCard}
        >
          <View style={styles.shieldWrap}>
            <Feather name="shield" size={28} color="#0EA5E9" />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.headingTitle}>Privacy Policy &amp; Data Usage</Text>
            <Text style={styles.headingDate}>Effective: June 2025</Text>
          </View>
        </LinearGradient>

        {/* Section 1 — Data Privacy */}
        <PolicySection
          number="01"
          title="Data Privacy"
          body="The app stores profile preferences, watch state, and feed cache data locally where possible. Requests to the service may include the information needed to authenticate, serve catalog data, protect the service, and diagnose failures. Do not enter information you do not want processed for those purposes."
        />

        {/* Section 2 — Streaming Infrastructure */}
        <PolicySection
          number="02"
          title="Streaming Infrastructure"
          body="Catalog and artwork requests may pass through first-party and third-party infrastructure, including TMDB and playback providers. Network availability and third-party privacy practices are outside the app's control."
        />

        {/* Section 3 — Local Storage Security */}
        <PolicySection
          number="03"
          title="Local Storage Security"
          body="Local preferences and cached feed data are stored on the device and can be cleared by removing the profile or app data. Local storage should not be treated as an encrypted vault; use device security controls and avoid storing sensitive information in the app."
        />

        {/* Section 4 — Third-Party Protocols */}
        <PolicySection
          number="04"
          title="Third-Party Protocols"
          body="Third-party services may have their own terms, licenses, cookies, logs, and retention policies. Using a linked service means you should review and accept that provider's terms separately."
        />

        {/* Acknowledgment footer */}
        <View style={styles.ackCard}>
          <Feather name="check-circle" size={18} color="#34D399" style={{ marginBottom: 8 }} />
          <Text style={styles.ackText}>
            By using S Movie Original, you acknowledge and agree to the data usage practices described above.
          </Text>
        </View>

        <Text style={styles.footerNote}>
          © 2025 S Movie Original. All rights reserved.
        </Text>
      </ScrollView>
    </View>
  );
}

function PolicySection({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <View style={pStyles.section}>
      <View style={pStyles.titleRow}>
        <View style={pStyles.numBadge}>
          <Text style={pStyles.num}>{number}</Text>
        </View>
        <Text style={pStyles.title}>{title}</Text>
      </View>
      <Text style={pStyles.body}>{body}</Text>
    </View>
  );
}

const pStyles = StyleSheet.create({
  section: {
    backgroundColor: "#0e0e0e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(14,165,233,0.12)",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  num: {
    color: "#0EA5E9",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  body: {
    color: "#888",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    minHeight: 52,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 6,
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  headerSpacer: { width: 44 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  headingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.18)",
    marginBottom: 4,
  },
  shieldWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(14,165,233,0.10)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headingText: { flex: 1, gap: 4 },
  headingTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headingDate: {
    color: "#555",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  ackCard: {
    backgroundColor: "rgba(52,211,153,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.18)",
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  ackText: {
    color: "#6b7280",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  footerNote: {
    color: "#333",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});
