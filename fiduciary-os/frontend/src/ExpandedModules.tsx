import { useState } from "react";
import SymphonyComposerPanel from "./SymphonyComposerPanel";

export type ExpandedView = "symphony" | "proposed" | "willtrust" | null;

interface HouseholdIntake {
  name: string;
  spouse: string;
  marital: "Married" | "Single";
  state: "Texas" | "California" | "Delaware" | "Florida" | "New York";
  minorChildren: boolean;
  specialNeeds: boolean;
  blended: boolean;
  netWorth: number;
  retirement: number;
  lifeFace: number;
  homestead: boolean;
  business: boolean;
}

const FAMILY_EXAMPLE: HouseholdIntake = {
  name: "Elena Voss Harlow",
  spouse: "James Harlow",
  marital: "Married",
  state: "Texas",
  minorChildren: true,
  specialNeeds: false,
  blended: false,
  netWorth: 4800000,
  retirement: 900000,
  lifeFace: 1500000,
  homestead: true,
  business: false,
};

const FOUNDER_EXAMPLE: HouseholdIntake = {
  name: "Marcus Vance",
  spouse: "Claire Vance",
  marital: "Married",
  state: "Delaware",
  minorChildren: true,
  specialNeeds: false,
  blended: true,
  netWorth: 18500000,
  retirement: 1400000,
  lifeFace: 5000000,
  homestead: true,
  business: true,
};

const RANKED_STRUCTURES = [
  { id: "jrt", name: "Joint revocable living trust", baseFit: 92, summary: "You keep control, avoid probate for what you fund, and name who acts if you cannot." },
  { id: "slat", name: "Living trust plus a spousal lifetime trust", baseFit: 81, summary: "Keep a living reserve in a revocable trust. Gift the surplus to an irrevocable grantor trust for your spouse." },
  { id: "offshore", name: "Offshore trust — memorandum, not a deed", baseFit: 44, summary: "Cook Islands, Jersey, Guernsey, or Bermuda. Foreign counsel has to form it. This atelier will not pretend to." },
  { id: "ing", name: "Irrevocable non-grantor trust", baseFit: 64, summary: "A completed gift. The trust, not you, pays tax on what it keeps." },
  { id: "dapt", name: "Living trust plus a domestic asset-protection trust", baseFit: 58, summary: "A self-settled irrevocable trust in a state that allows the settlor to be a discretionary beneficiary." },
];

const FUNDING_ITEMS = [
  { id: "f1", label: "Primary residence", amount: 720000, type: "RETITLE", note: "Retitled to the trustee (deed with qualifying homestead trust language)." },
  { id: "f2", label: "Checking and savings", amount: 180000, type: "RETITLE", note: "Retitled to the trustee (account re-registration or assignment)." },
  { id: "f3", label: "Taxable brokerage", amount: 1400000, type: "RETITLE", note: "Retitled to the trustee (bring Certificate of Trust)." },
  { id: "f4", label: "Household and personal effects", amount: 80000, type: "RETITLE", note: "General assignment of untitled personal property." },
  { id: "f5", label: "IRA and employer plans", amount: 900000, type: "BENEFICIARY", note: "Beneficiary form confirmed — passes by form, not by will or trust." },
  { id: "f6", label: "Life insurance", amount: 1500000, type: "BENEFICIARY", note: "Beneficiary form confirmed (or ILIT assignment; calendar IRC § 2035 3-yr rule)." },
];

