export type Audience = "household" | "advisor";
export type View =
  | "Overview"
  | "My plan"
  | "Compare choices"
  | "Next steps"
  | "Documents"
  | "Planning team";
export const STAGES = [
  "Gather information",
  "Analyze choices",
  "Ready for review",
  "Waiting for approval",
  "In progress",
  "Verified complete",
] as const;
export type Stage = (typeof STAGES)[number];
export interface Inputs {
  portfolio: number;
  spending: number;
  income: number;
}
export interface PlanningAction {
  id: string;
  title: string;
  outcome: string;
  owner: string;
  stage: Stage;
  evidence: string;
  alternatives: string;
  review: string;
  authorization: string;
  history: string[];
  revisit: boolean;
  snapshot?: Inputs;
}
export interface TransitionInput {
  audience: Audience;
  note: string;
  consent: boolean;
}
export const INITIAL_INPUTS: Inputs = {
  portfolio: 920000,
  spending: 6200,
  income: 3400,
};
export const SAMPLE_ACTIONS: PlanningAction[] = [
  {
    id: "income",
    title: "Compare retirement income choices",
    outcome: "Understand the gap between monthly spending and reliable income.",
    owner: "Planning team",
    stage: "Analyze choices",
    evidence: "Illustrative household inputs, not verified records.",
    alternatives: "",
    review: "",
    authorization: "",
    history: ["Sample action created for this walkthrough."],
    revisit: false,
    snapshot: { ...INITIAL_INPUTS },
  },
  {
    id: "beneficiaries",
    title: "Confirm beneficiary details",
    outcome: "Identify which designations need a professional review.",
    owner: "Household",
    stage: "Gather information",
    evidence: "",
    alternatives: "",
    review: "",
    authorization: "",
    history: ["Sample action; no beneficiary records are held here."],
    revisit: false,
  },
  {
    id: "protection",
    title: "Discuss a protection review",
    outcome: "Prepare questions about coverage needs and existing policies.",
    owner: "Planning team",
    stage: "Ready for review",
    evidence: "Illustrative coverage checklist only.",
    alternatives:
      "Compare keeping current coverage, adjusting coverage, or taking no action after review.",
    review: "",
    authorization: "",
    history: [
      "Sample evidence and alternatives prepared; no policy recommendation.",
    ],
    revisit: false,
  },
];

// Shared domain rules keep labels, arithmetic and transitions consistent across both views.
export class Planning {
  private static sequence = 0;
  private static id(prefix: string): string {
    return `${prefix}-${Date.now()}-${++Planning.sequence}`;
  }
  static money(value: number): string {
    if (!Number.isFinite(value)) return "Needs input";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  static validate(inputs: Inputs): string | null {
    if (!Object.values(inputs).every(Number.isFinite))
      return "Enter a finite number in every field.";
    if (inputs.portfolio <= 0 || inputs.portfolio > 1e10)
      return "Enter a portfolio value above $0 and no greater than $10 billion.";
    if (
      inputs.spending < 0 ||
      inputs.income < 0 ||
      inputs.spending > 1e7 ||
      inputs.income > 1e7
    )
      return "Monthly amounts must be between $0 and $10 million.";
    return null;
  }
  static estimate(inputs: Inputs) {
    const error = Planning.validate(inputs);
    if (error) throw new Error(error);
    const gap = Math.max(0, inputs.spending - inputs.income);
    return {
      gap,
      annualDraw: gap * 12,
      withdrawalRate: ((gap * 12) / inputs.portfolio) * 100,
      surplus: Math.max(0, inputs.income - inputs.spending),
    };
  }
  static next(stage: Stage): Stage | undefined {
    return STAGES[STAGES.indexOf(stage) + 1];
  }
  static transition(
    action: PlanningAction,
    target: Stage,
    input: TransitionInput,
  ): PlanningAction {
    if (target !== Planning.next(action.stage))
      throw new Error(
        "Move one stage at a time; completed records cannot be reopened.",
      );
    const note = input.note.trim();
    if (note.length < 12)
      throw new Error(
        "Add at least 12 characters explaining the evidence or decision.",
      );
    if (target === "In progress") {
      if (input.audience !== "household")
        throw new Error(
          "Only the household demo view can record its approval.",
        );
      if (!input.consent)
        throw new Error(
          "Explicit approval is required for this specific sample action.",
        );
      if (!action.review)
        throw new Error(
          "Professional review must be recorded before approval.",
        );
    } else if (input.audience !== "advisor")
      throw new Error(
        "Use the planning-team demo view to prepare, review, or complete work.",
      );
    if (
      target === "Waiting for approval" &&
      (!action.evidence || !action.alternatives)
    )
      throw new Error(
        "Evidence and alternatives are required before review is complete.",
      );
    if (target === "Verified complete" && !action.authorization)
      throw new Error("Approval is required before recording completion.");
    return {
      ...action,
      stage: target,
      evidence: target === "Analyze choices" ? note : action.evidence,
      alternatives: target === "Ready for review" ? note : action.alternatives,
      review: target === "Waiting for approval" ? note : action.review,
      authorization: target === "In progress" ? note : action.authorization,
      history: [
        ...action.history,
        `${new Date().toLocaleTimeString("en-US")} · ${target}: ${note}`,
      ],
    };
  }
  static scenarioAction(inputs: Inputs): PlanningAction {
    const result = Planning.estimate(inputs);
    return {
      ...SAMPLE_ACTIONS[0],
      id: Planning.id("income"),
      snapshot: { ...inputs },
      evidence: `Sample inputs: portfolio ${Planning.money(inputs.portfolio)}, monthly spending ${Planning.money(inputs.spending)}, monthly income ${Planning.money(inputs.income)}. Monthly gap ${Planning.money(result.gap)}. Not verified.`,
      history: [
        "A new discussion was prepared from these exact sample inputs; it has no review or approval.",
      ],
    };
  }
  static linkedReview(action: PlanningAction): PlanningAction {
    return {
      ...action,
      id: Planning.id(`${action.id}-review`),
      title: `Review: ${action.title}`,
      stage: "Gather information",
      evidence: "",
      alternatives: "",
      review: "",
      authorization: "",
      revisit: false,
      history: [
        `Linked review of ${action.id}; original completion record is unchanged.`,
      ],
    };
  }
}
