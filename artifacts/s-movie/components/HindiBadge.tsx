import React, { useEffect, useRef, useState } from "react";
import { StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";

import { checkHindiAvailable } from "@/lib/hindi-trailer";

interface HindiBadgeProps {
  tmdbId: number | string | null | undefined;
  mediaType?: "movie" | "tv";
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
}

/**
 * Self-contained "Hindi" badge. Renders nothing until TMDB confirms Hindi
 * ("hi") is an actual available audio/translation track for this exact
 * title (see lib/hindi-trailer.ts#checkHindiAvailable). Never guesses —
 * absence of confirmed data means the badge stays hidden.
 */
export default function HindiBadge({ tmdbId, mediaType = "movie", style, textStyle }: HindiBadgeProps) {
  const [isHindi, setIsHindi] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    checked.current = false;
    setIsHindi(false);
    const id = Number(tmdbId);
    if (!id || Number.isNaN(id)) return;
    checked.current = true;
    let cancelled = false;
    checkHindiAvailable(id, mediaType).then((v) => {
      if (!cancelled) setIsHindi(v);
    });
    return () => {
      cancelled = true;
    };
  }, [tmdbId, mediaType]);

  if (!isHindi) return null;

  return (
    <View style={style} pointerEvents="none">
      <Text style={textStyle}>Hindi</Text>
    </View>
  );
}
