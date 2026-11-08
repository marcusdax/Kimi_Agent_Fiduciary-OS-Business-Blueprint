import { describe, it, expect } from "vitest";
import {
  compareIncome,
  createComparisonAction,
  scheduleDemoReview,
  sampleActions,
  transition,
  authorizeDemo,
} from "./workflow";
describe("illustrative income math", () => {
  it("shows method without implying a sustainable withdrawal", () =>
    expect(compareIncome(600000, 48000, 25)).toEqual({
      annualDraw: 24000,
      annualGap: 24000,
    }));
  it("does not report negative gaps", () =>
    expect(compareIncome(600000, 1000, 25).annualGap).toBe(0));
  it.each([
    [-1, 10, 25],
    [10, -1, 25],
    [10, 10, 0],
    [10, 10, 61],
    [10, 10, 2.5],
    [NaN, 10, 25],
    [10, Infinity, 25],
  ])("rejects invalid inputs %s %s %s", (a, s, y) =>
    expect(() => compareIncome(a, s, y)).toThrow(),
  );
});
describe("decision workflow", () => {
  it("does not skip review stages or go backwards", () => {
    expect(() => transition(sampleActions[0], "In progress", "proof")).toThrow(
      "one step",
    );
    expect(() =>
      transition(sampleActions[0], "Gather information", ""),
    ).toThrow("one step");
  });
  it("does not mutate the original record", () => {
    const next = transition(sampleActions[0], "Ready for review", "");
    expect(next.history).toHaveLength(2);
    expect(sampleActions[0].history).toHaveLength(1);
  });
  it("requires explicit demo authorization", () => {
    const a = { ...sampleActions[0], stage: "Waiting for approval" as const };
    expect(() => transition(a, "In progress", "")).toThrow(
      "Record demo authorization",
    );
    expect(
      transition(authorizeDemo(a, true), "In progress", "").history.at(-1),
    ).toContain("no real action");
  });
  it("records demo authorization without advancing the card", () => {
    const pending = {
      ...sampleActions[0],
      stage: "Waiting for approval" as const,
    };
    const authorized = authorizeDemo(pending, true);
    expect(authorized.stage).toBe("Waiting for approval");
    expect(authorized.authorized).toBe(true);
    expect(pending.authorized).toBe(false);
    expect(() => authorizeDemo(pending, false)).toThrow();
  });
  it("requires completion evidence and preserves prior history", () => {
    const a = {
      ...sampleActions[0],
      stage: "In progress" as const,
      authorized: true,
    };
    expect(() => transition(a, "Verified complete", "  ")).toThrow("evidence");
    const completed = transition(
      a,
      "Verified complete",
      "  Confirmed sample outcome  ",
    );
    expect(completed.evidence).toBe("Confirmed sample outcome");
    expect(completed.history[0]).toBe(a.history[0]);
  });
});

describe("captured sample comparisons and review dates", () => {
  it("captures a detached immutable input/result snapshot and never inherits authorization", () => {
    const inputs = { assets: 600000, spending: 48000, years: 25 };
    const action = createComparisonAction(inputs, "new-example");
    inputs.assets = 900000;
    expect(action.comparisonSnapshot).toEqual({
      assets: 600000,
      spending: 48000,
      years: 25,
      annualDraw: 24000,
      annualGap: 24000,
    });
    expect(Object.isFrozen(action.comparisonSnapshot)).toBe(true);
    expect(action.stage).toBe("Analyze choices");
    expect(action.authorized).toBe(false);
    expect(action.evidence).toBe("");
    expect(action.reviewDate).toBe("");
    const approved = authorizeDemo(
      { ...action, stage: "Waiting for approval" },
      true,
    );
    expect(approved.comparisonSnapshot).toBe(action.comparisonSnapshot);
    const replacement = createComparisonAction(inputs, "another-example");
    expect(replacement.authorized).toBe(false);
    expect(approved.comparisonSnapshot?.assets).toBe(600000);
  });
  it("refuses to create a comparison discussion from invalid inputs", () => {
    expect(() =>
      createComparisonAction({ assets: -1, spending: 0, years: 25 }, "bad"),
    ).toThrow();
  });
  it("requires existing authorization even when a sample record is already In progress", () => {
    expect(() =>
      transition(
        { ...sampleActions[0], stage: "In progress" },
        "Verified complete",
        "Example evidence",
      ),
    ).toThrow("authorization");
  });
  it("records scheduling and clearing dates without changing completion, evidence, authorization or snapshot", () => {
    const complete: (typeof sampleActions)[number] = {
      ...createComparisonAction(
        { assets: 600000, spending: 48000, years: 25 },
        "complete",
      ),
      stage: "Verified complete",
      authorized: true,
      evidence: "Sample outcome recorded.",
    };
    const scheduled = scheduleDemoReview(complete, "2026-12-01");
    expect(scheduled.stage).toBe("Verified complete");
    expect(scheduled.authorized).toBe(true);
    expect(scheduled.evidence).toBe(complete.evidence);
    expect(scheduled.comparisonSnapshot).toBe(complete.comparisonSnapshot);
    expect(scheduled.history).toEqual([
      ...complete.history,
      expect.stringContaining("2026-12-01"),
    ]);
    expect(complete.reviewDate).toBe("");
    expect(scheduleDemoReview(scheduled, scheduled.reviewDate)).toBe(scheduled);
    expect(scheduleDemoReview(scheduled, "").stage).toBe("Verified complete");
  });
  it.each(["2026-02-30", "2026-13-01", "not-a-date", "2026-1-1"])(
    "rejects invalid review date %s",
    (date) => {
      expect(() => scheduleDemoReview(sampleActions[0], date)).toThrow(
        "valid sample review date",
      );
    },
  );
});
