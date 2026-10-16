import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export type ShareTarget =
  | "whatsapp"
  | "messages"
  | "instagram"
  | "messenger"
  | "snapchat"
  | "copy"
  | "more";

type Props = {
  visible: boolean;
  title: string;
  posterUri?: string | null;
  url: string;
  onClose: () => void;
  onShare: (target: ShareTarget) => void | Promise<void>;
};

const OPTIONS: Array<{
  id: ShareTarget;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
}> = [
  { id: "whatsapp", label: "WhatsApp", icon: "message-circle", color: "#25D366" },
  { id: "messages", label: "Messages", icon: "message-square", color: "#2F80ED" },
  { id: "instagram", label: "Instagram\nStories", icon: "instagram", color: "#E1306C" },
  { id: "messenger", label: "Messenger", icon: "message-circle", color: "#1677F2" },
  { id: "snapchat", label: "Snapchat", icon: "star", color: "#FFEB00" },
  { id: "copy", label: "Copy link", icon: "copy", color: "#575757" },
  { id: "more", label: "More\nOptions", icon: "more-horizontal", color: "#FFFFFF" },
];

export default function MovieShareBottomSheet({
  visible,
  title,
  posterUri,
  url,
  onClose,
  onShare,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    setPosterFailed(false);
  }, [posterUri]);
  const domain = useMemo(() => {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return "s-movie.com";
    }
  }, [url]);

  const select = async (target: ShareTarget) => {
    if (target === "copy") {
      await Clipboard.setStringAsync(url);
      ToastAndroid.show("Link copied", ToastAndroid.SHORT);
      onClose();
      return;
    }
    await onShare(target);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.previewRow}>
            {posterUri && !posterFailed ? (
              <Image
                source={{ uri: posterUri }}
                style={styles.previewPoster}
                resizeMode="cover"
                onError={() => setPosterFailed(true)}
              />
            ) : (
              <View style={[styles.previewPoster, styles.posterFallback]}>
                <Feather name="film" size={22} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.previewCopy}>
              <Text numberOfLines={1} style={[styles.title, { color: colors.cardForeground }]}>
                {title}
              </Text>
              <Text style={[styles.domain, { color: colors.mutedForeground }]}>{domain}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close share options"
              testID="close-share-sheet"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          <View style={styles.grid}>
            {OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                testID={`share-${option.id}`}
                onPress={() => void select(option.id)}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <View style={[styles.optionIcon, { backgroundColor: option.color }]}>
                  <Feather
                    name={option.icon}
                    size={option.id === "more" ? 27 : 28}
                    color={option.id === "snapchat" ? "#111111" : "#FFFFFF"}
                  />
                </View>
                <Text style={[styles.optionLabel, { color: colors.cardForeground }]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end" },
  dismissArea: { flex: 1 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" },
  grabber: { alignSelf: "center", width: 42, height: 4, borderRadius: 3, backgroundColor: "#8A8A8A", marginTop: 9, marginBottom: 14 },
  previewRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20 },
  previewPoster: { width: 168, height: 94, borderRadius: 3, backgroundColor: "#323232" },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  previewCopy: { flex: 1, paddingHorizontal: 14 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  domain: { fontSize: 16 },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#5C5C5C" },
  rule: { height: StyleSheet.hairlineWidth },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 15, paddingTop: 20 },
  option: { width: "33.333%", alignItems: "center", minHeight: 105 },
  optionIcon: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  optionLabel: { fontSize: 15, textAlign: "center", lineHeight: 18 },
  pressed: { opacity: 0.62 },
});