import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";

export interface AuthenticationModalProps {
  visible: boolean;
  onClose: () => void;
  onGooglePress?: () => void;
  onTwitterPress?: () => void;
  onFacebookPress?: () => void;
  linking?: boolean;
}

export default function AuthenticationModal({
  visible,
  onClose,
  onGooglePress,
  onTwitterPress,
  onFacebookPress,
  linking = false,
}: AuthenticationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.58)" }]}>
        <BlurView
          intensity={Platform.OS === "ios" ? 36 : 24}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(229,9,20,0.16)", "rgba(0,0,0,0)", "rgba(0,0,0,0.3)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sign in dialog"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="auth-modal-backdrop"
        />

        <View style={styles.scrollContent}>
          <View style={styles.cardFrame}>
            <BlurView
              intensity={Platform.OS === "ios" ? 52 : 30}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.12)",
                "rgba(24,24,28,0.78)",
                "rgba(13,13,16,0.92)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              style={[styles.card, { borderColor: "rgba(255,255,255,0.2)" }]}
              onPress={(event) => event.stopPropagation()}
              accessibilityViewIsModal
              testID="authentication-modal"
            >
              <View style={styles.cardHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={12}
                  onPress={onClose}
                  style={styles.closeButton}
                  testID="auth-modal-close"
                >
                  <Feather name="x" size={20} color="#d0d0d5" />
                </Pressable>
              </View>

              <Text style={styles.eyebrow}>
                {linking ? "KEEP YOUR ACCOUNT CONNECTED" : "S MOVIE ORIGINAL"}
              </Text>
              <Text style={styles.title}>
                {linking ? "Link a sign-in method" : "Welcome back"}
              </Text>
              <Text style={styles.subtitle}>
                {linking
                  ? "Connect another sign-in option to this account. Your S-Movie ID stays the same."
                  : "Sign in to continue watching and pick up where you left off."}
              </Text>

              <View style={styles.quickActions}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
                  onPress={onGooglePress}
                  testID="auth-google-button"
                >
                  <Text style={styles.googleLogo}>G</Text>
                  <Text style={styles.socialButtonText}>Continue with Google</Text>
                  <Feather name="arrow-up-right" size={16} color="#a8a8af" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
                  onPress={onTwitterPress}
                  testID="auth-twitter-button"
                >
                  <Text style={styles.providerMark}>𝕏</Text>
                  <Text style={styles.socialButtonText}>Continue with Twitter</Text>
                  <Feather name="arrow-up-right" size={16} color="#a8a8af" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}
                  onPress={onFacebookPress}
                  testID="auth-facebook-button"
                >
                  <Text style={styles.providerMark}>f</Text>
                  <Text style={styles.socialButtonText}>Continue with Facebook</Text>
                  <Feather name="arrow-up-right" size={16} color="#a8a8af" />
                </Pressable>
              </View>

              {!linking ? (
                <View style={styles.identityNote}>
                  <Ionicons name="finger-print-outline" size={17} color="#f1b7bc" />
                  <Text style={styles.identityNoteText}>
                    Your S-Movie ID belongs to your account, not your email or this device.
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    width: "100%",
  },
  cardFrame: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.48,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 16 },
    elevation: 20,
  },
  card: {
    width: "100%",
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 23,
    paddingBottom: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 40,
    marginBottom: 23,
  },
  closeButton: { padding: 4, marginLeft: "auto" },
  eyebrow: {
    color: "#e88e96",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: 27,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "#b7b7bf",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    marginBottom: 22,
  },
  quickActions: { gap: 10 },
  socialButton: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  googleLogo: {
    color: "#fff",
    width: 20,
    textAlign: "center",
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
  },
  providerMark: {
    color: "#fff",
    width: 20,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  socialButtonText: {
    color: "#fff",
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  identityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 19,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  identityNoteText: {
    color: "#aaaab3",
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
