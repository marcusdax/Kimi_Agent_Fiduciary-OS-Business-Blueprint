import { describe, expect, it } from "vitest";
import { estimateCoverage, MAX_YEARS, validateDemo, defaultDemoInputs } from "./demo";

describe("free plan check sample math", () => {
  it("counts years savings cover a growing gap", () => {
    const r = estimateCoverage(650000, 72000, 34000);
    expect(r.gap).toBe(38000);
    expect(r.years).toBeGreaterThan(15);
    expect(r.years).toBeLessThan(25);
    expect(r.capped).toBe(false);
  });
  it("caps at the maximum when guaranteed income covers spending", () => {
    expect(estimateCoverage(0, 30000, 40000)).toEqual({ gap: 0, years: MAX_YEARS, capped: true });
  });
  it("returns zero years when savings cannot cover the first gap", () => {
    expect(estimateCoverage(1000, 50000, 0).years).toBe(0);
  });
  it("validates age range and non-negative amounts", () => {
    expect(validateDemo(defaultDemoInputs)).toEqual({});
    const e = validateDemo({ age: "12", savings: "-1", spending: "", guaranteed: "abc" });
    expect(Object.keys(e).sort()).toEqual(["age", "guaranteed", "savings", "spending"]);
    expect(validateDemo({ ...defaultDemoInputs, age: "55.5" }).age).toMatch(/whole-number/);
  });
});
