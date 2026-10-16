/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * Device Fingerprinting
 *
 * Generates a stable, privacy-preserving device fingerprint sent with every
 * API request as the `X-S-Movie-Device` header.
 *
 * The fingerprint is a sha-256 digest of:
 *   - A random device ID generated on first launch (stored in AsyncStorage)
 *   - Hardware identifiers: brand, model, OS version, device type
 *
 * The server uses this to detect simulation, emulators, or suspicious
 * environments alongside the IP-level VPN/proxy check.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device  from "expo-device";
import * as Crypto  from "expo-crypto";

const DEVICE_ID_KEY = "@smovie:deviceId";

// ─── Stable random device ID ──────────────────────────────────────────────────

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;

    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "fallback-id";
  }
}

// ─── Fingerprint cache ────────────────────────────────────────────────────────

let _cachedFingerprint: string | null = null;

/**
 * Returns a hex fingerprint string suitable for the `X-S-Movie-Device` header.
 * Cached after first call so subsequent requests are synchronous.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (_cachedFingerprint) return _cachedFingerprint;

  const deviceId = await getOrCreateDeviceId();

  // Collect hardware identifiers
  const brand     = Device.brand               ?? "unknown";
  const model     = Device.modelName           ?? "unknown";
  const osVersion = Device.osVersion           ?? "unknown";
  const deviceType = Device.deviceType         ?? Device.DeviceType.UNKNOWN;
  const isDevice  = Device.isDevice            ? "real" : "virtual";

  const raw = [deviceId, brand, model, osVersion, String(deviceType), isDevice].join("|");

  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  // Format: <first 8 chars of deviceId>:<sha256>
  _cachedFingerprint = `${deviceId.slice(0, 8)}:${digest}`;
  return _cachedFingerprint;
}

/**
 * Synchronous accessor — returns cached fingerprint or a placeholder.
 * Always call getDeviceFingerprint() at app start to warm the cache.
 */
export function getDeviceFingerprintSync(): string {
  return _cachedFingerprint ?? "pending";
}

/**
 * Returns basic device info for debugging / logging.
 */
export function getDeviceInfo(): Record<string, string | number | boolean> {
  return {
    brand:      Device.brand              ?? "unknown",
    model:      Device.modelName          ?? "unknown",
    osVersion:  Device.osVersion          ?? "unknown",
    deviceType: Device.deviceType         ?? 0,
    isDevice:   Device.isDevice           ?? false,
  };
}
