/**
 * Global account-suspension state.
 *
 * Lightweight observable (mirrors lib/vpnState.ts) that lets any API call
 * site signal "account suspended" and have the root layout show a blocking
 * modal — without needing a React context wrapping the whole tree.
 */

export interface SuspensionInfo {
  reason: string;
}

let _suspension: SuspensionInfo | null = null;
const _listeners: Array<(info: SuspensionInfo | null) => void> = [];

export function setAccountSuspended(info: SuspensionInfo | null): void {
  _suspension = info;
  _listeners.forEach((fn) => fn(info));
}

export function getAccountSuspended(): SuspensionInfo | null {
  return _suspension;
}

/** Subscribe to suspension state changes. Returns an unsubscribe function. */
export function addSuspensionListener(
  fn: (info: SuspensionInfo | null) => void,
): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

/** Error subclass thrown by apiClient when the account is suspended. */
export class AccountSuspendedError extends Error {
  code: "ACCOUNT_SUSPENDED";
  constructor(message: string) {
    super(message);
    this.name = "AccountSuspendedError";
    this.code = "ACCOUNT_SUSPENDED";
  }
}
