import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Root, { routeFromHash } from "./Root";

afterEach(() => {
  history.replaceState(null, "", "#");
});

describe("funnel routing", () => {
  it("only treats #/ hashes as routes", () => {
    expect(routeFromHash("")).toBe("workspace");
    expect(routeFromHash("#/start")).toBe("start");
    expect(routeFromHash("#/request")).toBe("request");
    expect(routeFromHash("#/anything")).toBe("workspace");
    expect(routeFromHash("#main", "start")).toBe("start");
    expect(routeFromHash("#fx-try", "start")).toBe("start");
  });
  it("keeps the workspace as the default and switches pages on hash change", async () => {
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
  it("does not steal focus from the skip link on first load", () => {
    history.replaceState(null, "", "#/start");
    render(<Root />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(screen.getByRole("main")).not.toHaveFocus();
  });
});
