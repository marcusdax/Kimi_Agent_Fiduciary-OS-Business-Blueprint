import { useEffect, useRef, useState } from "react";
import App from "../App";
import LandingPage from "./LandingPage";
import RequestPage from "./RequestPage";
import { isSignedIn } from "../session-signal";

export type Route = "start" | "request" | "workspace";

// Only "#/..." hashes are routes, so in-page anchors such as #main or #try
// keep the current page. With no hash (or a bare "#"), visitors who aren't
// signed in land on #/start and signed-in users stay on the workspace
// (default decided by Marcus). "#/" and "#/workspace" stay explicit.
export function routeFromHash(
  hash: string,
  current: Route = "workspace",
  signedIn = false,
): Route {
  if (hash === "" || hash === "#") return signedIn ? "workspace" : "start";
  if (!hash.startsWith("#/")) return current;
  const name = hash.slice(2).split(/[/?#]/)[0];
  return name === "start" || name === "request" ? name : "workspace";
}

const knownRoutes = new Set(["", "start", "request", "workspace"]);
/** First load: unknown routes and in-page anchors (e.g. #try) count as no hash. */
export function initialRoute(hash: string, signedIn = false): Route {
  const name = hash.startsWith("#/") ? hash.slice(2).split(/[/?#]/)[0] : null;
  if (name !== null && knownRoutes.has(name)) return routeFromHash(hash);
  return signedIn ? "workspace" : "start";
}

export default function Root() {
  // Sign-in state is synchronous in-memory state, so the first render is
  // already correct and nothing flashes.
  const [route, setRoute] = useState<Route>(() =>
    initialRoute(location.hash, isSignedIn()),
  );
  // Focus moves to the new page only after a navigation, not on first load,
  // so the skip link stays the first Tab stop.
  const navigated = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    // Make the landing visible in the URL without adding a history entry:
    // on first load for any non-route hash, later only for an empty hash
    // (in-page anchors after load keep their place).
    const empty = location.hash === "" || location.hash === "#";
    const firstLoad = !mounted.current;
    mounted.current = true;
    if (route === "start" && !location.hash.startsWith("#/start") && (firstLoad || empty))
      history.replaceState(null, "", "#/start");
  }, [route]);
  useEffect(() => {
    // One listener, so the navigation flag is set before the new page renders.
    const onHash = () => {
      navigated.current = true;
      setRoute((r) => routeFromHash(location.hash, r, isSignedIn()));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (route === "workspace") return;
    window.scrollTo?.(0, 0);
    document.title =
      route === "start"
        ? "Fiduciary OS — How the Symphony Composer works"
        : "Fiduciary OS — Request advice and choose a plan";
  }, [route]);
  if (route === "start") return <LandingPage focusOnMount={navigated.current} />;
  if (route === "request") return <RequestPage focusOnMount={navigated.current} />;
  return <App />;
}
