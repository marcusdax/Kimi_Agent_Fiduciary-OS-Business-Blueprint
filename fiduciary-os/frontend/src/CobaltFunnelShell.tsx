import { useEffect, useState, type ReactNode } from "react";
import ExpandedModules, { type ExpandedView } from "./ExpandedModules";
import "./cobalt-chrome.css";

type PlatformStage = "landing" | "free" | "premium" | "advisor";
type BoardFinish = "cobalt" | "emerald" | "paper";

interface AuthUser {
  name: string;
  email: string;
  role: string;
  accessToken?: string;
}

const TOOL_GROUPS = [
  {
    title: "Home",
    items: [{ id: "home", glyph: "⌂", label: "Home", hash: "#/workspace", tier: "free" }],
  },
  {
    title: "My Profile",
    items: [{ id: "profile", glyph: "⬡", label: "Profile & Goals", hash: "#/workspace", tier: "free" }],
  },
  {
    title: "Fleet of Navigators",
    items: [
      { id: "annuity", glyph: "◈", label: "Annuity Navigator", hash: "#/workspace", tier: "free" },
      { id: "life", glyph: "◉", label: "Life Insurance", hash: "#/workspace", tier: "free" },
      { id: "xray", glyph: "◇", label: "Investment X-Ray", hash: "#/workspace", tier: "free" },
      { id: "retirement", glyph: "◆", label: "Retirement Income", hash: "#/workspace", tier: "free" },
    ],
  },
  {
    title: "Intelligence Core",
    items: [
      { id: "symphony", glyph: "♦", label: "Symphony Composer", hash: "#/workspace", tier: "premium" },
      { id: "proposed", glyph: "♬", label: "Proposed Symphony", hash: "#/workspace", tier: "premium" },
      { id: "tax", glyph: "◐", label: "Tax Planning", hash: "#/workspace", tier: "free" },
      { id: "digital", glyph: "◑", label: "Digital Assets", hash: "#/workspace", tier: "premium" },
    ],
  },
  {
    title: "Advanced",
    items: [
      { id: "risk", glyph: "⚠", label: "Risk Analytics", hash: "#/workspace", tier: "premium" },
      { id: "estate", glyph: "⬟", label: "Estate Engine", hash: "#/workspace", tier: "premium" },
      { id: "will", glyph: "⚖", label: "Will & Trust", hash: "#/workspace", tier: "premium" },
      { id: "roth", glyph: "↻", label: "Roth Planner", hash: "#/workspace", tier: "premium" },
      { id: "patterns", glyph: "◎", label: "Market Patterns", hash: "#/workspace", tier: "premium" },
      { id: "growth", glyph: "↗", label: "Growth Studio", hash: "#/advisor", tier: "advisor" },
      { id: "proof", glyph: "✓", label: "Proof & Sources", hash: "#/workspace", tier: "free" },
      { id: "vault", glyph: "⬛", label: "The Vault", hash: "#/workspace", tier: "premium" },
    ],
  },
];

function detectStage(): PlatformStage {
  const h = window.location.hash;
  if (h.startsWith("#/advisor")) return "advisor";
  if (h.startsWith("#/workspace")) return h.includes("tier=free") ? "free" : "premium";
  return "landing";
}

