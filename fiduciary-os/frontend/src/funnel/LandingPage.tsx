import { useId, useState, type ReactNode } from "react";
import FunnelLayout from "./FunnelLayout";
import { stages } from "../workflow";
import {
  defaultDemoInputs,
  estimateCoverage,
  MAX_YEARS,
  money,
  SAMPLE_INFLATION,
  SAMPLE_RETURN,
  validateDemo,
  type DemoInputs,
} from "./demo";

type Tone = "need" | "ready" | "wait" | "done";
export function StatusLight({ tone, children }: { tone: Tone; children: ReactNode }) {
  // The dot is decorative; the word carries the status.
  return <span className={`fx-status fx-s-${tone}`}>{children}</span>;
}

export const stageCopy: Record<(typeof stages)[number], string> = {
  "Gather information": "The guide asks only for what this step needs.",
  "Analyze choices":
    "The Composer lays out options. Sample results are labeled as examples.",
  "Ready for review":
    "You review the Composer's work. If something needs to change, the Composer prepares a new version for you instead of editing this one.",
  "Waiting for approval":
    "You approve this exact version. A changed plan becomes a new step that needs a fresh approval.",
  "In progress":
    "Starts only after your approval. Approving a plan never moves money.",
  "Verified complete": "Closes only when evidence is recorded.",
};

const movements = [
  ["01 · Listen", "Gather your picture", "Accounts, income, spending and what matters most to you."],
  ["02 · Compose", "Build scenarios", "Several realistic paths, not one guess."],
  ["03 · Tune", "Adjust for real life", "Taxes, income timing, Roth conversions and risk."],
  ["04 · Perform", "Act and review", "Dated next steps, with review when your life changes."],
] as const;

type GuideMode = "on" | "paused" | "skipped" | "finished";

function Explain({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="fx-btn-small"
        aria-expanded={open}
        aria-controls={id}
        aria-label={name}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div className="fx-explain" id={id} hidden={!open}>
        {children}
      </div>
    </>
  );
}

