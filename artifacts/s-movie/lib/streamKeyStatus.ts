/**
 * Stream Key Status Observable
 *
 * Lets the root layout (or any screen) react when the background stream-key
 * refresh fails — so users get a friendly warning instead of silent failure.
 */

export type StreamKeyStatus = "ok" | "refreshing" | "refresh_failed";

let _status: StreamKeyStatus = "ok";
const _listeners: Array<(s: StreamKeyStatus) => void> = [];

export function setStreamKeyStatus(s: StreamKeyStatus): void {
  _status = s;
  _listeners.forEach((fn) => fn(s));
}

export function getStreamKeyStatus(): StreamKeyStatus {
  return _status;
}

export function addStreamKeyListener(fn: (s: StreamKeyStatus) => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}
