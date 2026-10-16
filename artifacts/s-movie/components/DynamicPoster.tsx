import React from "react";
import type { ImageContentFit, ImageSource } from "expo-image";

import SmartImage from "@/components/SmartImage";

type Props = {
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  fallback: ImageSource | string | null | undefined;
  title?: string;
  style?: any;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  transition?: number;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  priority?: "low" | "normal" | "high";
};

/**
 * Netflix-style artwork selector for every browse surface.
 *
 * TMDB can expose dozens of approved key-art variants for one title. The
 * selector locks one of the first 50 for the current rotation window so
 * scrolling stays stable while revisiting the same title changes the artwork
 * over time instead of flickering on every render.
 */
export default function DynamicPoster({
  tmdbId,
  mediaType = "movie",
  fallback,
  title,
  style,
  contentFit = "cover",
  recyclingKey,
  transition = 250,
  cachePolicy = "disk",
  priority = "normal",
}: Props) {
  const fallbackSource: ImageSource | null | undefined =
    typeof fallback === "string" ? { uri: fallback } : fallback;
  return (
    <SmartImage
      source={fallbackSource}
      tmdbId={tmdbId}
      mediaType={mediaType}
      title={title}
      style={style}
      contentFit={contentFit}
      transition={transition}
      recyclingKey={recyclingKey}
      cachePolicy={cachePolicy}
      priority={priority}
    />
  );
}