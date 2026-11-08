import { describe, it, expect } from "vitest";
import { compareIncome, sampleActions, transition } from "./workflow";
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
    expect(() =>
      transition(sampleActions[0], "In progress", true, "proof"),
    ).toThrow("one step");
    expect(() =>
      transition(sampleActions[0], "Gather information", false, ""),
    ).toThrow("one step");
  });
  it("does not mutate the original record", () => {
    const next = transition(sampleActions[0], "Ready for review", false, "");
    expect(next.history).toHaveLength(2);
    expect(sampleActions[0].history).toHaveLength(1);
  });
  it("requires explicit demo authorization", () => {
    const a = { ...sampleActions[0], stage: "Waiting for approval" as const };
    expect(() => transition(a, "In progress", false, "")).toThrow("Confirm");
    expect(transition(a, "In progress", true, "").history.at(-1)).toContain(
      "no real action",
    );
  });
  it("requires completion evidence and preserves prior history", () => {
    const a = { ...sampleActions[0], stage: "In progress" as const };
    expect(() => transition(a, "Verified complete", false, "  ")).toThrow(
      "evidence",
    );
    const completed = transition(
      a,
      "Verified complete",
      false,
      "  Confirmed sample outcome  ",
    );
    expect(completed.evidence).toBe("Confirmed sample outcome");
    expect(completed.history[0]).toBe(a.history[0]);
  });
});
