/**
 * Shared API URL handling for the Expo client.
 *
 * Replit may provide either the routed origin or an already-routed `/api`
 * URL. Keep both forms valid so callers never accidentally request `/api/api`.
 */
import { Platform } from "react-native";

// During Replit development, EXPO_PUBLIC_DOMAIN is injected by the mobile
// workflow. Keep the other Replit domain as a defensive fallback so the API
// host cannot become null when Expo evaluates this module before the workflow
// command has copied the public domain into EXPO_PUBLIC_DOMAIN.
const isUsableValue = (value: string | undefined): value is string =>
  Boolean(value && value.trim() && value !== "null" && value !== "undefined");

// Expo Web is served from the mobile artifact's routed origin. Using that same
// origin keeps TMDB requests same-origin and avoids device/browser DNS and
// cross-origin differences between the Expo and API domains. Native builds
// cannot use window.location, so they continue using the injected API domain.
const browserOrigin =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  isUsableValue(window.location?.origin)
    ? window.location.origin
    : undefined;

const configuredUrl = browserOrigin ??
  (isUsableValue(process.env.EXPO_PUBLIC_DOMAIN)
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : isUsableValue(process.env.EXPO_PUBLIC_API_URL)
  ? process.env.EXPO_PUBLIC_API_URL
  : isUsableValue(process.env.REPLIT_DEV_DOMAIN)
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null);

const withoutTrailingSlash = (value: string): string =>
  value.replace(/\/+$/, "");

export const API_HOST: string | null = configuredUrl
  ? withoutTrailingSlash(configuredUrl).replace(/\/api$/, "")
  : null;

export const API_BASE: string | null = API_HOST ? `${API_HOST}/api` : null;