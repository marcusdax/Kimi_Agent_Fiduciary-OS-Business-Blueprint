import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import axe from "axe-core";
import AdvisorCommandCenter from "./AdvisorCommandCenter";

describe("AdvisorCommandCenter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline test"));
  });

  it("renders all 5 integrated ecosystem tabs and passes axe-core accessibility audit", async () => {
    const { container } = render(<AdvisorCommandCenter />);
    expect(screen.getByRole("heading", { name: "Advisor Command Center" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Trust & Compliance/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /K-Dense Research/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Intelligence & Vault/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Nature & Regimes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Advisor Productivity/i })).toBeInTheDocument();

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("evaluates FiduciaryOSGuard and renders 10,000-bps SHAP attribution", async () => {
    render(<AdvisorCommandCenter />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluate & Sign Receipt/i }));
    await waitFor(() => {
      expect(screen.getByText("10000 bps")).toBeInTheDocument();
      expect(screen.getByText("Ed25519+ML-DSA-87")).toBeInTheDocument();
    });
  });

  it("switches to Intelligence & Vault tab and runs Document Intelligence scan", async () => {
    render(<AdvisorCommandCenter />);
    fireEvent.click(screen.getByRole("tab", { name: /Intelligence & Vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /Classify & Scan Risks/i }));
    await waitFor(() => {
      expect(screen.getByText(/liquidity_lockup/i)).toBeInTheDocument();
    });
  });
});
