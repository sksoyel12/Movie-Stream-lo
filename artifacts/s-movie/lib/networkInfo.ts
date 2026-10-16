import * as Network from "expo-network";
import { getCountryName, detectContentRegion } from "@/lib/region";
import { nativeNetworkDetails, type NativeNetworkDetails } from "../modules/network-details";
import { PermissionsAndroid, Platform } from "react-native";

type BrowserConnection = {
  type?: string;
  effectiveType?: string;
};

type ExtendedNavigator = Navigator & {
  connection?: BrowserConnection;
  mozConnection?: BrowserConnection;
  webkitConnection?: BrowserConnection;
};

export type NetworkInfo = {
  connected: boolean | null;
  internetReachable: boolean | null;
  label: string;
  region: string;
  displayLabel: string;
};

let phoneStatePermissionDenied = false;
let permissionRequest: Promise<boolean> | null = null;

function browserNetworkInfo(): {
  connected: boolean | null;
  type: string | null;
  effectiveType: string | null;
} {
  if (typeof navigator === "undefined") {
    return { connected: null, type: null, effectiveType: null };
  }

  try {
    const nav = navigator as ExtendedNavigator;
    const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    return {
      connected: typeof nav.onLine === "boolean" ? nav.onLine : null,
      type: connection?.type?.toLowerCase() ?? null,
      effectiveType: connection?.effectiveType?.toLowerCase() ?? null,
    };
  } catch {
    return { connected: null, type: null, effectiveType: null };
  }
}

async function requestPhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !nativeNetworkDetails) return false;

  try {
    const permission = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
    if (await PermissionsAndroid.check(permission)) return true;
    if (phoneStatePermissionDenied) return false;
    if (permissionRequest) return permissionRequest;

    permissionRequest = PermissionsAndroid.request(permission, {
      title: "Network details",
      message:
        "Allow access to phone state to show the active mobile network generation and carrier in About.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    }).then((result) => {
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      phoneStatePermissionDenied = !granted;
      return granted;
    });

    return await permissionRequest;
  } catch {
    return false;
  } finally {
    permissionRequest = null;
  }
}

function normalizeType(value: string | undefined | null): string | null {
  const normalized = value?.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("wifi")) return "wifi";
  if (normalized.includes("cellular") || normalized.includes("mobile")) return "cellular";
  if (normalized.includes("none") || normalized.includes("offline")) return "none";
  if (normalized === "unknown") return null;
  return "other";
}

function normalizeGeneration(value: string | null | undefined): string | null {
  const generation = value?.trim().toLowerCase();
  if (!generation) return null;
  if (generation === "5g") return "5G";
  if (generation === "4g") return "4G";
  if (generation === "3g") return "3G";
  if (generation === "2g" || generation === "slow-2g") return "2G";
  return null;
}

function regionWithIso(countryIso: string | null | undefined): string | null {
  const code = countryIso?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return `${getCountryName(code)} (${code})`;
}

async function readNativeDetails(): Promise<NativeNetworkDetails | null> {
  if (Platform.OS !== "android" || !nativeNetworkDetails) return null;
  try {
    return await nativeNetworkDetails.getNetworkDetails();
  } catch {
    return null;
  }
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const browser = browserNetworkInfo();

  let expoState: Network.NetworkState | null = null;
  try {
    expoState = await Network.getNetworkStateAsync();
  } catch {
    // Continue with the browser or optional Android-native network details.
  }

  let native = await readNativeDetails();
  let type =
    normalizeType(native?.connectionType) ??
    normalizeType(expoState?.type) ??
    normalizeType(browser.type);

  const connected =
    expoState?.isConnected ??
    browser.connected ??
    (type === "none" ? false : type ? true : null);
  const internetReachable =
    expoState?.isInternetReachable ?? browser.connected;

  // Connection type is determined before cellular generation so a Wi-Fi
  // connection is never mislabeled from a browser's generic effectiveType.
  if (
    Platform.OS === "android" &&
    type === "cellular" &&
    nativeNetworkDetails
  ) {
    let hasPhoneStatePermission = false;
    try {
      hasPhoneStatePermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      );
    } catch {
      // Fall back to the visible network type and IP/timezone region.
    }

    if (!hasPhoneStatePermission && await requestPhoneStatePermission()) {
      native = await readNativeDetails();
      type =
        normalizeType(native?.connectionType) ??
        normalizeType(expoState?.type) ??
        normalizeType(browser.type);
    }
  }

  let label: string;
  const browserEstimate = normalizeGeneration(browser.effectiveType);
  const nativeGeneration = normalizeGeneration(native?.generation);
  if (connected === false || type === "none") {
    label = "Offline";
  } else if (type === "wifi") {
    label = "Wi-Fi";
  } else if (type === "cellular") {
    label = nativeGeneration ??
      (browserEstimate ? `Cellular (${browserEstimate} estimate)` : "Cellular");
  } else if (!type && browserEstimate) {
    label = `${browserEstimate} estimate`;
  } else {
    label = connected ? "Connected" : "Unknown";
  }

  const clientRegion = await detectContentRegion();
  const nativeRegion = type === "cellular" ? regionWithIso(native?.countryIso) : null;
  const baseRegion = nativeRegion ?? `${clientRegion.name} (${clientRegion.code})`;
  const carrierName =
    type === "cellular" && native?.carrierName?.trim()
      ? native.carrierName.trim()
      : null;
  const region = carrierName ? `${baseRegion} · ${carrierName}` : baseRegion;

  return {
    connected,
    internetReachable,
    label,
    region,
    displayLabel: `${label} • ${region}`,
  };
}
