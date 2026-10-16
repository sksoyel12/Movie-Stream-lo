/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * Client-Side Request Signer
 *
 * Generates `X-S-Movie-Ts` and `X-S-Movie-Sig` headers for every
 * authenticated API request.
 *
 * Algorithm (matches server requestSignature.ts exactly):
 *   material = "<METHOD>|<path>|<unixSeconds>"
 *   sig      = HMAC-SHA256(key: Buffer.from(streamKeyHex, "hex"), data: material) → hex
 *
 * Uses the WebCrypto API (crypto.subtle) which is built into React Native
 * 0.71+ / Expo SDK 49+.  No native modules required.
 */

// ─── Key store ────────────────────────────────────────────────────────────────

let _signingKeyHex: string | null = null;

/** Called by apiClient after /api/auth/stream-key succeeds. */
export function setSigningKey(hexKey: string): void {
  _signingKeyHex = hexKey;
}

/** Called on sign-out. */
export function clearSigningKey(): void {
  _signingKeyHex = null;
}

export function hasSigningKey(): boolean {
  return _signingKeyHex !== null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── HMAC-SHA256 via WebCrypto (crypto.subtle) ───────────────────────────────

async function hmacSha256(keyHex: string, data: string): Promise<string> {
  const keyBytes  = hexToBytes(keyHex);
  const dataBytes = new TextEncoder().encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(dataBytes),
  );
  return bytesToHex(sigBuffer);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `{ "X-S-Movie-Ts": "<secs>", "X-S-Movie-Sig": "<hex>" }` when a
 * signing key is available, or `{}` when not yet authenticated (pre-login).
 */
export async function signRequest(
  method: string,
  path:   string,
): Promise<Record<string, string>> {
  if (!_signingKeyHex) return {};

  try {
    const tsSec   = String(Math.floor(Date.now() / 1000));
    const material = `${method.toUpperCase()}|${path}|${tsSec}`;
    const sig      = await hmacSha256(_signingKeyHex, material);

    return {
      "X-S-Movie-Ts":  tsSec,
      "X-S-Movie-Sig": sig,
    };
  } catch {
    // WebCrypto unavailable (shouldn't happen in Expo SDK 49+) — omit sig headers
    return {};
  }
}
