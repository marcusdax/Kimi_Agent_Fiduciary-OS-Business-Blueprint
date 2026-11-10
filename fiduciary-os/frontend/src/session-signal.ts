import { useSyncExternalStore } from "react";

// Holds the app's existing sign-in sessions above the router; it is not an
// auth mechanism. Tokens live in module memory only (no storage, no cookie),
// so a reload still starts signed out, exactly as before. Because the store
// outlives the routes, a panel unmounting (e.g. going to #/start) does not
// sign anyone out; only an explicit sign-out, a clear, or an expiry does.
const tokens = new Map<string, string>();
const listeners = new Set<() => void>();
let signOutNotice = "";

function notify() {
  listeners.forEach((l) => l());
}

export function getSessionToken(source: string) {
  return tokens.get(source) ?? null;
}

/** Set (sign in) or clear (expiry or local clear) one panel's session. */
export function setSessionToken(source: string, token: string | null) {
  if (token) tokens.set(source, token);
  else tokens.delete(source);
  notify();
}

export function isSignedIn() {
  return tokens.size > 0;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A panel's session token, shared across routes and remounts. */
export function useSessionToken(source: string) {
  const token = useSyncExternalStore(subscribeSession, () =>
    getSessionToken(source),
  );
  return [token, (next: string | null) => setSessionToken(source, next)] as const;
}

/** Call after an explicit sign-out has cleared the local session. */
export function signedOut(source: string, notice: string) {
  setSessionToken(source, null);
  signOutNotice = notice;
  location.hash = "#/start";
}

/** The notice from the last explicit sign-out, if any. */
export function peekSignOutNotice() {
  return signOutNotice;
}
export function clearSignOutNotice() {
  signOutNotice = "";
}

/** Test helper. */
export function resetSessionSignal() {
  tokens.clear();
  signOutNotice = "";
  notify();
}
