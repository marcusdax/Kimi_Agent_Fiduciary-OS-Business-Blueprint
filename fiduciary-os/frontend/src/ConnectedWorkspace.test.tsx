import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import ConnectedWorkspace from "./ConnectedWorkspace";
import type { SavedAction } from "./planning-api";
const fixture: SavedAction = {
  id: "planning-fixture",
  title: "Review example planning assumptions",
  outcome: "Agree on a planning next step",
  owner: "Development account holder",
  source: "Synthetic fixture only",
  assumptions: "Inputs are unverified",
  alternatives: "Defer or seek qualified review",
  costs: "No product chosen; review potential costs",
  stage: "Waiting for approval",
  version: 4,
  authorizedVersion: null,
  reviewDate: null,
  completionEvidence: null,
  events: [
    {
      id: "event-fixture",
      actorId: "fixture-actor",
      type: "created",
      version: 1,
      details: '{"scope":"test only"}',
      createdAt: "2026-11-07T12:00:00Z",
    },
  ],
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function backend(initial: SavedAction[] = []) {
  let records = structuredClone(initial);
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/auth/login"))
      return reply({ accessToken: "synthetic-session-fixture" });
    if (init.method === "GET") return reply(records);
    if (url.endsWith("/actions")) {
      const saved = {
        ...fixture,
        ...body,
        id: "created-action",
        stage: "Gather information",
        version: 1,
        authorizedVersion: null,
      };
      records.push(saved);
      return reply(saved, 201);
    }
    const current = records[0];
    if (body.version !== current.version)
      return reply(
        { error: "This action changed. Reload it before deciding." },
        409,
      );
    const updated = { ...current, version: current.version + 1 };
    if (url.endsWith("/authorization"))
      updated.authorizedVersion = updated.version;
    if (url.endsWith("/transitions")) {
      updated.stage = body.stage;
      if (body.evidence) updated.completionEvidence = body.evidence;
    }
    if (url.endsWith("/revoke-authorization")) {
      updated.authorizedVersion = null;
      updated.stage = "Waiting for approval";
    }
    if (url.endsWith("/review-date")) {
      updated.reviewDate = body.reviewDate;
    }
    records = [updated];
    return reply(updated);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "developer@example.test");
  await user.type(
    screen.getByLabelText("Password"),
    "synthetic-password-fixture",
  );
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Your saved planning actions" });
  return user;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("saved planning workspace", () => {
  it("starts without requests and never implies connected financial accounts", () => {
    const fetch = backend();
    render(<ConnectedWorkspace />);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText(/advisor sharing is not implemented/),
    ).toBeVisible();
  });
  it("signs in without browser-token storage and clears local access on request", async () => {
    backend();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<ConnectedWorkspace />);
    const user = await signIn();
    expect(
      screen.getByRole("heading", { name: "No saved actions yet" }),
    ).toBeVisible();
    expect(storage).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Clear local session" }),
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "remain valid until expiry",
    );
  });
  it("separates keyboard-recorded authorization from moving to In progress, preserves focus, and requires evidence", async () => {
    const fetch = backend([fixture]);
    render(<ConnectedWorkspace />);
    const user = await signIn();
    await user.click(
      screen.getByRole("button", { name: new RegExp(fixture.title) }),
    );
    const start = screen.getByRole("button", { name: "Move to In progress" });
    expect(start).toBeDisabled();
    const checkbox = screen.getByRole("checkbox");
    checkbox.focus();
    await user.keyboard(" ");
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Record planning authorization" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: fixture.title }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for approval",
    );
    expect(
      screen.getByRole("button", { name: "Move to In progress" }),
    ).toBeEnabled();
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/transitions")),
    ).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Move to In progress" }),
    );
    await screen.findByRole("button", { name: "Move to Verified complete" });
    expect(
      screen.getByRole("button", { name: "Move to Verified complete" }),
    ).toBeDisabled();
    await user.type(
      screen.getByLabelText("Completion evidence"),
      "Synthetic planning meeting evidence.",
    );
    await user.click(
      screen.getByRole("button", { name: "Move to Verified complete" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Verified complete"),
    );
    expect(
      screen.getByText("Synthetic planning meeting evidence."),
    ).toBeVisible();
  });
  it("creates only explicitly supplied records, not sample-preview cards", async () => {
    const fetch = backend();
    render(<ConnectedWorkspace />);
    const user = await signIn();
    await user.click(screen.getByText("Create a planning action"));
    for (const label of [
      "Action title",
      "Intended outcome",
      "Responsible for next step",
      "Source and verification date",
      "Assumptions and known gaps",
      "Alternatives considered",
      "Costs and conflicts to review",
    ])
      await user.type(
        screen.getByLabelText(label),
        "Synthetic planning context",
      );
    await user.click(
      screen.getByRole("button", { name: "Save planning action" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Planning action saved",
      ),
    );
    const creates = fetch.mock.calls.filter(
      ([url, init]) => url.endsWith("/actions") && init.method === "POST",
    );
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0][1].body))).not.toHaveProperty("stage");
  });
  it("reports a version conflict without retrying or changing the displayed record", async () => {
    const fetch = backend([{ ...fixture, stage: "Analyze choices" }]);
    render(<ConnectedWorkspace />);
    const user = await signIn();
    await user.click(
      screen.getByRole("button", { name: new RegExp(fixture.title) }),
    );
    fetch.mockImplementationOnce(async () =>
      reply({ error: "This action changed. Reload it before deciding." }, 409),
    );
    await user.click(
      screen.getByRole("button", { name: "Move to Ready for review" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload saved actions",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Ready for review",
    );
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/transitions")),
    ).toHaveLength(1);
  });
  it("clears protected records if a session expires", async () => {
    const fetch = backend([fixture]);
    render(<ConnectedWorkspace />);
    const user = await signIn();
    fetch.mockImplementationOnce(async () =>
      reply({ error: "Token expired" }, 401),
    );
    await user.click(
      screen.getByRole("button", { name: "Reload saved actions" }),
    );
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: new RegExp(fixture.title) }),
    ).not.toBeInTheDocument();
  });
  it("has no automated accessibility violations in sign-in and saved-board views (browser contrast review remains)", async () => {
    backend([fixture]);
    const { container } = render(<ConnectedWorkspace />);
    expect(
      (
        await axe.run(container, {
          rules: {
            "color-contrast": { enabled: false },
            region: { enabled: false },
          },
        })
      ).violations,
    ).toEqual([]);
    await signIn();
    expect(
      (
        await axe.run(container, {
          rules: {
            "color-contrast": { enabled: false },
            region: { enabled: false },
          },
        })
      ).violations,
    ).toEqual([]);
  }, 20000);
});
