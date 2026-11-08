import ToolDiscovery from "./ToolDiscovery";
import { useRef, useState, type KeyboardEvent } from "react";
import FinancialWorkspace from "./FinancialWorkspace";
import ConnectedWorkspace from "./ConnectedWorkspace";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  FileText,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Sprout,
  Users,
  Waypoints,
} from "lucide-react";
import {
  compareIncome,
  createComparisonAction,
  scheduleDemoReview,
  sampleActions,
  authorizeDemo,
  stages,
  transition,
  type Action,
  type Stage,
} from "./workflow";
// Native focus enters the scroll region; explicit keys make horizontal access
// predictable without trapping Tab or intercepting future child controls.
function scrollComparison(event: KeyboardEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;
  const region = event.currentTarget;
  const end = Math.max(0, region.scrollWidth - region.clientWidth);
  let position: number;
  switch (event.key) {
    case "ArrowRight":
      position = Math.min(end, region.scrollLeft + 80);
      break;
    case "ArrowLeft":
      position = Math.max(0, region.scrollLeft - 80);
      break;
    case "Home":
      position = 0;
      break;
    case "End":
      position = end;
      break;
    default:
      return;
  }
  event.preventDefault();
  region.scrollLeft = position;
}
function revealBoardCard(card: HTMLButtonElement) {
  const board = card.closest<HTMLElement>(".board");
  if (!board) return;
  // Run after the browser's own focus scroll, then move this container only.
  // Three outline pixels plus a four-pixel offset need eight pixels of room.
  requestAnimationFrame(() => {
    if (document.activeElement !== card) return;
    const bounds = board.getBoundingClientRect();
    const item = card.getBoundingClientRect();
    const left = bounds.left + board.clientLeft + 8;
    const right = bounds.left + board.clientLeft + board.clientWidth - 8;
    const delta =
      item.left < left
        ? item.left - left
        : item.right > right
          ? item.right - right
          : 0;
    if (!delta) return;
    const end = Math.max(0, board.scrollWidth - board.clientWidth);
    board.scrollLeft = Math.min(end, Math.max(0, board.scrollLeft + delta));
  });
}
const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "My plan", icon: Compass },
  { label: "Financial workspace", icon: Waypoints },
  { label: "Compare choices", icon: Waypoints },
  { label: "Next steps", icon: ListChecks },
  { label: "Documents", icon: FileText },
  { label: "Planning team", icon: Users },
];
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export default function App() {
  const offline = location.protocol === "file:";
  const [savedMode, setSavedMode] = useState(false);
  const [page, setPage] = useState("Overview");
  const [requestedTool, setRequestedTool] = useState<string | undefined>();
  const [toolRequestId, setToolRequestId] = useState(0);
  const [audience, setAudience] = useState("Household");
  const [actions, setActions] = useState<Action[]>(() =>
    structuredClone(sampleActions),
  );
  const [selected, setSelected] = useState("income");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [goal, setGoal] = useState("Retirement income");
  const [assets, setAssets] = useState("600000");
  const [spending, setSpending] = useState("48000");
  const [years, setYears] = useState("25");
  const [filter, setFilter] = useState("All");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const active = actions.find((a) => a.id === selected)!;
  const open = actions.filter((a) => a.stage !== "Verified complete").length;
  function navigate(to: string) {
    if (to === page) return;
    if (
      !window.dispatchEvent(
        new Event("fiduciary:tool-navigation", { cancelable: true }),
      )
    ) {
      setNotice(
        "Resolve unsaved or uncertain changes before leaving this workspace.",
      );
      return;
    }
    setPage(to);
    setTimeout(() => titleRef.current?.focus(), 0);
  }
  function select(id: string) {
    setSelected(id);
    setNotice(
      `Opened ${actions.find((a) => a.id === id)?.title}. Review the action details.`,
    );
    setTimeout(() => document.getElementById("action-title")?.focus(), 0);
    setConfirmed(false);
    setEvidence("");
  }
  function move(to: Stage) {
    try {
      const changed = transition(active, to, evidence);
      setActions(actions.map((a) => (a.id === active.id ? changed : a)));
      setConfirmed(false);
      setEvidence("");
      setNotice(`${active.title}: ${to}. Demo only; no real action taken.`);
      if (to === "Verified complete")
        setTimeout(() => document.getElementById("action-title")?.focus(), 0);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  let comparison: ReturnType<typeof compareIncome> | null = null;
  let calculationError = "";
  try {
    if (!assets.trim() || !spending.trim() || !years.trim())
      throw new Error("Complete all three example inputs.");
    comparison = compareIncome(Number(assets), Number(spending), Number(years));
  } catch (error) {
    calculationError = (error as Error).message;
  }
  const next = stages[stages.indexOf(active.stage) + 1];
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
          aria-label="Fiduciary OS overview"
        >
          <span className="brand-mark">
            <Sprout size={24} />
          </span>
          <span>
            Fiduciary<span className="os">OS</span>
            <small>CLARITY. THEN ACTION.</small>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              aria-label={label}
              aria-current={page === label ? "page" : undefined}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              {label}
              {label === "Next steps" && !savedMode && (
                <span className="nav-count">{open}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="guidance">
            <ShieldCheck size={20} />
            <strong>
              A clearer picture.
              <br />A considered next step.
            </strong>
            <p>Explore your choices before making a commitment.</p>
          </div>
          <div className="profile">
            <span className="avatar">S</span>
            <div>
              <strong>Fiduciary workspace</strong>
              <small>Interactive preview</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} /> {page}
          </span>
          <ToolDiscovery
            onSelect={(key) => {
              if (
                !window.dispatchEvent(
                  new Event("fiduciary:tool-navigation", { cancelable: true }),
                )
              )
                return false;
              setRequestedTool(key);
              setToolRequestId((n) => n + 1);
              navigate("Financial workspace");
              return true;
            }}
          />
          <div className="view-picker">
            <label htmlFor="view">View as</label>
            <select
              id="view"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option>Household</option>
              <option>Planning team</option>
            </select>
          </div>
        </header>
        <div className="preview">
          <span className="dot" /> Interactive preview{" "}
          <span className="preview-detail">
            {offline
              ? "Offline sample preview. Changes reset on reload; saved actions require the local app and API."
              : "Sample tools use example data. Saved workspace records persist in the configured API. No financial accounts connected."}
          </span>
        </div>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {audience === "Household"
                  ? "YOUR FINANCIAL PICTURE"
                  : "YOUR CLIENT WORKSPACE"}
              </p>
              <h1 tabIndex={-1} ref={titleRef}>
                {page === "Overview" ? "Your next step, clearer." : page}
              </h1>
              <p className="intro">
                {page === "Overview"
                  ? "Bring your goals, choices, and next actions into one considered plan."
                  : "Understand what matters, what is known, and what needs to happen next."}
              </p>
            </div>
            <span className="sample-pill">
              <span className="dot" />{" "}
              {page === "Financial workspace"
                ? "Saved financial workspace"
                : page === "Next steps" && savedMode
                  ? "Saved planning workspace"
                  : "Sample plan"}
            </span>
          </div>
          {page === "Overview" && (
            <>
              <section className="hero" aria-labelledby="hero-title">
                <div>
                  <span className="light-label">START WITH WHAT MATTERS</span>
                  <h2 id="hero-title">
                    What would a more
                    <br />
                    confident retirement look like?
                  </h2>
                  <p>
                    Explore the decisions behind your income plan.
                    <br />
                    Start with estimates. Refine the picture together.
                  </p>
                  <button
                    className="button white"
                    onClick={() => navigate("Compare choices")}
                  >
                    Compare planning horizons <ArrowRight size={17} />
                  </button>
                  <span className="hero-note">
                    No account connection needed to explore.
                  </span>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span className="art-center">
                    <Sprout size={55} strokeWidth={1} />
                  </span>
                  <span className="art-label">
                    A plan built around your life
                  </span>
                </div>
              </section>
              <div className="stats">
                <div className="stat">
                  <span>YOUR FOCUS</span>
                  <strong>{goal}</strong>
                  <small>A goal, not a product recommendation</small>
                </div>
                <div className="stat">
                  <span>NEXT STEPS</span>
                  <strong>{open} open actions</strong>
                  <small>Clear owners and review stages</small>
                </div>
                <div className="stat">
                  <span>YOUR INFORMATION</span>
                  <strong>Needs confirmation</strong>
                  <small>Example inputs have not been verified</small>
                </div>
              </div>
              <div className="two-column">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Your next useful action</h2>
                    <span className="badge">Needs your input</span>
                  </div>
                  <div className="action-feature">
                    <span className="icon-tile">
                      <Compass size={23} />
                    </span>
                    <div>
                      <h3>Compare planning horizons</h3>
                      <p>
                        See how your planning horizon affects the income
                        available from a sample portfolio.
                      </p>
                      <p className="muted">
                        Why it matters: timing and spending work together.
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("Compare choices")}
                  >
                    Explore the comparison <ArrowUpRight size={17} />
                  </button>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>A plan with context</h2>
                  </div>
                  {[
                    "Your goals come first",
                    "Assumptions stay visible",
                    "You decide before action",
                  ].map((t, i) => (
                    <div className="context-row" key={t}>
                      <span className="check">
                        <Check size={15} />
                      </span>
                      <div>
                        <strong>{t}</strong>
                        <p>
                          {
                            [
                              "Start with the life you want to plan for.",
                              "Know which inputs still need confirmation.",
                              "Exploring is never authorization to execute.",
                            ][i]
                          }
                        </p>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
              <section className="section-space">
                <div className="section-heading">
                  <h2>Make room for the bigger picture</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("My plan")}
                  >
                    View your plan <ArrowRight size={16} />
                  </button>
                </div>
                <div className="goal-grid">
                  {["Retirement income", "Protection", "Legacy"].map(
                    (name, i) => (
                      <button
                        className="goal-card"
                        key={name}
                        onClick={() => {
                          setGoal(name);
                          navigate("My plan");
                        }}
                      >
                        <span className="goal-number">0{i + 1}</span>
                        <h3>{name}</h3>
                        <p>
                          {
                            [
                              "What could your savings support?",
                              "What needs to be protected?",
                              "What do you want to leave behind?",
                            ][i]
                          }
                        </p>
                        <ArrowUpRight size={20} />
                      </button>
                    ),
                  )}
                </div>
              </section>
            </>
          )}
          {page === "Financial workspace" &&
            (offline ? (
              <p>
                Saved financial plans require the hosted application and API;
                offline exports cannot save financial data.
              </p>
            ) : (
              <FinancialWorkspace
                requestedTool={requestedTool}
                toolRequestId={toolRequestId}
              />
            ))}
          {page === "My plan" && (
            <section className="panel">
              <h2>Start with a life goal</h2>
              <p>
                Choose a focus for this sample plan. No financial recommendation
                is generated.
              </p>
              <div className="goal-grid">
                {["Retirement income", "Protection", "Legacy"].map((name) => (
                  <button
                    className={`goal-card ${goal === name ? "chosen" : ""}`}
                    aria-pressed={goal === name}
                    key={name}
                    onClick={() => {
                      setGoal(name);
                      setNotice(`Sample goal changed to ${name}.`);
                    }}
                  >
                    <h3>{name}</h3>
                    <p>
                      {goal === name
                        ? "Current planning focus"
                        : "Explore this planning focus"}
                    </p>
                  </button>
                ))}
              </div>
              <div className="callout">
                <strong>What we still need to confirm</strong>
                <p>
                  Income, spending, account balances, coverage, beneficiaries,
                  jurisdiction, and source dates. No documents or financial
                  accounts are connected in this preview.
                </p>
              </div>
              <button
                className="button"
                onClick={() =>
                  navigate(
                    goal === "Retirement income"
                      ? "Compare choices"
                      : "Next steps",
                  )
                }
              >
                Explore the next step <ArrowRight size={17} />
              </button>
            </section>
          )}
          {page === "Compare choices" && (
            <>
              <section className="panel">
                <h2>What could your savings support?</h2>
                <p>
                  A simple illustration of dividing a portfolio across a
                  planning horizon. This is not a sustainable-withdrawal
                  recommendation or retirement probability.
                </p>
                <div className="input-grid">
                  <label>
                    Example portfolio (USD)
                    <input
                      type="number"
                      min="0"
                      value={assets}
                      onChange={(e) => setAssets(e.target.value)}
                    />
                  </label>
                  <label>
                    Example annual spending (USD)
                    <input
                      type="number"
                      min="0"
                      value={spending}
                      onChange={(e) => setSpending(e.target.value)}
                    />
                  </label>
                  <label>
                    Planning horizon (years)
                    <input
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      value={years}
                      onChange={(e) => setYears(e.target.value)}
                    />
                  </label>
                </div>
                {calculationError ? (
                  <p role="alert" className="error">
                    {calculationError}
                  </p>
                ) : (
                  comparison && (
                    <>
                      <p className="scroll-help" id="comparison-scroll-help">
                        If columns extend beyond the screen, focus the
                        comparison and use Left/Right arrow keys to scroll.
                        Home/End move to the first/last column.
                      </p>
                      <div
                        className="table-wrap"
                        role="region"
                        aria-label="Illustrative planning comparison"
                        aria-describedby="comparison-scroll-help"
                        tabIndex={0}
                        onKeyDown={scrollComparison}
                      >
                        <table>
                          <caption>
                            Illustrative comparison: a longer horizon spreads
                            the same savings over more years.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Scenario</th>
                              <th scope="col">Horizon</th>
                              <th scope="col">Annual portfolio draw</th>
                              <th scope="col">Annual spending gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              Number(years),
                              Number(years) > 55
                                ? Number(years) - 5
                                : Number(years) + 5,
                            ].map((n) => {
                              const c = compareIncome(
                                Number(assets),
                                Number(spending),
                                Math.min(n, 60),
                              );
                              return (
                                <tr key={n}>
                                  <th scope="row">
                                    {n === Number(years)
                                      ? "Your example"
                                      : Number(years) > 55
                                        ? "Shorter horizon"
                                        : "Longer horizon"}
                                  </th>
                                  <td>{Math.min(n, 60)} years</td>
                                  <td>{money(c.annualDraw)}</td>
                                  <td>{money(c.annualGap)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                )}
                <details open>
                  <summary>Assumptions, method, and limitations</summary>
                  <p>
                    Annual portfolio draw = portfolio ÷ years. Spending gap =
                    maximum of zero and annual spending minus that draw. Inputs
                    are illustrative and editable, not sourced account data. No
                    investment growth, taxes, inflation, fees, pension, Social
                    Security, insurance income, or market risk is modeled. Money
                    may run out; actual results may differ. Use a qualified
                    professional and a fuller model before acting.
                  </p>
                </details>
                <button
                  className="button"
                  disabled={!comparison}
                  onClick={() => {
                    const action = createComparisonAction(
                      {
                        assets: Number(assets),
                        spending: Number(spending),
                        years: Number(years),
                      },
                      `comparison-${crypto.randomUUID()}`,
                    );
                    setActions((current) => [...current, action]);
                    setSelected(action.id);
                    setSavedMode(false);
                    setFilter("All");
                    setConfirmed(false);
                    setEvidence("");
                    navigate("Next steps");
                    setNotice(
                      "New sample discussion created from the captured inputs. No authorization inherited.",
                    );
                    setTimeout(
                      () => document.getElementById("action-title")?.focus(),
                      0,
                    );
                  }}
                >
                  Create sample discussion from these inputs{" "}
                  <ArrowRight size={17} />
                </button>
              </section>
            </>
          )}
          {page === "Next steps" && (
            <div
              className="workspace-tabs"
              role="group"
              aria-label="Choose planning workspace"
            >
              <button
                aria-pressed={!savedMode}
                onClick={() => setSavedMode(false)}
              >
                Explore sample board
              </button>
              <button
                aria-pressed={savedMode}
                disabled={offline}
                title={
                  offline
                    ? "Run the local app and API to use saved records"
                    : undefined
                }
                onClick={() => setSavedMode(true)}
              >
                Saved planning workspace
              </button>
            </div>
          )}
          {page === "Next steps" && savedMode && <ConnectedWorkspace />}
          {page === "Next steps" && !savedMode && (
            <>
              <div className="board-toolbar">
                <div>
                  <h2>
                    {audience === "Household"
                      ? "Your decisions and agreed actions"
                      : "Client action board"}
                  </h2>
                  <p>
                    Moving a sample card changes this preview only. No real
                    approval or execution occurs.
                  </p>
                </div>
                <label>
                  Show actions
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option>All</option>
                    <option>Open</option>
                    <option>Completed</option>
                  </select>
                </label>
              </div>
              <div className="board" aria-label="Planning actions by status">
                {stages.map((stage) => (
                  <section className="lane" key={stage} aria-label={stage}>
                    <h3>
                      {stage}
                      <span>
                        {actions.filter((a) => a.stage === stage).length}
                      </span>
                    </h3>
                    {actions
                      .filter(
                        (a) =>
                          a.stage === stage &&
                          (filter === "All" ||
                            (filter === "Completed"
                              ? a.stage === "Verified complete"
                              : a.stage !== "Verified complete")),
                      )
                      .map((a) => (
                        <button
                          className={`board-card ${a.id === selected ? "selected" : ""}`}
                          key={a.id}
                          aria-pressed={a.id === selected}
                          onClick={() => select(a.id)}
                          onFocus={(event) =>
                            revealBoardCard(event.currentTarget)
                          }
                        >
                          <span className="card-tag">
                            {a.id === "income" || a.comparisonSnapshot
                              ? "INCOME"
                              : a.id === "legacy"
                                ? "LEGACY"
                                : "PROTECTION"}
                          </span>
                          <strong>{a.title}</strong>
                          <p>{a.outcome}</p>
                          <span className="card-owner">{a.owner}</span>
                          <span className="card-status">{a.stage}</span>
                          <span className="card-link">
                            Review action <ArrowRight size={14} />
                          </span>
                        </button>
                      ))}
                    {!actions.some((a) => a.stage === stage) && (
                      <p className="empty-lane">No actions here</p>
                    )}
                  </section>
                ))}
              </div>
              <section
                className="panel action-detail"
                aria-labelledby="action-title"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">SAMPLE DECISION RECORD</p>
                    <h2 id="action-title" tabIndex={-1}>
                      {active.title}
                    </h2>
                  </div>
                  <span className="badge">{active.stage}</span>
                </div>
                <dl className="record-grid">
                  {[
                    ["Intended outcome", active.outcome],
                    ["Responsible for next step", active.owner],
                    ["Source and verification", active.source],
                    ["Assumptions", active.assumptions],
                    ["Alternatives considered", active.alternatives],
                    ["Costs and conflicts to review", active.costs],
                  ].map(([term, value]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {active.comparisonSnapshot && (
                  <section
                    className="callout"
                    aria-label="Captured sample comparison"
                  >
                    <h3>Inputs captured for this sample discussion</h3>
                    <dl className="record-grid">
                      {[
                        [
                          "Example portfolio",
                          money(active.comparisonSnapshot.assets),
                        ],
                        [
                          "Example annual spending",
                          money(active.comparisonSnapshot.spending),
                        ],
                        [
                          "Planning horizon",
                          `${active.comparisonSnapshot.years} years`,
                        ],
                        [
                          "Illustrative annual draw",
                          money(active.comparisonSnapshot.annualDraw),
                        ],
                        [
                          "Illustrative annual spending gap",
                          money(active.comparisonSnapshot.annualGap),
                        ],
                      ].map(([term, value]) => (
                        <div key={term}>
                          <dt>{term}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      This is a fixed sample snapshot, not a financial
                      recommendation. Editing Compare choices does not change
                      this record or transfer its demo authorization. Create a
                      new discussion after input changes. Nothing here is saved
                      to the API.
                    </p>
                  </section>
                )}
                <label className="review-date">
                  Review date (optional; does not schedule a reminder)
                  <input
                    type="date"
                    value={active.reviewDate}
                    onChange={(e) => {
                      try {
                        const changed = scheduleDemoReview(
                          active,
                          e.target.value,
                        );
                        setActions((current) =>
                          current.map((a) =>
                            a.id === active.id ? changed : a,
                          ),
                        );
                        setNotice(
                          "Sample review date updated; stage and authorization unchanged. No reminder is scheduled.",
                        );
                      } catch (error) {
                        setNotice((error as Error).message);
                      }
                    }}
                  />
                </label>
                <div className="transition-area">
                  {next ? (
                    <>
                      <p>
                        <strong>Next stage: {next}.</strong>{" "}
                        {next === "Waiting for approval"
                          ? "Review options, assumptions, costs, and conflicts before requesting approval."
                          : next === "In progress"
                            ? "This simulates authorization of this specific sample action only."
                            : next === "Verified complete"
                              ? "Record the evidence that supports completion."
                              : "Complete the current review step before continuing."}
                      </p>
                      {next === "In progress" && !active.authorized && (
                        <>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={confirmed}
                              onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            I understand this records a demo authorization for “
                            {active.title}” only, not a real transaction.
                          </label>
                          <button
                            className="button"
                            disabled={!confirmed}
                            onClick={() => {
                              setActions(
                                actions.map((a) =>
                                  a.id === active.id
                                    ? authorizeDemo(a, confirmed)
                                    : a,
                                ),
                              );
                              setConfirmed(false);
                              setNotice(
                                "Demo authorization recorded. The sample card has not moved.",
                              );
                              setTimeout(
                                () =>
                                  document
                                    .getElementById("demo-advance")
                                    ?.focus(),
                                0,
                              );
                            }}
                          >
                            Record demo planning authorization
                          </button>
                        </>
                      )}
                      {next === "Verified complete" && (
                        <label>
                          Sample completion evidence
                          <textarea
                            value={evidence}
                            onChange={(e) => setEvidence(e.target.value)}
                            placeholder="Describe how the sample action was verified. Do not enter private information."
                          />
                        </label>
                      )}
                      <button
                        className="button"
                        id="demo-advance"
                        aria-label={`Move ${active.title} to ${next}`}
                        onClick={() => move(next)}
                        disabled={
                          (next === "In progress" && !active.authorized) ||
                          (next === "Verified complete" && !evidence.trim())
                        }
                      >
                        Move to {next} <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <p className="success">
                      Sample action verified complete. Its history stays intact;
                      use the review date for a future check rather than erasing
                      completion.
                    </p>
                  )}
                </div>
                <details>
                  <summary>
                    Sample decision history ({active.history.length} events)
                  </summary>
                  <ol>
                    {active.history.map((entry, i) => (
                      <li key={i}>{entry}</li>
                    ))}
                  </ol>
                </details>
              </section>
            </>
          )}
          {page === "Documents" && (
            <section className="panel">
              <span className="icon-tile">
                <FileText />
              </span>
              <h2>The evidence behind your plan</h2>
              <p>
                No documents are connected. Upload and storage are not enabled
                in this preview. Do not enter sensitive records here.
              </p>
              <ul className="document-list">
                {[
                  "Income and spending records",
                  "Account statements",
                  "Coverage summaries",
                  "Beneficiary and estate records",
                ].map((t) => (
                  <li key={t}>
                    <FileText size={18} />
                    <span>{t}</span>
                    <span className="badge">Not connected</span>
                  </li>
                ))}
              </ul>
              <div className="callout">
                Before launch, document handling needs authenticated access,
                storage, retention rules, and independently verified security
                controls.
              </div>
            </section>
          )}
          {page === "Planning team" && (
            <section className="panel">
              <span className="icon-tile">
                <Users />
              </span>
              <h2>Know who is responsible</h2>
              <p>
                No professionals have been invited. The view switcher
                demonstrates two interfaces; it is not authentication or an
                access-control boundary.
              </p>
              <div className="goal-grid">
                {[
                  [
                    "You",
                    "Set goals, confirm information, and review specific actions.",
                  ],
                  [
                    "Your advisor",
                    "Review financial options, assumptions, costs, and conflicts.",
                  ],
                  [
                    "Your tax and estate professionals",
                    "Validate jurisdiction-specific tax and legal questions.",
                  ],
                ].map(([name, role]) => (
                  <div className="goal-card" key={name}>
                    <h3>{name}</h3>
                    <p>{role}</p>
                    <span className="badge">Not connected</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer>
            <span>Fiduciary OS</span>
            <p>Understand your choices. Know your next step.</p>
            <small>
              Educational preview, not financial, tax, or legal advice. No
              fiduciary status or regulatory certification is implied.
            </small>
          </footer>
        </main>
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {notice}
        </div>
      </div>
    </div>
  );
}
