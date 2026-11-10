import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import Root, { initialRoute, routeFromHash } from "./Root";
import userEvent from "@testing-library/user-event";
import { resetSessionSignal, setSessionToken } from "../session-signal";

afterEach(() => {
  resetSessionSignal();
  history.replaceState(null, "", "#/workspace");
});

describe("funnel routing", () => {
  it("only treats #/ hashes as routes and picks the empty-hash default by sign-in", () => {
    expect(routeFromHash("")).toBe("start");
    expect(routeFromHash("#")).toBe("start");
    expect(routeFromHash("", "workspace", true)).toBe("workspace");
    expect(routeFromHash("#", "start", true)).toBe("workspace");
    for (const signedIn of [false, true]) {
      expect(routeFromHash("#/start", "workspace", signedIn)).toBe("start");
      expect(routeFromHash("#/request", "workspace", signedIn)).toBe("request");
      expect(routeFromHash("#/workspace", "start", signedIn)).toBe("workspace");
      expect(routeFromHash("#/", "start", signedIn)).toBe("workspace");
      expect(routeFromHash("#/anything", "start", signedIn)).toBe("workspace");
      expect(routeFromHash("#main", "start", signedIn)).toBe("start");
      expect(routeFromHash("#fx-try", "request", signedIn)).toBe("request");
    }
  });
  it("sends a visitor with no hash to #/start without rendering the workspace first", () => {
    history.replaceState(null, "", location.pathname);
    const { container } = render(<Root />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(container.querySelector(".app")).toBeNull();
    expect(location.hash).toBe("#/start");
  });
  it("keeps a signed-in user with no hash on the workspace", () => {
    setSessionToken("test", "synthetic");
    history.replaceState(null, "", location.pathname);
    render(<Root />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next step, clearer.");
    expect(location.hash).toBe("");
  });
  it.each([
    ["#/start", "Your retirement, composed and tuned."],
    ["#/request", "Tell us what you need"],
    ["#/workspace", "Your next step, clearer."],
    ["#/", "Your next step, clearer."],
  ])("respects explicit %s for visitors and signed-in users", (hash, heading) => {
    for (const signedIn of [false, true]) {
      resetSessionSignal();
      if (signedIn) setSessionToken("test", "synthetic");
      history.replaceState(null, "", hash);
      const { unmount } = render(<Root />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
      expect(location.hash).toBe(hash);
      unmount();
    }
  });
  it("switches pages on hash change and moves focus to the new page", async () => {
    history.replaceState(null, "", "#/workspace");
    render(<Root />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next step, clearer.");
    await act(async () => {
      location.hash = "#/start";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveFocus();
    await act(async () => {
      location.hash = "#/request";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell us what you need");
  });
  it.each(["#/start", "#/request"])("%s never promises professional review and says sample only", (hash) => {
    history.replaceState(null, "", hash);
    render(<Root />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/qualified professional|reviewed by an? (advisor|professional)|reviewed with you/i);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Sample results only, not advice.");
  });
  it.each(["#try", "#fx-try", "#main", "#/unknown"])(
    "treats %s on first load like no hash",
    (hash) => {
      expect(initialRoute(hash, false)).toBe("start");
      expect(initialRoute(hash, true)).toBe("workspace");
      history.replaceState(null, "", hash);
      const { unmount } = render(<Root />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
      expect(location.hash).toBe("#/start");
      unmount();
      setSessionToken("test", "synthetic");
      history.replaceState(null, "", hash);
      render(<Root />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next step, clearer.");
    },
  );
  it("keeps the page for in-page anchors after load", async () => {
    history.replaceState(null, "", "#/start");
    render(<Root />);
    await act(async () => {
      location.hash = "#fx-try";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(location.hash).toBe("#fx-try");
  });
  it("moves focus to the new page after activating a nav link with the keyboard", async () => {
    const u = userEvent.setup();
    history.replaceState(null, "", "#/start");
    render(<Root />);
    screen.getByRole("link", { name: "Request advice & plans" }).focus();
    await u.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell us what you need"),
    );
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });
  it("does not steal focus from the skip link on first load", () => {
    history.replaceState(null, "", "#/start");
    render(<Root />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(screen.getByRole("main")).not.toHaveFocus();
  });
});
