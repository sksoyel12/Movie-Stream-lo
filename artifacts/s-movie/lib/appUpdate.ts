import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

import { CURRENT_VERSION } from "@/data/releaseNotes";
import { API_HOST } from "@/lib/apiBase";

export interface VersionInfo {
  version: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
  forceUpdate: boolean;
  minSupportedVersion?: string;
  expiresAt?: string | null;
}

export interface UpdateCheckResult {
  isAvailable: boolean;
  info: VersionInfo | null;
  error?: string;
}

export interface DownloadProgress {
  bytesWritten: number;
  bytesTotal: number;
  percent: number;
}

// Custom self-hosted version endpoint — no EAS or Expo update servers involved.
// This is the single source of truth for update checks in all released APKs.
const LEGACY_VERSION_CHECK_URL =
  "https://movie-streamer--sksoyel584845.replit.app/api/version";

function getVersionUrls(): string[] {
  return [
    API_HOST ? `${API_HOST}/api/version` : null,
    LEGACY_VERSION_CHECK_URL,
  ].filter((url): url is string => Boolean(url));
}

/** Parses "1.2.3" → [1, 2, 3] and compares two semver strings.
 *  Returns  1 if a > b, -1 if a < b, 0 if equal. */
function compareSemVer(a: string, b: string): number {
  const toNum = (s: string) =>
    s.split(".").map((n) => parseInt(n, 10) || 0) as [number, number, number];
  const [a0, a1, a2] = toNum(a);
  const [b0, b1, b2] = toNum(b);
  if (a0 !== b0) return a0 > b0 ? 1 : -1;
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  return 0;
}

/** Fetches the server version manifest and compares with the installed version. */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  // The legacy manifest host does not expose CORS headers to the Expo web
  // preview. Update installation is native-only, so skip this optional check
  // on web instead of emitting a noisy failed request during startup.
  if (Platform.OS === "web") {
    return { isAvailable: false, info: null };
  }
  try {
    let lastError: Error | null = null;
    for (const url of getVersionUrls()) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const info = (await res.json()) as VersionInfo;
        const belowMinimum =
          Boolean(info.minSupportedVersion) &&
          compareSemVer(CURRENT_VERSION, info.minSupportedVersion!) < 0;
        const expired =
          Boolean(info.expiresAt) &&
          Number.isFinite(Date.parse(info.expiresAt!)) &&
          Date.now() >= Date.parse(info.expiresAt!);
        const forceUpdate = Boolean(info.forceUpdate || belowMinimum || expired);
        return {
          isAvailable: compareSemVer(info.version, CURRENT_VERSION) > 0 || forceUpdate,
          info: { ...info, forceUpdate },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error("No version manifest is configured.");
  } catch (err: any) {
    return {
      isAvailable: false,
      info: null,
      error: err?.message ?? "Network error",
    };
  }
}

const APK_FILENAME = "smovie-update.apk";

function getApkCacheDir(): string {
  if (Platform.OS === "web") return "";
  try {
    const { Paths } = require("expo-file-system");
    return Paths.cache.uri + "smovie_updates/";
  } catch {
    return (FileSystem as any).cacheDirectory ?? "" + "smovie_updates/";
  }
}

/** Downloads the APK and launches the Android package installer.
 *  Calls onProgress with a 0–1 fraction as the download progresses.
 *  Throws on download or install failure.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("APK installation is only supported on Android.");
  }

  const APK_CACHE_DIR = getApkCacheDir();

  // Ensure cache directory exists
  const dirInfo = await FileSystem.getInfoAsync(APK_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(APK_CACHE_DIR, { intermediates: true });
  }

  const destPath = APK_CACHE_DIR + APK_FILENAME;

  // Delete any stale APK from a previous attempt
  const existingInfo = await FileSystem.getInfoAsync(destPath);
  if (existingInfo.exists) {
    await FileSystem.deleteAsync(destPath, { idempotent: true });
  }

  // Create a resumable download so we can track progress
  const downloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    destPath,
    {},
    (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      const percent =
        totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite
          : 0;
      onProgress({
        bytesWritten: totalBytesWritten,
        bytesTotal: totalBytesExpectedToWrite,
        percent,
      });
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error("APK download failed (non-200 response).");
  }

  // Convert to a content:// URI so Android 7+ can open it
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  // Launch the Android Package Installer
  await IntentLauncher.startActivityAsync(
    "android.intent.action.INSTALL_PACKAGE",
    {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    },
  );
}

/** Convenience: open the EAS build page URL in browser as a fallback
 *  (used on web or if Intent fails). */
export function openApkInBrowser(apkUrl: string): void {
  const { Linking } = require("react-native");
  Linking.openURL(apkUrl).catch(() => {});
}
