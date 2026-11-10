import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Root from "./funnel/Root";
import { isSignedIn, resetSessionSignal } from "./session-signal";
vi.mock("./BlueprintTools", () => ({ default: () => null }));

const plan = {
  id: "plan",
  version: 1,
  updatedAt: "2026-11-08T08:00:00Z",
  inputs: {
    name: "My test plan", asOf: "2026-11-08", source: "Manual synthetic fixture",
    balances: { cash: 1000000, bonds: 0, equities: 0, other: 0 },
    monthlyIncomeCents: 100000, monthlySpendingCents: 50000,
    annualReturnBps: 0, annualFeeBps: 0, annualInflationBps: 0, years: 1,
  },
  projection: {
    initialCents: 1000000, monthlySurplusCents: 50000, depletionMonth: null,
    methodVersion: "monthly-cashflow-v1", assumptions: "Constant rates; illustrative scenario only.",
    rows: [
      { year: 0, nominalCents: 1000000, realCents: 1000000, cumulativeFeesCents: 0, cumulativeUnfundedCents: 0 },
      { year: 1, nominalCents: 1600000, realCents: 1600000, cumulativeFeesCents: 0, cumulativeUnfundedCents: 0 },
    ],
  },
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  resetSessionSignal();
  history.replaceState(null, "", "#/workspace");
});

async function signInToFinancialWorkspace() {
  fireEvent.click(screen.getByRole("button", { name: "Financial workspace" }));
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "test@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByLabelText("Plan name");
}

describe("sign-in aware default route", () => {
  it.each([
    ["Clear local session", "Server session revoked and local session cleared."],
    ["Sign out all sessions", "All server sessions revoked and local session cleared."],
  ])("%s sends the user to #/start with the sign-out notice", async (button, notice) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ accessToken: "test" }))
      .mockResolvedValueOnce(response(plan))
      .mockResolvedValueOnce(response({ message: "Session revoked" })));
    history.replaceState(null, "", "#/workspace");
    render(<Root />);
    await signInToFinancialWorkspace();
    expect(isSignedIn()).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: button }));
    });
    await waitFor(() => expect(location.hash).toBe("#/start"));
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes(notice))).toBe(true);
    expect(isSignedIn()).toBe(false);
  });

  it("keeps the revocation warning when the server can't confirm sign-out", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ accessToken: "test" }))
      .mockResolvedValueOnce(response(plan))
      .mockRejectedValueOnce(new TypeError("offline")));
    history.replaceState(null, "", "#/workspace");
    render(<Root />);
    await signInToFinancialWorkspace();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear local session" }));
    });
    await waitFor(() => expect(location.hash).toBe("#/start"));
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText(/server revocation was not confirmed/)).toBeVisible();
  });

  it("a signed-in user who reaches an empty hash stays on the workspace", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ accessToken: "test" }))
      .mockResolvedValueOnce(response(plan)));
    history.replaceState(null, "", "#/workspace");
    render(<Root />);
    await signInToFinancialWorkspace();
    await act(async () => {
      history.replaceState(null, "", location.pathname);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByLabelText("Plan name")).toBeInTheDocument();
    expect(location.hash).toBe("");
  });
});
