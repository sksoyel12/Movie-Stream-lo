/**
 * SmartImage — ISP-bypass robust image loader (speed-optimised)
 *
 * Problem: image.tmdb.org is DNS-blocked on Indian ISPs (BSNL, Airtel, Jio).
 *
 * Retry chain for TMDB artwork:
 *   1. wsrv.nl         ← global image cache, first choice on restricted networks
 *   2. statically.io   ← independent image relay
 *   3. /api/image      ← first-party API server proxy
 *   4. image.tmdb.org  ← direct CDN, last resort only
 *
 * Each attempt gets 2.5s before stepping to the next.
 * expo-image's disk cache keeps successfully loaded images available across
 * app restarts and offline sessions.
 */
import { Image, type ImageContentFit, type ImageSource } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image as RNImage, Platform, StyleSheet, View } from "react-native";
import { API_HOST } from "@/lib/apiBase";
import { resolvePosterFallback } from "@/lib/posterFallback";

// ─── Proxy hosts ──────────────────────────────────────────────────────────────
const _API_HOST = API_HOST;
const _BROWSER_ORIGIN =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : null;
const _IMAGE_PROXY_HOST = _API_HOST ?? _BROWSER_ORIGIN;
const SERVER_PROXY: string | null = _IMAGE_PROXY_HOST
  ? `${_IMAGE_PROXY_HOST.replace(/\/+$/, "")}/api/image?url=`
  : null;

function getTmdbImageDetails(directTmdbUrl: string): {
  url: string;
  size: string;
  cleanPath: string;
} | null {
  try {
    const parsed = new URL(directTmdbUrl);
    if (parsed.hostname !== "image.tmdb.org") return null;
    const match = parsed.pathname.match(/^\/t\/p\/([^/]+)\/(.+)$/);
    if (!match?.[2]) return null;

    // Upgrade small card posters to the requested w500; preserve larger
    // backdrop/detail sizes so their full-width artwork stays sharp.
    const requestedSize = match[1];
    const size = requestedSize === "w342" ? "w500" : requestedSize || "w500";
    const cleanPath = match[2].replace(/^\/+/, "");
    return {
      url: `https://image.tmdb.org/t/p/${size}/${cleanPath}`,
      size,
      cleanPath,
    };
  } catch {
    return null;
  }
}

// Keep a stalled route from holding up the next available image source.
const STEP_TIMEOUT_MS = 2_500;

