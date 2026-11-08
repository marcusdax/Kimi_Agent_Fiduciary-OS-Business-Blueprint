import { describe, expect, it } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import App from "./App";

describe("Fiduciary OS workspace", () => {
  it("labels the sample scope and never claims a live connection", () => {
    render(<App />);
    expect(
      screen.getByText(/Nothing is linked, sent, or executed/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A clearer picture. A next step.",
    );
    expect(screen.getByText("$2,800")).toBeInTheDocument();
  });
  it("opens every navigation destination and explains document limits", async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    for (const name of [
      "My plan",
      "Compare choices",
      "Next steps",
      "Documents",
      "Planning team",
      "Overview",
    ]) {
      await user.click(
        within(nav).getByRole("button", { name: new RegExp(`^${name}`) }),
      );
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    }
    await user.click(within(nav).getByRole("button", { name: "Documents" }));
    expect(
      screen.getByText(/No files are uploaded or stored/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Social Security statement/ }),
    );
    expect(
      screen.getByRole("status", { name: "Document guidance" }),
    ).toHaveTextContent(
      "This preview has no upload, download, or storage integration.",
    );
  });
  it("recalculates the comparison and refuses invalid inputs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Explore my income choices" }),
    );
    const spending = screen.getByLabelText("Monthly spending ($)");
    await user.clear(spending);
    await user.type(spending, "7000");
    expect(screen.getByRole("table")).toHaveTextContent("$3,600");
    await user.clear(screen.getByLabelText("Planning portfolio ($)"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("creates a new snapshot without inheriting approval", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Explore my income choices" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Prepare a planning discussion" }),
    );
    const details = screen.getByRole("region", {
      name: "Selected action details",
    });
    expect(details).toHaveTextContent("Inputs attached to this decision");
    expect(details).toHaveTextContent("Not approved.");
    expect(
      screen.getByText("4 open actions · 0 completed"),
    ).toBeInTheDocument();
  });
  it("supports keyboard-only review, approval and completion with focus and announcements", async () => {
    const user = userEvent.setup();
    render(<App />);
    const audience = screen.getByLabelText("Demo audience");
    await user.selectOptions(audience, "advisor");
    const open = screen.getByRole("button", {
      name: /Compare retirement income choices/,
    });
    open.focus();
    await user.keyboard("{Enter}");
    const note = screen.getByLabelText("Alternatives and tradeoffs");
    note.focus();
    await user.keyboard(
      "Compare keeping spending unchanged with spending less.",
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Update stage" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Update stage" }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "moved to Ready for review",
    );
    screen.getByLabelText("Reviewer rationale").focus();
    await user.keyboard(
      "Reviewed source assumptions and explained both alternatives.",
    );
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent(
      "moved to Waiting for approval",
    );
    await user.selectOptions(audience, "household");
    screen.getByLabelText("Scope of this specific approval").focus();
    await user.keyboard(
      "Approve this exact illustrative planning discussion only.",
    );
    await user.tab();
    await user.keyboard(" ");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent(
      "moved to In progress",
    );
    await user.selectOptions(audience, "advisor");
    screen.getByLabelText("Completion evidence").focus();
    await user.keyboard(
      "Sample discussion completed and summary recorded in the demo.",
    );
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent(
      "moved to Verified complete",
    );
    expect(
      screen.getByRole("button", { name: "Open linked review" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open linked review" }),
    );
    expect(
      screen.getByText("3 open actions · 1 completed"),
    ).toBeInTheDocument();
  });
  it("does not allow household users to advance team review", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Compare retirement income choices/ }),
    );
    await user.type(
      screen.getByLabelText("Alternatives and tradeoffs"),
      "A sufficient explanation of alternatives.",
    );
    await user.click(screen.getByRole("button", { name: "Update stage" }));
    expect(screen.getByRole("alert")).toHaveTextContent("planning-team");
  });
  it("routes each life goal to the relevant planning action", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Protect the people I love" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Review protection questions" }),
    );
    expect(
      screen.getByRole("region", { name: "Selected action details" }),
    ).toHaveTextContent("Discuss a protection review");
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).getByRole("button", { name: "Overview" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Leave a thoughtful legacy" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Prepare a legacy review" }),
    );
    expect(
      screen.getByRole("region", { name: "Selected action details" }),
    ).toHaveTextContent("Confirm beneficiary details");
  });
  it("resets all transient sample changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Protect the people I love" }),
    );
    await user.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(
      screen.getByRole("button", { name: "A confident retirement" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("has no automated accessibility violations in main destinations (contrast checked separately)", async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const view of [
      "Overview",
      "Compare choices",
      "Next steps",
      "Documents",
    ]) {
      await user.click(
        within(
          screen.getByRole("navigation", { name: "Main navigation" }),
        ).getByRole("button", { name: new RegExp(`^${view}`) }),
      );
      const result = await axe.run(document.body, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.description}`)).toEqual(
        [],
      );
    }
  }, 20000);
});
