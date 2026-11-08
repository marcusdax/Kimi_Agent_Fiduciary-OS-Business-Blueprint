import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FinancialWorkspace from "./FinancialWorkspace";
const inputs = {
  name: "My test plan",
  asOf: "2026-11-08",
  source: "Manual synthetic fixture",
  balances: { cash: 1000000, bonds: 0, equities: 0, other: 0 },
  monthlyIncomeCents: 100000,
  monthlySpendingCents: 50000,
  annualReturnBps: 0,
  annualFeeBps: 0,
  annualInflationBps: 0,
  years: 2,
};
const plan = {
  id: "plan",
  version: 1,
  updatedAt: "2026-11-08T08:00:00Z",
  inputs,
  projection: {
    initialCents: 1000000,
    monthlySurplusCents: 50000,
    depletionMonth: null,
    methodVersion: "monthly-cashflow-v1",
    assumptions: "Constant rates; illustrative scenario only.",
    rows: [
      {
        year: 0,
        nominalCents: 1000000,
        realCents: 1000000,
        cumulativeFeesCents: 0,
        cumulativeUnfundedCents: 0,
      },
      {
        year: 1,
        nominalCents: 1600000,
        realCents: 1600000,
        cumulativeFeesCents: 0,
        cumulativeUnfundedCents: 0,
      },
      {
        year: 2,
        nominalCents: 2200000,
        realCents: 2200000,
        cumulativeFeesCents: 0,
        cumulativeUnfundedCents: 0,
      },
    ],
  },
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
async function login() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "test@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByLabelText("Plan name");
}
afterEach(() => vi.unstubAllGlobals());
describe("financial workspace", () => {
  it("shows manual-data boundaries, saved allocation, accessible chart and exact table", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ accessToken: "test" }))
        .mockResolvedValueOnce(response(plan)),
    );
    render(<FinancialWorkspace />);
    await login();
    expect(
      screen.getByRole("img", { name: /Saved financial plan balances/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Manual synthetic fixture", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: /Saved asset snapshot/ }),
    ).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
  it("saves versioned inputs and does not invent price history", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ accessToken: "test" }))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response(plan));
    vi.stubGlobal("fetch", fetcher);
    render(<FinancialWorkspace />);
    await login();
    fireEvent.change(screen.getByLabelText("Plan name"), {
      target: { value: "My test plan" },
    });
    fireEvent.change(
      screen.getByLabelText("Input source / verification note"),
      { target: { value: "Manual synthetic fixture" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save plan and update charts" }),
    );
    await screen.findByText(/Plan saved at version 1/);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).version).toBe(0);
    expect(fetcher.mock.calls[2][0]).toContain("/financial-plan");
  });
  it("blocks saving on lost write response until successful reload without automatic retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ accessToken: "test" }))
      .mockResolvedValueOnce(response(plan))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(response({ ...plan, version: 2 }));
    vi.stubGlobal("fetch", fetcher);
    render(<FinancialWorkspace />);
    await login();
    fireEvent.click(
      screen.getByRole("button", { name: "Save plan and update charts" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save plan and update charts" }),
      ).toBeDisabled(),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved plan (discard edits)" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save plan and update charts" }),
      ).not.toBeDisabled(),
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(screen.getByText(/Saved v2/)).toBeInTheDocument();
  });
  it("clears private saved data when local session is cleared", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ accessToken: "test" }))
        .mockResolvedValueOnce(response(plan)),
    );
    render(<FinancialWorkspace />);
    await login();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear local session" }),
    );
    expect(
      screen.queryByRole("img", { name: /Saved financial plan balances/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
});
