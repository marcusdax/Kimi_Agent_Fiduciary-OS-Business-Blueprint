export const stages = [
  "Gather information",
  "Analyze choices",
  "Ready for review",
  "Waiting for approval",
  "In progress",
  "Verified complete",
] as const;
export type Stage = (typeof stages)[number];
export type ComparisonInputs = {
  assets: number;
  spending: number;
  years: number;
};
export type ComparisonSnapshot = Readonly<
  ComparisonInputs & { annualDraw: number; annualGap: number }
>;
export type Action = {
  id: string;
  title: string;
  outcome: string;
  owner: string;
  stage: Stage;
  authorized: boolean;
  source: string;
  assumptions: string;
  alternatives: string;
  costs: string;
  reviewDate: string;
  evidence: string;
  history: string[];
  comparisonSnapshot?: ComparisonSnapshot;
};
export const sampleActions: Action[] = [
  {
    id: "income",
    title: "Compare planning horizons",
    outcome: "See how the assumed horizon changes a simple annual draw.",
    owner: "You and your planning team",
    stage: "Analyze choices",
    source: "Illustrative household estimates; not verified",
    assumptions:
      "Annual spending stays level. No taxes, growth, inflation, fees, or Social Security modeled.",
    alternatives:
      "Retire later, adjust spending, or review other income sources.",
    costs:
      "No product has been selected. Any future fees and conflicts need separate disclosure.",
    reviewDate: "",
    evidence: "",
    authorized: false,
    history: [
      "Example record created; no client recommendation or authorization exists.",
    ],
  },
  {
    id: "protection",
    title: "Confirm your protection needs",
    outcome: "Identify gaps before comparing coverage.",
    owner: "You",
    stage: "Gather information",
    source: "No policy documents connected",
    assumptions: "Existing coverage and premiums are unknown.",
    alternatives:
      "Review current coverage, seek qualified advice, or defer a product decision.",
    costs:
      "Premiums, exclusions, surrender charges, and compensation are not yet known.",
    reviewDate: "",
    evidence: "",
    authorized: false,
    history: ["Example record created."],
  },
  {
    id: "legacy",
    title: "Review beneficiary information",
    outcome: "Prepare questions for your estate professional.",
    owner: "You and your estate professional",
    stage: "Ready for review",
    source: "Illustrative checklist; no estate documents reviewed",
    assumptions:
      "Ownership, jurisdiction, and beneficiary designations need confirmation.",
    alternatives:
      "Review existing designations and coordinate changes with qualified counsel.",
    costs: "Legal fees and tax consequences require professional review.",
    reviewDate: "",
    evidence: "",
    authorized: false,
    history: ["Example checklist prepared; not legal advice."],
  },
];
export function transition(
  action: Action,
  target: Stage,
  evidence: string,
): Action {
  const current = stages.indexOf(action.stage);
  const next = stages.indexOf(target);
  if (next !== current + 1)
    throw new Error(
      "Move one step at a time so review and authorization are not skipped.",
    );
  if (target === "In progress" && !action.authorized)
    throw new Error(
      "Record demo authorization separately before starting follow-through.",
    );
  if (target === "Verified complete" && !action.authorized)
    throw new Error(
      "Record demo authorization before completing this sample action.",
    );
  if (target === "Verified complete" && !evidence.trim())
    throw new Error(
      "Add completion evidence before marking this action complete.",
    );
  const entry =
    target === "In progress"
      ? "Demo follow-through started; no real action is authorized or executed."
      : target === "Verified complete"
        ? `Demo completion evidence: ${evidence.trim()}`
        : `Demo status changed to ${target}.`;
  return {
    ...action,
    stage: target,
    evidence:
      target === "Verified complete" ? evidence.trim() : action.evidence,
    history: [...action.history, entry],
  };
}
export function compareIncome(assets: number, spending: number, years: number) {
  if (
    !Number.isFinite(assets) ||
    !Number.isFinite(spending) ||
    !Number.isInteger(years) ||
    assets < 0 ||
    spending < 0 ||
    years < 1 ||
    years > 60
  )
    throw new Error(
      "Enter non-negative amounts and a whole-number horizon from 1 to 60 years.",
    );
  return {
    annualDraw: assets / years,
    annualGap: Math.max(0, spending - assets / years),
  };
}

export function authorizeDemo(action: Action, confirmation: boolean): Action {
  if (action.stage !== "Waiting for approval" || !confirmation)
    throw new Error(
      "Confirm the specific sample action while waiting for approval.",
    );
  return {
    ...action,
    authorized: true,
    history: [
      ...action.history,
      "Demo planning authorization recorded separately; no real action is authorized.",
    ],
  };
}

// Carry forward the reference design's snapshot/review-date invariants without
// importing its audience-based permissions or coupled consent/stage transition.
export function createComparisonAction(
  inputs: ComparisonInputs,
  id: string,
): Action {
  const { assets, spending, years } = inputs;
  const result = compareIncome(assets, spending, years);
  return {
    ...sampleActions[0],
    id,
    stage: "Analyze choices",
    authorized: false,
    evidence: "",
    reviewDate: "",
    source:
      "Editable example inputs captured for this sample discussion; not verified account data.",
    comparisonSnapshot: Object.freeze({ assets, spending, years, ...result }),
    history: [
      "New sample discussion created from the captured inputs. No authorization inherited; no real action is executed.",
    ],
  };
}

export function scheduleDemoReview(action: Action, date: string): Action {
  if (date) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new Error("Choose a valid sample review date.");
  }
  if (date === action.reviewDate) return action;
  return {
    ...action,
    reviewDate: date,
    history: [
      ...action.history,
      date
        ? `Sample review date set to ${date}; status and authorization unchanged. No reminder is scheduled.`
        : "Sample review date cleared; status and authorization unchanged.",
    ],
  };
}
