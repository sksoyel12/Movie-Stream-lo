/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * Client-side stream URL decryption (React Native / Expo).
 *
 * Uses the WebCrypto API (crypto.subtle) which is available natively in
 * React Native 0.71+ and all current Expo SDK versions.
 *
 * The server encrypts stream URLs with AES-256-GCM using a key derived from
 * HMAC-SHA256(SESSION_SECRET, uid + hourSlot). The client fetches the same
 * key from /api/auth/stream-key (after Firebase auth) and uses it here.
 *
 * Wire format from server: "<12-byte-iv-hex>:<ciphertext+gcm-tag-base64>"
 */

// ─── Utility helpers ─────────────────────────────────────────────────────────

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

function base64ToBytes(b64: string): Uint8Array {
  // RN has atob available via the JSI or polyfill
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── In-memory key cache ──────────────────────────────────────────────────────

interface KeyEntry {
  keyHex:    string;
  expiresAt: number;
  cryptoKey: CryptoKey | null;
}

let _keyCache: KeyEntry | null = null;

/** Store the key returned by /api/auth/stream-key */
export function setStreamKey(keyHex: string, expiresAt: number) {
  _keyCache = { keyHex, expiresAt, cryptoKey: null };
}

/** Return the raw key hex (used by requestSigner for HMAC signing). */
export function getStreamKeyHex(): string | null {
  return _keyCache?.keyHex ?? null;
}

/** Clear stored key (on sign-out) */
export function clearStreamKey() {
  _keyCache = null;
}

/** Returns true if we have a valid, non-expired key */
export function hasValidKey(): boolean {
  return _keyCache !== null && Date.now() < _keyCache.expiresAt - 60_000; // 1-min buffer
}

// ─── Import CryptoKey (cached after first import) ─────────────────────────────

async function getKey(): Promise<CryptoKey | null> {
  if (!_keyCache) return null;
  if (_keyCache.cryptoKey) return _keyCache.cryptoKey;

  try {
    const keyBytes = hexToBytes(_keyCache.keyHex);
    const key = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    _keyCache.cryptoKey = key;
    return key;
  } catch {
    return null;
  }
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypt a single encrypted URL string.
 * Returns the original URL, or null if decryption fails (bad key / format).
 *
 * If no key is stored (guest / not logged in), returns null so the caller
 * can fall back to the embed player.
 */
export async function decryptUrl(enc: string | null | undefined): Promise<string | null> {
  if (!enc || typeof enc !== "string") return null;

  const key = await getKey();
  if (!key) return null;

  try {
    const colonIdx = enc.indexOf(":");
    if (colonIdx < 0) return null;

    const iv       = hexToBytes(enc.slice(0, colonIdx));
    // Server appends: Buffer.concat([ciphertext, gcmTag])
    // WebCrypto AES-GCM decrypt expects exactly this layout (ciphertext || tag).
    const combined = base64ToBytes(enc.slice(colonIdx + 1));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      toArrayBuffer(combined),
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Attempt to decrypt a value — if it fails or there's no key, returns the
 * original value unchanged (graceful fallback for unencrypted fields or guests).
 */
export async function tryDecrypt(value: string | null | undefined): Promise<string | null | undefined> {
  if (!value || !hasValidKey()) return value;
  const decrypted = await decryptUrl(value);
  return decrypted ?? value; // Fall back to original if decryption fails
}
