import { useEffect, useRef, useState, type FormEvent } from "react";
import { signedOut, useSessionToken } from "./session-signal";
import {
  api,
  savedAction,
  eventDetails,
  ApiError,
  type SavedAction,
  type ActionFields,
} from "./planning-api";
import { stages } from "./workflow";
const labels: Record<keyof ActionFields, string> = {
  title: "Action title",
  outcome: "Intended outcome",
  owner: "Responsible for next step",
  source: "Source and verification date",
  assumptions: "Assumptions and known gaps",
  alternatives: "Alternatives considered",
  costs: "Costs and conflicts to review",
};
const empty: ActionFields = {
  title: "",
  outcome: "",
  owner: "",
  source: "",
  assumptions: "",
  alternatives: "",
  costs: "",
};
export default function ConnectedWorkspace() {
  // Shared across routes so leaving this view doesn't drop the session.
  const [token, setToken] = useSessionToken("connected-workspace");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [actions, setActions] = useState<SavedAction[]>([]);
  const [selected, setSelected] = useState("");
  const [fields, setFields] = useState<ActionFields>(empty);
  const [busy, setBusy] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const reconciliationRequired = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reviewDate, setReviewDate] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const active = actions.find((a) => a.id === selected);
  const next = active ? stages[stages.indexOf(active.stage) + 1] : null;
  async function work(fn: () => Promise<void>, mutation = false) {
    if (inFlight.current) return;
    if (mutation && reconciliationRequired.current) {
      setError(
        "Reload saved actions and inspect the records before trying another change.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      if (
        mutation &&
        (!(err instanceof ApiError) || err.uncertain || err.status === 409)
      ) {
        reconciliationRequired.current = true;
        setRequiresReload(true);
      }
      if (err instanceof ApiError && err.status === 401) {
        reconciliationRequired.current = false;
        setRequiresReload(false);
        setToken(null);
        setActions([]);
        setSelected("");
        setFields(empty);
        setReview("");
        setEvidence("");
        setConfirmed(false);
        setReviewDate("");
      }
      setError(
        err instanceof Error
          ? err.message
          : "The request failed. No change has been confirmed.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function load(current = token) {
    const data = await api<SavedAction[]>("/planning/actions", current);
    if (!Array.isArray(data))
      throw new Error("The API returned an invalid action list.");
    const records = data.map(savedAction);
    setActions(records);
    setConfirmed(false);
    setReviewDate(records.find((a) => a.id === selected)?.reviewDate || "");
    if (reconciliationRequired.current) {
      // An ambiguous create may already exist. Never leave the same filled draft
      // ready to resubmit after reconciliation; require a deliberate new entry.
      setFields(empty);
      setReview("");
      setEvidence("");
      setStatus(
        "Saved planning actions reloaded. Inspect the records before creating another action. The previous create draft was cleared; no request was repeated.",
      );
    } else {
      setStatus("Saved planning actions loaded.");
    }
    reconciliationRequired.current = false;
    setRequiresReload(false);
  }
  useEffect(() => {
    // Returning with a live session: reload the saved actions.
    if (token) void work(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    let acquired = "";
    await work(async () => {
      const session = await api<{ accessToken: string }>(
        "/auth/login",
        null,
        "POST",
        { email, password },
      );
      if (
        !session ||
        typeof session.accessToken !== "string" ||
        !session.accessToken
      )
        throw new Error("The API did not return a valid session.");
      await load(session.accessToken);
      acquired = session.accessToken;
      setEmail("");
      setPassword("");
    });
    // Publish the shared session once the sign-in work has settled.
    if (acquired) setToken(acquired);
    setPassword("");
  }
  function select(action: SavedAction) {
    setSelected(action.id);
    setStatus(`Opened ${action.title}. ${action.stage}.`);
    setTimeout(() => heading.current?.focus(), 0);
    setReview("");
    setEvidence("");
    setConfirmed(false);
    setReviewDate(action.reviewDate || "");
  }
  async function mutate(suffix: string, body: object, method = "POST") {
    if (!active) return;
    await work(async () => {
      const updated = await api<SavedAction>(
        `/planning/actions/${active.id}/${suffix}`,
        token,
        method,
        { version: active.version, ...body },
      );
      savedAction(updated);
      setActions((current) =>
        current.map((a) => (a.id === updated.id ? updated : a)),
      );
      setConfirmed(false);
      setStatus(
        `${updated.title}: ${updated.stage}. Saved at version ${updated.version}. No financial transaction was executed.`,
      );
      setTimeout(() => heading.current?.focus(), 0);
    }, true);
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await work(async () => {
      const saved = await api<SavedAction>(
        "/planning/actions",
        token,
        "POST",
        fields,
      );
      savedAction(saved);
      setActions((current) => [...current, saved]);
      select(saved);
      setFields(empty);
      setStatus("Planning action saved.");
    }, true);
  }
  return (
    <section className="connected-workspace">
      <div className="callout">
        <strong>Saved planning workspace · development build</strong>
        <p>
          This view saves planning records to the configured backend. It does
          not connect financial accounts, execute transactions, upload
          documents, or provide professional sign-off. Use development data only
          until the security and privacy review is complete. Access is limited
          to the signed-in account; advisor sharing is not implemented. Sample
          comparison inputs are not attached to these records; this is not
          approval of a financial scenario.
        </p>
      </div>
      {requiresReload && (
        <p className="callout" id="write-reconciliation">
          A previous change may already have been saved, or this record changed
          elsewhere. All save controls are paused. Reload saved actions and
          inspect the results before making another change. A successful reload
          will clear the previous create draft; a failed reload will not unlock
          saving.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
          {error.includes("Reload") &&
            " Use Reload saved actions before trying again; requests are never silently repeated."}
        </p>
      )}
      {!token ? (
        <form className="panel" onSubmit={signIn}>
          <h2>Sign in to your development workspace</h2>
          <p>
            Use an existing backend development account. Your session token
            stays in memory and is cleared on reload; it is not saved in browser
            storage. Do not enter client records.
          </p>
          <div className="input-grid">
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <button className="button" disabled={busy}>
            {busy ? "Connecting…" : "Sign in"}
          </button>
        </form>
      ) : (
        <>
          <div className="section-heading">
            <h2>Your saved planning actions</h2>
            <div className="toolbar-buttons">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => work(() => load())}
              >
                Reload saved actions
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setToken(null);
                  reconciliationRequired.current = false;
                  setRequiresReload(false);
                  setActions([]);
                  setSelected("");
                  setFields(empty);
                  setReview("");
                  setEvidence("");
                  setConfirmed(false);
                  setReviewDate("");
                  setError("");
                  const notice =
                    "Local session cleared. Existing backend tokens remain valid until expiry.";
                  setStatus(notice);
                  signedOut("connected-workspace", notice);
                }}
              >
                Clear local session
              </button>
            </div>
          </div>
          <details className="panel">
            <summary>Create a planning action</summary>
            <form onSubmit={create}>
              <div className="record-grid">
                {Object.entries(labels).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    {key === "title" || key === "owner" ? (
                      <input
                        required
                        maxLength={160}
                        value={fields[key as keyof ActionFields]}
                        onChange={(e) =>
                          setFields({ ...fields, [key]: e.target.value })
                        }
                      />
                    ) : (
                      <textarea
                        required
                        maxLength={4000}
                        value={fields[key as keyof ActionFields]}
                        onChange={(e) =>
                          setFields({ ...fields, [key]: e.target.value })
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <p>
                Record unknowns explicitly. Do not invent supporting evidence or
                imply professional review.
              </p>
              <button className="button" disabled={busy || requiresReload}>
                Save planning action
              </button>
            </form>
          </details>
          {!actions.length ? (
            <div className="panel">
              <h3>No saved actions yet</h3>
              <p>
                Create an action with its context, assumptions, alternatives,
                and costs. Sample preview cards are never imported
                automatically.
              </p>
            </div>
          ) : (
            <div
              className="board"
              aria-label="Saved planning actions by status"
            >
              {stages.map((stage) => (
                <section className="lane" key={stage} aria-label={stage}>
                  <h3>{stage}</h3>
                  {actions
                    .filter((a) => a.stage === stage)
                    .map((a) => (
                      <button
                        className={`board-card ${a.id === selected ? "selected" : ""}`}
                        key={a.id}
                        aria-pressed={a.id === selected}
                        onClick={() => select(a)}
                      >
                        <strong>{a.title}</strong>
                        <p>{a.outcome}</p>
                        <span className="card-status">{a.stage}</span>
                        <span className="card-owner">{a.owner}</span>
                      </button>
                    ))}
                </section>
              ))}
            </div>
          )}
          {active && (
            <section className="panel" aria-busy={busy}>
              <div className="section-heading">
                <h2 tabIndex={-1} ref={heading}>
                  {active.title}
                </h2>
                <span className="badge">
                  {active.stage} · version {active.version}
                </span>
              </div>
              <dl className="record-grid">
                {Object.entries(labels)
                  .filter(([key]) => key !== "title")
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{active[key as keyof ActionFields]}</dd>
                    </div>
                  ))}
              </dl>
              <div className="transition-area">
                {next && (
                  <>
                    <p>
                      Next stage: <strong>{next}</strong>. A status change never
                      grants permission to transact.
                    </p>
                    {next === "Waiting for approval" && (
                      <label>
                        Review note (not professional sign-off)
                        <textarea
                          value={review}
                          onChange={(e) => setReview(e.target.value)}
                          maxLength={4000}
                        />
                      </label>
                    )}
                    {next === "In progress" &&
                      active.authorizedVersion !== active.version && (
                        <>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={confirmed}
                              onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            I authorize planning follow-through for “
                            {active.title}” with the assumptions, alternatives,
                            and costs shown. This does not authorize a trade,
                            transfer, purchase, or legal instrument.
                          </label>
                          <button
                            className="button"
                            disabled={busy || requiresReload || !confirmed}
                            onClick={() =>
                              mutate("authorization", {
                                confirmation:
                                  "AUTHORIZE_PLANNING_FOLLOW_THROUGH",
                              })
                            }
                          >
                            Record planning authorization
                          </button>
                          <p>
                            Recording authorization leaves the card in Waiting
                            for approval. Starting follow-through is a separate
                            step.
                          </p>
                        </>
                      )}
                    {next === "Verified complete" && (
                      <label>
                        Completion evidence
                        <textarea
                          maxLength={4000}
                          value={evidence}
                          onChange={(e) => setEvidence(e.target.value)}
                        />
                      </label>
                    )}
                    <button
                      className="button"
                      disabled={
                        busy ||
                        requiresReload ||
                        (next === "Waiting for approval" && !review.trim()) ||
                        (next === "In progress" &&
                          active.authorizedVersion !== active.version) ||
                        (next === "Verified complete" && !evidence.trim())
                      }
                      onClick={() =>
                        mutate("transitions", {
                          stage: next,
                          ...(next === "Waiting for approval"
                            ? { reviewNote: review }
                            : {}),
                          ...(next === "Verified complete" ? { evidence } : {}),
                        })
                      }
                    >
                      Move to {next}
                    </button>
                  </>
                )}
                {active.authorizedVersion !== null &&
                  (active.stage === "Waiting for approval" ||
                    active.stage === "In progress") && (
                    <button
                      className="text-button"
                      disabled={busy || requiresReload}
                      onClick={() => mutate("revoke-authorization", {})}
                    >
                      Revoke planning authorization and pause follow-through
                    </button>
                  )}
                {active.completionEvidence && (
                  <p>
                    <strong>Completion evidence:</strong>{" "}
                    {active.completionEvidence}
                  </p>
                )}
              </div>
              <div className="input-grid">
                <label>
                  Review date (does not schedule a reminder)
                  <input
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                  />
                </label>
                <button
                  className="button align-end"
                  disabled={busy || requiresReload}
                  onClick={() =>
                    mutate(
                      "review-date",
                      { reviewDate: reviewDate || null },
                      "PATCH",
                    )
                  }
                >
                  Save review date
                </button>
              </div>
              <details>
                <summary>
                  Saved decision history ({active.events.length} events)
                </summary>
                <ol>
                  {active.events.map((event) => (
                    <li key={event.id}>
                      <strong>
                        Version {event.version}:{" "}
                        {event.type.replaceAll("_", " ")}
                      </strong>
                      <p>
                        <time dateTime={event.createdAt}>
                          {new Date(event.createdAt).toLocaleString("en-US", {
                            timeZone: "America/Chicago",
                          })}{" "}
                          Central Time
                        </time>{" "}
                        · Recorded actor: {event.actorId}
                      </p>
                      <pre className="event-details">
                        {eventDetails(event.details)}
                      </pre>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </>
      )}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {status}
      </div>
    </section>
  );
}