export default function CobaltFunnelShell({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<BoardFinish>("cobalt");
  const [stage, setStage] = useState<PlatformStage>(detectStage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState("admin@fiduciaryos.com");
  const [password, setPassword] = useState("Admin!2026");
  const [fullName, setFullName] = useState("");
  const [regTier, setRegTier] = useState<"free" | "premium" | "advisor">("free");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState("Home");
  const [studioView, setStudioView] = useState<ExpandedView>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [tenantName, setTenantName] = useState("Fiduciary OS");
  const [tenantAccent, setTenantAccent] = useState("#38BDF8");
  const [brandNotice, setBrandNotice] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "assistant" | "user"; text: string }[]>([
    {
      role: "assistant",
      text: "Welcome to Fiduciary OS. Ask about Roth conversion ladders, 70/30 retirement glidepaths, Texas homestead trust rules (§ 11.13(j)), IRC § 2035 life insurance rules, or what any calculator assumes. (Educational guidance only, not individualized advice.)",
    },
  ]);

  useEffect(() => {
    document.documentElement.dataset.foBoard = board;
  }, [board]);

  useEffect(() => {
    document.documentElement.style.setProperty("--fo-accent", tenantAccent);
  }, [tenantAccent]);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
    fetch(`${base}/workspace-state/tenant:brand`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const p = data?.record?.payload;
        if (p?.tenantName) setTenantName(String(p.tenantName));
        if (p?.tenantAccent) setTenantAccent(String(p.tenantAccent));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onHash = () => setStage(detectStage());
    const onStudio = (ev: Event) => {
      const v = (ev as CustomEvent<{ view: ExpandedView }>).detail?.view ?? null;
      setStudioView(v);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("fiduciary:open-studio", onStudio);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("fiduciary:open-studio", onStudio);
    };
  }, []);

  function sendChat(promptText?: string) {
    const q = (promptText ?? chatInput).trim();
    if (!q) return;
    const low = q.toLowerCase();
    let reply =
      "Every calculator in Fiduciary OS uses explicit user-supplied inputs and public economic baselines. Open 'Show the work' on any screen to inspect exact assumptions, formulas, and locked disclosures.";
    if (low.includes("roth")) {
      reply =
        "Roth Conversion Ladder: Between retirement and age 73 RMDs, converting pre-tax IRA balances up to the top of the 22% federal bracket locks in today's tax rate and reduces future forced RMD spikes. Always verify MAGI thresholds for Medicare IRMAA.";
    } else if (low.includes("texas") || low.includes("homestead") || low.includes("trust")) {
      reply =
        "Texas Homestead & Trust (Tax Code § 11.13(j)): Deeding a primary residence into a revocable living trust requires qualifying-trust language that preserves the settlor's rent-free right to occupy — otherwise the school-tax homestead exemption can drop. Never use a generic out-of-state quitclaim deed.";
    } else if (low.includes("2035") || low.includes("ilit") || low.includes("life")) {
      reply =
        "Life Insurance & IRC § 2035: Transferring an existing life policy into an Irrevocable Life Insurance Trust (ILIT) pulls proceeds back into the taxable estate if the insured passes away within 3 years. Having the ILIT apply for and own a new policy from day one avoids the 3-year lookback.";
    } else if (low.includes("70/30") || low.includes("glide") || low.includes("symphony")) {
      reply =
        "Symphony Glidepath Model: With 20 years to retirement, the illustrative baseline uses a 70/30 equity/bond split and shifts 5% per year toward fixed income beginning 10 years before retirement to buffer early-retirement sequence-of-returns risk.";
    }
    setChatLog((prev) => [...prev, { role: "user", text: q }, { role: "assistant", text: reply }]);
    setChatInput("");
  }

  function navigateStage(next: PlatformStage) {
    setStage(next);
    if (next === "landing") window.location.hash = "#/start";
    else if (next === "free") window.location.hash = "#/workspace?tier=free";
    else if (next === "premium") window.location.hash = "#/workspace?tier=premium";
    else window.location.hash = "#/advisor";
  }

  async function handleAuthSubmit() {
    setBusy(true);
    setAuthMsg(null);
    const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
    try {
      const endpoint = authMode === "signin" ? "/auth/login" : "/auth/register";
      const payload =
        authMode === "signin"
          ? { email, password }
          : { name: fullName || "New Member", email, password, role: regTier === "advisor" ? "advisor" : "client" };

      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthMsg(json?.error || json?.message || "Authentication failed. Check credentials.");
        return;
      }
      const u = json?.data?.user || json?.user || { name: fullName || email.split("@")[0], email, role: regTier === "advisor" ? "advisor" : "client" };
      const token = json?.data?.accessToken || json?.accessToken;
      setUser({ name: u.name || email, email: u.email || email, role: u.role || "client", accessToken: token });
      setAuthMode(null);
      if (u.role === "admin" || u.role === "advisor") navigateStage("advisor");
      else navigateStage(authMode === "signup" ? regTier : "premium");
    } catch {
      setAuthMsg("Could not reach the authentication server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Polished Cobalt BGA Top Chrome */}
      <header className="fo-chrome-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="fo-btn" onClick={() => setMenuOpen(true)} aria-label="Open Full Tool Navigator Menu" title="Full 18-Tool Navigator">
            ☰ Tools
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>{tenantName}</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--fo-muted)" }}>
              AUCTUM-Powered Financial Planning · {activeTool}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
          <div className="fo-seg" role="group" aria-label="Surface Finish">
            {(["cobalt", "emerald", "paper"] as BoardFinish[]).map((b) => (
              <button key={b} aria-pressed={board === b} onClick={() => setBoard(b)}>
                {b === "cobalt" ? "Cobalt BGA" : b === "emerald" ? "Emerald PCB" : "Calm Paper"}
              </button>
            ))}
          </div>
          <button className="fo-btn" onClick={() => setStudioView(studioView ? null : "willtrust")}>
            ⚖ Will &amp; Trust
          </button>
          <button className="fo-btn" onClick={() => setStudioView(studioView === "symphony" ? null : "symphony")}>
            ♦ Symphony
          </button>
          <button className="fo-btn" onClick={() => setBrandOpen(true)}>
            ⚙ Brand
          </button>
          <button className="fo-btn" onClick={() => setChatOpen((o) => !o)}>
            ✦ AI Guide
          </button>
          <button className="fo-btn" onClick={() => setProofOpen(true)}>Show the work</button>
          {user ? (
            <>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "var(--fo-proof-soft)", color: "var(--fo-proof)" }}>
                {user.name} · {user.role.toUpperCase()}
              </span>
              <button className="fo-btn" onClick={() => { setUser(null); navigateStage("landing"); }}>Sign Out</button>
            </>
          ) : (
            <>
              <button className="fo-btn" onClick={() => { setAuthMsg(null); setAuthMode("signin"); }}>Sign In</button>
              <button className="fo-btn fo-btn-primary" onClick={() => { setAuthMsg(null); setAuthMode("signup"); }}>Create Account</button>
            </>
          )}
        </div>
      </header>

      {/* Wired 4-Stage Sales Funnel Bar */}
      <div className="fo-funnel-strip">
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
          <button className="fo-funnel-pill" aria-current={stage === "landing"} onClick={() => navigateStage("landing")}>1. Landing Hub</button>
          <span style={{ opacity: 0.45 }}>→</span>
          <button className="fo-funnel-pill" aria-current={stage === "free"} onClick={() => navigateStage("free")}>2. Consumer Free</button>
          <span style={{ opacity: 0.45 }}>→</span>
          <button className="fo-funnel-pill" aria-current={stage === "premium"} onClick={() => navigateStage("premium")}>3. Consumer Premium</button>
          <span style={{ opacity: 0.45 }}>→</span>
          <button className="fo-funnel-pill" aria-current={stage === "advisor"} onClick={() => navigateStage("advisor")}>4. Advisor Full Stack</button>
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--fo-muted)" }}>
          NET WORTH <strong style={{ color: "var(--fo-ink)" }}>$2,450,000</strong> · RISK SCORE <strong style={{ color: "var(--fo-accent-hi)" }}>72/100</strong>
        </div>
      </div>

      {/* Legacy 18-Tool Hamburger Drawer */}
      {(menuOpen || proofOpen || authMode) && (
        <div className="fo-backdrop" onClick={() => { setMenuOpen(false); setProofOpen(false); setAuthMode(null); }} />
      )}

      {menuOpen && (
        <aside className="fo-drawer-left" aria-label="Legacy Tool Navigator Menu">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--fo-accent-hi)" }}>FULL TOOL NAVIGATOR</span>
            <button className="fo-btn" onClick={() => setMenuOpen(false)} style={{ padding: "3px 8px", minHeight: 26 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 10, borderRadius: 8, background: "var(--fo-well)", border: "1px solid var(--fo-line)" }}>
            <div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9.5, color: "var(--fo-muted)" }}>NET WORTH</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>$2,450,000</div>
            </div>
            <div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9.5, color: "var(--fo-muted)" }}>RISK SCORE</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--fo-accent-hi)" }}>72 / 100</div>
            </div>
          </div>
          {TOOL_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="fo-tool-group">{g.title}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className="fo-tool-item"
                  onClick={() => {
                    setActiveTool(it.label);
                    setMenuOpen(false);
                    if (it.id === "proof") {
                      setProofOpen(true);
                      return;
                    }
                    if (it.id === "symphony" || it.id === "proposed" || it.id === "will") {
                      setStudioView(it.id === "will" ? "willtrust" : it.id);
                      return;
                    }
                    setStudioView(null);
                    const toolKeyMap: Record<string, string> = {
                      profile: "profile",
                      annuity: "annuity",
                      life: "life",
                      xray: "investment",
                      retirement: "retirement",
                      tax: "tax",
                      roth: "tax",
                      digital: "crypto",
                      risk: "risk",
                      estate: "estate",
                      will: "willtrust",
                    };
                    const mappedKey = toolKeyMap[it.id];
                    window.location.hash = it.hash;
                    setStage(it.tier === "advisor" ? "advisor" : it.tier === "premium" ? "premium" : "free");
                    if (mappedKey) {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent("fiduciary:select-tool", { detail: { key: mappedKey } }));
                      }, 30);
                    }
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", width: 18, textAlign: "center", color: "var(--fo-accent-hi)" }}>{it.glyph}</span>
                    <span>{it.label}</span>
                  </span>
                  {it.tier !== "free" && (
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 9.5, padding: "1px 5px", borderRadius: 4, background: "var(--fo-brass-soft)", color: "var(--fo-brass)" }}>
                      {it.tier === "advisor" ? "ADVISOR" : "PRO"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>
      )}

      {/* Right Show the Work Proof Drawer */}
      {proofOpen && (
        <aside className="fo-drawer-right" aria-label="Verification Drawer">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Show the work · Verification</h3>
            <button className="fo-btn" onClick={() => setProofOpen(false)}>Close</button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--fo-muted)", margin: 0 }}>
            Every figure in Fiduciary OS is backed by transparent assumptions, public economic data sources, privacy redaction, and tamper-evident audit receipts.
          </p>
          <div style={{ padding: 12, borderRadius: 8, background: "var(--fo-well)", border: "1px solid var(--fo-brass)", fontSize: 12 }}>
            <strong style={{ color: "var(--fo-brass)", display: "block", marginBottom: 4 }}>LOCKED REGULATORY DISCLOSURE</strong>
            All outputs are educational, illustrative planning estimates based on user-supplied assumptions. Past performance does not guarantee future results. No brokerage execution is performed.
          </div>
        </aside>
      )}

      {/* Live PostgreSQL Sign In / Create Account Modal */}
      {authMode && (
        <div className="fo-modal" role="dialog" aria-modal="true" aria-label="Account Access">
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--fo-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="fo-seg">
              <button aria-pressed={authMode === "signin"} onClick={() => { setAuthMsg(null); setAuthMode("signin"); }}>Sign In</button>
              <button aria-pressed={authMode === "signup"} onClick={() => { setAuthMsg(null); setAuthMode("signup"); }}>Create Account</button>
            </div>
            <button className="fo-btn" onClick={() => setAuthMode(null)} style={{ padding: "3px 8px", minHeight: 26 }}>✕</button>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {authMode === "signup" && (
              <label style={{ fontSize: 12 }}>
                Full Name
                <input className="fo-field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Rivera" />
              </label>
            )}
            <label style={{ fontSize: 12 }}>
              Email
              <input className="fo-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label style={{ fontSize: 12 }}>
              Password
              <input className="fo-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {authMode === "signup" && (
              <label style={{ fontSize: 12 }}>
                Plan Tier
                <select className="fo-field" value={regTier} onChange={(e) => setRegTier(e.target.value as "free" | "premium" | "advisor")}>
                  <option value="free">Consumer Free ($0/mo)</option>
                  <option value="premium">Consumer Premium (All 18 Tools)</option>
                  <option value="advisor">Independent Advisor (Full Stack)</option>
                </select>
              </label>
            )}
            {authMsg && <div style={{ fontSize: 12, color: "#FCA5A5" }}>{authMsg}</div>}
            <button className="fo-btn fo-btn-primary" disabled={busy} onClick={handleAuthSubmit}>
              {busy ? "Connecting..." : authMode === "signin" ? "Sign In (Live DB)" : "Create Account & Launch →"}
            </button>
            {authMode === "signin" && (
              <div style={{ borderTop: "1px solid var(--fo-line)", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <button className="fo-btn" onClick={() => { setEmail("admin@fiduciaryos.com"); setPassword("Admin!2026"); }}>Admin</button>
                <button className="fo-btn" onClick={() => { setEmail("demo@fiduciaryos.com"); setPassword("demo123"); }}>Consumer</button>
                <button className="fo-btn" onClick={() => { setEmail("advisor@fiduciaryos.com"); setPassword("advisor123"); }}>Advisor</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* White-Label Tenant Theme Editor Drawer */}
      {brandOpen && (
        <aside className="fo-drawer-right" aria-label="White-Label Tenant Theme Editor">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>⚙ White-Label Tenant Theme</h3>
            <button className="fo-btn" onClick={() => setBrandOpen(false)}>Close</button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--fo-muted)", margin: 0 }}>
            Customize your firm&apos;s live brand chrome and persist tokens to PostgreSQL. Regulatory disclosures stay hardware-locked per AUCTUM governance.
          </p>
          <label style={{ fontSize: 12 }}>
            Firm / Tenant Name
            <input className="fo-field" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </label>
          <label style={{ fontSize: 12 }}>
            Primary Action Accent Token
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input type="color" value={tenantAccent} onChange={(e) => setTenantAccent(e.target.value)} style={{ width: 52, height: 34, cursor: "pointer" }} />
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{tenantAccent}</span>
            </div>
          </label>
          <button
            className="fo-btn fo-btn-primary"
            onClick={async () => {
              const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
              try {
                const res = await fetch(`${base}/workspace-state/tenant:brand`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    category: "tenant",
                    label: tenantName,
                    payload: { tenantName, tenantAccent },
                  }),
                });
                setBrandNotice(res.ok ? "✓ Saved white-label tokens to PostgreSQL." : "Could not save to database.");
              } catch {
                setBrandNotice("Saved locally (offline).");
              }
            }}
          >
            Save Brand Tokens to PostgreSQL
          </button>
          {brandNotice && <div style={{ fontSize: 12, color: "var(--fo-proof)" }}>{brandNotice}</div>}
          <div style={{ padding: 12, borderRadius: 8, background: "var(--fo-well)", border: "1px solid var(--fo-brass)", fontSize: 12 }}>
            <strong style={{ color: "var(--fo-brass)", display: "block", marginBottom: 4 }}>LOCKED DISCLOSURE SLOT (NON-EDITABLE)</strong>
            © 2026 AUCTUM Inc. · Illustrative educational estimates only — not individualized investment, tax, or legal advice.
          </div>
        </aside>
      )}

      {/* Educational AI Fiduciary Chatbot Drawer */}
      {chatOpen && (
        <aside className="fo-chat-dock" aria-label="Educational AI Fiduciary Guide">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--fo-line)" }}>
            <strong style={{ fontSize: 13 }}>✦ Educational AI Guide</strong>
            <button className="fo-btn" style={{ padding: "2px 8px", minHeight: 24 }} onClick={() => setChatOpen(false)}>✕</button>
          </div>
          <div className="fo-chat-prompts">
            <button className="td-cat-pill" onClick={() => sendChat("Explain Roth conversion ladder")}>Roth ladder</button>
            <button className="td-cat-pill" onClick={() => sendChat("Texas homestead trust rule")}>TX § 11.13(j)</button>
            <button className="td-cat-pill" onClick={() => sendChat("IRC 2035 life insurance ILIT")}>IRC § 2035</button>
            <button className="td-cat-pill" onClick={() => sendChat("70/30 Symphony glidepath")}>70/30 glidepath</button>
          </div>
          <div className="fo-chat-log">
            {chatLog.map((m, i) => (
              <div key={i} className={`fo-chat-msg ${m.role}`}>
                <strong>{m.role === "assistant" ? "Guide" : "You"}:</strong> {m.text}
              </div>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 6, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              sendChat();
            }}
          >
            <input
              className="fo-field"
              style={{ marginTop: 0, flex: 1 }}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about assumptions, tax, trusts…"
            />
            <button className="fo-btn fo-btn-primary" type="submit">Ask</button>
          </form>
        </aside>
      )}

      {/* Expanded Studio or Main Application Content */}
      {studioView ? (
        <ExpandedModules view={studioView} onClose={() => setStudioView(null)} />
      ) : (
        children
      )}
    </div>
  );
}
