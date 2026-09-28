/**
 * VPN Block Modal
 *
 * Shown as a full-screen overlay when the API server returns VPN_DETECTED or
 * DATACENTER_IP. Blocks all interaction until the user disables their VPN.
 *
 * Usage (in app layout or a stream error handler):
 *
 *   import { VpnBlockModal } from "@/components/VpnBlockModal";
 *
 *   const [vpnBlocked, setVpnBlocked] = useState(false);
 *
 *   // On stream API call:
 *   try {
 *     const data = await apiClient.get("/stream", ...);
 *   } catch (e: any) {
 *     if (e?.code === "VPN_DETECTED" || e?.code === "DATACENTER_IP") {
 *       setVpnBlocked(true);
 *     }
 *   }
 *
 *   <VpnBlockModal visible={vpnBlocked} />
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons }  from "@expo/vector-icons";

interface Props {
  visible:       boolean;
  /** Called when user taps "I've turned off my VPN" — parent should re-try the action. */
  onRetry?:      () => void;
}

export function VpnBlockModal({ visible, onRetry }: Props) {
  const scale   = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1,    useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacity, { toValue: 1,    useNativeDriver: true, duration: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale,   { toValue: 0.85, useNativeDriver: true, duration: 150 }),
        Animated.timing(opacity, { toValue: 0,    useNativeDriver: true, duration: 150 }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      {/* Blurred backdrop */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>

          {/* Shield icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={48} color="#ef4444" />
          </View>

          <Text style={styles.title}>VPN Detected</Text>

          <Text style={styles.body}>
            S Movie Original requires a direct connection to protect content rights and prevent
            abuse.{"\n\n"}
            Please <Text style={styles.bold}>disable your VPN or proxy</Text> and
            try again.
          </Text>

          {/* Steps */}
          <View style={styles.steps}>
            {[
              "Turn off your VPN app",
              "Disconnect any proxy or Tor",
              "Reconnect to your normal network",
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          {onRetry && (
            <Pressable style={styles.retryBtn} onPress={onRetry}>
              <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryText}>I've turned off my VPN</Text>
            </Pressable>
          )}

          <Text style={styles.footer}>
            This check is done securely on our servers.{"\n"}
            Your privacy is respected.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    justifyContent:  "center",
    alignItems:      "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#0f172a",
    borderRadius:    24,
    padding:         28,
    width:           "100%",
    maxWidth:        380,
    borderWidth:     1,
    borderColor:     "#1e293b",
    alignItems:      "center",
    ...Platform.select({
      ios: {
        shadowColor:   "#000",
        shadowOffset:  { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius:  16,
      },
      android: { elevation: 20 },
    }),
  },
  iconWrap: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius:    50,
    padding:         16,
    marginBottom:    16,
  },
  title: {
    color:        "#f8fafc",
    fontSize:     22,
    fontWeight:   "700",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  body: {
    color:        "#94a3b8",
    fontSize:     14,
    lineHeight:   22,
    textAlign:    "center",
    marginBottom: 20,
  },
  bold: {
    color:      "#f8fafc",
    fontWeight: "600",
  },
  steps: {
    alignSelf:    "stretch",
    marginBottom: 20,
    gap:          10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           12,
  },
  stepBadge: {
    backgroundColor: "rgba(99,102,241,0.15)",
    borderRadius:    20,
    width:           28,
    height:          28,
    justifyContent:  "center",
    alignItems:      "center",
  },
  stepNum: {
    color:      "#818cf8",
    fontSize:   13,
    fontWeight: "700",
  },
  stepText: {
    color:    "#cbd5e1",
    fontSize: 14,
    flex:     1,
  },
  retryBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: "#6366f1",
    borderRadius:    14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom:    16,
    alignSelf:       "stretch",
    justifyContent:  "center",
  },
  retryText: {
    color:      "#fff",
    fontWeight: "600",
    fontSize:   15,
  },
  footer: {
    color:     "#475569",
    fontSize:  11,
    textAlign: "center",
    lineHeight: 16,
  },
});
