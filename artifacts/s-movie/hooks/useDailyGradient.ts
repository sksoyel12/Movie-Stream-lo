/**
 * useDailyGradient — React hook
 *
 * • Returns today's gradient pair (computed once per day via dailyGradient.ts).
 * • Schedules an automatic swap at local midnight with a smooth fade animation.
 * • fadeAnim drives opacity on the gradient layer so the swap is imperceptible
 *   even when the user happens to be in the app at midnight.
 */

import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

import {
  getDailyGradient,
  msUntilMidnight,
  type GradientPair,
} from "@/lib/dailyGradient";

const FADE_OUT_MS = 700;
const FADE_IN_MS  = 900;

export function useDailyGradient(): {
  gradient: GradientPair;
  fadeAnim: Animated.Value;
} {
  const [gradient, setGradient] = useState<GradientPair>(getDailyGradient);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleSwap() {
      const delay = msUntilMidnight();

      timerRef.current = setTimeout(() => {
        // 1. Fade out current gradient
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start(() => {
          // 2. Swap to new day's gradient
          setGradient(getDailyGradient());

          // 3. Fade the new gradient back in
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: FADE_IN_MS,
            useNativeDriver: true,
          }).start();

          // 4. Schedule the next day's swap
          scheduleSwap();
        });
      }, delay);
    }

    scheduleSwap();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { gradient, fadeAnim };
}
