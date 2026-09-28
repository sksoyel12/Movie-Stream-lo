/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * S-Movie API Client
 *
 * Centralised HTTP client for all protected API calls. Handles:
 *   1. Firebase ID token injection (Authorization: Bearer header)
 *   2. Custom client header for anti-bot (X-S-Movie-Client)
 *   3. Device fingerprint header for device verification (X-S-Movie-Device)
 *   4. Lazy stream-key fetch + cache (for URL decryption)
 *   5. VPN / proxy detection — throws VpnBlockedError + signals global modal
 *
 * Usage:
 *   import { apiClient } from "@/lib/apiClient";
 *   const data = await apiClient.get<MyType>("/stream", { id: "123", type: "movie" });
 */

import { firebaseAuth }                              from "@/lib/firebase";
import { setStreamKey, clearStreamKey, hasValidKey, getStreamKeyHex } from "@/lib/streamCrypto";
import { getDeviceFingerprint, getDeviceFingerprintSync } from "@/lib/deviceFingerprint";
import { setVpnBlocked, VpnBlockedError }            from "@/lib/vpnState";
import { setAccountSuspended, AccountSuspendedError } from "@/lib/suspensionState";
import { setSigningKey, clearSigningKey, signRequest } from "@/lib/requestSigner";
import { setStreamKeyStatus }                        from "@/lib/streamKeyStatus";
import { API_BASE }                                  from "@/lib/apiBase";

// ─── API base URL ─────────────────────────────────────────────────────────────

export function getApiBase(): string {
  // Artifact services are exposed through the shared routed domain. Do not
  // append :8080 here: that bypasses Replit's /api proxy and fails on mobile.
  return API_BASE ?? "";
}

// Platform identifier sent with every request (required by server antiBot)
const CLIENT_HEADER_VALUE = "SMovie-Android/1.0";

// Warm device fingerprint cache eagerly so it's ready for the first request
getDeviceFingerprint().catch(() => {});

// ─── Token management ─────────────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getIdToken(): Promise<string | null> {
  try {
    const user = firebaseAuth.currentUser;
    if (!user) return null;

    // Firebase tokens expire after 1 hour; getIdToken() auto-refreshes
    const token = await user.getIdToken(/* forceRefresh */ false);
    _cachedToken = token;
    _tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 min
    return token;
  } catch {
    return null;
  }
}

// ─── Stream key management ────────────────────────────────────────────────────

let _fetchingKey    = false;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a background key refresh 90 s before the key expires. */
function scheduleKeyRefresh(expiresAt: number): void {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const delay = Math.max(5_000, expiresAt - Date.now() - 90_000); // ≥5 s
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null;
    fetchStreamKey(/* isProactive */ true);
  }, delay);
}

/** Core key-fetch logic (called on demand and by the refresh scheduler). */
async function fetchStreamKey(isProactive = false): Promise<void> {
  if (_fetchingKey) return;
  if (!isProactive && hasValidKey()) return;

  const token = await getIdToken();
  if (!token) return;

  _fetchingKey = true;
  setStreamKeyStatus("refreshing");
  try {
    const fp  = getDeviceFingerprintSync();
    const res = await fetch(`${getApiBase()}/auth/stream-key`, {
      method:  "POST",
      headers: buildHeaders(token, fp),
    });

    if (res.ok) {
      const data = (await res.json()) as { key: string; expiresAt: number };
      setStreamKey(data.key, data.expiresAt);
      setSigningKey(data.key);
      setStreamKeyStatus("ok");
      scheduleKeyRefresh(data.expiresAt); // schedule next proactive refresh
    } else if (isProactive) {
      setStreamKeyStatus("refresh_failed");
    }
  } catch {
    if (isProactive) setStreamKeyStatus("refresh_failed");
    // Non-fatal — decryption falls back to cached values until they expire
  } finally {
    _fetchingKey = false;
  }
}

/**
 * Ensure a valid stream key is in cache.
 * Proactive rotation is scheduled automatically after the first successful fetch.
 */
export async function ensureStreamKey(): Promise<void> {
  return fetchStreamKey(false);
}

/** Call on sign-out to clear cached credentials and cancel pending refresh. */
export function invalidateAuth() {
  _cachedToken = null;
  _tokenExpiry = 0;
  clearStreamKey();
  clearSigningKey();
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  setStreamKeyStatus("ok");
}

// ─── Header builder ───────────────────────────────────────────────────────────

function buildHeaders(token?: string | null, fingerprint?: string): HeadersInit {
  const fp = fingerprint ?? getDeviceFingerprintSync();
  const h: Record<string, string> = {
    "Content-Type":      "application/json",
    "X-S-Movie-Client":  CLIENT_HEADER_VALUE,
    "X-S-Movie-Device":  fp,
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 SMovie/1.0",
  };

  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ─── VPN / error response handling ───────────────────────────────────────────

interface ApiErrorBody {
  error?:   string;
  code?:    string;
  blocked?: boolean;
}

async function handleErrorResponse(res: Response): Promise<never> {
  let body: ApiErrorBody = {};
  try { body = (await res.json()) as ApiErrorBody; } catch { /* ignore */ }

  if (body.code === "VPN_DETECTED" || body.code === "DATACENTER_IP") {
    setVpnBlocked(true);
    throw new VpnBlockedError(
      body.code as "VPN_DETECTED" | "DATACENTER_IP",
      body.error ?? "VPN or proxy detected",
    );
  }

  if (body.code === "ACCOUNT_SUSPENDED") {
    const reason = body.error ?? "Your account is under verification.";
    setAccountSuspended({ reason });
    throw new AccountSuspendedError(reason);
  }

  const genericErr = new Error(body.error ?? `API error ${res.status}`) as Error & { code?: string };
  if (body.code) genericErr.code = body.code;
  throw genericErr;
}

// ─── Public client ────────────────────────────────────────────────────────────

export interface FetchOptions {
  timeoutMs?: number;
  signal?:    AbortSignal;
  method?:    "GET" | "POST" | "PUT" | "DELETE";
  body?:      Record<string, unknown>;
}

export const apiClient = {
  /**
   * Authenticated GET request with query params.
   * Automatically injects auth token, client header, and device fingerprint.
   */
  async get<T = unknown>(
    path: string,
    params?: Record<string, string | number | undefined>,
    opts: FetchOptions = {},
  ): Promise<T> {
    const [token, fp, sigHeaders] = await Promise.all([
      getIdToken(),
      getDeviceFingerprint(),
      signRequest("GET", path),
    ]);

    const url = new URL(`${getApiBase()}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 30_000,
    );

    try {
      const res = await fetch(url.toString(), {
        method:  "GET",
        headers: { ...buildHeaders(token, fp), ...sigHeaders },
        signal:  opts.signal ?? controller.signal,
      });

      if (!res.ok) return handleErrorResponse(res);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Authenticated POST request.
   */
  async post<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
    opts: FetchOptions = {},
  ): Promise<T> {
    const [token, fp, sigHeaders] = await Promise.all([
      getIdToken(),
      getDeviceFingerprint(),
      signRequest("POST", path),
    ]);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 30_000,
    );

    try {
      const res = await fetch(`${getApiBase()}${path}`, {
        method:  "POST",
        headers: { ...buildHeaders(token, fp), ...sigHeaders },
        body:    body ? JSON.stringify(body) : undefined,
        signal:  opts.signal ?? controller.signal,
      });

      if (!res.ok) return handleErrorResponse(res);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  },
};
