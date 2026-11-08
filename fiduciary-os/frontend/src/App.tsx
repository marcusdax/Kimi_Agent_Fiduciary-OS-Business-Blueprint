import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Compass,
  FileText,
  Flag,
  LayoutDashboard,
  Leaf,
  LockKeyhole,
  Menu,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  INITIAL_INPUTS,
  Planning,
  SAMPLE_ACTIONS,
  STAGES,
  type Audience,
  type Inputs,
  type PlanningAction,
  type View,
} from "./planning";

const NAV: { label: View; icon: typeof Compass }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My plan", icon: Compass },
  { label: "Compare choices", icon: Scale },
  { label: "Next steps", icon: ClipboardList },
  { label: "Documents", icon: FileText },
  { label: "Planning team", icon: Users },
];
const GOAL_CONTENT = [
  {
    title: (
      <>
        Make room for
        <br />
        your next chapter.
      </>
    ),
    detail:
      "Start with your retirement income. See what’s covered, explore the gap, and prepare for a better conversation.",
    cta: "Explore my income choices",
  },
  {
    title: (
      <>
        Care for the people
        <br />
        who count on you.
      </>
    ),
    detail:
      "Gather questions about existing coverage, costs, and the protection your household may need. Review the details before considering a change.",
    cta: "Review protection questions",
  },
  {
    title: (
      <>
        Make your wishes
        <br />
        easier to understand.
      </>
    ),
    detail:
      "Start by confirming beneficiary details and the questions to bring to your estate attorney. No legal documents are created in this preview.",
    cta: "Prepare a legacy review",
  },
];
const GOALS = [
  "A confident retirement",
  "Protect the people I love",
  "Leave a thoughtful legacy",
];

