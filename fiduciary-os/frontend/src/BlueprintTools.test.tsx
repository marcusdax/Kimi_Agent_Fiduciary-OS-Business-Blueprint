import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlueprintTools from "./BlueprintTools";
const catalog = {
  profile: {
    title: "Profile & goals",
    note: "Manual facts",
    fields: [{ key: "age", label: "Current age", min: 18, max: 100, step: 1 }],
  },
};
const scenario = {
  kind: "profile",
  version: 1,
  updatedAt: "2026-11-08T09:00:00Z",
  inputs: { source: "Synthetic fixture", asOfDate: "2026-01-01", age: 40 },
  result: {
    methodVersion: "test-method",
    notice: "Manual facts",
    metrics: [{ label: "Years to target", value: 20, unit: "years" }],
    rows: [
      { year: 0, balance: 1000 },
      { year: 1, balance: 1100 },
    ],
  },
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());
describe("Blueprint tools", () => {
  it("loads saved sources, preserves confirmed charts and saves expected version", async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) =>
      url.endsWith("/catalog")
        ? response(catalog)
        : options?.method === "PUT"
          ? response({ ...scenario, version: 2 })
          : response([scenario]),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<BlueprintTools token="synthetic-token" />);
    await screen.findByText(/Saved v1/);
    expect(screen.getByText(/Source: Synthetic fixture/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Profile & goals: Current age"), {
      target: { value: "41" },
    });
    expect(screen.getByText(/Unsaved inputs/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save Profile & goals & calculate" }),
    );
    await screen.findByText(/Saved v2/);
    const write = fetcher.mock.calls.find((call) => call[1]?.method === "PUT")!;
    expect(JSON.parse(write[1]!.body as string)).toMatchObject({
      version: 1,
      inputs: { age: 41 },
    });
    expect(
      screen.getByRole("img", { name: /saved scenario/ }),
    ).toBeInTheDocument();
  });
  it("locks uncertain writes without automatic retry and recovers through reload", async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") throw new Error("Synthetic response loss");
      return url.endsWith("/catalog")
        ? response(catalog)
        : response([scenario]);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<BlueprintTools token="synthetic-token" />);
    await screen.findByText(/Saved v1/);
    fireEvent.click(
      screen.getByRole("button", { name: "Save Profile & goals & calculate" }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Profile & goals: Current age"),
      ).toBeDisabled(),
    );
    expect(
      fetcher.mock.calls.filter((call) => call[1]?.method === "PUT"),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard draft & reload tools" }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Profile & goals: Current age"),
      ).not.toBeDisabled(),
    );
  });
  it("shows unavailable feeds with provenance and never invents a valuation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/catalog")
          ? response(catalog)
          : url.endsWith("/observations")
            ? response([
                {
                  key: "crypto",
                  provider: "Synthetic provider fixture",
                  providerUrl: "https://example.test/data",
                  unit: "USD per coin",
                  currency: "USD",
                  ttlSeconds: 900,
                  fetchedAt: null,
                  observedAt: null,
                  status: "unavailable",
                  error: "UPSTREAM_UNAVAILABLE_OR_INVALID",
                  points: [],
                },
              ])
            : response([]),
      ),
    );
    render(<BlueprintTools token="synthetic-token" />);
    await screen.findByRole("button", { name: "Profile & goals" });
    fireEvent.click(
      screen.getByRole("button", { name: "Load public observations" }),
    );
    await screen.findByText(/Synthetic provider fixture — unavailable/);
    expect(
      screen.getByText("Unavailable; no invented replacement values."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Valuation and P&L are unavailable otherwise/),
    ).toBeInTheDocument();
  });
  it("fails closed on malformed reload data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ unexpected: true })),
    );
    render(<BlueprintTools token="synthetic-token" />);
    await screen.findByText(/Tool response invalid/);
    expect(
      screen.queryByRole("button", { name: /Save Profile/ }),
    ).not.toBeInTheDocument();
  });
});
