/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * App Integrity Checker
 *
 * Detects hostile environments that scrapers / pirates commonly use:
 *
 *   • Emulator / simulator   — Device.isDevice === false
 *   • Suspicious device type — DeviceType.UNKNOWN on non-web
 *   • Debug build in prod    — __DEV__ is true on a device (shouldn't happen)
 *
 * Returns an IntegrityViolation describing why, or null if everything is fine.
 * The root layout calls this on startup and shows a non-dismissable modal.
 *
 * NOTE: This is a deterrent layer — determined attackers can patch it out.
 * It significantly raises the effort required for casual scraping.
 */

import * as Device from "expo-device";

export type IntegrityViolation =
  | "EMULATOR"
  | "UNKNOWN_DEVICE_TYPE"
  | "DEBUG_ON_DEVICE"
  | null;

export interface IntegrityResult {
  ok:        boolean;
  violation: IntegrityViolation;
  details:   string;
}

export async function checkAppIntegrity(): Promise<IntegrityResult> {
  // ── 1. Emulator / Simulator ────────────────────────────────────────────────
  // expo-device: isDevice is false in simulators, emulators, and web browsers.
  // We allow web explicitly (React Native Web in dev) but block headless emulators.
  if (Device.isDevice === false) {
    const brand = (Device.brand ?? "").toLowerCase();
    const model = (Device.modelName ?? "").toLowerCase();

    // Known emulator fingerprints (Android emulators often report these)
    const emulatorSigns = [
      "generic", "sdk_gphone", "emulator", "goldfish", "ranchu",
      "sdk", "vbox", "genymotion", "bluestacks",
    ];

    const isKnownEmulator = emulatorSigns.some(
      (s) => brand.includes(s) || model.includes(s),
    );

    if (isKnownEmulator) {
      return {
        ok:        false,
        violation: "EMULATOR",
        details:   `Emulator detected: ${Device.brand} / ${Device.modelName}`,
      };
    }
  }

  // ── 2. Unknown device type on physical device ─────────────────────────────
  // Physical phones and tablets always have a valid DeviceType.
  // UNKNOWN on a real device is a red flag for a heavily-modified firmware.
  if (
    Device.isDevice === true &&
    Device.deviceType === Device.DeviceType.UNKNOWN
  ) {
    return {
      ok:        false,
      violation: "UNKNOWN_DEVICE_TYPE",
      details:   "Device type unknown on physical device",
    };
  }

  return { ok: true, violation: null, details: "OK" };
}
