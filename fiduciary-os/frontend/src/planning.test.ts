import { describe, expect, it } from "vitest";
import {
  INITIAL_INPUTS,
  Planning,
  SAMPLE_ACTIONS,
  type PlanningAction,
} from "./planning";
const team = (note = "Illustrative evidence and alternatives documented.") => ({
  audience: "advisor" as const,
  note,
  consent: false,
});
function reviewed(): PlanningAction {
  const ready = Planning.transition(
    SAMPLE_ACTIONS[0],
    "Ready for review",
    team(),
  );
  return Planning.transition(
    ready,
    "Waiting for approval",
    team("Reviewed the assumptions and discussed alternatives."),
  );
}
describe("illustrative income arithmetic", () => {
  it("derives the monthly gap and annual rate from visible assumptions", () => {
    expect(Planning.estimate(INITIAL_INPUTS)).toEqual({
      gap: 2800,
      annualDraw: 33600,
      withdrawalRate: (33600 / 920000) * 100,
      surplus: 0,
    });
  });
  it("does not turn an income surplus into a negative draw", () => {
    expect(
      Planning.estimate({ portfolio: 100000, spending: 0, income: 1000 }),
    ).toEqual({ gap: 0, annualDraw: 0, withdrawalRate: 0, surplus: 1000 });
  });
  it.each([0, -1, NaN, Infinity, 1e11])(
    "rejects invalid portfolio values %s",
    (portfolio) => {
      expect(() =>
        Planning.estimate({ ...INITIAL_INPUTS, portfolio }),
      ).toThrow();
    },
  );
  it.each([-1, NaN, Infinity, 1e8])(
    "rejects invalid spending %s",
    (spending) => {
      expect(() =>
        Planning.estimate({ ...INITIAL_INPUTS, spending }),
      ).toThrow();
    },
  );
  it("does not display NaN as money", () =>
    expect(Planning.money(NaN)).toBe("Needs input"));
});
describe("decision safeguards", () => {
  it("blocks skipped stages and blank rationale", () => {
    expect(() =>
      Planning.transition(SAMPLE_ACTIONS[0], "In progress", team()),
    ).toThrow("one stage");
    expect(() =>
      Planning.transition(SAMPLE_ACTIONS[0], "Ready for review", team(" ")),
    ).toThrow("12 characters");
  });
  it("requires preparation by the team, not the household", () => {
    expect(() =>
      Planning.transition(SAMPLE_ACTIONS[0], "Ready for review", {
        ...team(),
        audience: "household",
      }),
    ).toThrow("planning-team");
  });
  it("blocks approval by the team and requires explicit household consent", () => {
    const action = reviewed();
    expect(() => Planning.transition(action, "In progress", team())).toThrow(
      "household",
    );
    expect(() =>
      Planning.transition(action, "In progress", {
        audience: "household",
        note: "Approve this sample planning conversation.",
        consent: false,
      }),
    ).toThrow("Explicit approval");
  });
  it("requires evidence and alternatives before review", () => {
    expect(() =>
      Planning.transition(
        { ...SAMPLE_ACTIONS[2], evidence: "" },
        "Waiting for approval",
        team(),
      ),
    ).toThrow("Evidence and alternatives");
  });
  it("requires a review before approval and approval before completion", () => {
    expect(() =>
      Planning.transition({ ...reviewed(), review: "" }, "In progress", {
        ...team(),
        audience: "household",
        consent: true,
      }),
    ).toThrow("Professional review");
    expect(() =>
      Planning.transition(
        { ...reviewed(), stage: "In progress" },
        "Verified complete",
        team(),
      ),
    ).toThrow("Approval is required");
  });
  it("preserves evidence through review, approval and completion", () => {
    const waiting = reviewed();
    const approved = Planning.transition(waiting, "In progress", {
      audience: "household",
      note: "I approve this exact sample planning conversation.",
      consent: true,
    });
    const completed = Planning.transition(
      approved,
      "Verified complete",
      team("Sample discussion held; summary recorded in this preview."),
    );
    expect(completed.history).toHaveLength(5);
    expect(completed.review).toBe(waiting.review);
    expect(completed.authorization).toBe(approved.authorization);
    expect(Planning.next(completed.stage)).toBeUndefined();
    expect(Planning.linkedReview(completed).authorization).toBe("");
    expect(completed.stage).toBe("Verified complete");
  });
  it("snapshots changed inputs into a new unapproved action", () => {
    const inputs = { ...INITIAL_INPUTS };
    const action = Planning.scenarioAction(inputs);
    inputs.spending = 8000;
    expect(action.snapshot?.spending).toBe(6200);
    expect(action.review).toBe("");
    expect(action.authorization).toBe("");
    expect(action.stage).toBe("Analyze choices");
  });
});
