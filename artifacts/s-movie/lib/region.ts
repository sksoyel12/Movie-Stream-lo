import { getLocales } from "expo-localization";

export const DEFAULT_CONTENT_REGION = "IN";

export interface ContentRegion {
  code: string;
  name: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  KR: "Korea",
  US: "United States",
};

const INDIA_TIME_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);
const IP_LOOKUP_TIMEOUT_MS = 2500;
const REGION_CACHE_TTL_MS = 15 * 60 * 1000;

let resolvedRegion: ContentRegion | null = null;
let resolvedRegionAt = 0;
let regionDetection: Promise<ContentRegion> | null = null;

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function regionFromLanguageTag(languageTag?: string | null): string | null {
  if (!languageTag) return null;
  const subtags = languageTag.replace(/_/g, "-").split("-").slice(1);
  return subtags
    .map((subtag) => normalizeCountryCode(subtag))
    .find((code) => code !== null) ?? null;
}

function getDeviceRegionHint(): string | null {
  let locales: ReturnType<typeof getLocales> | null = null;
  try {
    locales = getLocales();
  } catch {
    // Expo localization may be unavailable in a browser or test runtime.
  }

  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }

  let browserLanguage: string | undefined;
  try {
    if (typeof navigator !== "undefined") browserLanguage = navigator.language;
  } catch {
    browserLanguage = undefined;
  }

  const expoLocale = locales?.[0];
  const expoRegion =
    normalizeCountryCode(expoLocale?.regionCode) ??
    regionFromLanguageTag(expoLocale?.languageTag);
  const browserRegion = regionFromLanguageTag(browserLanguage);
  if (timeZone && INDIA_TIME_ZONES.has(timeZone)) return "IN";
  if (expoRegion) return expoRegion;
  if (browserRegion) return browserRegion;
  return null;
}

function getLocalRegionCode(): string {
  return getDeviceRegionHint() ?? DEFAULT_CONTENT_REGION;
}

async function getNetworkRegionCode(): Promise<string | null> {
  const controller =
    typeof AbortController === "undefined" ? undefined : new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    if (controller) {
      timeout = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
    }
    const response = await fetch(
      "https://ipapi.co/json/",
      controller ? { signal: controller.signal } : undefined,
    );
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    return normalizeCountryCode(
      (data as { country_code?: unknown }).country_code,
    );
  } catch {
    return null;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export function getDeviceRegionCode(): string {
  return resolvedRegion?.code ?? getLocalRegionCode();
}

export function getCurrentContentRegion(): ContentRegion {
  const code = resolvedRegion?.code ?? getLocalRegionCode();
  return { code, name: getCountryName(code) };
}

export function detectContentRegion(): Promise<ContentRegion> {
  if (resolvedRegion && Date.now() - resolvedRegionAt < REGION_CACHE_TTL_MS) {
    return Promise.resolve(resolvedRegion);
  }
  if (regionDetection) return regionDetection;

  const deviceHint = getDeviceRegionHint();
  const detection = (async () => {
    const networkCode = await getNetworkRegionCode();
    // Prefer device settings over IP geolocation: VPNs can change the network
    // country without changing the user's regional catalog preference.
    const code = deviceHint ?? networkCode ?? DEFAULT_CONTENT_REGION;
    resolvedRegion = { code, name: getCountryName(code) };
    resolvedRegionAt = Date.now();
    return resolvedRegion;
  })();
  regionDetection = detection;
  void detection.then(
    () => {
      if (regionDetection === detection) regionDetection = null;
    },
    () => {
      if (regionDetection === detection) regionDetection = null;
    },
  );
  return detection;
}

export function getCountryName(regionCode: string): string {
  const normalizedCode = normalizeCountryCode(regionCode) ?? DEFAULT_CONTENT_REGION;
  const knownName = COUNTRY_NAMES[normalizedCode];
  if (knownName) return knownName;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalizedCode)
      ?? normalizedCode;
  } catch {
    return normalizedCode;
  }
}