export default function App() {
  const [view, setView] = useState<View>("Overview");
  const [audience, setAudience] = useState<Audience>("household");
  const [goal, setGoal] = useState(GOALS[0]);
  const [inputs, setInputs] = useState<Inputs>(INITIAL_INPUTS);
  const [actions, setActions] = useState<PlanningAction[]>(SAMPLE_ACTIONS);
  const [selected, setSelected] = useState<string>("income");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [document, setDocument] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const updateButton = useRef<HTMLButtonElement>(null);
  const inputError = Planning.validate(inputs);
  const estimate = inputError ? null : Planning.estimate(inputs);
  const action = actions.find((item) => item.id === selected) ?? actions[0];
  const complete = actions.filter(
    (item) => item.stage === "Verified complete",
  ).length;
  const open = actions.length - complete;
  const goalIndex = GOALS.indexOf(goal);
  const focus = GOAL_CONTENT[goalIndex];
  useLayoutEffect(() => {
    heading.current?.focus();
  }, [view]);
  useLayoutEffect(() => {
    updateButton.current?.focus();
  }, [action.stage]);

  function navigate(next: View) {
    setView(next);
    setMenu(false);
    setError("");
    setNotice("");
  }
  function openAction(id: string) {
    setSelected(id);
    setNote("");
    setConsent(false);
    navigate("Next steps");
  }
  function updateAction(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const target = Planning.next(action.stage);
      if (!target) return;
      const updated = Planning.transition(action, target, {
        audience,
        note,
        consent,
      });
      setActions((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        `${action.title} moved to ${target}. This is a demo record only.`,
      );
      setNote("");
      setConsent(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to change the stage.",
      );
    }
  }
  function reset() {
    setInputs(INITIAL_INPUTS);
    setActions(SAMPLE_ACTIONS);
    setSelected("income");
    setGoal(GOALS[0]);
    setNote("");
    setConsent(false);
    setError("");
    setNotice("The sample workspace has been reset.");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside
        className={`sidebar ${menu ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <a
          className="brand"
          href="#main-content"
          onClick={() => navigate("Overview")}
        >
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={24} />
          </span>
          <span>
            fiduciary<span className="brand-os">OS</span>
            <small>Clarity for what comes next.</small>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${view === label ? "active" : ""}`}
              aria-current={view === label ? "page" : undefined}
              onClick={() => navigate(label)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {label === "Next steps" && (
                <span className="nav-count">{open}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-mark">
              <Sparkles size={18} />
            </span>
            <h2>
              A little clarity.
              <br />A meaningful next step.
            </h2>
            <p>You don’t need every answer to start asking better questions.</p>
            <button
              onClick={() => {
                setHelp(true);
                navigate("Overview");
              }}
            >
              How this works <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="help-button"
            onClick={() => setHelp(!help)}
            aria-expanded={help}
          >
            <CircleHelp size={18} /> About this preview
          </button>
          <div className="profile">
            <span className="avatar">SH</span>
            <span>
              Sample household<small>Illustrative workspace</small>
            </span>
            <span className="profile-dot" aria-hidden="true" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
              aria-expanded={menu}
            >
              <Menu size={22} />
            </button>
            <span>Personal workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{view}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-tag">INTERACTIVE PREVIEW</span>
            <label className="audience-label">
              <span className="sr-only">Demo audience</span>
              <select
                aria-label="Demo audience"
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as Audience);
                  setError("");
                  setConsent(false);
                  setNote("");
                }}
              >
                <option value="household">Household view</option>
                <option value="advisor">Planning-team view</option>
              </select>
            </label>
            <span className="avatar small">SH</span>
          </div>
        </header>
        <main id="main-content" className="main" tabIndex={-1}>
          <div className="demo-banner">
            <span>
              <span className="status-dot" /> Sample data only · Nothing is
              linked, sent, or executed.
            </span>
            <button onClick={reset}>Reset preview</button>
          </div>
          {help && (
            <section className="help-panel" aria-label="About this preview">
              <button
                className="icon-button panel-close"
                aria-label="Close preview information"
                onClick={() => setHelp(false)}
              >
                <X size={18} />
              </button>
              <h2>A working preview, not a live financial service.</h2>
              <p>
                Explore goals, change sample assumptions, compare monthly income
                gaps, and rehearse an action’s review history. Changes stay in
                memory and reset when the page reloads. Audience switching
                demonstrates two layouts, not authentication or access control.
                Do not enter personal information.
              </p>
              <p>
                No accounts, document uploads, professional reviews, investment
                transactions, or actual authorizations are connected.
                Calculations are simple arithmetic, not financial advice or a
                simulation. “Fiduciary OS” is a product name, not a regulatory
                credential.
              </p>
            </section>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {audience === "household"
                  ? "YOUR LIFE. YOUR NEXT CHAPTER."
                  : "THE PEOPLE BEHIND EVERY PLAN."}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {view === "Overview"
                  ? audience === "household"
                    ? "A clearer picture. A next step."
                    : "Good planning moves together."
                  : view}
              </h1>
              <p>
                {view === "Overview"
                  ? "Bring your goals, choices, and next steps into focus."
                  : view === "Next steps"
                    ? "Keep the decision, the evidence, and the follow-through connected."
                    : "Understand the details without losing sight of what matters."}
              </p>
            </div>
            <button
              className="button secondary heading-button"
              onClick={() =>
                navigate(view === "My plan" ? "Compare choices" : "My plan")
              }
            >
              <Compass size={16} />{" "}
              {view === "My plan" ? "Explore choices" : "View my plan"}
            </button>
          </div>
          <div className="live-notice" role="status" aria-live="polite">
            {notice}
          </div>

          {view === "Overview" && (
            <>
              <section
                className="hero-grid"
                aria-label="Your planning priorities"
              >
                <div className="next-step-card">
                  <div className="hero-top">
                    <span className="pill light">
                      <span className="status-dot" /> YOUR NEXT MEANINGFUL STEP
                    </span>
                    <span className="step-index">01 / 03</span>
                  </div>
                  <h2>{focus.title}</h2>
                  <p>{focus.detail}</p>
                  <button
                    className="button cream"
                    onClick={() =>
                      goalIndex === 0
                        ? navigate("Compare choices")
                        : openAction(
                            goalIndex === 1 ? "protection" : "beneficiaries",
                          )
                    }
                  >
                    {focus.cta} <ArrowRight size={17} />
                  </button>
                  <div className="hero-footer">
                    <ShieldCheck size={16} />
                    <span>Explore first. Decide when you’re ready.</span>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <div className="goal-card card">
                  <div className="section-top">
                    <span className="eyebrow">WHAT MATTERS TO YOU</span>
                    <Flag size={18} />
                  </div>
                  <h2>
                    A plan with your
                    <br />
                    life at the center.
                  </h2>
                  <p>Choose the goal you want to focus on.</p>
                  <div className="goal-options">
                    {GOALS.map((item, i) => (
                      <button
                        key={item}
                        aria-pressed={goal === item}
                        className={goal === item ? "selected" : ""}
                        onClick={() => {
                          setGoal(item);
                          setNotice(`Your focus is now ${item.toLowerCase()}.`);
                        }}
                      >
                        <span className="goal-icon">
                          {i === 0 ? (
                            <Compass size={18} />
                          ) : i === 1 ? (
                            <ShieldCheck size={18} />
                          ) : (
                            <Leaf size={18} />
                          )}
                        </span>
                        <span>{item}</span>
                        {goal === item ? (
                          <Check size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("My plan")}
                  >
                    See your plan <ArrowRight size={15} />
                  </button>
                </div>
              </section>
              <section
                aria-labelledby="snapshot-title"
                className="snapshot-section"
              >
                <div className="section-heading">
                  <div>
                    <h2 id="snapshot-title">Your financial picture</h2>
                    <p>A starting point, not the whole story.</p>
                  </div>
                  <span className="subtle-tag">ILLUSTRATIVE ESTIMATES</span>
                </div>
                <div className="metric-grid">
                  <article className="metric card">
                    <span className="metric-label">
                      Planning portfolio <Compass size={17} />
                    </span>
                    <strong>{Planning.money(inputs.portfolio)}</strong>
                    <span>Sample investments · not linked accounts</span>
                  </article>
                  <article className="metric card">
                    <span className="metric-label">
                      Monthly income <ArrowDownLeft size={17} />
                    </span>
                    <strong>{Planning.money(inputs.income)}</strong>
                    <span>Assumed Social Security + pension</span>
                  </article>
                  <article className="metric card">
                    <span className="metric-label">
                      Monthly spending <ArrowUpRight size={17} />
                    </span>
                    <strong>{Planning.money(inputs.spending)}</strong>
                    <span>Assumed household spending</span>
                  </article>
                  <article className="metric card focus-metric">
                    <span className="metric-label">
                      Monthly income gap <Scale size={17} />
                    </span>
                    <strong>
                      {estimate ? Planning.money(estimate.gap) : "Check inputs"}
                    </strong>
                    <button
                      className="text-button"
                      onClick={() => navigate("Compare choices")}
                    >
                      Understand the gap <ArrowRight size={14} />
                    </button>
                  </article>
                </div>
              </section>
              <div className="bottom-grid">
                <section
                  className="card action-list"
                  aria-labelledby="actions-title"
                >
                  <div className="section-heading">
                    <div>
                      <h2 id="actions-title">
                        Small steps. Meaningful progress.
                      </h2>
                      <p>Your planning conversations, made actionable.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Next steps")}
                    >
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  {actions.slice(0, 3).map((item, index) => (
                    <button
                      className="action-row"
                      key={item.id}
                      onClick={() => openAction(item.id)}
                    >
                      <span className="action-number">0{index + 1}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.owner} · {item.stage}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </section>
                <section className="insight-card">
                  <span className="eyebrow">
                    <Leaf size={16} /> A MOMENT OF CLARITY
                  </span>
                  <h2>
                    Your plan should evolve
                    <br />
                    with your life.
                  </h2>
                  <p>
                    A change in family, work, or priorities is a reason to
                    revisit your choices—not a sign that you got them wrong.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("Planning team")}
                  >
                    Prepare for a conversation <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}

          {view === "My plan" && (
            <div className="detail-grid">
              <section className="card content-card">
                <span className="eyebrow">YOUR NORTH STAR</span>
                <h2>{goal}</h2>
                <p>
                  Start with one decision. Build the picture before choosing a
                  product.
                </p>
                <ol className="journey">
                  <li>
                    <strong>Name what matters</strong>
                    <span>Current focus: {goal.toLowerCase()}.</span>
                  </li>
                  <li>
                    <strong>Confirm the starting point</strong>
                    <span>
                      All amounts in this preview are illustrative and
                      unverified.
                    </span>
                  </li>
                  <li>
                    <strong>Compare meaningful alternatives</strong>
                    <span>
                      Explore spending choices with the same baseline.
                    </span>
                  </li>
                  <li>
                    <strong>Review, then decide</strong>
                    <span>
                      Keep a professional review separate from your approval.
                    </span>
                  </li>
                  <li>
                    <strong>Follow through and revisit</strong>
                    <span>Record evidence; preserve completed decisions.</span>
                  </li>
                </ol>
                <button
                  className="button primary"
                  onClick={() => navigate("Compare choices")}
                >
                  Compare income choices <ArrowRight size={16} />
                </button>
              </section>
              <section className="card content-card">
                <h2>What’s known. What’s missing.</h2>
                <dl className="facts">
                  <div>
                    <dt>Source</dt>
                    <dd>Sample household</dd>
                  </div>
                  <div>
                    <dt>Portfolio</dt>
                    <dd>{Planning.money(inputs.portfolio)}</dd>
                  </div>
                  <div>
                    <dt>Income / month</dt>
                    <dd>{Planning.money(inputs.income)}</dd>
                  </div>
                  <div>
                    <dt>Spending / month</dt>
                    <dd>{Planning.money(inputs.spending)}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>Not verified</dd>
                  </div>
                </dl>
                <div className="notice-box">
                  <h3>Before a real decision</h3>
                  <p>
                    Confirm account balances, benefit statements, spending, tax
                    circumstances, and existing contracts with an appropriately
                    qualified professional.
                  </p>
                </div>
              </section>
            </div>
          )}

          {view === "Compare choices" && (
            <>
              <section className="comparison-intro">
                <div>
                  <span className="eyebrow">
                    RETIREMENT INCOME · SIMPLE FIRST VIEW
                  </span>
                  <h2>What would a little more flexibility change?</h2>
                  <p>
                    Compare your assumed monthly spending with an alternative
                    that spends $500 less. No account connection required.
                  </p>
                </div>
                <span className="pill neutral">
                  <SlidersHorizontal size={15} /> Adjustable assumptions
                </span>
              </section>
              <div className="detail-grid">
                <section className="card content-card">
                  <h2>Your starting assumptions</h2>
                  <p>
                    Use sample numbers only. These inputs are not saved or sent
                    anywhere.
                  </p>
                  <div className="input-grid">
                    {(
                      [
                        { key: "portfolio", label: "Planning portfolio ($)" },
                        { key: "income", label: "Monthly income ($)" },
                        { key: "spending", label: "Monthly spending ($)" },
                      ] as const
                    ).map(({ key, label }) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          min={key === "portfolio" ? 1 : 0}
                          max={key === "portfolio" ? 1e10 : 1e7}
                          step="any"
                          value={Number.isNaN(inputs[key]) ? "" : inputs[key]}
                          aria-invalid={!!inputError}
                          aria-describedby={
                            inputError ? "input-error" : undefined
                          }
                          onChange={(e) =>
                            setInputs({
                              ...inputs,
                              [key]:
                                e.target.value === ""
                                  ? NaN
                                  : e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {inputError && (
                    <p id="input-error" role="alert" className="error">
                      {inputError}
                    </p>
                  )}
                  <div className="notice-box">
                    <h3>What this calculation does</h3>
                    <p>
                      Monthly gap = spending minus income, floored at zero.
                      Annual portfolio draw = monthly gap × 12. Withdrawal rate
                      = annual draw ÷ portfolio. This is not a forecast, tax
                      estimate, annuity quote, or probability of success.
                    </p>
                  </div>
                </section>
                <section className="card content-card">
                  <h2>Two choices, one baseline</h2>
                  {estimate ? (
                    <>
                      <table className="comparison-table">
                        <caption>
                          Illustrative arithmetic in US dollars; no returns,
                          inflation, fees, or taxes modeled.
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Per month</th>
                            <th scope="col">Starting plan</th>
                            <th scope="col">Spend $500 less</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <th scope="row">Spending</th>
                            <td>{Planning.money(inputs.spending)}</td>
                            <td>
                              {Planning.money(
                                Math.max(0, inputs.spending - 500),
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Income</th>
                            <td>{Planning.money(inputs.income)}</td>
                            <td>{Planning.money(inputs.income)}</td>
                          </tr>
                          <tr className="highlight-row">
                            <th scope="row">Portfolio gap</th>
                            <td>{Planning.money(estimate.gap)}</td>
                            <td>
                              {Planning.money(
                                Planning.estimate({
                                  ...inputs,
                                  spending: Math.max(0, inputs.spending - 500),
                                }).gap,
                              )}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Annual draw rate</th>
                            <td>{estimate.withdrawalRate.toFixed(2)}%</td>
                            <td>
                              {Planning.estimate({
                                ...inputs,
                                spending: Math.max(0, inputs.spending - 500),
                              }).withdrawalRate.toFixed(2)}
                              %
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="caption">
                        A lower draw rate alone does not establish that a plan
                        is sustainable. The alternative may not fit your needs
                        or priorities.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => {
                          const prepared = Planning.scenarioAction(inputs);
                          setActions((items) => [...items, prepared]);
                          openAction(prepared.id);
                        }}
                      >
                        Prepare a planning discussion <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <p>Correct the assumptions to compare these choices.</p>
                  )}
                </section>
              </div>
            </>
          )}

          {view === "Next steps" && (
            <>
              <div className="board-toolbar">
                <span>
                  {open} open actions · {complete} completed
                </span>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Filter actions"
                    placeholder="Find an action…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <span className="subtle-tag">
                  {audience === "advisor"
                    ? "TEAM WORKBOARD"
                    : "YOUR DECISIONS & NEXT STEPS"}
                </span>
              </div>
              <div className="board" aria-label="Planning action board">
                {STAGES.map((stage) => (
                  <section
                    className="board-lane"
                    key={stage}
                    aria-label={stage}
                  >
                    <div className="lane-heading">
                      <h2>{stage}</h2>
                      <span>
                        {
                          actions.filter(
                            (item) =>
                              item.stage === stage &&
                              item.title
                                .toLowerCase()
                                .includes(filter.toLowerCase()),
                          ).length
                        }
                      </span>
                    </div>
                    {actions
                      .filter(
                        (item) =>
                          item.stage === stage &&
                          item.title
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          className={`board-card ${selected === item.id ? "selected" : ""}`}
                          key={item.id}
                          onClick={() => {
                            setSelected(item.id);
                            setNote("");
                            setConsent(false);
                            setError("");
                          }}
                          aria-label={`Open ${item.title}`}
                          aria-pressed={selected === item.id}
                        >
                          <span className="action-category">
                            {item.id.startsWith("income")
                              ? "RETIREMENT INCOME"
                              : item.id.startsWith("beneficiaries")
                                ? "LEGACY"
                                : "PROTECTION"}
                          </span>
                          <strong>{item.title}</strong>
                          <p>{item.outcome}</p>
                          <span className="board-owner">
                            <span className="mini-avatar">
                              {item.owner === "Household" ? "SH" : "PT"}
                            </span>
                            {item.owner}
                          </span>
                          {item.revisit && (
                            <span className="revisit-flag">
                              Review requested
                            </span>
                          )}
                        </button>
                      ))}
                  </section>
                ))}
              </div>
              <section
                className="card action-detail"
                aria-label="Selected action details"
              >
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      ACTION DETAILS · SAMPLE WORKFLOW
                    </span>
                    <h2>{action.title}</h2>
                    <p>{action.outcome}</p>
                  </div>
                  <span className="pill neutral">{action.stage}</span>
                </div>
                <div className="detail-grid">
                  <div>
                    {action.snapshot && (
                      <div className="notice-box snapshot-note">
                        <h3>Inputs attached to this decision</h3>
                        <p>
                          Portfolio {Planning.money(action.snapshot.portfolio)}{" "}
                          · spending {Planning.money(action.snapshot.spending)}
                          /month · income{" "}
                          {Planning.money(action.snapshot.income)}/month.
                          Changing the comparison does not change this record;
                          prepare a new discussion for new inputs.
                        </p>
                      </div>
                    )}
                    <dl className="facts">
                      <div>
                        <dt>Owner</dt>
                        <dd>{action.owner}</dd>
                      </div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>
                          {action.evidence || "Information not yet confirmed."}
                        </dd>
                      </div>
                      <div>
                        <dt>Alternatives</dt>
                        <dd>{action.alternatives || "Not recorded yet."}</dd>
                      </div>
                      <div>
                        <dt>Review</dt>
                        <dd>{action.review || "Not reviewed."}</dd>
                      </div>
                      <div>
                        <dt>Approval</dt>
                        <dd>{action.authorization || "Not approved."}</dd>
                      </div>
                    </dl>
                    <h3>Recorded activity</h3>
                    <ol className="history">
                      {action.history.map((entry, i) => (
                        <li key={i}>{entry}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    {Planning.next(action.stage) ? (
                      <form onSubmit={updateAction}>
                        <h3>Change status</h3>
                        <p>
                          Next stage:{" "}
                          <strong>{Planning.next(action.stage)}</strong>. No
                          real-world action will be taken.
                        </p>
                        <label className="field-label" htmlFor="decision-note">
                          {action.stage === "Gather information"
                            ? "Source and input confirmation"
                            : action.stage === "Analyze choices"
                              ? "Alternatives and tradeoffs"
                              : action.stage === "Ready for review"
                                ? "Reviewer rationale"
                                : action.stage === "Waiting for approval"
                                  ? "Scope of this specific approval"
                                  : "Completion evidence"}
                        </label>
                        <textarea
                          id="decision-note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Describe this sample planning step…"
                          aria-describedby="note-guidance"
                        />
                        <p id="note-guidance" className="caption">
                          Use sample text only; at least 12 characters.{" "}
                          {action.stage === "Waiting for approval"
                            ? "Switch to Household view to record demo approval."
                            : "Switch to Planning-team view to prepare or review work."}
                        </p>
                        {action.stage === "Waiting for approval" && (
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(e) => setConsent(e.target.checked)}
                            />
                            <span>
                              I approve this specific sample action:{" "}
                              {action.title}. This is a rehearsal, not
                              authorization to transact.
                            </span>
                          </label>
                        )}
                        {error && (
                          <p role="alert" className="error">
                            {error}
                          </p>
                        )}
                        <button
                          ref={updateButton}
                          type="submit"
                          className="button primary"
                        >
                          Update stage <ArrowRight size={16} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="notice-box">
                          <CheckCircle2 size={22} />
                          <h3>Completion record preserved</h3>
                          <p>
                            Changed circumstances should open a linked review,
                            not erase the original decision.
                          </p>
                        </div>
                        <button
                          ref={updateButton}
                          className="button secondary"
                          onClick={() => {
                            const review = Planning.linkedReview(action);
                            setActions((items) => [
                              ...items.map((item) =>
                                item.id === action.id
                                  ? { ...item, revisit: true }
                                  : item,
                              ),
                              review,
                            ]);
                            setSelected(review.id);
                            setNotice(
                              "A linked review was created. The completed action is unchanged.",
                            );
                          }}
                        >
                          Open linked review <Plus size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {view === "Documents" && (
            <section className="card content-card">
              <div className="section-heading">
                <div>
                  <h2>The evidence behind your plan</h2>
                  <p>
                    A preparation checklist, not a document vault. No files are
                    uploaded or stored.
                  </p>
                </div>
                <LockKeyhole size={22} />
              </div>
              <div className="document-list">
                {[
                  "Account balances",
                  "Social Security statement",
                  "Household spending",
                  "Existing insurance policies",
                  "Beneficiary designations",
                ].map((name) => (
                  <button
                    key={name}
                    onClick={() => setDocument(name)}
                    className="document-row"
                  >
                    <FileText size={20} />
                    <span>
                      <strong>{name}</strong>
                      <small>
                        Not provided · confirm with your planning team
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
              {document && (
                <div
                  className="notice-box"
                  role="status"
                  aria-label="Document guidance"
                >
                  <h3>{document}</h3>
                  <p>
                    Use a properly authorized, secure document system to share
                    this record with your professional. This preview has no
                    upload, download, or storage integration.
                  </p>
                </div>
              )}
            </section>
          )}

          {view === "Planning team" && (
            <div className="detail-grid">
              <section className="card content-card">
                <span className="eyebrow">COORDINATION, NOT ASSUMPTIONS</span>
                <h2>
                  The right conversation.
                  <br />
                  The right professional.
                </h2>
                <p>
                  No professionals are connected to this preview. These roles
                  describe who might help, not people currently assigned to your
                  plan.
                </p>
                <div className="role-list">
                  {[
                    [
                      "Financial planner",
                      "Coordinate goals, income needs, and tradeoffs.",
                    ],
                    [
                      "Tax professional",
                      "Review jurisdiction, tax-year rules, and tax consequences.",
                    ],
                    [
                      "Estate attorney",
                      "Review legal documents, titling, and beneficiary structures.",
                    ],
                  ].map(([role, detail]) => (
                    <div key={role}>
                      <span className="role-icon">
                        <Users size={19} />
                      </span>
                      <span>
                        <h3>{role}</h3>
                        <p>{detail}</p>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card content-card">
                <h2>Make the conversation count.</h2>
                <p>Bring the decision, not just the numbers.</p>
                <ul className="question-list">
                  <li>What am I trying to achieve?</li>
                  <li>Which inputs still need confirming?</li>
                  <li>What alternatives have we considered?</li>
                  <li>What are the costs, risks, and conflicts?</li>
                  <li>What exactly am I being asked to approve?</li>
                </ul>
                <button
                  className="button primary"
                  onClick={() => navigate("Next steps")}
                >
                  Review my next steps <ArrowRight size={16} />
                </button>
              </section>
            </div>
          )}
          <footer className="footer">
            <span>
              <Leaf size={15} /> Fiduciary OS
            </span>
            <span>Understand your choices. Know your next step.</span>
            <button onClick={() => setHelp(!help)}>
              Preview scope & limitations <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
