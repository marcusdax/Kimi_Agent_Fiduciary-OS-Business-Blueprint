import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ToolDiscovery, { toolInfo } from "./ToolDiscovery";
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
describe("Canonical tools discovery", () => {
  it("finds Roth conversion by synonym and routes only the actual tax tool", async () => {
    const u = userEvent.setup(),
      select = vi.fn(() => true);
    render(<ToolDiscovery onSelect={select} />);
    await u.click(screen.getByRole("button", { name: "Tools" }));
    expect(
      screen.getByLabelText("Search tools or a specific feature"),
    ).toHaveFocus();
    await u.type(
      screen.getByLabelText("Search tools or a specific feature"),
      "Roth",
    );
    await u.click(
      screen.getByRole("button", {
        name: "2026 basic federal conversion illustration",
      }),
    );
    expect(select).toHaveBeenCalledWith("tax");
    expect(screen.getByRole("button", { name: "Tools" })).toHaveFocus();
  });
  it("keeps research hidden until explicit opt-in and never makes it a launch button", async () => {
    const u = userEvent.setup();
    render(<ToolDiscovery onSelect={() => true} />);
    await u.click(screen.getByRole("button", { name: "Tools" }));
    expect(
      screen.queryByText("Monte Carlo and efficient frontier"),
    ).not.toBeInTheDocument();
    await u.click(screen.getByLabelText("Include research tools"));
    expect(
      screen.getByText("Monte Carlo and efficient frontier"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Monte Carlo and efficient frontier",
      }),
    ).not.toBeInTheDocument();
    expect(Object.keys(toolInfo)).toHaveLength(10);
  });
  it("retains the dialog on dirty-guard rejection and restores focus on Escape", async () => {
    const u = userEvent.setup();
    render(<ToolDiscovery onSelect={() => false} />);
    await u.click(screen.getByRole("button", { name: "Tools" }));
    await u.click(screen.getByRole("button", { name: "Profile and goals" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      screen.getAllByText(/Resolve unsaved or uncertain changes/).length,
    ).toBeGreaterThan(0);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tools" })).toHaveFocus();
  });
});