function NumberField({
  id,
  label,
  value,
  error,
  onChange,
  hint,
  step,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  step?: number;
  onChange: (v: string) => void;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="fx-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p className="fx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="fx-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function LandingPage({ focusOnMount = false }: { focusOnMount?: boolean }) {
  const [inputs, setInputs] = useState<DemoInputs>(defaultDemoInputs);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<GuideMode>("on");
  const [announce, setAnnounce] = useState("");
  const errors = validateDemo(inputs);
  const set = (k: keyof DemoInputs) => (v: string) =>
    setInputs({ ...inputs, [k]: v });
  const chip1Ok = !errors.age && !errors.savings;
  const chip2Ok = !errors.spending && !errors.guaranteed;
  const result =
    chip1Ok && chip2Ok
      ? estimateCoverage(
          Number(inputs.savings),
          Number(inputs.spending),
          Number(inputs.guaranteed),
        )
      : null;
  const yearsText = result
    ? `${result.capped ? `${MAX_YEARS}+` : result.years} years`
    : "—";

  const beats = [
    {
      chip: "Age and savings",
      why: "Your age and savings set the starting point for everything after this.",
      needs: "Your age and roughly what you have saved for retirement. Rough numbers are fine.",
      found: chip1Ok
        ? `Starting point: ${money(Number(inputs.savings))} saved at age ${inputs.age}.`
        : "Waiting for a valid age and savings amount.",
      choice: "Keep these numbers or change them. Nothing is saved or sent.",
    },
    {
      chip: "Spending and guaranteed income",
      why: "The gap between what you spend and the income you can count on is what savings have to cover each year.",
      needs: "Your yearly spending goal and guaranteed income, such as Social Security.",
      found: chip2Ok
        ? `Yearly gap savings must cover: ${money(Math.max(0, Number(inputs.spending) - Number(inputs.guaranteed)))}.`
        : "Waiting for valid spending and income amounts.",
      choice: "Try a different spending goal to see how the gap changes.",
    },
    {
      chip: "Sample retirement result",
      why: "This shows how long savings could cover that gap in a simple example.",
      needs: "Nothing new. It uses the first two chips and two stated assumptions.",
      found: result
        ? `In this example, about ${yearsText}. This is an example, not a recommendation.`
        : "Fill in the first two chips to see the example.",
      choice:
        "Open the explanation, request advice, or stop here. Deciding later is always fine.",
    },
  ];
  const total = beats.length;
  const guiding = mode === "on" || mode === "paused";
  const activeChip = guiding ? step : -1;

  function go(to: number) {
    setStep(to);
    setAnnounce(`Step ${to + 1} of ${total}: ${beats[to].chip}.`);
  }
  function next() {
    if (mode !== "on") return;
    if (step < total - 1) go(step + 1);
    else {
      setMode("finished");
      setAnnounce("Guide finished. Every chip still works on its own.");
    }
  }
  function back() {
    if (mode === "on" && step > 0) go(step - 1);
  }
  function togglePause() {
    if (mode === "on") {
      setMode("paused");
      setAnnounce("Guide paused.");
    } else if (mode === "paused") {
      setMode("on");
      setAnnounce(`Guide resumed at step ${step + 1} of ${total}.`);
    }
  }
  function skip() {
    setMode("skipped");
    setAnnounce("Guide skipped. Every chip still works on its own.");
  }
  function restart() {
    setMode("on");
    go(0);
  }
  const beat = beats[step];
  const chipStatus = (i: number): [Tone, string] => {
    if (i === 0) return chip1Ok ? ["ready", "Ready"] : ["need", "Needs info"];
    if (i === 1) return chip2Ok ? ["ready", "Ready"] : ["need", "Needs info"];
    return result ? ["done", "Example ready"] : ["wait", "Waiting"];
  };
  const chipClass = (i: number) =>
    `fx-chip${activeChip === i ? " fx-active" : ""}`;
  const chipHeader = (i: number, code: string) => {
    const [tone, word] = chipStatus(i);
    return (
      <div className="fx-top">
        <span className="fx-etched">{code}</span>
        <StatusLight tone={tone}>{word}</StatusLight>
      </div>
    );
  };

  return (
    <FunnelLayout current="start" focusOnMount={focusOnMount}>
      <div className="fx-wrap">
        <section className="fx-hero" aria-labelledby="fx-hero-h">
          <div>
            <p className="fx-etched">Symphony Composer · Retirement planning</p>
            <h1 id="fx-hero-h">Your retirement, composed and tuned.</h1>
            <p className="fx-lede">
              The Symphony Composer lays your plan out as a board of clear
              steps. A guide takes you through each one, shows the math behind
              every number, and lets you decide at your own pace.
            </p>
            <div className="fx-cta">
              <a className="fx-btn fx-btn-primary" href="#fx-try">
                Try the free plan check
              </a>
              <a className="fx-btn fx-btn-ghost" href="#/request">
                Request advice
              </a>
            </div>
            <p className="fx-disclaim">
              Free to try. Sample results are estimates, not guarantees, and
              are labeled as examples.
            </p>
          </div>
          <div
            className="fx-hero-board"
            role="img"
            aria-label="Three planning steps linked in a path from today to retirement."
          >
            <svg className="fx-traces" viewBox="0 0 400 420" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path className="fx-trace" d="M20 70 H60 V200 H110" />
              <path className="fx-trace fx-live" d="M20 70 H60 V200 H110 M150 200 V330 H200" />
              <path className="fx-trace" d="M380 40 H350 V380 H320" />
            </svg>
            <div className="fx-hero-stack" aria-hidden="true">
              {[
                ["FOS-01 · Today", "Done", "done", "Your picture", "Savings, income and goals, in one place."],
                ["FOS-02 · Tune", "Ready", "ready", "Income you can count on", "Spending matched to guaranteed income."],
                ["FOS-03 · Retire", "Next", "wait", "Your retirement plan", "Dated steps, reviewed with you."],
              ].map(([code, word, tone, title, mean], i) => (
                <div className={`fx-chip${i === 1 ? " fx-active" : ""}`} key={code}>
                  <div className="fx-face">
                    <div className="fx-top">
                      <span className="fx-etched">{code}</span>
                      <StatusLight tone={tone as Tone}>{word}</StatusLight>
                    </div>
                    <h3>{title}</h3>
                    <p className="fx-mean">{mean}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="fx-panel fx-light" aria-labelledby="fx-how-h">
        <div className="fx-wrap">
          <p className="fx-etched">How the Composer works</p>
          <h2 id="fx-how-h">Four movements, one clear plan</h2>
          <p className="fx-sub">
            Each movement is a chip on your board. You always see what it used,
            what it found, and what it means for you.
          </p>
          <div className="fx-grid4">
            {movements.map(([num, title, mean]) => (
              <article className="fx-chip" key={num}>
                <div className="fx-face">
                  <div className="fx-top">
                    <span className="fx-etched fx-num">{num}</span>
                  </div>
                  <h3>{title}</h3>
                  <p className="fx-mean">{mean}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fx-panel fx-dark" id="fx-try" tabIndex={-1} aria-labelledby="fx-try-h">
        <div className="fx-wrap">
          <p className="fx-etched">Free plan check</p>
          <h2 id="fx-try-h">Walk three chips with a guide</h2>
          <p className="fx-sub">
            No sign-up needed. Nothing you type here is saved or sent.
          </p>
          <div className="fx-guide">
            <aside className="fx-guide-panel" aria-labelledby="fx-guide-title">
              <div className="fx-who">
                <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
                  <circle cx="17" cy="17" r="16" fill="#2a3139" stroke="#c8874a" />
                  <path d="M10 20c2 3 12 3 14 0M12 13h2M20 13h2" stroke="#e9a866" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
                <div>
                  <strong id="fx-guide-title">Your guide</strong>
                  <span>Guided assistant, not a licensed advisor</span>
                </div>
              </div>
              {guiding ? (
                <>
                  <p className="fx-progress">
                    Step {step + 1} of {total}
                    {mode === "paused" ? " · Paused" : ""}
                  </p>
                  <div className="fx-meter" aria-hidden="true">
                    <i style={{ width: `${((step + 1) / total) * 100}%` }} />
                  </div>
                  <h3>{beat.chip}</h3>
                  <dl className="fx-beats">
                    <dt>Why this matters</dt>
                    <dd>{beat.why}</dd>
                    <dt>What we need from you</dt>
                    <dd>{beat.needs}</dd>
                    <dt>What the Composer found</dt>
                    <dd>{beat.found}</dd>
                    <dt>Your choice</dt>
                    <dd>{beat.choice}</dd>
                  </dl>
                  <div className="fx-guide-controls">
                    <button type="button" onClick={back} disabled={mode !== "on" || step === 0}>
                      Back
                    </button>
                    <button type="button" className="fx-go" onClick={next} disabled={mode !== "on"}>
                      {step === total - 1 ? "Finish guide" : "Next step"}
                    </button>
                    <button type="button" aria-pressed={mode === "paused"} onClick={togglePause}>
                      {mode === "paused" ? "Resume guide" : "Pause guide"}
                    </button>
                    <button type="button" onClick={skip}>
                      Skip guide
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="fx-progress">
                    {mode === "finished" ? "Guide finished" : "Guide off"}
                  </p>
                  <p>
                    Every chip still works on its own. You can restart the guide
                    any time.
                  </p>
                  <div className="fx-guide-controls">
                    <button type="button" className="fx-go" onClick={restart}>
                      Restart guide
                    </button>
                  </div>
                </>
              )}
              <p className="fx-sr" role="status" aria-live="polite">
                {announce}
              </p>
            </aside>

            <div className="fx-demo-chips">
              <article className={chipClass(0)} aria-labelledby="fx-c1-h" aria-current={activeChip === 0 ? "step" : undefined}>
                <div className="fx-face">
                  {chipHeader(0, "FOS-01 · Your picture")}
                  <h3 id="fx-c1-h">Age and savings</h3>
                  <NumberField id="fx-age" label="Your age" value={inputs.age} error={errors.age} onChange={set("age")} />
                  <NumberField id="fx-savings" label="Retirement savings today ($)" value={inputs.savings} error={errors.savings} hint="Rough numbers are fine." step={1000} onChange={set("savings")} />
                  <div className="fx-actions">
                    <Explain label="Explain why we ask" name="Explain why we ask for age and savings">
                      <p>Savings are the starting balance for the example. Age is shown for context; this simple example does not change with age.</p>
                    </Explain>
                  </div>
                </div>
              </article>
              <article className={chipClass(1)} aria-labelledby="fx-c2-h" aria-current={activeChip === 1 ? "step" : undefined}>
                <div className="fx-face">
                  {chipHeader(1, "FOS-02 · Spending goal")}
                  <h3 id="fx-c2-h">Spending and guaranteed income</h3>
                  <NumberField id="fx-spending" label="Yearly spending in retirement ($)" value={inputs.spending} error={errors.spending} step={1000} onChange={set("spending")} />
                  <NumberField id="fx-guaranteed" label="Yearly guaranteed income, like Social Security ($)" value={inputs.guaranteed} error={errors.guaranteed} step={1000} onChange={set("guaranteed")} />
                  <div className="fx-actions">
                    <Explain label="Explain the gap" name="Explain the gap between spending and guaranteed income">
                      <p><code>gap = spending − guaranteed income</code>. Savings pay this gap each year in the example.</p>
                    </Explain>
                  </div>
                </div>
              </article>
              <article className={chipClass(2)} aria-labelledby="fx-c3-h" aria-current={activeChip === 2 ? "step" : undefined}>
                <div className="fx-face">
                  {chipHeader(2, "FOS-03 · Sample result")}
                  <h3 id="fx-c3-h">
                    How long savings could cover the gap{" "}
                    <span className="fx-tag">Example estimate</span>
                  </h3>
                  <p className="fx-value" aria-live="polite">{yearsText}</p>
                  <p className="fx-mean">
                    {result
                      ? result.gap === 0
                        ? "Guaranteed income covers spending in this example."
                        : `In this example, savings cover a yearly gap of ${money(result.gap)} for about ${result.capped ? `${MAX_YEARS} or more` : result.years} years.`
                      : "Fill in the first two chips to see the example."}{" "}
                    Not a recommendation.
                  </p>
                  <ul className="fx-pins" aria-label="Inputs used">
                    <li>Savings: you entered</li>
                    <li>Spending: you entered</li>
                    <li>Return: {SAMPLE_RETURN * 100}% assumption</li>
                    <li>Inflation: {SAMPLE_INFLATION * 100}% assumption</li>
                  </ul>
                  <div className="fx-actions">
                    <Explain label="Explain this estimate" name="Explain this estimate: sample retirement result">
                      <p><strong>In plain words:</strong> each year savings pay the gap between spending and guaranteed income. The gap grows with inflation and savings grow with the assumed return. We count the years until savings run out, up to {MAX_YEARS}.</p>
                      <p><code>gap = spending − guaranteed income</code>, rising {SAMPLE_INFLATION * 100}% a year; savings grow {SAMPLE_RETURN * 100}% a year after each withdrawal.</p>
                      <p>This simple example ignores taxes, market swings and one-time costs. A full plan models those.</p>
                    </Explain>
                    <a className="fx-btn fx-btn-dark fx-btn-small-link" href="#/request">
                      Get a full plan
                    </a>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="fx-panel fx-light" aria-labelledby="fx-stages-h">
        <div className="fx-wrap">
          <p className="fx-etched">How a plan moves</p>
          <h2 id="fx-stages-h">Six steps, in order, every time</h2>
          <p className="fx-sub">
            Steps can't be skipped. Approving a plan covers planning only and
            never moves money.
          </p>
          <ol className="fx-stage-list">
            {stages.map((s, i) => (
              <li key={s}>
                <span className="fx-etched fx-num">0{i + 1}</span>
                <strong>{s}</strong>
                <span>{stageCopy[s]}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="fx-panel fx-light fx-tight" aria-labelledby="fx-diff-h">
        <div className="fx-wrap">
          <p className="fx-etched">Why people trust it</p>
          <h2 id="fx-diff-h">Nothing hidden behind a number</h2>
          <div className="fx-grid3">
            {[
              ["Every number explained", "Open any chip to see the formula, your inputs and the sources."],
              ["Every assumption visible", "Return and inflation assumptions are shown on the chip that uses them."],
              ["Every decision yours", "Reviewing, approving and acting stay separate steps, each recorded."],
            ].map(([t, m]) => (
              <article className="fx-chip" key={t}>
                <div className="fx-face">
                  <h3>{t}</h3>
                  <p className="fx-mean">{m}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="fx-placeholder" role="note" aria-label="Placeholder: needs compliance review">
            <strong>Placeholder — needs compliance review before launch.</strong>{" "}
            Any comparison with other platforms goes here only with proof and
            sign-off. No comparative or performance claims are made on this
            page.
          </div>
          <ul className="fx-trust">
            <li>Sample data only: the plan check uses what you type and two stated assumptions.</li>
            <li>No account linking and no sign-up on this page.</li>
            <li>Recommendations that need a professional are handed to a human.</li>
          </ul>
        </div>
      </section>

      <section className="fx-panel fx-dark" aria-labelledby="fx-close-h">
        <div className="fx-wrap fx-close">
          <h2 id="fx-close-h">Ready for the next step?</h2>
          <div className="fx-cta">
            <a className="fx-btn fx-btn-primary" href="#/request">Request advice</a>
            <a className="fx-btn fx-btn-ghost" href="#fx-try">Start free</a>
          </div>
        </div>
      </section>
    </FunnelLayout>
  );
}
