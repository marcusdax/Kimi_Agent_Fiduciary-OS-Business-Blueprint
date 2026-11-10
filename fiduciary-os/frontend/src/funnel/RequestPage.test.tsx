import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import RequestPage from "./RequestPage";
import { recommendPlan, validateRequest, emptyRequest } from "./request";

afterEach(() => vi.restoreAllMocks());

async function fillValid(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByLabelText("Have a steady retirement income"));
  await u.click(screen.getByLabelText("Nearing retirement"));
  await u.selectOptions(screen.getByLabelText(/When do you want this plan/), "In 1 to 5 years");
  await u.click(screen.getByLabelText("With a dedicated advisor"));
  await u.click(screen.getByLabelText("Email"));
  await u.type(screen.getByLabelText("Your name"), "Sam Rivera");
  await u.type(screen.getByLabelText("Email address"), "sam@example.com");
  await u.click(screen.getByLabelText(/You may contact me about this request only/));
}

describe("advice request and plans", () => {
  it("validates required answers, lists errors and focuses the summary", async () => {
    const u = userEvent.setup();
    render(<RequestPage />);
    await u.click(screen.getByRole("button", { name: "Review my request" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent("Please fix 5 things");
    await u.click(within(summary).getByRole("link", { name: "Choose a timeline." }));
    expect(screen.getByLabelText(/When do you want this plan/)).toHaveFocus();
    expect(screen.queryByText(/not sent yet/)).not.toBeInTheDocument();
  });

  it("requires a valid email and contact consent when email is chosen", () => {
    const base = { ...emptyRequest, goal: "g", stage: "s", timeline: "t", help: "h", contactMethod: "Email", name: "A" };
    expect(validateRequest({ ...base, email: "nope" }).email).toMatch(/email address/);
    expect(validateRequest({ ...base, email: "a@b.co" }).consent).toMatch(/Confirm/);
    expect(validateRequest({ ...base, email: "a@b.co", consent: true })).toEqual({});
    expect(validateRequest({ ...base, contactMethod: "Phone", phone: "555", consent: true }).phone).toMatch(/10 digits/);
    expect(validateRequest({ ...base, contactMethod: "Don't contact me yet", name: "" })).toEqual({});
  });

  it("holds a valid request on the page without sending, storing or signing up", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const u = userEvent.setup();
    render(<RequestPage />);
    await fillValid(u);
    await u.click(screen.getByRole("button", { name: "Review my request" }));
    const held = await screen.findByRole("status", { name: "Request ready — not sent yet" });
    await waitFor(() => expect(held).toHaveFocus());
    expect(held).toHaveTextContent("not sent");
    expect(held).toHaveTextContent("no account was created");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/account (has been )?created|welcome aboard|you're signed up|subscribed/i);
    // Changing an answer clears the held preview rather than silently editing it.
    await u.click(screen.getByLabelText("Retired"));
    expect(screen.queryByRole("status", { name: /not sent yet/ })).not.toBeInTheDocument();
  });

  it("shows three plans with no prices or checkout, and highlights the fit", async () => {
    const u = userEvent.setup();
    render(<RequestPage />);
    const plans = screen.getAllByRole("article");
    expect(plans.map((p) => within(p).getByRole("heading").textContent)).toEqual(["Free", "Premium", "Advisor-led"]);
    for (const p of plans) {
      expect(within(p).getByText("Price to be set")).toBeVisible();
      expect(p.textContent).not.toMatch(/\$|\/mo|per month|per year/i);
    }
    expect(screen.queryByRole("button", { name: /checkout|subscribe|pay|buy/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested for you")).not.toBeInTheDocument();
    await u.click(screen.getByLabelText("Guided, with occasional review"));
    expect(within(plans[1]).getByText("Suggested for you")).toBeVisible();
    expect(within(plans[2]).getByText(/Advisor access isn't built yet/)).toBeVisible();
    const interest = screen.getByRole("button", { name: "I'm interested in Premium" });
    await u.click(interest);
    expect(interest).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/noted on this page only. No checkout and no charge/)).toBeInTheDocument();
  });

  it("marks every plan feature that isn't built yet", () => {
    render(<RequestPage />);
    const [free, premium, advisor] = screen.getAllByRole("article");
    expect(within(free).queryByText("Not built yet")).not.toBeInTheDocument();
    const item = (card: HTMLElement, text: string) => within(card).getAllByRole("listitem").find((li) => li.textContent?.startsWith(text))!;
    expect(item(premium, "Review reminders")).toHaveTextContent("Not built yet");
    expect(item(premium, "Roth and income planners")).toHaveTextContent("Not built yet");
    expect(item(premium, "Saved financial workspace")).not.toHaveTextContent("Not built yet");
    expect(within(premium).getByText(/no reminders are sent/)).toBeVisible();
    expect(item(advisor, "Advisor reviews your plan")).toHaveTextContent("Not built yet");
    expect(item(advisor, "Decisions shared with your advisor")).toHaveTextContent("Not built yet");
    expect(within(advisor).getByText(/Advisor access isn't built yet/)).toBeVisible();
  });

  it("maps help choices to plans", () => {
    expect(recommendPlan("On my own, with the guide")).toBe("free");
    expect(recommendPlan("With a dedicated advisor")).toBe("advisor");
    expect(recommendPlan("")).toBeUndefined();
  });

  it("passes axe with the contact fields open", async () => {
    const u = userEvent.setup();
    const { container } = render(<RequestPage />);
    await u.click(screen.getByLabelText("Phone"));
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
