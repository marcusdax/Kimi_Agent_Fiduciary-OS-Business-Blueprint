import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import App from "./App";
describe("Fiduciary OS workspace", () => {
  it("opens with a clear sample-data boundary and navigates every section", async () => {
    const u = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your next step, clearer.",
    );
    expect(screen.getByText(/Sample tools use example data/)).toBeVisible();
    for (const page of [
      "My plan",
      "Compare choices",
      "Next steps",
      "Documents",
      "Planning team",
      "Overview",
    ]) {
      await u.click(screen.getByRole("button", { name: page }));
      expect(screen.getByRole("button", { name: page })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
    expect(screen.getByText(/No financial accounts connected/)).toBeVisible();
  });
  it("updates a goal without connecting any accounts", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(screen.getByRole("button", { name: "My plan" }));
    await u.click(screen.getByRole("button", { name: /Protection/ }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sample goal changed to Protection",
    );
  });
  it("validates comparison inputs and labels the formula", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(screen.getByRole("button", { name: "Compare choices" }));
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByText(/Annual portfolio draw = portfolio/)).toBeVisible();
    await u.clear(screen.getByLabelText("Planning horizon (years)"));
    expect(screen.getByRole("alert")).toHaveTextContent("Complete all three");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("distinguishes the planning-team view from access control", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.selectOptions(screen.getByLabelText("View as"), "Planning team");
    await u.click(screen.getByRole("button", { name: /Next steps/ }));
    expect(
      screen.getByRole("heading", { name: "Client action board" }),
    ).toBeVisible();
  });
  it("opens action details from the keyboard, focuses their heading, and announces the selected record", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Next steps" }));
    const card = screen.getByRole("button", {
      name: /Review beneficiary information.*Review action/,
    });
    card.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Review beneficiary information" }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Opened Review beneficiary information",
    );
  });
  it("supports keyboard-only status changes, announces them, gates authorization and completion", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(screen.getByRole("button", { name: /Next steps/ }));
    const move = screen.getByRole("button", {
      name: "Move Compare planning horizons to Ready for review",
    });
    move.focus();
    await u.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Ready for review");
    expect(
      screen.getByRole("button", {
        name: "Move Compare planning horizons to Waiting for approval",
      }),
    ).toHaveFocus();
    await u.keyboard("{Enter}");
    const authorization = screen.getByRole("button", {
      name: "Move Compare planning horizons to In progress",
    });
    expect(authorization).toBeDisabled();
    const checkbox = screen.getByRole("checkbox");
    checkbox.focus();
    await u.keyboard(" ");
    await u.tab();
    const recordAuthorization = screen.getByRole("button", {
      name: "Record demo planning authorization",
    });
    expect(recordAuthorization).toHaveFocus();
    await u.keyboard("{Enter}");
    await waitFor(() => expect(authorization).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("card has not moved");
    await u.keyboard("{Enter}");
    const completion = screen.getByRole("button", {
      name: "Move Compare planning horizons to Verified complete",
    });
    expect(completion).toBeDisabled();
    const proof = screen.getByLabelText("Sample completion evidence");
    proof.focus();
    await u.keyboard("Sample outcome reviewed.");
    await u.tab();
    expect(completion).toHaveFocus();
    await u.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Compare planning horizons" }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Verified complete");
    expect(screen.getByText(/history stays intact/)).toBeVisible();
  });
  it("has no automatically detected accessibility violations in key views (contrast needs browser review)", async () => {
    const u = userEvent.setup();
    const { container } = render(<App />);
    for (const page of ["Overview", "Compare choices", "Next steps"]) {
      if (page !== "Overview")
        await u.click(screen.getByRole("button", { name: page }));
      const result = await axe.run(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations.map((v) => v.id)).toEqual([]);
    }
  }, 20000);
});
