// Sample-only math for the free plan check. Not a recommendation or a
// projection of real results; the UI labels every output as an example.
export const SAMPLE_RETURN = 0.04;
export const SAMPLE_INFLATION = 0.025;
export const MAX_YEARS = 40;

export type DemoInputs = {
  age: string;
  savings: string;
  spending: string;
  guaranteed: string;
};
export type DemoErrors = Partial<Record<keyof DemoInputs, string>>;
export type Coverage = { gap: number; years: number; capped: boolean };

export const defaultDemoInputs: DemoInputs = {
  age: "55",
  savings: "650000",
  spending: "72000",
  guaranteed: "34000",
};

function amount(raw: string) {
  if (!raw.trim()) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function validateDemo(inputs: DemoInputs): DemoErrors {
  const errors: DemoErrors = {};
  const age = amount(inputs.age);
  if (!Number.isInteger(age) || age < 18 || age > 100)
    errors.age = "Enter a whole-number age from 18 to 100.";
  for (const [key, label] of [
    ["savings", "savings"],
    ["spending", "yearly spending"],
    ["guaranteed", "guaranteed income"],
  ] as const) {
    const n = amount(inputs[key]);
    if (!Number.isFinite(n) || n < 0)
      errors[key] = `Enter your ${label} as a number of 0 or more.`;
  }
  return errors;
}

/** Years savings could cover the yearly gap in a simple example. */
export function estimateCoverage(
  savings: number,
  spending: number,
  guaranteed: number,
): Coverage {
  let gap = spending - guaranteed;
  const firstGap = Math.max(0, gap);
  if (gap <= 0) return { gap: 0, years: MAX_YEARS, capped: true };
  let balance = savings;
  let years = 0;
  while (years < MAX_YEARS) {
    balance -= gap;
    if (balance < 0) break;
    balance *= 1 + SAMPLE_RETURN;
    gap *= 1 + SAMPLE_INFLATION;
    years++;
  }
  return { gap: firstGap, years, capped: years >= MAX_YEARS };
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