// ─── URI normalisation ────────────────────────────────────────────────────────
function extractDirectUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  // Already a wsrv / weserv proxied URL — decode inner URL
  if (raw.includes("wsrv.nl") || raw.includes("weserv.nl")) {
    const m = raw.match(/[?&]url=([^&]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch {}
    }
    return raw;
  }

  // Statically relay URLs store the original host and path after /img/.
  if (raw.includes("cdn.statically.io/img/")) {
    try {
      const parsed = new URL(raw);
      const target = parsed.pathname.replace(/^\/img\//, "");
      if (parsed.hostname === "cdn.statically.io" && target.startsWith("image.tmdb.org/")) {
        return `https://${target}`;
      }
    } catch {}
    return raw;
  }

  // Server proxy URL — extract the inner url= param
  if (raw.includes("/api/image?url=")) {
    const m = raw.match(/\/api\/image\?url=([^&]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch {}
    }
    return raw;
  }

  // Bare TMDB path like /abc123.jpg
  if (raw.startsWith("/")) return `https://image.tmdb.org/t/p/w342${raw}`;

  // Direct image.tmdb.org URL
  if (raw.includes("image.tmdb.org")) return raw;

  // http → https
  if (raw.startsWith("http://")) return raw.replace("http://", "https://");

  return raw;
}

function buildAttemptUrls(rawUri: string | undefined, directUrl: string | undefined): string[] {
  if (!directUrl) return rawUri ? [rawUri] : [];

  const tmdbImage = getTmdbImageDetails(directUrl);
  if (tmdbImage) {
    const encodedUrl = encodeURIComponent(tmdbImage.url);
    const urls = [
      `https://wsrv.nl/?url=${encodedUrl}&output=webp`,
      `https://cdn.statically.io/img/image.tmdb.org/t/p/${tmdbImage.size}/${tmdbImage.cleanPath}`,
    ];
    if (SERVER_PROXY) urls.push(`${SERVER_PROXY}${encodedUrl}`);
    urls.push(tmdbImage.url);
    return [...new Set(urls)];
  }

  // Preserve the original URL for non-TMDB assets.
  if (rawUri?.startsWith("http://") || rawUri?.startsWith("https://")) {
    return [rawUri];
  }
  return [directUrl];
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
function Shimmer({ style }: { style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, sh.shimmer, style, { opacity }]} />
  );
}
const sh = StyleSheet.create({ shimmer: { backgroundColor: "#1e2a3a" } });

function webResizeMode(contentFit: ImageContentFit): "cover" | "contain" | "stretch" | "center" {
  if (contentFit === "contain" || contentFit === "scale-down") return "contain";
  if (contentFit === "fill") return "stretch";
  if (contentFit === "none") return "center";
  return "cover";
}

// ─── SmartImage ───────────────────────────────────────────────────────────────
interface Props {
  source: ImageSource | string | number | null | undefined;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  style?: any;
  contentFit?: ImageContentFit;
  contentPosition?: any;
  transition?: number;
  recyclingKey?: string;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  priority?: "low" | "normal" | "high";
  title?: string;
}

export default function SmartImage({
  source,
  tmdbId,
  mediaType = "movie",
  style,
  contentFit = "cover",
  contentPosition,
  transition = 250,
  recyclingKey,
  cachePolicy = "disk",
  priority = "normal",
  title,
}: Props) {
  const rawUri =
    typeof source === "object" && source !== null && "uri" in source
      ? (source as { uri?: string }).uri
      : typeof source === "string"
      ? source
      : typeof source === "number"
      ? RNImage.resolveAssetSource(source)?.uri
      : undefined;

  const directUrl = extractDirectUrl(rawUri);
  const isTmdb = Boolean(directUrl?.includes("image.tmdb.org"));
  const attemptUrls = buildAttemptUrls(rawUri, directUrl);

  const [step, setStep] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fallbackUri, setFallbackUri] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const fallbackAttemptedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUri = attemptUrls[step] ?? directUrl;
  const useBrowserImage = Platform.OS === "web";
  const hasNoSource = !directUrl || !currentUri;

  // Reset whenever the source changes
  useEffect(() => {
    setStep(0);
    setLoadFailed(false);
    setIsLoading(true);
    setFallbackUri(null);
    setFallbackFailed(false);
    fallbackAttemptedRef.current = false;
  }, [directUrl, mediaType, tmdbId]);

  useEffect(() => {
    if (
      ((!loadFailed && !hasNoSource) ||
        fallbackAttemptedRef.current ||
        fallbackFailed ||
        !title)
    ) return;
    fallbackAttemptedRef.current = true;
    let cancelled = false;
    void resolvePosterFallback({ title, mediaType, tmdbId }).then((uri) => {
      if (!cancelled && uri) setFallbackUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [fallbackFailed, hasNoSource, loadFailed, mediaType, title, tmdbId]);

  const handleError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const nextStep = step + 1;
    if (nextStep < attemptUrls.length) {
      setStep(nextStep);
      setIsLoading(true);
    } else {
      setLoadFailed(true);
      setIsLoading(false);
    }
  }, [attemptUrls.length, currentUri, isTmdb, step]);

  const handleLoad = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsLoading(false);
  }, []);

  // Per-step timeout: advance through the proxy chain when a request stalls.
  useEffect(() => {
    if (loadFailed || !isLoading || !directUrl) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => handleError(), STEP_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  // handleError is stable (useCallback + no deps that change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, directUrl, loadFailed]);

  if (fallbackUri && !fallbackFailed) {
    return (
      <View style={[styles.wrap, style]}>
        {useBrowserImage ? (
          <RNImage
            source={{ uri: fallbackUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={webResizeMode(contentFit)}
            onError={() => {
              setFallbackUri(null);
              setFallbackFailed(true);
            }}
          />
        ) : (
          <Image
            source={{ uri: fallbackUri }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            contentPosition={contentPosition}
            transition={transition}
            cachePolicy={cachePolicy}
            recyclingKey={recyclingKey ?? fallbackUri}
            priority={priority}
            onError={() => {
              setFallbackUri(null);
              setFallbackFailed(true);
            }}
          />
        )}
      </View>
    );
  }

  // Rows filter posterless catalog results before they reach SmartImage. If a
  // URL still fails, keep the card title-free rather than creating a black
  // title placeholder that looks like valid artwork.
  if (hasNoSource) {
    return <View style={[styles.wrap, styles.failBg, style]} />;
  }

  if (loadFailed) {
    return <View style={[styles.wrap, styles.failBg, style]} />;
  }

  return (
    <View style={[styles.wrap, style]}>
      {isLoading && <Shimmer />}
      {useBrowserImage ? (
        <RNImage
          source={{ uri: currentUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={webResizeMode(contentFit)}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <Image
          source={{ uri: currentUri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          contentPosition={contentPosition}
          transition={isLoading ? 0 : transition}
          cachePolicy={cachePolicy}
          recyclingKey={recyclingKey ?? currentUri}
          priority={priority}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       { overflow: "hidden", backgroundColor: "#141414" },
  failBg:     { backgroundColor: "#141414" },
});

// ─── Prefetch utility ─────────────────────────────────────────────────────────
/**
 * Prefetch a list of image URIs using the first SmartImage attempt.
 * Call after data loads to warm the first proxy cache before the user scrolls.
 */
export async function prefetchImages(uris: (string | undefined | null)[]): Promise<void> {
  const valid = uris.filter(Boolean) as string[];
  await Promise.allSettled(
    valid.map((uri) => {
      const direct = extractDirectUrl(uri);
      const firstAttempt = buildAttemptUrls(uri, direct)[0] ?? uri;
      return Image.prefetch(firstAttempt);
    }),
  );
}

/**
 * Normalise any raw image URI to a direct source URL.
 * Exported for components that build their own `{ uri }` sources.
 */
export function normaliseImageUri(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const direct = extractDirectUrl(raw);
  if (!direct) return undefined;
  return direct;
}

/** @deprecated use normaliseImageUri */
export const normaliseUri = normaliseImageUri;
