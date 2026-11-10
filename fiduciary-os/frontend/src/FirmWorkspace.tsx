import { useState, type FormEvent } from "react";
import { api, ApiError } from "./planning-api";

type Household = { id: string; name: string; firmId: string };
type Detail = {
  id: string;
  name: string;
  firm: string;
  clients: { id: string; name: string }[];
  access: string;
};

/** Advisor-side workspace: firms, households, client links, advisor assignments, plan PDF. */
export default function FirmWorkspace() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [households, setHouseholds] = useState<Household[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [firmId, setFirmId] = useState("");
  const [firmName, setFirmName] = useState("");
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [scope, setScope] = useState<"view" | "manage">("view");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "The request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const call = <T,>(path: string, method = "GET", body?: unknown) =>
    api<T>(path, token, method, body);
  const reload = async (t = token) =>
    setHouseholds(await api<Household[]>("/org/households", t));

  const login = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const s = await api<{ accessToken: string }>(
        "/auth/login",
        null,
        "POST",
        { email, password },
      );
      if (!s || typeof s.accessToken !== "string")
        throw new Error("The API did not return a valid session.");
      setToken(s.accessToken);
      await reload(s.accessToken);
      setPassword("");
    });
  };
  const createFirm = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const f = await call<{ id: string; name: string }>("/org/firms", "POST", {
        name: firmName,
      });
      setFirmId(f.id);
      setStatus(`Firm "${f.name}" created. You are its owner.`);
    });
  };
  const addAdvisor = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await call(`/org/firms/${firmId}/advisors`, "POST", {
        email: advisorEmail,
      });
      setStatus("Advisor added to the firm.");
      setAdvisorEmail("");
    });
  };
  const createHousehold = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await call(`/org/firms/${firmId}/households`, "POST", {
        name: householdName,
      });
      setHouseholdName("");
      await reload();
      setStatus("Household created.");
    });
  };
  const open = (id: string) =>
    run(async () => setDetail(await call<Detail>(`/org/households/${id}`)));
  const addClient = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await call(`/org/households/${detail!.id}/clients`, "POST", {
        email: clientEmail,
      });
      setClientEmail("");
      setDetail(await call<Detail>(`/org/households/${detail!.id}`));
      setStatus("Client linked to household.");
    });
  };
  const assign = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await call(`/org/households/${detail!.id}/assignments`, "POST", {
        email: assignEmail,
        scope,
      });
      setAssignEmail("");
      setStatus(`Advisor assigned with ${scope} access.`);
    });
  };
  const pdf = () =>
    run(async () => {
      const r = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "/api/v1"}/org/households/${detail!.id}/plan.pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!r.ok)
        throw new Error(
          r.status === 403
            ? "You do not have access to this household."
            : "The PDF could not be created.",
        );
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "household-plan.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Plan PDF downloaded.");
    });

  if (!token)
    return (
      <section className="firm-workspace" aria-labelledby="firm-login">
        <h2 id="firm-login">Firm workspace sign-in</h2>
        <p>
          Sign in with the same account you use for the saved planning
          workspace.
        </p>
        <form className="panel" onSubmit={login}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            Sign in
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    );

  return (
    <section className="firm-workspace" aria-labelledby="firm-title">
      <h2 id="firm-title">Firms and households</h2>
      <p>
        Access is relationship-based: owners see their firm, advisors see
        assigned households, clients see their own. Every access decision is
        logged.
      </p>
      <div role="status" className="callout" hidden={!status}>
        {status}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <form className="panel" onSubmit={createFirm}>
        <h3>Create a firm</h3>
        <label>
          Firm name
          <input
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          Create firm
        </button>
      </form>
      <label>
        Active firm ID (set automatically when you create a firm; paste one you
        own to reuse it)
        <input value={firmId} onChange={(e) => setFirmId(e.target.value)} />
      </label>
      {firmId && (
        <>
          <form className="panel" onSubmit={addAdvisor}>
            <h3>Add an advisor (owner only)</h3>
            <label>
              Advisor email (must be registered)
              <input
                type="email"
                value={advisorEmail}
                onChange={(e) => setAdvisorEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Add advisor
            </button>
          </form>
          <form className="panel" onSubmit={createHousehold}>
            <h3>Create a household</h3>
            <label>
              Household name
              <input
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Create household
            </button>
          </form>
        </>
      )}

      <h3>Households you can access</h3>
      {households.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ul>
          {households.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="button white"
                onClick={() => open(h.id)}
                aria-pressed={detail?.id === h.id}
              >
                {h.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <article className="panel" aria-label={`Household ${detail.name}`}>
          <h3>{detail.name}</h3>
          <p>
            Firm: {detail.firm}. Your access: {detail.access}.
          </p>
          <ul>
            {detail.clients.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button white"
            onClick={pdf}
            disabled={busy}
          >
            Download plan PDF
          </button>
          <form className="panel" onSubmit={addClient}>
            <label>
              Link a client by email
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Link client
            </button>
          </form>
          <form className="panel" onSubmit={assign}>
            <label>
              Assign advisor by email
              <input
                type="email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Access
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "view" | "manage")}
              >
                <option value="view">view</option>
                <option value="manage">manage</option>
              </select>
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Assign advisor
            </button>
          </form>
          <p>
            Linking and assigning need manage access; assigning needs firm-owner
            rights. You will see an error if you lack it.
          </p>
        </article>
      )}
    </section>
  );
}
