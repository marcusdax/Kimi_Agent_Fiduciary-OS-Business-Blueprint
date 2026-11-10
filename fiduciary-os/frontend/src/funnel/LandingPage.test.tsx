import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import LandingPage, { stageCopy } from "./LandingPage";

const guide = () => screen.getByRole("complementary", { name: "Your guide" });

describe("free landing page", () => {
  it("states the hero point in one alt line and labels sample results as examples", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your retirement, composed and tuned.");
    expect(screen.getByRole("img", { name: "Three planning steps linked in a path from today to retirement." })).toBeInTheDocument();
    expect(screen.getByText("Example estimate")).toBeVisible();
    expect(screen.getByText(/Not a recommendation/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/unlike any other platform/i);
    expect(document.body.textContent).not.toMatch(/guarantee(d)? (returns|results)/i);
    expect(screen.getByRole("note", { name: /needs compliance review/ })).toBeVisible();
  });

  it("walks the three chips with Step N of M, four beats, Back and Finish", async () => {
    const u = userEvent.setup();
    render(<LandingPage />);
    const g = within(guide());
    expect(g.getByText("Step 1 of 3")).toBeVisible();
    for (const beat of ["Why this matters", "What we need from you", "What the Composer found", "Your choice"])
      expect(g.getByText(beat)).toBeVisible();
    expect(g.getByRole("button", { name: "Back" })).toBeDisabled();
    const chip1 = screen.getByRole("article", { name: "Age and savings" });
    expect(chip1).toHaveAttribute("aria-current", "step");
    await u.click(g.getByRole("button", { name: "Next step" }));
    expect(g.getByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByRole("article", { name: "Spending and guaranteed income" })).toHaveAttribute("aria-current", "step");
    expect(chip1).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3: Spending and guaranteed income.");
    await u.click(g.getByRole("button", { name: "Back" }));
    expect(g.getByText("Step 1 of 3")).toBeVisible();
    await u.click(g.getByRole("button", { name: "Next step" }));
    await u.click(g.getByRole("button", { name: "Next step" }));
    expect(g.getByText("Step 3 of 3")).toBeVisible();
    expect(g.getByText(/This is an example, not a recommendation/)).toBeVisible();
    await u.click(g.getByRole("button", { name: "Finish guide" }));
    expect(g.getByText("Guide finished")).toBeVisible();
    await u.click(g.getByRole("button", { name: "Restart guide" }));
    expect(g.getByText("Step 1 of 3")).toBeVisible();
  });

  it("pauses, resumes and skips the guide from the keyboard", async () => {
    const u = userEvent.setup();
    render(<LandingPage />);
    const g = within(guide());
    const pause = g.getByRole("button", { name: "Pause guide" });
    pause.focus();
    await u.keyboard("{Enter}");
    expect(g.getByRole("button", { name: "Resume guide" })).toHaveAttribute("aria-pressed", "true");
    expect(g.getByRole("button", { name: "Next step" })).toBeDisabled();
    expect(g.getByText(/Step 1 of 3 · Paused/)).toBeVisible();
    await u.keyboard(" ");
    expect(g.getByRole("button", { name: "Pause guide" })).toHaveAttribute("aria-pressed", "false");
    expect(g.getByRole("button", { name: "Next step" })).toBeEnabled();
    await u.click(g.getByRole("button", { name: "Skip guide" }));
    expect(g.getByText("Guide off")).toBeVisible();
    expect(screen.queryByRole("article", { current: "step" })).not.toBeInTheDocument();
    // Chips keep working with the guide off.
    expect(screen.getByLabelText("Your age")).toBeEnabled();
  });

  it("recomputes the example and flags invalid inputs with a status word", async () => {
    const u = userEvent.setup();
    render(<LandingPage />);
    const result = screen.getByRole("article", { name: /How long savings could cover the gap/ });
    expect(within(result).getByText("Example ready")).toBeVisible();
    await u.clear(screen.getByLabelText("Retirement savings today ($)"));
    expect(screen.getByText(/Enter your savings/)).toBeVisible();
    expect(screen.getByLabelText("Retirement savings today ($)")).toHaveAttribute("aria-invalid", "true");
    expect(within(screen.getByRole("article", { name: "Age and savings" })).getByText("Needs info")).toBeVisible();
    expect(within(result).getByText("Waiting")).toBeVisible();
    await u.type(screen.getByLabelText("Retirement savings today ($)"), "650000");
    await u.clear(screen.getByLabelText("Yearly spending in retirement ($)"));
    await u.type(screen.getByLabelText("Yearly spending in retirement ($)"), "30000");
    expect(within(result).getByText(/Guaranteed income covers spending/)).toBeVisible();
  });

  it("gives every explain button a specific name and toggles its panel", async () => {
    const u = userEvent.setup();
    render(<LandingPage />);
    for (const name of ["Explain why we ask for age and savings", "Explain the gap between spending and guaranteed income", "Explain this estimate: sample retirement result"])
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    const b = screen.getByRole("button", { name: "Explain this estimate: sample retirement result" });
    await u.click(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/We count the years until savings run out/)).toBeVisible();
  });

  it("describes plan stages with client review and no in-place edits or money movement", () => {
    render(<LandingPage />);
    expect(screen.getAllByRole("listitem").some((li) => li.textContent?.includes("Ready for review"))).toBe(true);
    expect(stageCopy["Ready for review"]).toMatch(/^You review/);
    expect(stageCopy["Ready for review"]).not.toMatch(/advisor/i);
    expect(stageCopy["Ready for review"]).toMatch(/new version/);
    expect(stageCopy["Ready for review"]).not.toMatch(/\bedit (it|this|your)\b|edit in place/i);
    expect(stageCopy["Waiting for approval"]).toMatch(/fresh approval/);
    expect(stageCopy["In progress"]).toMatch(/never moves money/);
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("hides decorative art from assistive tech and passes axe", async () => {
    const { container } = render(<LandingPage />);
    for (const el of container.querySelectorAll(".fx-traces, .fx-hero-stack, .fx-meter"))
      expect(el.closest("[aria-hidden='true']")).not.toBeNull();
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
