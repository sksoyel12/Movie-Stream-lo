import { Feather, Ionicons } from "@expo/vector-icons";
import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { firebaseAuth, firebaseConfigReady } from "@/lib/firebase";

type Step = "phone" | "otp" | "success";

export interface FirebaseUser {
  uid: string;
  phoneNumber: string;
  idToken: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: (user: FirebaseUser) => void;
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let recaptchaElement: HTMLDivElement | null = null;

function getRecaptchaVerifier(): RecaptchaVerifier {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    throw new Error("Phone authentication is available in the web Firebase flow.");
  }

  if (!recaptchaElement) {
    recaptchaElement = document.createElement("div");
    recaptchaElement.id = "smovie-phone-recaptcha";
    document.body.appendChild(recaptchaElement);
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, recaptchaElement, {
      size: "invisible",
      callback: () => undefined,
      "expired-callback": () => {
        recaptchaVerifier = null;
      },
    });
  }

  return recaptchaVerifier;
}

function resetRecaptcha() {
  try {
    recaptchaVerifier?.clear();
  } catch {
    // Firebase may already have removed the verifier after an expired token.
  }
  recaptchaVerifier = null;
  if (recaptchaElement?.parentNode) {
    recaptchaElement.parentNode.removeChild(recaptchaElement);
  }
  recaptchaElement = null;
}

function formatPhoneError(error: unknown): string {
  const value = error as { code?: string; message?: string };
  const code = value?.code ?? "";
  const message = value?.message ?? "";

  if (code === "auth/operation-not-allowed") {
    return "Phone sign-in is not enabled in Firebase.";
  }
  if (code === "auth/invalid-phone-number") {
    return "Enter a valid 10-digit phone number.";
  }
  if (code === "auth/invalid-verification-code") {
    return "That OTP is incorrect. Please try again.";
  }
  if (code === "auth/code-expired") {
    return "That OTP has expired. Request a new one.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please try again later.";
  }
  if (code === "auth/quota-exceeded") {
    return "SMS quota exceeded. Please try again later.";
  }
  if (code === "auth/captcha-check-failed") {
    return "Security verification failed. Please try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Please check your connection.";
  }
  if (message.toLowerCase().includes("recaptcha")) {
    return "Security verification failed. Please refresh and try again.";
  }
  return message || "Unable to send the OTP. Please try again.";
}