const CHECKLIST_GROUPS: { phase: string; items: { id: string; title: string; detail: string; owner: string }[] }[] = [
  {
    phase: "COUNSEL",
    items: [
      { id: "c1", title: "Hire the lawyer who can actually sign the opinion", detail: "Engage licensed state counsel. Bring this draft as an agenda, not a finished instrument.", owner: "Settlor" },
      { id: "c2", title: "Prove capacity, family, and title", detail: "Bring deeds, beneficiary forms, cap table, policy illustrations, and creditor list.", owner: "Counsel" },
      { id: "c3", title: "Lock the pathway in a one-page decision", detail: "Confirm Pour-over will + Joint revocable living trust pathway.", owner: "Settlor & Counsel" },
      { id: "c4", title: "Give the spouse a chance at separate advice", detail: "Wise when community property is retitled or residue alters elective share.", owner: "Spouse" },
    ],
  },
  {
    phase: "SIGN",
    items: [
      { id: "c5", title: "Sign the trust and the trustee acceptance", detail: "Settlor signs, trustee accepts, notary acknowledges for deeds & banks.", owner: "Settlor & Trustee" },
      { id: "c6", title: "Sign the pour-over will", detail: "Written will signed before two credible witnesses + self-proving affidavit (§ 251.104).", owner: "Testator & Witnesses" },
      { id: "c7", title: "The spouse signs a separate will the same day", detail: "Never use one joint will; neither spouse should witness the other.", owner: "Spouse & Witnesses" },
      { id: "c8", title: "Sign the incapacity documents", detail: "Financial POA, Medical POA, Directive to Physicians, and HIPAA release.", owner: "Settlor" },
    ],
  },
  {
    phase: "FUND",
    items: [
      { id: "c9", title: "Deed the homestead with qualifying-trust language", detail: "Preserve Texas Tax Code § 11.13(j) homestead exemption; confirm with appraisal district.", owner: "Counsel & Title" },
      { id: "c10", title: "Assign personal property and open trust accounts", detail: "Retitle taxable brokerage and bank accounts using Certificate of Trust.", owner: "Trustee" },
      { id: "c11", title: "Rewrite beneficiary forms — do not put the IRA in the trust", detail: "IRAs, 401(k)s, and life policies pass by custodian form; verify SECURE Act rules.", owner: "Settlor" },
      { id: "c12", title: "Put life insurance in the ILIT the right way", detail: "File absolute assignment, calendar 3-year IRC § 2035 window, send Crummey notices.", owner: "ILIT Trustee" },
    ],
  },
  {
    phase: "FILE",
    items: [
      { id: "c13", title: "Get tax numbers only where a separate taxpayer exists", detail: "Revocable grantor trust uses SSN; irrevocable trusts need EIN via Form SS-4.", owner: "Trustee" },
      { id: "c14", title: "Calendar Form 709 for 2026 gifts", detail: "Gifts above $19,000 annual exclusion or GST allocations require Form 709; Form 706 for portability.", owner: "Return Preparer" },
    ],
  },
  {
    phase: "KEEP",
    items: [
      { id: "c15", title: "Tell the successor where the original is", detail: "Courts want the original will — keep accessible, not locked in an unreachable safe-deposit box.", owner: "Settlor" },
      { id: "c16", title: "Review on a calendar, not at the funeral", detail: "Revisit at marriage, birth, move to a new state, liquidity event, or exemption reset.", owner: "Settlor / Trustee" },
    ],
  },
];

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function ExpandedModules({
  view,
  onClose,
}: {
  view: ExpandedView;
  onClose: () => void;
}) {
  // Proposed Symphony state
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [advisorSigned, setAdvisorSigned] = useState(false);
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([
    { q: "Primary retirement horizon", a: "20 years (target age 65)" },
    { q: "Target equity / bond split", a: "70% Equity / 30% Fixed Income with 5%/yr glidepath" },
    { q: "Tax priority", a: "5-year Roth conversion ladder + max HSA + Dec loss harvesting" },
  ]);
  const [newAnsQ, setNewAnsQ] = useState("");
  const [newAnsA, setNewAnsA] = useState("");

  // Will & Trust Formation state
  const [savedClients, setSavedClients] = useState<HouseholdIntake[]>([FAMILY_EXAMPLE, FOUNDER_EXAMPLE]);
  const [intake, setIntake] = useState<HouseholdIntake>(FAMILY_EXAMPLE);
  const [docScope, setDocScope] = useState<"TRUST" | "WILL" | "BOTH">("BOTH");
  const [intakeStep, setIntakeStep] = useState(1);
  const [activeStructure, setActiveStructure] = useState("jrt");
  const [activeDraft, setActiveDraft] = useState(0);
  const [fundedIds, setFundedIds] = useState<Record<string, boolean>>({});
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [copyToast, setCopyToast] = useState("");

  // Step 2: What matters
  const [priorities, setPriorities] = useState({
    avoidProbate: true,
    stagedDistributions: true,
    disclaimerBypass: true,
    ilitShield: true,
    charitableGift: false,
    counselNote: "Primary home is the Burleson homestead. Do not disturb the property-tax exemption.",
  });

  // Step 3: People & Fiduciaries
  const [successorTrustee, setSuccessorTrustee] = useState("Priya Shah");
  const [guardianName, setGuardianName] = useState("Priya Shah");
  const [beneficiaries, setBeneficiaries] = useState([
    { id: "b1", name: "Adele Harlow", relation: "Child", minor: true, share: "50% (staged 25/30/35)" },
    { id: "b2", name: "Noah Harlow", relation: "Child", minor: false, share: "50% (staged 25/30/35)" },
  ]);
  const [newBenName, setNewBenName] = useState("");
  const [newBenMinor, setNewBenMinor] = useState(false);

  // Step 4: Assets Schedule
  const [assets, setAssets] = useState(FUNDING_ITEMS);
  const [newAssetLabel, setNewAssetLabel] = useState("");
  const [newAssetAmt, setNewAssetAmt] = useState("");
  const [newAssetType, setNewAssetType] = useState<"RETITLE" | "BENEFICIARY">("RETITLE");

  // Step 5: Will & Companions
  const [companions, setCompanions] = useState({
    selfProving: true,
    digitalRufadaa: true,
    financialPoa: true,
    medicalPoa: true,
    directivePhysicians: true,
    hipaaRelease: true,
  });

  function startNewClient() {
    const blank: HouseholdIntake = {
      name: "New Client",
      spouse: "",
      marital: "Married",
      state: "Texas",
      minorChildren: false,
      specialNeeds: false,
      blended: false,
      netWorth: 1500000,
      retirement: 450000,
      lifeFace: 500000,
      homestead: true,
      business: false,
    };
    setIntake(blank);
    setIntakeStep(1);
    setFundedIds({});
    setCheckedIds({});
    setCopyToast("New client intake initialized — edit fields and click Save Client.");
    setTimeout(() => setCopyToast(""), 3000);
  }

  function saveCurrentClient() {
    setSavedClients((prev) => {
      const exists = prev.some((c) => c.name === intake.name);
      return exists ? prev.map((c) => (c.name === intake.name ? intake : c)) : [intake, ...prev];
    });
    setCopyToast(`Saved "${intake.name}" to client roster.`);
    setTimeout(() => setCopyToast(""), 2500);
  }

  const taxableEstate = Math.max(0, intake.netWorth - intake.lifeFace);
  const exemption2026 = intake.marital === "Married" ? 30000000 : 15000000;
  const complexity = Math.min(
    96,
    12 + (intake.minorChildren ? 7 : 0) + (intake.specialNeeds ? 24 : 0) + (intake.blended ? 18 : 0) + (intake.business ? 26 : 0),
  );
  const fitScore = Math.min(98, 92 - (intake.business ? 8 : 0) - (intake.specialNeeds ? 6 : 0));

  const retitledTotal = assets.filter((f) => f.type === "RETITLE").reduce((s, f) => s + f.amount, 0);
  const fundedRetitled = assets.filter((f) => f.type === "RETITLE" && fundedIds[f.id]).reduce((s, f) => s + f.amount, 0);
  const fundedPct = Math.round((fundedRetitled / Math.max(1, retitledTotal)) * 100);
  const totalChecks = CHECKLIST_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const doneChecks = Object.values(checkedIds).filter(Boolean).length;

  const DRAFTS = [
    {
      title: `The ${intake.name.split(" ").pop()} Family Living Trust`,
      subtitle: "Revocable living trust — discussion draft (Articles I–XXII)",
      body: `Article I — Creation\nDiscussion draft, not an executed instrument. ${intake.name}${intake.marital === "Married" ? ` and ${intake.spouse}` : ""}, as settlor(s), create this Living Trust by signing this instrument and transferring property to the trustee. Until both happen, there is no trust.\n\nArticle III — Revocable Grantor Trust\nWhile living and with capacity, the settlor may amend, revoke, or withdraw property. Grantor trust under IRC § 676; no separate Form 1041 required while revocable.\n\nArticle IV — Situs & Governing Law (${intake.state})\nGoverned by the laws of ${intake.state}. Homestead deeds must comply with local statutory trust rules (${intake.state === "Texas" ? "Texas Tax Code § 11.13(j)" : "state homestead statute"}).\n\nArticle V — Property & Schedules\nSchedule A (Separate), Schedule B (Community), Schedule C (Spouse Separate). Beneficiary forms on retirement accounts and life insurance control over this instrument.\n\nArticle IX–X — Surviving Spouse & Staged Descendants\nDisclaimer option under IRC § 2518 (9-month window). Descendant tranches staged at ages 25 (1/3), 30 (1/2 remainder), and 35 (balance) with spendthrift protection.\n\nArticle XIII — Retirement Accounts (SECURE Act)\nDo not retitle an IRA/401(k) into the trust. Update custodian beneficiary forms; comply with 10-year distribution rules.\n\nArticle XIX — Tax (2026 Figures)\nLifetime exclusion: $15,000,000 per individual ($30,000,000 married); annual exclusion: $19,000 per donee. Timely Form 706 required to elect portability.`,
    },
    {
      title: `${intake.name.split(" ").pop()} Life Insurance Trust (ILIT)`,
      subtitle: "Irrevocable life insurance trust — discussion memo",
      body: `Face amount modeled: ${usd(intake.lifeFace)}.\nTransferring an existing policy into an ILIT triggers the IRC § 2035 three-year lookback rule. Having the ILIT apply for and own a new policy avoids inclusion. Send annual Crummey withdrawal notices for every premium gift.`,
    },
    {
      title: `Last Will and Testament of ${intake.name}`,
      subtitle: "Pour-over will — discussion draft",
      body: `Leaves probate residue to the Living Trust and nominates guardian of the person for minor children so assets are held in trust rather than court-supervised guardianship at age 18.\n${intake.state === "Texas" ? "Texas Estates Code § 251.051: signed written will + 2 credible witnesses (age 14+) + self-proving affidavit (§ 251.104)." : "Execute with state-required witnesses and self-proving affidavit."}`,
    },
    {
      title: `Last Will and Testament of ${intake.spouse}`,
      subtitle: "Separate mirror pour-over will — discussion draft",
      body: `Each spouse executes a separate will on the same day with two disinterested witnesses. Never execute a single joint will.`,
    },
    {
      title: "Companion Documents — Incapacity Suite",
      subtitle: "Not optional — neither the will nor trust replaces these",
      body: `1. Durable Financial Power of Attorney\n2. Medical Power of Attorney / Healthcare Proxy\n3. Directive to Physicians (Living Will)\n4. HIPAA Authorization Release`,
    },
    {
      title: "Tax Deductions & Basis Step-Up",
      subtitle: "Community property & IRC § 1014 review",
      body: `${intake.state === "Texas" ? "Texas is a community-property state — properly scheduled community assets may qualify for a full double basis step-up at first death (confirm with counsel)." : "Review separate vs. marital basis step-up rules with state tax counsel."} Retirement accounts are Income in Respect of a Decedent (IRC § 1014(c)) and receive no step-up.`,
    },
    {
      title: "Gift Tax & Form 709 Schedule",
      subtitle: "2026 annual exclusion ($19,000) & lifetime exemption",
      body: `Annual exclusion gifts up to $19,000 per donee ($38,000 gift-splitting) require no lifetime exemption use. Gifts above the annual exclusion or GST allocations require a timely Form 709.`,
    },
  ];

  if (!view) return null;

  return (
    <section className="fo-exp-wrap" aria-label="Expanded Fiduciary Studio">
      <div className="fo-exp-topbar">
        <div className="fo-seg">
          <button aria-pressed={view === "symphony"} onClick={() => window.dispatchEvent(new CustomEvent("fiduciary:open-studio", { detail: { view: "symphony" } }))}>
            ♦ Symphony Composer
          </button>
          <button aria-pressed={view === "proposed"} onClick={() => window.dispatchEvent(new CustomEvent("fiduciary:open-studio", { detail: { view: "proposed" } }))}>
            ♬ Proposed Symphony
          </button>
          <button aria-pressed={view === "willtrust"} onClick={() => window.dispatchEvent(new CustomEvent("fiduciary:open-studio", { detail: { view: "willtrust" } }))}>
            ⚖ Will &amp; Trust Atelier
          </button>
        </div>
        <button className="fo-btn" onClick={onClose}>✕ Back to Workspace</button>
      </div>

      {/* 1. SYMPHONY COMPOSER */}
      {view === "symphony" && (
        <SymphonyComposerPanel
          onSendToProposed={(topic, answer) => {
            setAnswers((list) => [...list, { q: topic, a: answer }]);
          }}
          onOpenProposed={() => {
            window.dispatchEvent(new CustomEvent("fiduciary:open-studio", { detail: { view: "proposed" } }));
          }}
        />
      )}

      {/* 2. PROPOSED SYMPHONY */}
      {view === "proposed" && (
        <div className="fo-exp-grid">
          <div className="fo-chrome-card">
            <span className="fo-ns-label">PROPOSED SYMPHONY · DISCOVERY · PLAN · AGREEMENT · EXECUTION</span>
            <div className="fo-stepper">
              {[
                [1, "1 Discovery"],
                [2, "2 Plan"],
                [3, "3 Client view"],
                [4, "4 Agreement"],
                [5, "5 Execute"],
              ].map(([num, label]) => (
                <button
                  key={String(num)}
                  className="fo-funnel-pill"
                  aria-current={workflowStep === num}
                  onClick={() => setWorkflowStep(num as 1 | 2 | 3 | 4 | 5)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="fo-draft-banner">
              <strong>{workflowStep} · {["Discovery Intake", "Side-by-Side Plan", "Your Plan (Client View)", "Client Acceptance Record", "Execution Tracker"][workflowStep - 1]}</strong>
              <p style={{ margin: "4px 0 0" }}>
                {advisorSigned
                  ? "Advisor signed off. You can review, record explicit acceptance, and track each implementation step."
                  : "This is a draft. Your advisor has not signed off yet, so you can read it and edit your answers, but not execute."}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button className="fo-btn" onClick={() => setAdvisorSigned((s) => !s)}>
                  {advisorSigned ? "Revert to Draft Mode" : "Simulate Advisor Sign-Off ✓"}
                </button>
                {workflowStep < 5 && (
                  <button className="fo-btn fo-btn-primary" onClick={() => setWorkflowStep((s) => Math.min(5, s + 1) as 1 | 2 | 3 | 4 | 5)}>
                    Advance to Stage {workflowStep + 1} →
                  </button>
                )}
              </div>
            </div>

            {workflowStep === 1 && (
              <div className="td-item" style={{ marginTop: 14 }}>
                <span className="fo-ns-label">STAGE 1 · DISCOVERY SUMMARY</span>
                <p style={{ margin: "4px 0", fontSize: 13 }}>
                  Household: <strong>{intake.name}</strong> ({intake.state}) · Net Worth: <strong>{usd(intake.netWorth)}</strong> · Retirement Accounts: <strong>{usd(intake.retirement)}</strong> · Life Face: <strong>{usd(intake.lifeFace)}</strong>
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--fo-muted)" }}>
                  All discovery inputs flow directly into Symphony Composer, Will &amp; Trust Atelier, and your Client Answers ledger with zero re-entry.
                </p>
              </div>
            )}

            {workflowStep === 2 && (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px" }}>Planning Pillar</th>
                      <th style={{ textAlign: "left", padding: "8px" }}>Current Baseline</th>
                      <th style={{ textAlign: "left", padding: "8px" }}>Proposed Symphony</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid var(--fo-line)" }}><td style={{ padding: "8px" }}><strong>Savings Rate</strong></td><td style={{ padding: "8px", color: "var(--fo-muted)" }}>6% 401(k)</td><td style={{ padding: "8px", color: "var(--fo-proof)" }}>9% + Max HSA (+6 DNA pts)</td></tr>
                    <tr style={{ borderTop: "1px solid var(--fo-line)" }}><td style={{ padding: "8px" }}><strong>Asset Location</strong></td><td style={{ padding: "8px", color: "var(--fo-muted)" }}>Mixed taxable / IRA</td><td style={{ padding: "8px", color: "var(--fo-proof)" }}>Bonds in IRA, VTI/VXUS Taxable, VNQ Roth</td></tr>
                    <tr style={{ borderTop: "1px solid var(--fo-line)" }}><td style={{ padding: "8px" }}><strong>Tax Corridor</strong></td><td style={{ padding: "8px", color: "var(--fo-muted)" }}>Unconverted IRA → age-73 RMD spike</td><td style={{ padding: "8px", color: "var(--fo-proof)" }}>5-Yr Roth Conversion Ladder</td></tr>
                    <tr style={{ borderTop: "1px solid var(--fo-line)" }}><td style={{ padding: "8px" }}><strong>Estate &amp; Protection</strong></td><td style={{ padding: "8px", color: "var(--fo-muted)" }}>Probate exposure + unreviewed forms</td><td style={{ padding: "8px", color: "var(--fo-proof)" }}>Joint Revocable Trust + Pour-Over Will + Beneficiary Audit</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {workflowStep === 3 && (
              <div style={{ marginTop: 14 }}>
                <span className="fo-ns-label">YOUR ANSWERS ({answers.length})</span>
                <p style={{ fontSize: 12, color: "var(--fo-muted)", margin: "4px 0 10px" }}>
                  These are the words we used. Edit or add anything that is wrong; your advisor will see the change.
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  {answers.map((item, idx) => (
                    <div key={idx} className="td-item">
                      <strong>{item.q}</strong>
                      <span style={{ fontSize: 12.5, color: "var(--fo-muted)" }}>{item.a}</span>
                    </div>
                  ))}
                </div>
                <form
                  style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newAnsQ.trim() || !newAnsA.trim()) return;
                    setAnswers((list) => [...list, { q: newAnsQ.trim(), a: newAnsA.trim() }]);
                    setNewAnsQ("");
                    setNewAnsA("");
                  }}
                >
                  <input className="fo-field" style={{ flex: "1 1 160px", marginTop: 0 }} placeholder="Topic (e.g. Homestead goal)" value={newAnsQ} onChange={(e) => setNewAnsQ(e.target.value)} />
                  <input className="fo-field" style={{ flex: "2 1 220px", marginTop: 0 }} placeholder="Your answer in your own words…" value={newAnsA} onChange={(e) => setNewAnsA(e.target.value)} />
                  <button className="fo-btn fo-btn-primary" type="submit">Save Answer</button>
                </form>
              </div>
            )}

            {workflowStep === 4 && (
              <div className="td-item" style={{ marginTop: 14, borderColor: "var(--fo-brass)" }}>
                <span className="fo-ns-label">STAGE 4 · CLIENT ACCEPTANCE RECORD (AUCTUM EVIDENCE STANDARD)</span>
                <p style={{ margin: "4px 0 8px", fontSize: 12.5, color: "var(--fo-muted)" }}>
                  Confirming this record logs an explicit, timestamped acceptance of the planning scope and assumptions. This is an educational acceptance record, not a brokerage order or legal e-signature.
                </p>
                <label className="fo-check-inline">
                  <input type="checkbox" checked={advisorSigned} onChange={(e) => setAdvisorSigned(e.target.checked)} />
                  <span>I have reviewed the assumptions, alternatives, costs, and illustrative disclosures for all {answers.length} recorded items.</span>
                </label>
                {advisorSigned && (
                  <div style={{ marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "var(--fo-proof)" }}>
                    ✓ ACCEPTANCE RECORD LOGGED · {new Date().toISOString()} · RECEIPT: ACC-{intake.name.slice(0, 3).toUpperCase()}-2026
                  </div>
                )}
              </div>
            )}

            {workflowStep === 5 && (
              <div className="td-item" style={{ marginTop: 14 }}>
                <span className="fo-ns-label">STAGE 5 · IMPLEMENTATION &amp; EXECUTION TRACKER</span>
                <label className="fo-check-row"><input type="checkbox" defaultChecked /><span><strong>1. Escalate 401(k) deferral to 9% &amp; max HSA</strong><div style={{ color: "var(--fo-muted)", fontSize: 11.5 }}>Owner: Household payroll portal</div></span></label>
                <label className="fo-check-row"><input type="checkbox" /><span><strong>2. Execute Q4 Roth Conversion inside 22%/24% bracket</strong><div style={{ color: "var(--fo-muted)", fontSize: 11.5 }}>Owner: Advisor + CPA review</div></span></label>
                <label className="fo-check-row"><input type="checkbox" /><span><strong>3. Complete Will &amp; Trust Atelier counsel review &amp; funding</strong><div style={{ color: "var(--fo-muted)", fontSize: 11.5 }}>Owner: Licensed state estate counsel</div></span></label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. WILL & TRUST FORMATION ATELIER */}
      {view === "willtrust" && (
        <div className="fo-exp-grid">
          <div className="fo-chrome-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span className="fo-ns-label">WILL &amp; TRUST FORMATION · STRUCTURE FINDER · WILL GATE · DISCUSSION DRAFTS · CHECKLIST</span>
                <h2 style={{ margin: "4px 0 0" }}>Estate &amp; Trust Atelier</h2>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <div className="fo-seg">
                  {(["TRUST", "WILL", "BOTH"] as const).map((m) => (
                    <button key={m} aria-pressed={docScope === m} onClick={() => setDocScope(m)}>{m}</button>
                  ))}
                </div>
                <select
                  className="fo-field"
                  style={{ width: "auto", marginTop: 0, padding: "6px 10px", fontSize: 12 }}
                  aria-label="Switch active client"
                  value={intake.name}
                  onChange={(e) => {
                    const found = savedClients.find((c) => c.name === e.target.value);
                    if (found) setIntake(found);
                  }}
                >
                  {savedClients.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} ({c.state})</option>
                  ))}
                  {!savedClients.some((c) => c.name === intake.name) && (
                    <option value={intake.name}>{intake.name} (unsaved)</option>
                  )}
                </select>
                <button className="fo-btn fo-btn-primary" onClick={startNewClient}>+ NEW CLIENT</button>
                <button className="fo-btn" onClick={saveCurrentClient}>SAVE CLIENT</button>
                <button className="fo-btn" onClick={() => setIntake(FAMILY_EXAMPLE)}>LOAD FAMILY</button>
                <button className="fo-btn" onClick={() => setIntake(FOUNDER_EXAMPLE)}>LOAD FOUNDER</button>
                <button className="fo-btn" onClick={() => { setFundedIds({}); setCheckedIds({}); setAssets(FUNDING_ITEMS); setIntake(FAMILY_EXAMPLE); }}>RESET</button>
              </div>
            </div>

            {/* 5-Step Intake Tabs */}
            <div className="fo-stepper" style={{ marginTop: 12 }}>
              {["1 · Household", "2 · What matters", "3 · People", "4 · Assets", "5 · Will & companions"].map((label, i) => (
                <button key={label} className="fo-funnel-pill" aria-current={intakeStep === i + 1} onClick={() => setIntakeStep(i + 1)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="fo-wt-two">
              {/* Left: Dynamic 5-Step Interactive Intake Panel */}
              <div className="td-item" style={{ gap: 10 }}>
                {intakeStep === 1 && (
                  <>
                    <span className="fo-ns-label">STEP 1 · HOUSEHOLD &amp; DOMICILE</span>
                    <label style={{ fontSize: 12 }}>Your name<input className="fo-field" value={intake.name} onChange={(e) => setIntake({ ...intake, name: e.target.value })} /></label>
                    <label style={{ fontSize: 12 }}>Spouse name<input className="fo-field" value={intake.spouse} onChange={(e) => setIntake({ ...intake, spouse: e.target.value })} placeholder="Leave blank if single" /></label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={{ fontSize: 12 }}>Marital status
                        <select className="fo-field" value={intake.marital} onChange={(e) => setIntake({ ...intake, marital: e.target.value as "Married" | "Single" })}>
                          <option>Married</option><option>Single</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 12 }}>State of residence
                        <select className="fo-field" value={intake.state} onChange={(e) => setIntake({ ...intake, state: e.target.value as HouseholdIntake["state"] })}>
                          <option>Texas</option><option>California</option><option>Delaware</option><option>Florida</option><option>New York</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <label style={{ fontSize: 11.5 }}>Net worth ($)<input className="fo-field" type="number" value={intake.netWorth} onChange={(e) => setIntake({ ...intake, netWorth: Number(e.target.value) })} /></label>
                      <label style={{ fontSize: 11.5 }}>Retirement ($)<input className="fo-field" type="number" value={intake.retirement} onChange={(e) => setIntake({ ...intake, retirement: Number(e.target.value) })} /></label>
                      <label style={{ fontSize: 11.5 }}>Life face ($)<input className="fo-field" type="number" value={intake.lifeFace} onChange={(e) => setIntake({ ...intake, lifeFace: Number(e.target.value) })} /></label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <label className="fo-check-inline"><input type="checkbox" checked={intake.minorChildren} onChange={(e) => setIntake({ ...intake, minorChildren: e.target.checked })} /><span>Minor children</span></label>
                      <label className="fo-check-inline"><input type="checkbox" checked={intake.specialNeeds} onChange={(e) => setIntake({ ...intake, specialNeeds: e.target.checked })} /><span>Special needs beneficiary</span></label>
                      <label className="fo-check-inline"><input type="checkbox" checked={intake.blended} onChange={(e) => setIntake({ ...intake, blended: e.target.checked })} /><span>Blended family</span></label>
                      <label className="fo-check-inline"><input type="checkbox" checked={intake.homestead} onChange={(e) => setIntake({ ...intake, homestead: e.target.checked })} /><span>Own a homestead</span></label>
                      <label className="fo-check-inline"><input type="checkbox" checked={intake.business} onChange={(e) => setIntake({ ...intake, business: e.target.checked })} /><span>Closely held business</span></label>
                    </div>
                  </>
                )}

                {intakeStep === 2 && (
                  <>
                    <span className="fo-ns-label">STEP 2 · WHAT MATTERS &amp; TRUST GOALS</span>
                    <label className="fo-check-inline"><input type="checkbox" checked={priorities.avoidProbate} onChange={(e) => setPriorities({ ...priorities, avoidProbate: e.target.checked })} /><span>Avoid probate &amp; keep family affairs private</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={priorities.stagedDistributions} onChange={(e) => setPriorities({ ...priorities, stagedDistributions: e.target.checked })} /><span>Stage descendant distributions (ages 25 / 30 / 35)</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={priorities.disclaimerBypass} onChange={(e) => setPriorities({ ...priorities, disclaimerBypass: e.target.checked })} /><span>Include IRC § 2518 disclaimer credit-shelter option</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={priorities.ilitShield} onChange={(e) => setPriorities({ ...priorities, ilitShield: e.target.checked })} /><span>Evaluate ILIT to keep life insurance outside taxable estate</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={priorities.charitableGift} onChange={(e) => setPriorities({ ...priorities, charitableGift: e.target.checked })} /><span>Include charitable legacy / CRUT provision</span></label>
                    <label style={{ fontSize: 12 }}>Precatory note for estate counsel
                      <textarea className="fo-field" rows={3} value={priorities.counselNote} onChange={(e) => setPriorities({ ...priorities, counselNote: e.target.value })} />
                    </label>
                  </>
                )}

                {intakeStep === 3 && (
                  <>
                    <span className="fo-ns-label">STEP 3 · PEOPLE, FIDUCIARIES &amp; BENEFICIARIES</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={{ fontSize: 12 }}>Successor Trustee<input className="fo-field" value={successorTrustee} onChange={(e) => setSuccessorTrustee(e.target.value)} /></label>
                      <label style={{ fontSize: 12 }}>Minor Guardian<input className="fo-field" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} /></label>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {beneficiaries.map((b) => (
                        <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 9px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid var(--fo-line)", fontSize: 12 }}>
                          <span><strong>{b.name}</strong> · {b.relation} {b.minor ? "(Minor)" : ""} · <span style={{ color: "var(--fo-muted)" }}>{b.share}</span></span>
                          <button type="button" className="fo-btn" style={{ padding: "2px 7px", minHeight: 24 }} onClick={() => setBeneficiaries((l) => l.filter((x) => x.id !== b.id))}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <input className="fo-field" style={{ flex: 1, marginTop: 0 }} placeholder="Add child / beneficiary name…" value={newBenName} onChange={(e) => setNewBenName(e.target.value)} />
                      <label className="fo-check-inline" style={{ padding: "5px 8px" }}><input type="checkbox" checked={newBenMinor} onChange={(e) => setNewBenMinor(e.target.checked)} /><span>Minor</span></label>
                      <button
                        type="button"
                        className="fo-btn fo-btn-primary"
                        onClick={() => {
                          if (!newBenName.trim()) return;
                          setBeneficiaries((l) => [...l, { id: `b-${Date.now()}`, name: newBenName.trim(), relation: "Child", minor: newBenMinor, share: "Equal share" }]);
                          setNewBenName("");
                          setNewBenMinor(false);
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  </>
                )}

                {intakeStep === 4 && (
                  <>
                    <span className="fo-ns-label">STEP 4 · ASSET SCHEDULE &amp; TITLING ({assets.length} ITEMS)</span>
                    <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                      {assets.map((a) => (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid var(--fo-line)", fontSize: 12 }}>
                          <span><strong>{a.label}</strong> <span style={{ color: "var(--fo-brass)", fontSize: 10 }}>[{a.type}]</span></span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <strong style={{ fontFamily: "ui-monospace, monospace" }}>{usd(a.amount)}</strong>
                            <button type="button" className="fo-btn" style={{ padding: "2px 7px", minHeight: 24 }} onClick={() => setAssets((l) => l.filter((x) => x.id !== a.id))}>✕</button>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <input className="fo-field" style={{ flex: "2 1 130px", marginTop: 0 }} placeholder="Asset name (e.g. Rental duplex)" value={newAssetLabel} onChange={(e) => setNewAssetLabel(e.target.value)} />
                      <input className="fo-field" style={{ flex: "1 1 90px", marginTop: 0 }} type="number" placeholder="Value ($)" value={newAssetAmt} onChange={(e) => setNewAssetAmt(e.target.value)} />
                      <select className="fo-field" style={{ flex: "1 1 100px", marginTop: 0 }} value={newAssetType} onChange={(e) => setNewAssetType(e.target.value as "RETITLE" | "BENEFICIARY")}>
                        <option value="RETITLE">RETITLE</option>
                        <option value="BENEFICIARY">BENEFICIARY</option>
                      </select>
                      <button
                        type="button"
                        className="fo-btn fo-btn-primary"
                        onClick={() => {
                          const amt = Number(newAssetAmt);
                          if (!newAssetLabel.trim() || !amt) return;
                          setAssets((l) => [...l, { id: `a-${Date.now()}`, label: newAssetLabel.trim(), amount: amt, type: newAssetType, note: newAssetType === "RETITLE" ? "Retitle into trustee name." : "Confirm custodian beneficiary form." }]);
                          setIntake((prev) => ({ ...prev, netWorth: prev.netWorth + amt }));
                          setNewAssetLabel("");
                          setNewAssetAmt("");
                        }}
                      >
                        + Add Asset
                      </button>
                    </div>
                  </>
                )}

                {intakeStep === 5 && (
                  <>
                    <span className="fo-ns-label">STEP 5 · WILL GATE &amp; COMPANION INCAPACITY SUITE</span>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.selfProving} onChange={(e) => setCompanions({ ...companions, selfProving: e.target.checked })} /><span>Attach Self-Proving Affidavit ({intake.state === "Texas" ? "Estates Code § 251.104" : "State Statutory Form"})</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.digitalRufadaa} onChange={(e) => setCompanions({ ...companions, digitalRufadaa: e.target.checked })} /><span>Include Digital Assets Access Authority (RUFADAA)</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.financialPoa} onChange={(e) => setCompanions({ ...companions, financialPoa: e.target.checked })} /><span>Durable Financial Power of Attorney</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.medicalPoa} onChange={(e) => setCompanions({ ...companions, medicalPoa: e.target.checked })} /><span>Medical Power of Attorney / Healthcare Proxy</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.directivePhysicians} onChange={(e) => setCompanions({ ...companions, directivePhysicians: e.target.checked })} /><span>Directive to Physicians (Living Will)</span></label>
                    <label className="fo-check-inline"><input type="checkbox" checked={companions.hipaaRelease} onChange={(e) => setCompanions({ ...companions, hipaaRelease: e.target.checked })} /><span>HIPAA Medical Information Release</span></label>
                  </>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--fo-line)" }}>
                  <button type="button" className="fo-btn" disabled={intakeStep === 1} onClick={() => setIntakeStep((s) => Math.max(1, s - 1))}>← Previous</button>
                  <span style={{ fontSize: 11.5, color: "var(--fo-muted)", alignSelf: "center" }}>Step {intakeStep} of 5</span>
                  <button type="button" className="fo-btn fo-btn-primary" disabled={intakeStep === 5} onClick={() => setIntakeStep((s) => Math.min(5, s + 1))}>Next Step →</button>
                </div>
              </div>

              {/* Right: Live Structure Scorecards + Statutory Callouts */}
              <div style={{ display: "grid", gap: 10 }}>
                <div className="fo-wt-kpis">
                  <div className="fo-ns-card"><span className="fo-ns-label">RECOMMENDED STRUCTURE</span><strong>{RANKED_STRUCTURES.find((s) => s.id === activeStructure)?.name}</strong><span className="td-badge">fit score {fitScore}/100</span></div>
                  <div className="fo-ns-card"><span className="fo-ns-label">WILL TYPE</span><strong>Pour-over will</strong><span className="td-badge">confidence: high</span></div>
                  <div className="fo-ns-card"><span className="fo-ns-label">COMPLEXITY</span><strong>{complexity}/100</strong><p>{complexity < 35 ? "Simple. A will can carry this if you accept probate." : "Multi-factor — specialized counsel essential."}</p></div>
                  <div className="fo-ns-card"><span className="fo-ns-label">IN TAXABLE ESTATE (2026)</span><strong>{usd(taxableEstate)}</strong><p>vs {usd(exemption2026)} exemption</p></div>
                </div>

                {/* Family & Fiduciary SVG Map */}
                <div className="td-item">
                  <span className="fo-ns-label">FAMILY &amp; FIDUCIARY MAP</span>
                  <svg viewBox="0 0 540 128" style={{ width: "100%", height: "auto", display: "block" }}>
                    <g stroke="var(--fo-accent-hi)" strokeOpacity="0.55" strokeWidth="1.5" fill="none">
                      <line x1="150" y1="36" x2="380" y2="36" />
                      <line x1="265" y1="36" x2="265" y2="78" />
                      <line x1="160" y1="78" x2="370" y2="78" />
                    </g>
                    <rect x="20" y="14" width="150" height="44" rx="7" fill="#0D1E3F" stroke="var(--fo-accent)" />
                    <text x="95" y="33" textAnchor="middle" fill="#F1F6FF" fontSize="11" fontWeight="700">{intake.name}</text>
                    <text x="95" y="49" textAnchor="middle" fill="var(--fo-brass)" fontSize="9.5">SETTLOR · TRUSTEE</text>

                    <rect x="370" y="14" width="150" height="44" rx="7" fill="#0D1E3F" stroke="var(--fo-accent)" />
                    <text x="445" y="33" textAnchor="middle" fill="#F1F6FF" fontSize="11" fontWeight="700">{intake.spouse}</text>
                    <text x="445" y="49" textAnchor="middle" fill="var(--fo-brass)" fontSize="9.5">SETTLOR · EXECUTOR</text>

                    <rect x="80" y="80" width="160" height="38" rx="6" fill="#0A1630" stroke="var(--fo-line-hi)" />
                    <text x="160" y="98" textAnchor="middle" fill="#F1F6FF" fontSize="10.5">Adele Harlow · CHILD</text>
                    <text x="160" y="111" textAnchor="middle" fill="var(--fo-accent-hi)" fontSize="9">MINOR · STAGED TRUST</text>

                    <rect x="300" y="80" width="160" height="38" rx="6" fill="#0A1630" stroke="var(--fo-line-hi)" />
                    <text x="380" y="98" textAnchor="middle" fill="#F1F6FF" fontSize="10.5">Noah Harlow · CHILD</text>
                    <text x="380" y="111" textAnchor="middle" fill="var(--fo-accent-hi)" fontSize="9">EQUAL SHARE · STAGED</text>
                  </svg>
                </div>

                {/* Statutory Rules */}
                <div className="fo-assumptions" style={{ marginTop: 0 }}>
                  <strong>Key Statutory &amp; Tax Rules Flagged for Counsel</strong>
                  <ul>
                    {intake.state === "Texas" && intake.homestead && (
                      <li><strong>Texas Homestead (Tax Code § 11.13(j)):</strong> Deeding a homestead to a trust requires qualifying-trust language or the school-tax exemption can drop.</li>
                    )}
                    <li><strong>Life Insurance (IRC § 2035):</strong> Transferring an existing policy into an ILIT risks estate inclusion if death occurs within 3 years.</li>
                    <li><strong>Retirement Accounts (SECURE Act):</strong> Do not retitle IRAs/401(k)s into the trust — update custodian beneficiary forms and verify 10-year distribution rules.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Structures Ranked */}
            <div style={{ marginTop: 14 }}>
              <span className="fo-ns-label">STRUCTURES RANKED FOR THESE ANSWERS</span>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {RANKED_STRUCTURES.map((s) => (
                  <div key={s.id} className="td-item" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <strong>{s.name}</strong> {activeStructure === s.id && <span className="td-badge">IN DRAFT</span>}
                      <p className="td-method">{s.summary}</p>
                    </div>
                    <button className="fo-btn" onClick={() => setActiveStructure(s.id)}>{activeStructure === s.id ? "ACTIVE" : "USE"}</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Discussion Drafts (7) + Export Actions */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span className="fo-ns-label">DISCUSSION DRAFTS ({DRAFTS.length})</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    className="fo-btn"
                    onClick={() => {
                      const txt = DRAFTS.map((d) => `=== ${d.title} ===\n${d.subtitle}\n\n${d.body}`).join("\n\n");
                      const blob = new Blob([txt], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "fiduciary-os-discussion-drafts.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    DOWNLOAD ALL DRAFTS (.TXT)
                  </button>
                  <button className="fo-btn" onClick={() => window.print()}>PRINT THIS DRAFT</button>
                  <button
                    className="fo-btn fo-btn-primary"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${DRAFTS[activeDraft].title}\n\n${DRAFTS[activeDraft].body}`).catch(() => {});
                      setCopyToast("Attorney brief copied to clipboard.");
                      setTimeout(() => setCopyToast(""), 2200);
                    }}
                  >
                    COPY ATTORNEY BRIEF
                  </button>
                </div>
              </div>
              {copyToast && <div style={{ fontSize: 12, color: "var(--fo-proof)", marginTop: 6 }}>{copyToast}</div>}
              <div className="td-cats" style={{ marginTop: 8 }}>
                {DRAFTS.map((d, i) => (
                  <button key={d.title} className="td-cat-pill" aria-pressed={activeDraft === i} onClick={() => setActiveDraft(i)}>
                    {d.title}
                  </button>
                ))}
              </div>
              <div className="td-item" style={{ marginTop: 10 }}>
                <strong>{DRAFTS[activeDraft].title}</strong>
                <span style={{ fontSize: 11.5, color: "var(--fo-brass)" }}>{DRAFTS[activeDraft].subtitle}</span>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, color: "var(--fo-muted)", margin: "8px 0 0", lineHeight: 1.55 }}>
                  {DRAFTS[activeDraft].body}
                </pre>
              </div>
            </div>

            {/* Funding Tracker + 16-Item Signing Checklist */}
            <div className="fo-wt-two" style={{ marginTop: 16 }}>
              <div className="td-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="fo-ns-label">FUNDING TRACKER · A TRUST ONLY CONTROLS WHAT IS RETITLED</span>
                  <span className="td-badge">{fundedPct}% · {usd(fundedRetitled)} of {usd(retitledTotal)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", margin: "6px 0" }}>
                  <div style={{ width: `${fundedPct}%`, height: "100%", background: "var(--fo-proof)", transition: "width 0.2s" }} />
                </div>
                {assets.map((f) => (
                  <label key={f.id} className="fo-check-row">
                    <input type="checkbox" checked={!!fundedIds[f.id]} onChange={(e) => setFundedIds({ ...fundedIds, [f.id]: e.target.checked })} />
                    <span style={{ flex: 1 }}>
                      <strong>{f.label} · {usd(f.amount)}</strong> <span style={{ color: "var(--fo-brass)", fontSize: 10 }}>[{f.type}]</span>
                      <div style={{ color: "var(--fo-muted)", fontSize: 11.5 }}>{f.note}</div>
                    </span>
                  </label>
                ))}
              </div>

              <div className="td-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="fo-ns-label">SIGNING &amp; FUNDING CHECKLIST</span>
                  <span className="td-badge">{doneChecks}/{totalChecks} done</span>
                </div>
                {CHECKLIST_GROUPS.map((g) => (
                  <div key={g.phase} style={{ marginTop: 6 }}>
                    <div className="fo-tool-group">{g.phase}</div>
                    {g.items.map((item) => (
                      <label key={item.id} className="fo-check-row">
                        <input type="checkbox" checked={!!checkedIds[item.id]} onChange={(e) => setCheckedIds({ ...checkedIds, [item.id]: e.target.checked })} />
                        <span style={{ flex: 1 }}>
                          <strong>{item.title}</strong> <span style={{ color: "var(--fo-muted)" }}>({item.owner})</span>
                          <div style={{ color: "var(--fo-muted)", fontSize: 11.5 }}>{item.detail}</div>
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 11.5, color: "var(--fo-muted)", margin: "12px 0 0" }}>
              Sandbox tool. Discussion drafts only, not executed legal instruments and not legal, tax, or investment advice. A licensed attorney in your state must review before signing or retitling.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
