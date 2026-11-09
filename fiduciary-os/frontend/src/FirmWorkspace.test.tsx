import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import FirmWorkspace from "./FirmWorkspace";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function mockApi() {
  let households: unknown[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const m = init.method ?? "GET";
    if (url.endsWith("/auth/login")) return json({ accessToken: "tok" });
    if (url.endsWith("/org/firms") && m === "POST")
      return json({ id: "f1", name: "Acme" }, 201);
    if (url.endsWith("/org/firms/f1/households") && m === "POST") {
      households = [{ id: "h1", name: "Smith", firmId: "f1" }];
      return json({ id: "h1" }, 201);
    }
    if (url.endsWith("/org/households") && m === "GET") return json(households);
    if (url.endsWith("/org/households/h1") && m === "GET")
      return json({
        id: "h1",
        name: "Smith",
        firm: "Acme",
        clients: [{ id: "c1", name: "Pat" }],
        access: "firm owner",
      });
    if (url.endsWith("/org/households/h1/assignments"))
      return json({ error: "Firm owner only" }, 403);
    return json({ error: "unexpected " + url }, 500);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "a@b.test");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Firms and households" });
}

describe("FirmWorkspace", () => {
  it("signs in, creates a firm and household, and shows access reason", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<FirmWorkspace />);
    await signIn(user);
    await user.type(screen.getByLabelText("Firm name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create firm" }));
    await screen.findByText(/Firm "Acme" created/);
    await user.type(screen.getByLabelText("Household name"), "Smith");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    await user.click(await screen.findByRole("button", { name: "Smith" }));
    expect(await screen.findByText(/Your access: firm owner/)).toBeTruthy();
    expect(screen.getByText("Pat")).toBeTruthy();
  });

  it("shows the API's permission error instead of failing silently", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<FirmWorkspace />);
    await signIn(user);
    await user.type(screen.getByLabelText("Firm name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create firm" }));
    await user.type(screen.getByLabelText("Household name"), "Smith");
    await user.click(screen.getByRole("button", { name: "Create household" }));
    await user.click(await screen.findByRole("button", { name: "Smith" }));
    await user.type(
      await screen.findByLabelText("Assign advisor by email"),
      "x@y.test",
    );
    await user.click(screen.getByRole("button", { name: "Assign advisor" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Firm owner only/,
    );
  });

  it("has no axe violations when signed in", async () => {
    mockApi();
    const user = userEvent.setup();
    const { container } = render(<FirmWorkspace />);
    await signIn(user);
    await waitFor(async () => {
      const r = await axe.run(container);
      expect(r.violations).toEqual([]);
    });
  });
});
