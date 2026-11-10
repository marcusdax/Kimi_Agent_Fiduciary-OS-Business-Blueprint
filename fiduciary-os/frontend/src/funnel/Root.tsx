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

export default function Root() {
  // Sign-in state is synchronous in-memory state, so the first render is
  // already correct and nothing flashes.
  const [route, setRoute] = useState<Route>(() =>
    routeFromHash(location.hash, "workspace", isSignedIn()),
  );
  useEffect(() => {
    // Make the landing visible in the URL without adding a history entry.
    if (route === "start" && (location.hash === "" || location.hash === "#"))
      history.replaceState(null, "", "#/start");
  }, [route]);
  useEffect(() => {
    const onHash = () =>
      setRoute((r) => routeFromHash(location.hash, r, isSignedIn()));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Focus moves to the new page only after a navigation, not on first load,
  // so the skip link stays the first Tab stop.
  const navigated = useRef(false);
  useEffect(() => {
    const onHash = () => (navigated.current = true);
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
