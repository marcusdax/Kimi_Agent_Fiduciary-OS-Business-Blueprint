// Observes the app's existing sign-in state; it is not an auth mechanism.
// Sessions still live only in FinancialWorkspace / ConnectedWorkspace memory
// (no storage, no cookie), so a reload always starts signed out, exactly as
// before. This module only lets the router see whether any panel currently
// holds a session token, and lets explicit sign-out send people to #/start.
const holders = new Set<string>();
const listeners = new Set<() => void>();
let signOutNotice = "";

export function reportSession(source: string, signedIn: boolean) {
  if (signedIn) holders.add(source);
  else holders.delete(source);
  listeners.forEach((l) => l());
}

export function isSignedIn() {
  return holders.size > 0;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call after an explicit sign-out has cleared the local session. */
export function signedOut(source: string, notice: string) {
  reportSession(source, false);
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
  holders.clear();
  signOutNotice = "";
}