export default function PhoneAuthModal({ visible, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendTimer = useCallback(() => {
    setResendTimer(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((previous) => {
        if (previous <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    setStep("phone");
    setPhoneNumber("");
    setOtp(["", "", "", "", "", ""]);
    setConfirmationResult(null);
    setLoading(false);
    setError("");
    setResendTimer(0);
    if (timerRef.current) clearInterval(timerRef.current);
    resetRecaptcha();
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const sendOtp = useCallback(async () => {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    if (!firebaseConfigReady) {
      setError("Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_API_KEY.");
      return;
    }
    if (Platform.OS !== "web") {
      setError("Phone authentication is currently available in the web app.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      resetRecaptcha();
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(firebaseAuth, `+91${digits}`, verifier);
      setConfirmationResult(result);
      setStep("otp");
      startResendTimer();
    } catch (errorValue) {
      resetRecaptcha();
      setError(formatPhoneError(errorValue));
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, startResendTimer]);

  const verifyOtp = useCallback(async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    if (!confirmationResult) {
      setError("Your OTP session expired. Request a new one.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const result = await confirmationResult.confirm(code);
      const user = result.user;
      const idToken = await user.getIdToken();
      setStep("success");
      setTimeout(() => {
        reset();
        onSuccess({
          uid: user.uid,
          phoneNumber: user.phoneNumber ?? `+91${phoneNumber.replace(/\D/g, "")}`,
          idToken,
        });
      }, 700);
    } catch (errorValue) {
      setError(formatPhoneError(errorValue));
    } finally {
      setLoading(false);
    }
  }, [confirmationResult, onSuccess, otp, phoneNumber, reset]);

  const handleOtpChange = useCallback((value: string, index: number) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((previous) => {
      const next = [...previous];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (!digit && index > 0) otpRefs.current[index - 1]?.focus();
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name={step === "otp" ? "keypad-outline" : "phone-portrait-outline"}
                  size={24}
                  color="#E50914"
                />
              </View>
              <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close phone sign-in">
                <Feather name="x" size={21} color="#737373" />
              </Pressable>
            </View>

            {step === "phone" && (
              <>
                <Text style={styles.title}>Sign In with Phone</Text>
                <Text style={styles.subtitle}>We&apos;ll send a one-time password to your number.</Text>
                <View style={styles.phoneField}>
                  <TextInput
                    style={styles.countryCode}
                    value="+91"
                    editable={false}
                    accessibilityLabel="Country code"
                  />
                  <View style={styles.fieldDivider} />
                  <TextInput
                    style={styles.phoneInput}
                    value={phoneNumber}
                    onChangeText={(value) => {
                      setPhoneNumber(value.replace(/\D/g, "").slice(0, 10));
                      setError("");
                    }}
                    placeholder="10-digit phone number"
                    placeholderTextColor="#555"
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={sendOtp}
                    autoFocus
                  />
                </View>
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={sendOtp}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send OTP</Text>}
                </Pressable>
              </>
            )}

            {step === "otp" && (
              <>
                <Text style={styles.title}>Verify OTP</Text>
                <Text style={styles.subtitle}>Enter the 6-digit code sent to +91 {phoneNumber}.</Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(input) => {
                        otpRefs.current[index] = input;
                      }}
                      style={[styles.otpBox, digit && styles.otpBoxFilled]}
                      value={digit}
                      onChangeText={(value) => handleOtpChange(value, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      textAlign="center"
                      selectTextOnFocus
                    />
                  ))}
                </View>
                {!!error && <Text style={styles.error}>{error}</Text>}
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={verifyOtp}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify OTP</Text>}
                </Pressable>
                <View style={styles.resendRow}>
                  {resendTimer > 0 ? (
                    <Text style={styles.mutedText}>Resend in {resendTimer}s</Text>
                  ) : (
                    <Pressable onPress={sendOtp}>
                      <Text style={styles.linkText}>Resend OTP</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable onPress={() => { setStep("phone"); setOtp(["", "", "", "", "", ""]); setError(""); }}>
                  <Text style={styles.cancelText}>Change number</Text>
                </Pressable>
              </>
            )}

            {step === "success" && (
              <View style={styles.success}>
                <Ionicons name="checkmark-circle" size={62} color="#34D399" />
                <Text style={styles.successTitle}>You&apos;re signed in</Text>
                <Text style={styles.subtitle}>Welcome to S Movie Original.</Text>
              </View>
            )}
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "#141414",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(229,9,20,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subtitle: {
    color: "#737373",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  phoneField: {
    height: 52,
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginBottom: 12,
    overflow: "hidden",
  },
  countryCode: {
    width: 54,
    minWidth: 54,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  fieldDivider: {
    height: 26,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#3a3a3a",
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
  },
  error: {
    color: "#ff6b73",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  pressed: {
    opacity: 0.78,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  otpBox: {
    width: 43,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    fontSize: 21,
    fontFamily: "Inter_700Bold",
  },
  otpBoxFilled: {
    borderColor: "#E50914",
    backgroundColor: "rgba(229,9,20,0.08)",
  },
  resendRow: {
    alignItems: "center",
    paddingVertical: 14,
  },
  mutedText: {
    color: "#555",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  linkText: {
    color: "#E50914",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cancelText: {
    color: "#737373",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  success: {
    alignItems: "center",
    paddingVertical: 22,
    gap: 12,
  },
  successTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
});