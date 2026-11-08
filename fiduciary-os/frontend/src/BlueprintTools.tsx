import { useEffect, useState } from "react";

type Field = {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};
type Catalog = Record<string, { title: string; note: string; fields: Field[] }>;
type Row = {
  year: number;
  balance: number;
  comparison?: number;
  unfunded?: number;
};
type Scenario = {
  kind: string;
  version: number;
  updatedAt: string;
  inputs: Record<string, string | number>;
  result: {
    methodVersion: string;
    notice: string;
    metrics: { label: string; value: number; unit: string }[];
    rows: Row[];
  };
};
type Feed = {
  key: string;
  provider: string;
  providerUrl: string;
  unit: string;
  currency: string | null;
  ttlSeconds: number;
  fetchedAt: string | null;
  observedAt: string | null;
  status: string;
  error: string | null;
  points: { label: string; value: number; observedAt: string }[];
};
const base =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/v1";
const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const time = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value} (reported date; no time supplied)`
    : value
      ? new Date(value).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          timeZoneName: "short",
        })
      : "Unavailable";
function Plot({
  rows,
  label,
  observed = false,
}: {
  rows: Row[];
  label: string;
  observed?: boolean;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.balance, r.comparison ?? 0]),
  );
  const path = (key: "balance" | "comparison") =>
    rows
      .map(
        (row, index) =>
          `${20 + (index / Math.max(1, rows.length - 1)) * 560},${150 - ((row[key] ?? 0) / max) * 125}`,
      )
      .join(" ");
  return (
    <svg
      viewBox="0 0 600 185"
      className="financial-chart"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <desc>
        {observed
          ? "Solid cyan shows provider observations. Exact dates, units and values are in the preceding table."
          : "Exact years and values are in the following table. Solid cyan is saved scenario assets; dashed gold is the no-fee comparison when available."}
      </desc>
      <line x1="20" x2="580" y1="150" y2="150" stroke="currentColor" />
      <polyline
        points={path("balance")}
        fill="none"
        stroke="var(--cyan)"
        strokeWidth="3"
      />
      {rows[0]?.comparison !== undefined && (
        <polyline
          points={path("comparison")}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
      )}
      <text x="20" y="175">
        Start
      </text>
      <text x="530" y="175">
        End
      </text>
    </svg>
  );
}
export default function BlueprintTools({ token }: { token: string }) {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [saved, setSaved] = useState<Scenario[]>([]);
  const [kind, setKind] = useState("profile");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [clock, setClock] = useState(Date.now());
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${base}/tools${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Session expired. Clear the local session and sign in again."
          : response.status === 409
            ? "Scenario changed. Reload before saving again."
            : "Request failed. Check inputs or reload; no write was automatically retried.",
      );
    return response.json();
  }
  function fill(selected: string, scenarios: Scenario[]) {
    setDraft(
      Object.fromEntries(
        Object.entries(
          scenarios.find((s) => s.kind === selected)?.inputs ?? {},
        ).map(([key, value]) => [key, String(value)]),
      ),
    );
  }
  async function reload() {
    setBusy(true);
    try {
      const [nextCatalog, scenarios] = await Promise.all([
        request<Catalog>("/catalog"),
        request<Scenario[]>("/scenarios"),
      ]);
      if (
        !nextCatalog ||
        typeof nextCatalog !== "object" ||
        !Array.isArray(scenarios) ||
        Object.values(nextCatalog).some(
          (value) =>
            !value ||
            typeof value.title !== "string" ||
            !Array.isArray(value.fields),
        )
      )
        throw new Error("Tool response invalid. Reload before saving.");
      setCatalog(nextCatalog);
      setSaved(scenarios);
      fill(kind, scenarios);
      setLocked(false);
      setDirty(false);
      setMessage("Saved tools loaded. Unsaved draft discarded.");
    } catch (error) {
      setLocked(true);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [token]);
  const current = saved.find((s) => s.kind === kind);
  const definition = catalog[kind];
  const state = (feed: Feed) =>
    feed.status === "fresh" &&
    feed.fetchedAt &&
    clock - Date.parse(feed.fetchedAt) >= feed.ttlSeconds * 1000
      ? "stale"
      : feed.status;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked || !definition) return;
    const inputs: Record<string, string | number> = {
      source: draft.source ?? "",
      asOfDate: draft.asOfDate ?? "",
    };
    for (const field of definition.fields) {
      if (draft[field.key] === undefined || draft[field.key] === "") {
        setMessage(
          "Every field is required; enter zero only when it is a known fact or assumption.",
        );
        return;
      }
      inputs[field.key] = field.options
        ? draft[field.key]
        : Number(draft[field.key]);
    }
    setBusy(true);
    try {
      const result = await request<Scenario>(`/scenarios/${kind}`, "PUT", {
        version: current?.version ?? 0,
        inputs,
      });
      if (
        !result.result ||
        !Number.isInteger(result.version) ||
        result.kind !== kind
      )
        throw new Error("Save response uncertain. Reload before trying again.");
      setSaved((previous) => [
        ...previous.filter((s) => s.kind !== kind),
        result,
      ]);
      fill(kind, [result]);
      setDirty(false);
      setMessage("Scenario saved; results use the confirmed saved inputs.");
    } catch (error) {
      setLocked(true);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadFeeds() {
    setBusy(true);
    try {
      setFeeds(await request<Feed[]>("/observations"));
      setClock(Date.now());
      setMessage(
        "Public provider observations loaded. Inspect source dates and freshness before use.",
      );
    } catch (error) {
      setFeeds([]);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const quoteFeed = feeds.find(
    (f) => f.key === "crypto" && state(f) === "fresh",
  );
  const holdings = saved.find((s) => s.kind === "crypto");
  function exportSaved() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              classification:
                "Private manually entered scenarios; not live accounts or legal advice",
              scenarios: saved,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fiduciary-private-scenarios.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="blueprint-tools" aria-labelledby="blueprint-heading">
      <h2 id="blueprint-heading">Blueprint tools</h2>
      <p>
        Private saved facts, transparent calculated scenarios and public
        observations are separate. No financial accounts connected. Blank fields
        are not demo values.
      </p>
      <nav className="tool-tabs" aria-label="Blueprint modules">
        {Object.entries(catalog).map(([key, value]) => (
          <button
            type="button"
            key={key}
            aria-pressed={kind === key}
            disabled={busy || (dirty && key !== kind)}
            onClick={() => {
              setKind(key);
              fill(key, saved);
              setMessage("");
            }}
          >
            {value.title}
          </button>
        ))}
      </nav>
      <div className="financial-toolbar">
        <button type="button" disabled={busy} onClick={() => void reload()}>
          Discard draft & reload tools
        </button>
        <button type="button" disabled={!saved.length} onClick={exportSaved}>
          Download private saved snapshot
        </button>
      </div>
      <p role="status">
        {message}
        {dirty
          ? " Unsaved inputs: results still show the last confirmed save. Save or discard before changing modules."
          : ""}
      </p>
      {definition && (
        <section className="panel">
          <h3>{definition.title}</h3>
          <p>{definition.note}</p>
          <form className="financial-form" onSubmit={save}>
            <label>
              Source / assumptions
              <input
                aria-label={`${definition.title}: Source`}
                required
                maxLength={120}
                value={draft.source ?? ""}
                disabled={locked || busy}
                onChange={(e) => {
                  setDraft({ ...draft, source: e.target.value });
                  setDirty(true);
                }}
              />
            </label>
            <label>
              As-of date
              <input
                aria-label={`${definition.title}: As-of date`}
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={draft.asOfDate ?? ""}
                disabled={locked || busy}
                onChange={(e) => {
                  setDraft({ ...draft, asOfDate: e.target.value });
                  setDirty(true);
                }}
              />
            </label>
            {definition.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.options ? (
                  <select
                    aria-label={`${definition.title}: ${field.label}`}
                    required
                    disabled={locked || busy}
                    value={draft[field.key] ?? ""}
                    onChange={(e) => {
                      setDraft({ ...draft, [field.key]: e.target.value });
                      setDirty(true);
                    }}
                  >
                    <option value="">Choose…</option>
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={`${definition.title}: ${field.label}`}
                    type="number"
                    required
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    disabled={locked || busy}
                    value={draft[field.key] ?? ""}
                    onChange={(e) => {
                      setDraft({ ...draft, [field.key]: e.target.value });
                      setDirty(true);
                    }}
                  />
                )}
              </label>
            ))}
            <button
              className="primary wide"
              disabled={locked || busy}
              type="submit"
            >
              Save {definition.title} & calculate
            </button>
          </form>
          {current && (
            <>
              <p>
                Saved v{current.version} · {time(current.updatedAt)} · Source:{" "}
                {current.inputs.source} · As of {current.inputs.asOfDate} ·{" "}
                {current.result.methodVersion}
              </p>
              <dl className="tool-metrics">
                {current.result.metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>
                      {metric.unit === "USD"
                        ? usd(metric.value)
                        : `${metric.value} ${metric.unit}`}
                    </dd>
                  </div>
                ))}
              </dl>
              {current.result.rows.length > 0 && (
                <>
                  <Plot
                    rows={current.result.rows}
                    label={`${definition.title} saved scenario, not a forecast`}
                  />
                  <details>
                    <summary>Exact scenario data and no-fee comparison</summary>
                    <div
                      className="table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label="Exact saved scenario data"
                    >
                      <table>
                        <caption>
                          Year end USD. No-fee comparisons are not investment
                          recommendations.
                        </caption>
                        <thead>
                          <tr>
                            <th>Year</th>
                            <th>Assets</th>
                            <th>Without fees</th>
                            <th>Unfunded spending</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.result.rows.map((row) => (
                            <tr key={row.year}>
                              <td>{row.year}</td>
                              <td>{usd(row.balance)}</td>
                              <td>
                                {row.comparison === undefined
                                  ? "Not modeled"
                                  : usd(row.comparison)}
                              </td>
                              <td>
                                {row.unfunded === undefined
                                  ? "Not modeled"
                                  : usd(row.unfunded)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </>
          )}
        </section>
      )}
      <section className="panel">
        <h3>Symphony: saved planning inventory</h3>
        <p>
          {saved.length} of {Object.keys(catalog).length} tool records saved.
          This is a completeness inventory, not a financial-security score or AI
          recommendation.
        </p>
        <ul>
          {saved.map((s) => (
            <li key={s.kind}>
              {catalog[s.kind]?.title ?? s.kind}: v{s.version}, as of{" "}
              {s.inputs.asOfDate}, source {s.inputs.source}
            </li>
          ))}
        </ul>
        <p>
          Review cash-flow gaps, coverage needs and liquidity with qualified
          advisers. No automatic sharing or generated legal playbook.
        </p>
      </section>
      <section className="panel">
        <h3>Public observations</h3>
        <p>
          Loading sends only fixed public asset/series identifiers, never your
          holdings or profile. Informational only, no advice. By using these
          observations, review the{" "}
          <a href="https://www.coingecko.com/en/api_terms">
            CoinGecko API terms
          </a>
          . CoinGecko is not responsible for financial decisions or data delays.
          This sandbox is for internal evaluation, not customers.
        </p>
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => void loadFeeds()}
        >
          Load public observations
        </button>
        <p>
          <a href="https://www.coingecko.com">Powered by CoinGecko</a> ·{" "}
          <a href="https://fiscaldata.treasury.gov/api-documentation/">
            U.S. Treasury open data
          </a>
          . No market feed is automatically used as an expected return, annuity
          quote or account balance.
        </p>
        {feeds.map((feed) => (
          <article className="observation" key={feed.key}>
            <h4>
              {feed.provider} — {state(feed)}
            </h4>
            <p>
              Observed: {time(feed.observedAt)} · Fetched:{" "}
              {time(feed.fetchedAt)} · TTL {feed.ttlSeconds}s · Unit:{" "}
              {feed.unit}
            </p>
            <a href={feed.providerUrl}>Provider endpoint</a>
            {feed.error && (
              <p role="status">
                Upstream unavailable or invalid. Retained observations, if any,
                are explicitly stale.
              </p>
            )}
            {feed.points.length === 0 ? (
              <p>Unavailable; no invented replacement values.</p>
            ) : (
              <>
                <div
                  className="table-wrap"
                  role="region"
                  aria-label={`${feed.provider} observations`}
                  tabIndex={0}
                >
                  <table>
                    <caption>Provider observations, not forecasts</caption>
                    <thead>
                      <tr>
                        <th>Asset / period</th>
                        <th>Value</th>
                        <th>Observed date / Central timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.points.map((point, index) => (
                        <tr key={`${point.label}-${index}`}>
                          <td>{point.label}</td>
                          <td>
                            {feed.currency === "USD"
                              ? usd(point.value)
                              : point.value}
                          </td>
                          <td>{time(point.observedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {feed.key !== "crypto" && feed.points.length > 1 && (
                  <Plot
                    observed
                    rows={feed.points.map((point, index) => ({
                      year: index,
                      balance: point.value,
                    }))}
                    label={`${feed.provider} observed history; see exact dates and units in table`}
                  />
                )}
              </>
            )}
          </article>
        ))}
        <h4>Manual holdings valued against fresh public observations</h4>
        {!holdings || !quoteFeed ? (
          <p>
            Save Digital assets holdings and load fresh quotes first. Valuation
            and P&amp;L are unavailable otherwise.
          </p>
        ) : (
          <div
            className="table-wrap"
            role="region"
            aria-label="Manual holdings valuation"
            tabIndex={0}
          >
            <table>
              <caption>
                Calculated units × quoted USD price; cost basis is manually
                entered. Not a connected account.
              </caption>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Units</th>
                  <th>Indicative value</th>
                  <th>Unrealized difference</th>
                </tr>
              </thead>
              <tbody>
                {quoteFeed.points.map((point) => (
                  <tr key={point.label}>
                    <td>{point.label}</td>
                    <td>{holdings.inputs[point.label]}</td>
                    <td>
                      {usd(Number(holdings.inputs[point.label]) * point.value)}
                    </td>
                    <td>
                      {usd(
                        Number(holdings.inputs[point.label]) * point.value -
                          Number(holdings.inputs[`${point.label}Cost`]),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h3>Connections and safety boundaries</h3>
        <p>
          Disconnected: account aggregation, carrier quotes, AI provider,
          advisor sharing, secure document vault and legal document execution.
          Vault storage and keys have not been provisioned; no upload control is
          offered. Will/trust tools are discussion checklists only. Historical
          Monte Carlo, efficient frontier, beta/Sharpe, RMD and advanced tax
          methods are not validated implementations. Demo client queues,
          meetings and compliance items are not real records.
        </p>
      </section>
    </section>
  );
}
