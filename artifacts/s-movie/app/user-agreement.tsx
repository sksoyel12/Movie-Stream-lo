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

export default function UserAgreementScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
          hitSlop={14}
        >
          <Feather name="chevron-left" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>User Agreement</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["rgba(229,9,20,0.16)", "rgba(255,107,0,0.08)", "rgba(0,0,0,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headingCard}
        >
          <View style={styles.iconWrap}>
            <Feather name="clipboard" size={28} color="#E50914" />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.headingTitle}>Terms of Use</Text>
            <Text style={styles.headingDate}>Effective: June 2025</Text>
          </View>
        </LinearGradient>

        <AgreementSection
          number="01"
          title="Acceptance of Terms"
          body="By creating an account or using S Movie Original, you agree to be bound by this User Agreement and our Privacy Policy. If you do not agree, please discontinue use of the app."
        />
        <AgreementSection
          number="02"
          title="Account Responsibility"
          body="You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account, including any devices linked to it."
        />
        <AgreementSection
          number="03"
          title="Acceptable Use"
          body="You agree not to misuse the service — including attempting to bypass verification, security, or content-access controls — or to use the app for any unlawful purpose."
        />
        <AgreementSection
          number="04"
          title="Content & Availability"
          body="Streaming catalog, availability, and features may change at any time without notice. S Movie Original makes no guarantee of uninterrupted access to any specific title."
        />
        <AgreementSection
          number="05"
          title="Account Suspension"
          body="Accounts found to violate identity verification requirements, duplicate-account restrictions, or these terms may be suspended pending review."
        />
        <AgreementSection
          number="06"
          title="Changes to This Agreement"
          body="We may update this agreement from time to time. Continued use of the app after changes take effect constitutes acceptance of the revised terms."
        />
        <AgreementSection
          number="07"
          title="Third-Party Content"
          body="Catalog metadata, artwork, availability information, and external playback destinations may be supplied by third parties. S Movie Original does not claim ownership of third-party materials and does not grant you rights to content that belongs to another provider."
        />
        <AgreementSection
          number="08"
          title="No Warranty or Guaranteed Availability"
          body="The app and its catalog are provided on an as-available basis. Features, metadata, links, playback, and title availability may be inaccurate, interrupted, or removed. To the extent permitted by law, use of the app is at your own risk."
        />
        <AgreementSection
          number="09"
          title="Copyright and Rights Requests"
          body="Rights holders may request review or removal of material through the operator's published support channel. Do not use the app to access, copy, or redistribute content unless you have the necessary permission."
        />

        <View style={styles.ackCard}>
          <Feather name="check-circle" size={18} color="#34D399" style={{ marginBottom: 8 }} />
          <Text style={styles.ackText}>
            By using S Movie Original, you acknowledge and agree to this User Agreement.
          </Text>
        </View>

        <Text style={styles.footerNote}>© 2025 S Movie Original. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

function AgreementSection({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={aStyles.section}>
      <View style={aStyles.titleRow}>
        <View style={aStyles.numBadge}>
          <Text style={aStyles.num}>{number}</Text>
        </View>
        <Text style={aStyles.title}>{title}</Text>
      </View>
      <Text style={aStyles.body}>{body}</Text>
    </View>
  );
}

const aStyles = StyleSheet.create({
  section: {
    backgroundColor: "#0e0e0e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  numBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  num: { color: "#E50914", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  title: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },
  body: { color: "#888", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
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
    borderColor: "rgba(229,9,20,0.18)",
    marginBottom: 4,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: "rgba(229,9,20,0.10)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  headingText: { flex: 1, gap: 4 },
  headingTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3, lineHeight: 22 },
  headingDate:  { color: "#555", fontSize: 12, fontFamily: "Inter_400Regular" },

  ackCard: {
    backgroundColor: "rgba(52,211,153,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.18)",
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  ackText: { color: "#6b7280", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  footerNote: { color: "#333", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, marginTop: 4 },
});
