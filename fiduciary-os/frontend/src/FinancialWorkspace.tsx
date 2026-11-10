import BlueprintTools from "./BlueprintTools";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./planning-api";
import { reportSession, signedOut } from "./session-signal";

type Balances = {
  cash: number;
  bonds: number;
  equities: number;
  other: number;
};
type Inputs = {
  name: string;
  asOf: string;
  source: string;
  balances: Balances;
  monthlyIncomeCents: number;
  monthlySpendingCents: number;
  annualReturnBps: number;
  annualFeeBps: number;
  annualInflationBps: number;
  years: number;
};
type Row = {
  year: number;
  nominalCents: number;
  realCents: number;
  cumulativeFeesCents: number;
  cumulativeUnfundedCents: number;
};
type Plan = {
  id: string;
  version: number;
  updatedAt: string;
  inputs: Inputs;
  projection: {
    initialCents: number;
    monthlySurplusCents: number;
    depletionMonth: number | null;
    rows: Row[];
    assumptions: string;
    methodVersion: string;
  };
};
const blank = (): Inputs => ({
  name: "",
  asOf: new Date().toISOString().slice(0, 10),
  source: "",
  balances: { cash: 0, bonds: 0, equities: 0, other: 0 },
  monthlyIncomeCents: 0,
  monthlySpendingCents: 0,
  annualReturnBps: 0,
  annualFeeBps: 0,
  annualInflationBps: 0,
  years: 10,
});
const usd = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(c / 100);
function checked(value: unknown): Plan | null {
  if (value === null) return null;
  const p = value as Plan;
  if (
    !p ||
    typeof p.id !== "string" ||
    !Number.isInteger(p.version) ||
    !p.inputs ||
    !p.inputs.balances ||
    !p.projection ||
    !Array.isArray(p.projection.rows) ||
    p.projection.rows.length < 2 ||
    p.projection.rows.some(
      (r) => !Number.isFinite(r.nominalCents) || !Number.isFinite(r.realCents),
    )
  )
    throw new Error("Invalid plan response. Reload before saving.");
  return p;
}
export default function FinancialWorkspace({
  requestedTool,
  toolRequestId,
}: { requestedTool?: string; toolRequestId?: number } = {}) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    reportSession("financial-workspace", !!token);
    return () => reportSession("financial-workspace", false);
  }, [token]);
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<Inputs>(blank);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const inFlight = useRef(false);
  const uncertain = useRef(false);
  const dirty = plan
    ? JSON.stringify(draft) !== JSON.stringify(plan.inputs)
    : JSON.stringify(draft) !== JSON.stringify(blank());
  function clearSession() {
    setToken(null);
    setPlan(null);
    setDraft(blank());
    setPassword("");
    setEmail("");
    setName("");
    uncertain.current = false;
    setBlocked(false);
  }
  async function revokeSessions(all = false) {
    let notice = "";
    setBusy(true);
    try {
      await api(all ? "/auth/logout-all" : "/auth/logout", token!, "POST");
      clearSession();
      notice =
        all
          ? "All server sessions revoked and local session cleared."
          : "Server session revoked and local session cleared.";
    } catch {
      clearSession();
      notice =
        "Local session cleared; server revocation was not confirmed. Sign in again to revoke all sessions.";
    } finally {
      setBusy(false);
    }
    setStatus(notice);
    signedOut("financial-workspace", notice);
  }
  async function work(fn: () => Promise<void>, mutation = false) {
    if (inFlight.current || (mutation && uncertain.current)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (e) {
      if (
        mutation &&
        (!(e instanceof ApiError) || e.uncertain || e.status === 409)
      ) {
        uncertain.current = true;
        setBlocked(true);
      }
      if (e instanceof ApiError && e.status === 401) clearSession();
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const guard = (event: Event) => {
      if (token && (dirty || blocked || busy)) {
        event.preventDefault();
        setStatus(
          "Save or discard pending plan changes before navigating tools.",
        );
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (token && (dirty || blocked || busy)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("fiduciary:tool-navigation", guard);
    return () => {
      window.removeEventListener("fiduciary:tool-navigation", guard);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, blocked, busy, token]);
  async function load(current = token) {
    const saved = checked(await api<unknown>("/financial-plan", current));
    setPlan(saved);
    setDraft(saved ? structuredClone(saved.inputs) : blank());
    uncertain.current = false;
    setBlocked(false);
    setStatus(
      saved
        ? "Saved plan reloaded. Unsaved edits discarded; no write repeated."
        : "No saved plan yet. Enter your own test inputs.",
    );
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    await work(async () => {
      const session = await api<{ accessToken: string }>(
        register ? "/auth/register" : "/auth/login",
        null,
        "POST",
        { email, password, ...(register ? { name } : {}) },
      );
      if (typeof session?.accessToken !== "string")
        throw new Error("Invalid session response.");
      await load(session.accessToken);
      setToken(session.accessToken);
      setEmail("");
      setName("");
    });
    setPassword("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await work(async () => {
      const saved = checked(
        await api<unknown>("/financial-plan", token, "PUT", {
          version: plan?.version ?? 0,
          inputs: draft,
        }),
      );
      if (!saved)
        throw new Error("Save response missing. Reload before trying again.");
      setPlan(saved);
      setDraft(structuredClone(saved.inputs));
      setStatus(
        `Plan saved at version ${saved.version}. Charts now show those saved inputs.`,
      );
    }, true);
  }
  function numberField(
    label: string,
    key:
      | "monthlyIncomeCents"
      | "monthlySpendingCents"
      | "annualReturnBps"
      | "annualFeeBps"
      | "annualInflationBps"
      | "years",
    min = 0,
    max = 10000000000,
  ) {
    const scale = key === "years" ? 1 : 100;
    return (
      <label>
        {label}
        <input
          required
          type="number"
          step={key === "years" ? 1 : "0.01"}
          min={min}
          max={max}
          value={draft[key] / scale}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]: Math.round(Number(e.target.value) * scale),
            })
          }
        />
      </label>
    );
  }
  const rows = plan?.projection.rows || [];
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.nominalCents, r.realCents]),
  );
  function points(key: "nominalCents" | "realCents") {
    return rows
      .map(
        (r, i) =>
          `${40 + (i / (rows.length - 1)) * 660},${220 - (r[key] / max) * 180}`,
      )
      .join(" ");
  }
  return (
    <section
      className="financial-workspace"
      aria-labelledby="financial-heading"
    >
      <div className="panel">
        <span className="eyebrow">PERSISTED TEST WORKSPACE · USD</span>
        <h2 id="financial-heading">Your financial picture, from your inputs</h2>
        <p>
          Enter manual balances and monthly cash flow, save them to your
          account, and compare nominal with inflation-adjusted balances. No
          linked accounts, live prices, or probability of success. Synthetic
          test data only during this pre-launch sandbox.
        </p>
      </div>
      {!token ? (
        <section className="panel">
          <h3>
            {register
              ? "Create a test account"
              : "Sign in to your financial workspace"}
          </h3>
          <p>
            Sessions stay in memory. Reloading or leaving this view requires
            sign-in again. Existing planning accounts work here; no
            demonstration account is pre-filled.
          </p>
          <form onSubmit={signIn} className="financial-form">
            {register && (
              <label>
                Display name
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                minLength={register ? 8 : 1}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy
                ? "Connecting…"
                : register
                  ? "Create test account"
                  : "Sign in"}
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setPassword("");
              setError("");
            }}
          >
            {register
              ? "Use an existing account"
              : "Create a test account instead"}
          </button>
        </section>
      ) : (
        <>
          <BlueprintTools
            key={token}
            token={token}
            requestedTool={requestedTool}
            toolRequestId={toolRequestId}
          />
          <div className="financial-toolbar">
            <button disabled={busy} onClick={() => void work(() => load())}>
              Reload saved plan (discard edits)
            </button>
            <button disabled={busy} onClick={() => void revokeSessions()}>
              Clear local session
            </button>
            <button disabled={busy} onClick={() => void revokeSessions(true)}>
              Sign out all sessions
            </button>
          </div>
          {blocked && (
            <p role="alert" className="validation">
              A write may have succeeded, or another version was saved. Saving
              is paused. Reload and inspect the saved plan before deliberately
              editing again. No automatic retry.
            </p>
          )}
          <section className="panel">
            <h3>
              {plan
                ? "Edit your saved assumptions"
                : "Build your first saved plan"}
            </h3>
            <p>
              Amounts are dollars; rates are annual percentages. Balances are
              as-of snapshots, not historical returns. Saving replaces this
              account’s plan with version checks.
            </p>
            <form onSubmit={save} className="financial-form">
              <label>
                Plan name
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Balance as-of date
                <input
                  required
                  type="date"
                  value={draft.asOf}
                  onChange={(e) => setDraft({ ...draft, asOf: e.target.value })}
                />
              </label>
              <label className="wide">
                Input source / verification note
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  placeholder="e.g. Synthetic test inputs; not connected to a financial institution"
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value })
                  }
                />
              </label>
              {(Object.keys(draft.balances) as (keyof Balances)[]).map((k) => (
                <label key={k}>
                  {k[0].toUpperCase() + k.slice(1)} balance ($)
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000000000"
                    value={draft.balances[k] / 100}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        balances: {
                          ...draft.balances,
                          [k]: Math.round(Number(e.target.value) * 100),
                        },
                      })
                    }
                  />
                </label>
              ))}
              {numberField("Monthly income ($)", "monthlyIncomeCents")}
              {numberField("Monthly spending ($)", "monthlySpendingCents")}
              {numberField(
                "Assumed annual return (%)",
                "annualReturnBps",
                -90,
                20,
              )}
              {numberField("Annual asset fee (%)", "annualFeeBps", 0, 10)}
              {numberField(
                "Assumed annual inflation (%)",
                "annualInflationBps",
                0,
                20,
              )}
              {numberField("Projection horizon (years)", "years", 1, 60)}
              <button className="primary" disabled={busy || blocked}>
                {busy ? "Saving…" : "Save plan and update charts"}
              </button>
              {dirty && (
                <p>
                  Unsaved inputs. Charts below remain tied to the last confirmed
                  save.
                </p>
              )}
            </form>
          </section>
          {plan && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <h3>{plan.inputs.name}</h3>
                  <span>
                    Saved v{plan.version} ·{" "}
                    {new Date(plan.updatedAt).toLocaleString()}
                  </span>
                </div>
                <p>
                  Manual balances as of {plan.inputs.asOf}. Source:{" "}
                  {plan.inputs.source}
                </p>
                <div className="financial-kpis">
                  <div>
                    <small>Starting assets</small>
                    <strong>{usd(plan.projection.initialCents)}</strong>
                  </div>
                  <div>
                    <small>Monthly surplus / deficit</small>
                    <strong>{usd(plan.projection.monthlySurplusCents)}</strong>
                  </div>
                  <div>
                    <small>First unfunded spending</small>
                    <strong>
                      {plan.projection.depletionMonth
                        ? `Month ${plan.projection.depletionMonth}`
                        : "None in this scenario"}
                    </strong>
                  </div>
                </div>
                <h3>Asset mix · manually entered balances</h3>
                <div
                  className="allocation"
                  role="img"
                  aria-label="Asset allocation; exact values and percentages in the table below"
                >
                  {(Object.entries(plan.inputs.balances) as [string, number][])
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span
                        className={`asset-${k}`}
                        key={k}
                        style={{
                          width: `${(v / Math.max(1, plan.projection.initialCents)) * 100}%`,
                        }}
                      />
                    ))}
                </div>
                <table>
                  <caption>
                    Saved asset snapshot · not market valuations
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Balance</th>
                      <th scope="col">Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(plan.inputs.balances).map(([k, v]) => (
                      <tr key={k}>
                        <th scope="row">{k}</th>
                        <td>{usd(v)}</td>
                        <td>
                          {plan.projection.initialCents
                            ? (
                                (v / plan.projection.initialCents) *
                                100
                              ).toFixed(1) + "%"
                            : "Not applicable"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="panel">
                <h3>Balance over time · deterministic scenario</h3>
                <p>
                  Solid cyan: nominal dollars. Dashed gold: today’s purchasing
                  power using your inflation assumption. These are not
                  predictions or confidence intervals.
                </p>
                <svg
                  className="financial-chart"
                  viewBox="0 0 740 270"
                  role="img"
                  aria-labelledby="projection-title projection-desc"
                >
                  <title id="projection-title">
                    Saved financial plan balances
                  </title>
                  <desc id="projection-desc">
                    Annual nominal and real balances from year zero to{" "}
                    {plan.inputs.years}. Exact values are in the expandable
                    table below.
                  </desc>
                  <line
                    x1="40"
                    y1="220"
                    x2="700"
                    y2="220"
                    stroke="currentColor"
                  />
                  <text x="40" y="250">
                    Year 0
                  </text>
                  <text x="640" y="250">
                    Year {plan.inputs.years}
                  </text>
                  <text x="40" y="24">
                    Scale: {usd(max)}
                  </text>
                  <polyline
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="3"
                    points={points("nominalCents")}
                  />
                  <polyline
                    fill="none"
                    stroke="#ffd700"
                    strokeWidth="3"
                    strokeDasharray="8 5"
                    points={points("realCents")}
                  />
                </svg>
                <details>
                  <summary>
                    View exact annual balances, fees and unfunded spending
                  </summary>
                  <div
                    className="table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Annual projection data"
                  >
                    <table>
                      <caption>
                        All amounts rounded for display; real dollars use the
                        input as-of date as base.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Year</th>
                          <th scope="col">Nominal</th>
                          <th scope="col">Real</th>
                          <th scope="col">Cumulative fees</th>
                          <th scope="col">Unfunded spending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.year}>
                            <th scope="row">{r.year}</th>
                            <td>{usd(r.nominalCents)}</td>
                            <td>{usd(r.realCents)}</td>
                            <td>{usd(r.cumulativeFeesCents)}</td>
                            <td>{usd(r.cumulativeUnfundedCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <p className="method-note">
                  Method {plan.projection.methodVersion}:{" "}
                  {plan.projection.assumptions} Depletion records the first
                  month income plus assets cannot cover spending; a zero balance
                  alone is not a probability of failure.
                </p>
                <p>
                  Methods:{" "}
                  <a
                    href="https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SEC compounding inputs
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://www.bls.gov/cpi/factsheets/purchasing-power-constant-dollars.htm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    BLS real-dollar method
                  </a>
                  . No external data is fetched or implied.
                </p>
              </section>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="validation">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
