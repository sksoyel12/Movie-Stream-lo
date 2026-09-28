/**
 * Account Suspension Modal
 *
 * Shown as a full-screen overlay when the API server returns
 * ACCOUNT_SUSPENDED (photo-ID verification failed — blur/tamper/fake-ID
 * detection, or a manual support suspension). Blocks streaming and other
 * protected actions until support clears the account.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  reason?: string | null;
  onDismiss?: () => void;
}

const SUPPORT_EMAIL = "wftis.aryux07@gmail.com";

export function SuspensionBlockModal({ visible, reason, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, useNativeDriver: true, duration: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.85, useNativeDriver: true, duration: 150 }),
        Animated.timing(opacity, { toValue: 0, useNativeDriver: true, duration: 150 }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle" size={48} color="#f59e0b" />
          </View>

          <Text style={styles.title}>Account Under Verification</Text>

          <Text style={styles.body}>
            {reason ?? "We couldn't verify your photo ID."}
            {"\n\n"}
            Streaming and other account features are paused until this is resolved.
          </Text>

          <Pressable
            style={styles.contactBtn}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Account%20Verification`).catch(() => {})}
          >
            <Ionicons name="mail-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.contactText}>Contact Support</Text>
          </Pressable>

          {onDismiss && (
            <Pressable style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissText}>Close</Text>
            </Pressable>
          )}

          <Text style={styles.footer}>Support usually replies within 24-48 hours.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  iconWrap: { backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 50, padding: 16, marginBottom: 16 },
  title: { color: "#f8fafc", fontSize: 22, fontWeight: "700", marginBottom: 12, letterSpacing: -0.3, textAlign: "center" },
  body: { color: "#94a3b8", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 22 },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e50914",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  contactText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  dismissBtn: { paddingVertical: 10, marginBottom: 10 },
  dismissText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  footer: { color: "#475569", fontSize: 11, textAlign: "center", lineHeight: 16 },
});
