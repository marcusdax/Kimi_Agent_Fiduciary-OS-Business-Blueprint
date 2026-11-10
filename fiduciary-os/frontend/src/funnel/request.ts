// Client-side only. There is no advice-request endpoint on the backend yet,
// so a "submitted" request stays in page memory and is never sent or stored.
export type RequestForm = {
  goal: string;
  stage: string;
  timeline: string;
  help: string;
  contactMethod: string;
  name: string;
  email: string;
  phone: string;
  consent: boolean;
};
export type RequestErrors = Partial<Record<keyof RequestForm, string>>;

export const emptyRequest: RequestForm = {
  goal: "",
  stage: "",
  timeline: "",
  help: "",
  contactMethod: "",
  name: "",
  email: "",
  phone: "",
  consent: false,
};

export const goals = [
  "Retire by a certain age",
  "Have a steady retirement income",
  "Leave money to family or causes",
  "Not sure yet",
];
export const lifeStages = [
  "Building savings",
  "Nearing retirement",
  "Retired",
  "Planning a transfer to family",
];
export const timelines = [
  "Within a year",
  "In 1 to 5 years",
  "In 5 to 10 years",
  "More than 10 years away",
  "Not sure",
];
export const helpOptions = [
  "On my own, with the guide",
  "Guided, with occasional review",
  "With a dedicated advisor",
];
export const contactMethods = ["Email", "Phone", "Don't contact me yet"];

export type PlanId = "free" | "premium" | "advisor";
export type PlanFeature = { label: string; built: boolean };
// built: false marks features that don't exist in the app today; the card
// shows "Not built yet" beside each so no plan promises more than exists.
export const plans: {
  id: PlanId;
  code: string;
  name: string;
  fits: string;
  includes: PlanFeature[];
  note?: string;
}[] = [
  {
    id: "free",
    code: "Tier 01",
    name: "Free",
    fits: "Curious and early planners",
    includes: [
      { label: "Free plan check", built: true },
      { label: "Guided walk-through of the chips", built: true },
      { label: "Sample data only", built: true },
    ],
  },
  {
    id: "premium",
    code: "Tier 02",
    name: "Premium",
    fits: "People who want a full plan",
    includes: [
      { label: "Saved financial workspace", built: true },
      { label: "Roth and income planners", built: false },
      { label: "Review reminders", built: false },
    ],
    note: "Roth and income planners and review reminders aren't built yet. Review dates can be recorded today, but no reminders are sent.",
  },
  {
    id: "advisor",
    code: "Tier 03",
    name: "Advisor-led",
    fits: "People who want a professional",
    includes: [
      { label: "Everything in Premium", built: true },
      { label: "Advisor reviews your plan", built: false },
      { label: "Decisions shared with your advisor", built: false },
    ],
    note: "Advisor access isn't built yet. This tier is shown so you can tell us it interests you.",
  },
];

export function recommendPlan(help: string): PlanId | undefined {
  if (help === helpOptions[0]) return "free";
  if (help === helpOptions[1]) return "premium";
  if (help === helpOptions[2]) return "advisor";
  return undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateRequest(f: RequestForm): RequestErrors {
  const e: RequestErrors = {};
  if (!f.goal) e.goal = "Choose what you're planning for.";
  if (!f.stage) e.stage = "Choose your stage.";
  if (!f.timeline) e.timeline = "Choose a timeline.";
  if (!f.help) e.help = "Choose how you'd like help.";
  if (!f.contactMethod) e.contactMethod = "Choose how we may contact you.";
  const contacting = f.contactMethod === "Email" || f.contactMethod === "Phone";
  if (contacting && !f.name.trim()) e.name = "Enter your name.";
  if (f.contactMethod === "Email" && !EMAIL.test(f.email.trim()))
    e.email = "Enter an email address like name@example.com.";
  if (f.contactMethod === "Phone" && f.phone.replace(/\D/g, "").length < 10)
    e.phone = "Enter a phone number with at least 10 digits.";
  if (contacting && !f.consent)
    e.consent = "Confirm that we may contact you about this request.";
  return e;
}
