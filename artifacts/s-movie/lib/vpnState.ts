/**
 * ⚠️  SECURITY FREEZE — DO NOT MODIFY WITHOUT SECURITY OVERRIDE CODE
 *     Override code: SMOVIE-SEC-OVERRIDE-2026
 *     Ask the project owner for this code before editing.
 *
 * Global VPN block state
 *
 * Lightweight observable that lets any API call site signal "VPN detected"
 * and have the root layout show the blocking modal — without needing a
 * React context that wraps the entire tree.
 */

let _vpnBlocked = false;
const _listeners: Array<(blocked: boolean) => void> = [];

export function setVpnBlocked(blocked: boolean): void {
  _vpnBlocked = blocked;
  _listeners.forEach((fn) => fn(blocked));
}

export function getVpnBlocked(): boolean {
  return _vpnBlocked;
}

/**
 * Subscribe to VPN block state changes.
 * Returns an unsubscribe function.
 */
export function addVpnListener(
  fn: (blocked: boolean) => void,
): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

/** Error subclass thrown by apiClient when VPN is detected. */
export class VpnBlockedError extends Error {
  code: "VPN_DETECTED" | "DATACENTER_IP";
  constructor(code: "VPN_DETECTED" | "DATACENTER_IP", message: string) {
    super(message);
    this.name    = "VpnBlockedError";
    this.code    = code;
  }
}
