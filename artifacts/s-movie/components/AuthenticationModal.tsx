import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

export interface AuthenticationModalProps {
  visible: boolean;
  onClose: () => void;
  onGooglePress?: () => void;
  onPhonePress?: () => void;
  onTwitterPress?: () => void;
  onFacebookPress?: () => void;
  onSignIn?: (credentials: { email: string; password: string }) => void | Promise<void>;
  /** Kept in interface for backward compatibility but not exposed in UI */
  onForgotPassword?: (email: string) => void | Promise<void>;
  onCreateAccount?: (account: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => void | Promise<void>;
}

export default function AuthenticationModal({
  visible,
  onClose,
  onGooglePress,
  onPhonePress,
  onTwitterPress,
  onFacebookPress,
  onSignIn,
}: AuthenticationModalProps) {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowPassword(false);
      setEmail("");
      setPassword("");
    }
  }, [visible]);

  const handleSubmit = () => {
    onSignIn?.({ email: email.trim(), password });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.82)" }]}>
        <BlurView
          intensity={Platform.OS === "ios" ? 28 : 20}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sign in dialog"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          testID="auth-modal-backdrop"
        />

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            testID="authentication-modal"
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={[styles.brandMark, { backgroundColor: `${colors.primary}1F` }]}>
                <Ionicons name="person-outline" size={22} color={colors.primary} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={onClose}
                style={styles.closeButton}
                testID="auth-modal-close"
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Sign in to continue watching on S Movie Original
            </Text>

            {/* Social sign-in */}
            <View style={styles.quickActions}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
                onPress={onGooglePress}
                testID="auth-google-button"
              >
                <Text style={[styles.googleLogo, { color: colors.foreground }]}>G</Text>
                <Text style={[styles.socialButtonText, { color: colors.foreground }]}>
                  Continue with Google
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: "#1DA1F2", borderColor: "#1DA1F2" },
                  pressed && styles.pressed,
                ]}
                onPress={onTwitterPress}
                testID="auth-twitter-button"
              >
                <Text style={[styles.socialButtonText, { color: "#fff", fontSize: 16, fontFamily: "Inter_800ExtraBold" }]}>𝕏</Text>
                <Text style={[styles.socialButtonText, { color: "#fff" }]}>
                  Continue with Twitter
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: "#1877F2", borderColor: "#1877F2" },
                  pressed && styles.pressed,
                ]}
                onPress={onFacebookPress}
                testID="auth-facebook-button"
              >
                <Text style={[styles.socialButtonText, { color: "#fff", fontSize: 18, fontFamily: "Inter_800ExtraBold" }]}>f</Text>
                <Text style={[styles.socialButtonText, { color: "#fff" }]}>
                  Continue with Facebook
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
                onPress={onPhonePress}
                testID="auth-phone-button"
              >
                <Ionicons name="phone-portrait-outline" size={18} color={colors.foreground} />
                <Text style={[styles.socialButtonText, { color: colors.foreground }]}>
                  Continue with Phone
                </Text>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Email field */}
            <Field
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              colors={colors}
              testID="auth-email-input"
            />

            {/* Password field */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
              <View
                style={[
                  styles.passwordWrap,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: colors.foreground }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="password"
                  testID="auth-password-input"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  style={styles.eyeButton}
                  testID="auth-password-toggle"
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            {/* Sign In button */}
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                pressed && styles.pressed,
              ]}
              onPress={handleSubmit}
              testID="auth-sign-in-button"
            >
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Sign In</Text>
            </Pressable>

          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  colors,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  testID,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useColors>;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences";
  secureTextEntry?: boolean;
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        testID={testID}
      />
    </View>
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
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 22,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: { padding: 4 },
  title: {
    fontSize: 23,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    marginBottom: 20,
  },
  quickActions: { gap: 10 },
  socialButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleLogo: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
  },
  socialButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginHorizontal: 12,
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 7,
    letterSpacing: 0.4,
  },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  passwordWrap: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  forgotButton: {
    alignSelf: "flex-end",
    paddingVertical: 2,
    marginTop: -2,
    marginBottom: 18,
  },
  linkText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  submitButton: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  submitText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  pressed: { opacity: 0.78 },
});
