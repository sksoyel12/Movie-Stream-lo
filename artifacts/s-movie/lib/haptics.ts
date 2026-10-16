import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const isNative = Platform.OS !== "web";

export const haptic = {
  light: () => {
    if (!isNative) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (!isNative) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (!isNative) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  success: () => {
    if (!isNative) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: () => {
    if (!isNative) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning: () => {
    if (!isNative) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection: () => {
    if (!isNative) return;
    Haptics.selectionAsync().catch(() => {});
  },
};
