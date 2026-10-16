/**
 * Integrity Block Modal
 *
 * Full-screen, non-dismissable modal shown when the app detects it is
 * running in an emulator, modified, or hostile environment.
 *
 * Users on legitimate physical devices will never see this. It is aimed
 * at scrapers / pirates who run automated extraction in emulators.
 */

import React                     from "react";
import {
  View, Text, StyleSheet,
  Image, Platform,
}                                from "react-native";
import { BlurView }              from "expo-blur";
import { Ionicons }              from "@expo/vector-icons";
import { type IntegrityViolation } from "@/lib/integrityCheck";

interface Props {
  visible:   boolean;
  violation: IntegrityViolation;
}

const MESSAGES: Record<NonNullable<IntegrityViolation>, { title: string; body: string }> = {
  EMULATOR: {
    title: "Real Device Required",
    body:
      "S Movie Original cannot run in an emulator or simulator. " +
      "Please install the app on a physical Android or iOS device.",
  },
  UNKNOWN_DEVICE_TYPE: {
    title: "Unsupported Device",
    body:
      "Your device type could not be verified. " +
      "S Movie Original requires a standard Android or iOS phone or tablet.",
  },
  DEBUG_ON_DEVICE: {
    title: "Debug Build Detected",
    body:
      "This build of S Movie Original is not authorised for use on physical devices. " +
      "Please download the official release from the S Movie Original website.",
  },
};

export function IntegrityBlockModal({ visible, violation }: Props) {
  if (!visible || !violation) return null;

  const msg = MESSAGES[violation];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-only">
      <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, styles.container]}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={48} color="#FF4444" />
          </View>

          <Text style={styles.title}>{msg.title}</Text>
          <Text style={styles.body}>{msg.body}</Text>

          <View style={styles.divider} />

          <View style={styles.steps}>
            {[
              "Download the official S Movie Original APK from our website",
              "Install it on a real Android or iOS phone",
              "Open the app and enjoy ad-free streaming",
            ].map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

      <Text style={styles.footer}>S Movie Original · Official App Only</Text>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#111",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    padding: 28,
    alignItems: "center",
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,68,68,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: "#AAA",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#222",
    marginBottom: 24,
  },
  steps: { width: "100%", gap: 14 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E50914",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  stepNumText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  stepText:    { color: "#CCC", fontSize: 13, lineHeight: 20, flex: 1 },
  footer:      { marginTop: 24, fontSize: 11, color: "#555", letterSpacing: 1 },
});
