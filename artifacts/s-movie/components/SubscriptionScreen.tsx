import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { firebaseAuth } from "@/lib/firebase";
import {
  getVIPStatus,
  grantVIPStatus,
  getVIPSince,
  buildUPILink,
} from "@/lib/subscription";

interface Feature {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Ionicons name="color-palette-outline" size={22} color="#FFD700" />,
    title: "Custom Themes",
    desc: "Unlock dark, amoled, purple & more app themes",
  },
  {
    icon: <MaterialCommunityIcons name="cellphone-settings" size={22} color="#FFD700" />,
    title: "Custom App Icon",
    desc: "Change your S Movie Original icon on your home screen",
  },
  {
    icon: <Ionicons name="notifications-outline" size={22} color="#FFD700" />,
    title: "Priority Notifications",
    desc: "Get notified first about new episodes & releases",
  },
  {
    icon: <Ionicons name="sparkles-outline" size={22} color="#FFD700" />,
    title: "AI Pro Recommendations",
    desc: "Gemini AI picks movies just for you, every day",
  },
  {
    icon: <Feather name="zap" size={22} color="#FFD700" />,
    title: "Ad-Free Experience",
    desc: "Cleaner player with fewer interruptions",
  },
  {
    icon: <Ionicons name="star-outline" size={22} color="#FFD700" />,
    title: "VIP Badge",
    desc: "Exclusive gold crown badge on your profile",
  },
];

interface Props {
  onClose: () => void;
}

export default function SubscriptionScreen({ onClose }: Props) {
  const [isVIP, setIsVIP]           = useState(false);
  const [vipSince, setVipSince]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [payStep, setPayStep]       = useState<"idle" | "paid" | "verifying" | "done">("idle");
  const glowAnim                    = React.useRef(new Animated.Value(0)).current;

  const uid = firebaseAuth.currentUser?.uid ?? null;

  useEffect(() => {
    getVIPStatus(uid).then((v) => {
      setIsVIP(v);
      if (v) getVIPSince().then(setVipSince);
      setLoading(false);
    });
  }, [uid]);

  // Pulsing glow on crown
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handlePay = useCallback(async () => {
    const upiUrl = buildUPILink();
    const canOpen = await Linking.canOpenURL(upiUrl);
    if (canOpen) {
      await Linking.openURL(upiUrl);
      setPayStep("paid");
    } else {
      // Fallback — UPI apps not found (web / emulator)
      Alert.alert(
        "Open UPI App",
        `Pay ₹5 to UPI ID:\nsksoyel584845-2@okaxis\n\nAfter payment, tap "Verify Payment" below.`,
        [{ text: "OK", onPress: () => setPayStep("paid") }]
      );
    }
  }, []);

  const handleVerify = useCallback(async () => {
    setPayStep("verifying");
    try {
      await grantVIPStatus(uid);
      setIsVIP(true);
      setVipSince(new Date().toISOString());
      setPayStep("done");
    } catch {
      setPayStep("paid");
      Alert.alert("Error", "Could not save VIP status. Try again.");
    }
  }, [uid]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#1a1000", "#000"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
          <Feather name="x" size={22} color="#888" />
        </Pressable>
        <Text style={styles.headerTitle}>S Movie Original VIP</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Crown / VIP Hero */}
        <View style={styles.heroWrap}>
          <Animated.View
            style={[
              styles.crownGlow,
              {
                opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] }),
                transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
              },
            ]}
          />
          <View style={styles.crownCircle}>
            <Ionicons name="star" size={52} color="#FFD700" />
          </View>
          {isVIP && (
            <View style={styles.vipBadge}>
              <Text style={styles.vipBadgeText}>✓ ACTIVE</Text>
            </View>
          )}
        </View>

        <Text style={styles.heroTitle}>
          {isVIP ? "You're a VIP Member!" : "Upgrade to VIP"}
        </Text>
        <Text style={styles.heroSub}>
          {isVIP
            ? `Member since ${vipSince ? new Date(vipSince).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}`
            : "Unlock all premium features for just ₹5"}
        </Text>

        {!isVIP && (
          <View style={styles.priceCard}>
            <LinearGradient
              colors={["#2a1a00", "#1a1000"]}
              style={styles.priceGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>₹5</Text>
                <View>
                  <Text style={styles.priceUSD}>≈ $1 USD</Text>
                  <Text style={styles.pricePeriod}>per month</Text>
                </View>
              </View>
              <View style={styles.priceDivider} />
              <Text style={styles.priceNote}>
                One-time UPI payment · Instant activation
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Features */}
        <Text style={styles.sectionTitle}>VIP Features</Text>
        <View style={styles.featuresList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>{f.icon}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              {isVIP && (
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              )}
            </View>
          ))}
        </View>

        {/* Payment Flow */}
        {!isVIP && payStep === "idle" && (
          <Pressable style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }]} onPress={handlePay}>
            <LinearGradient
              colors={["#FFD700", "#FFA500"]}
              style={styles.payBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="phone-portrait-outline" size={20} color="#000" />
              <Text style={styles.payBtnText}>Pay ₹5 via UPI</Text>
            </LinearGradient>
          </Pressable>
        )}

        {!isVIP && payStep === "paid" && (
          <View style={styles.verifyWrap}>
            <BlurView intensity={40} tint="dark" style={styles.verifyCard}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#22c55e" style={{ marginBottom: 4 }} />
              <Text style={styles.verifyTitle}>Payment Done?</Text>
              <Text style={styles.verifySub}>
                Paid ₹5 to{"\n"}
                <Text style={styles.upiId}>sksoyel584845-2@okaxis</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [styles.verifyBtn, pressed && { opacity: 0.8 }]}
                onPress={handleVerify}
              >
                <Text style={styles.verifyBtnText}>✓ Verify Payment &amp; Activate VIP</Text>
              </Pressable>
              <Pressable onPress={() => setPayStep("idle")} hitSlop={8}>
                <Text style={styles.payAgainText}>Pay again</Text>
              </Pressable>
            </BlurView>
          </View>
        )}

        {!isVIP && payStep === "verifying" && (
          <View style={styles.verifyingWrap}>
            <ActivityIndicator color="#FFD700" size="large" />
            <Text style={styles.verifyingText}>Activating VIP…</Text>
          </View>
        )}

        {(isVIP || payStep === "done") && (
          <View style={styles.activeWrap}>
            <LinearGradient colors={["#052e16", "#000"]} style={styles.activeCard}>
              <Ionicons name="checkmark-circle" size={40} color="#22c55e" />
              <Text style={styles.activeTitle}>VIP Active!</Text>
        <Text style={styles.activeSub}>All features unlocked. Enjoy S Movie Original VIP.</Text>
              <Pressable style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Continue</Text>
              </Pressable>
            </LinearGradient>
          </View>
        )}

        {/* UPI info */}
        {!isVIP && payStep === "idle" && (
          <View style={styles.upiInfoWrap}>
            <Text style={styles.upiInfoLabel}>UPI ID</Text>
            <Text style={styles.upiInfoValue}>sksoyel584845-2@okaxis</Text>
            <Text style={styles.upiInfoNote}>
              GPay · PhonePe · Paytm · Any UPI App
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFD700",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  scroll: { paddingHorizontal: 20 },

  heroWrap: { alignItems: "center", marginTop: 12, marginBottom: 16, position: "relative" },
  crownGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFD700",
  },
  crownCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1a1200",
    borderWidth: 2,
    borderColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  vipBadge: {
    position: "absolute",
    bottom: -4,
    backgroundColor: "#22c55e",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  vipBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  heroTitle: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  heroSub: {
    color: "#888",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 24,
  },

  priceCard: { borderRadius: 16, overflow: "hidden", marginBottom: 28, borderWidth: 1, borderColor: "#3a2800" },
  priceGradient: { padding: 20 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  priceAmount: { color: "#FFD700", fontSize: 48, fontFamily: "Inter_700Bold", lineHeight: 52 },
  priceUSD: { color: "#aaa", fontSize: 14, fontFamily: "Inter_400Regular" },
  pricePeriod: { color: "#FFD700", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  priceDivider: { height: 1, backgroundColor: "#3a2800", marginVertical: 12 },
  priceNote: { color: "#888", fontSize: 12, fontFamily: "Inter_400Regular" },

  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  featuresList: { gap: 4, marginBottom: 28 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#0d0d0d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#1a1a00",
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1a1200",
    justifyContent: "center",
    alignItems: "center",
  },
  featureTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  featureDesc: { color: "#666", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  payBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  payBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  payBtnText: { color: "#000", fontSize: 17, fontFamily: "Inter_700Bold" },

  verifyWrap: { marginBottom: 20 },
  verifyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#22c55e33",
    overflow: "hidden",
  },
  verifyTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  verifySub: { color: "#888", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 22 },
  upiId: { color: "#FFD700", fontFamily: "Inter_600SemiBold" },
  verifyBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 14,
    width: "100%",
    alignItems: "center",
  },
  verifyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  payAgainText: { color: "#555", fontSize: 13, fontFamily: "Inter_400Regular" },

  verifyingWrap: { alignItems: "center", paddingVertical: 32, gap: 16 },
  verifyingText: { color: "#FFD700", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  activeWrap: { marginBottom: 20 },
  activeCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#22c55e44",
  },
  activeTitle: { color: "#22c55e", fontSize: 22, fontFamily: "Inter_700Bold" },
  activeSub: { color: "#888", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  doneBtn: {
    marginTop: 16,
    backgroundColor: "#E50914",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  upiInfoWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
    borderTopWidth: 1,
    borderColor: "#111",
    marginTop: 8,
  },
  upiInfoLabel: { color: "#444", fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 1, textTransform: "uppercase" },
  upiInfoValue: { color: "#888", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  upiInfoNote: { color: "#444", fontSize: 11, fontFamily: "Inter_400Regular" },
});
