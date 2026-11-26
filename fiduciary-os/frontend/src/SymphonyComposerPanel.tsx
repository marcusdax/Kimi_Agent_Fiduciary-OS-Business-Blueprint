import { useEffect, useMemo, useState } from "react";

interface SymphonyProps {
  onSendToProposed: (topic: string, answer: string) => void;
  onOpenProposed: () => void;
}

interface LiveSimResponse {
  engineVersion: string;
  pathsSimulated: number;
  successRate: number;
  rows: { age: number; yearOffset: number; p10: number; median: number; p90: number }[];
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const PRESETS = [
  { label: "Pre-Retiree (61 · $1.45M)", age: 61, horizon: 6, income: 285000, portfolio: 1450000, spend: 8500, risk: "Balanced" as const },
  { label: "Peak Accumulator (42 · $680k)", age: 42, horizon: 20, income: 240000, portfolio: 680000, spend: 7500, risk: "Growth" as const },
  { label: "Founder Exit (52 · $6.2M)", age: 52, horizon: 10, income: 520000, portfolio: 6200000, spend: 16000, risk: "Balanced" as const },
  { label: "Early Retiree (58 · $2.4M)", age: 58, horizon: 3, income: 195000, portfolio: 2400000, spend: 9500, risk: "Conservative" as const },
];

export default function SymphonyComposerPanel({ onSendToProposed, onOpenProposed }: SymphonyProps) {
  const [age, setAge] = useState(61);
  const [horizon, setHorizon] = useState(20);
  const [income, setIncome] = useState(285000);
  const [portfolio, setPortfolio] = useState(1450000);
  const [monthlySpend, setMonthlySpend] = useState(8500);
  const [filing, setFiling] = useState<"Married" | "Single">("Married");
  const [riskPosture, setRiskPosture] = useState<"Conservative" | "Balanced" | "Growth">("Balanced");
  const [stressShock, setStressShock] = useState<0 | 15 | 25>(0);
  const [showAssumptions, setShowAssumptions] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string>(() => new Date().toLocaleTimeString());
  const [toast, setToast] = useState("");
  const [liveSim, setLiveSim] = useState<LiveSimResponse | null>(null);

  const retireAge = age + horizon;

  // Dynamic Glidepath Allocation
  const riskOffset = riskPosture === "Growth" ? 10 : riskPosture === "Conservative" ? -12 : 0;
  const glideBase = horizon >= 10 ? 70 : Math.max(30, 70 - (10 - horizon) * 5);
  const equityPct = Math.min(90, Math.max(25, glideBase + riskOffset));
  const bondPct = 100 - equityPct;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
        const res = await fetch(`${base}/calculations/retirement-simulation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            currentAge: age,
            retirementAge: Math.min(85, age + horizon),
            endAge: Math.max(92, age + horizon + 5),
            currentPortfolio: portfolio,
            annualContribution: Math.round(income * 0.16),
            monthlyRetirementSpend: monthlySpend,
            equityWeight: equityPct,
            yearOneShockPct: stressShock,
            paths: 500,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as LiveSimResponse;
          setLiveSim(data);
        }
      } catch {
        // Offline / aborted — keep client-side fallback
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [age, horizon, income, portfolio, monthlySpend, equityPct, stressShock]);

  const sleeves = useMemo(() => {
    const usEq = Math.round(equityPct * 0.68);
    const intlEq = Math.round(equityPct * 0.24);
    const alts = Math.max(0, equityPct - usEq - intlEq);
    const coreBond = Math.round(bondPct * 0.72);
    const cashBuf = Math.max(0, bondPct - coreBond);
    return [
      { name: "US Broad Equities", ticker: "VTI", pct: usEq, location: "Taxable Brokerage", color: "#38BDF8" },
      { name: "International Equities", ticker: "VXUS", pct: intlEq, location: "Taxable (Foreign Tax Credit)", color: "#60A5FA" },
      { name: "Real Assets / Alternatives", ticker: "VNQ", pct: alts, location: "Roth IRA (Tax-Free)", color: "#A78BFA" },
      { name: "Investment-Grade Bonds", ticker: "BND", pct: coreBond, location: "Tax-Deferred 401(k)/IRA", color: "#E0B86B" },
      { name: "Short-Term Treasury Buffer", ticker: "SGOV", pct: cashBuf, location: "Cash / Sequence Reserve", color: "#34D399" },
    ];
  }, [equityPct, bondPct]);

  // Fan Chart Projection (Live Backend 500-Path Engine with Offline Fallback)
  const fanRows = useMemo(() => {
    if (liveSim?.rows?.length) {
      return liveSim.rows.map((r) => ({
        yearOffset: r.yearOffset,
        ageAt: r.age,
        p10: Math.round(r.p10 / 1000),
        med: Math.round(r.median / 1000),
        p90: Math.round(r.p90 / 1000),
      }));
    }
    const annualSpend = monthlySpend * 12;
    const baseReturn = 0.045 + (equityPct / 100) * 0.032;
    const points = [0, 5, 10, 15, 20, 25, 30];
    return points.map((yr) => {
      const shockMult = yr === 0 ? 1 : 1 - stressShock / 100;
      const contrib = yr <= horizon ? income * 0.16 : -annualSpend * 0.55;
      const med = Math.max(
        0,
        Math.round((portfolio * shockMult * Math.pow(1 + baseReturn, yr) + contrib * yr * 0.85) / 1000),
      );
      const p90 = Math.round(med * (1.16 + yr * 0.018) + 120);
      const p10 = Math.max(0, Math.round(med * (0.82 - yr * 0.012) - stressShock * yr * 1.4));
      return { yearOffset: yr, ageAt: age + yr, p10, med, p90 };
    });
  }, [liveSim, age, horizon, income, portfolio, monthlySpend, equityPct, stressShock]);

  const successRate = useMemo(() => {
    if (liveSim) return liveSim.successRate;
    const endP10 = fanRows[fanRows.length - 1]?.p10 ?? 0;
    const ratio = endP10 / Math.max(1, (monthlySpend * 12) / 1000);
    return Math.max(38, Math.min(97, Math.round(62 + ratio * 2.1 - stressShock * 0.5)));
  }, [liveSim, fanRows, monthlySpend, stressShock]);

  // Tax & Roth Headroom (2026 illustrative)
  const stdDeduction = filing === "Married" ? 30000 : 15000;
  const taxableInc = Math.max(0, income - stdDeduction - 23500);
  const bracket24Cap = filing === "Married" ? 394600 : 197300;
  const rothHeadroom = Math.max(0, bracket24Cap - taxableInc);
  const annualRothTarget = Math.min(60000, Math.round(rothHeadroom * 0.6));

  // 5-Pillar Dynamic Playbook
  const pillars = [
    {
      num: 1,
      title: "Income Optimization",
      impact: `+${usd(Math.round(income * 0.18))}/yr savings capacity`,
      body: `Maximize contributions to tax-advantaged accounts (401(k) + catch-up${age >= 50 ? " active at age 50+" : ""} + HSA). Your ${usd(income)} income trajectory supports disciplined accumulation through target age ${retireAge}.`,
      why: "Front-loading tax-advantaged buckets compounds both principal and tax deferral — typically adding 35–60 bps/yr in after-tax wealth.",
    },
    {
      num: 2,
      title: "Investment Strategy",
      impact: `${equityPct}/${bondPct} Glidepath · ${successRate}% durability*`,
      body: `With ${horizon} years to retirement (target age ${retireAge}), maintain a ${equityPct}/${bondPct} equity/bond split (${riskPosture} posture). Shift 5% annually toward fixed income starting 10 years pre-retirement and keep ${sleeves[4].pct}% in Short-Term Treasuries.`,
      why: "A dedicated 2–3 year Treasury buffer prevents forced equity sales during an early-retirement market downturn (Sequence-of-Returns Risk).",
    },
    {
      num: 3,
      title: "Protection Planning",
      impact: age >= 55 ? "Active LTC Review Window" : `LTC Review in ${55 - age} yrs`,
      body: `Life insurance gap analysis recommends verifying term coverage against remaining earning years (${horizon} yrs) and liabilities. Long-term care insurance evaluation becomes critical at age 55${age >= 55 ? " — schedule underwriting review now" : ""}.`,
      why: "Health underwriting and hybrid LTC premiums escalate steeply after age 60; locking coverage in your mid-50s preserves both insurability and estate liquidity.",
    },
    {
      num: 4,
      title: "Tax Efficiency",
      impact: `${usd(annualRothTarget)}/yr Roth conversion room`,
      body: `Execute a 5-year Roth conversion ladder (${usd(annualRothTarget)}/yr illustrative target inside the 24% ${filing} bracket). Harvest taxable losses each December and maximize HSA triple-tax-advantaged contributions.`,
      why: "Converting pre-tax IRA balances before age-73 Required Minimum Distributions shrinks future forced taxable income and helps avoid Medicare IRMAA surcharges.",
    },
    {
      num: 5,
      title: "Legacy Blueprint",
      impact: `${usd(portfolio)} estate alignment`,
      body: `Establish or update a revocable living trust (see Will & Trust Atelier), audit IRA/401(k) and life policy beneficiary forms annually, and coordinate annual exclusion gifting ($19,000/donee for 2026).`,
      why: "Beneficiary forms override wills and trusts — aligning titles and custodian designations prevents probate delays and unintended tax acceleration.",
    },
  ];

  // Fan Chart SVG
  const fanSvg = useMemo(() => {
    const w = 520, h = 195, pad = 34;
    const maxV = Math.max(...fanRows.map((r) => r.p90), 1500);
    const x = (i: number) => pad + (i / (fanRows.length - 1)) * (w - pad * 2);
    const y = (v: number) => h - pad - (v / maxV) * (h - pad * 1.6);
    const p90 = fanRows.map((r, i) => `${x(i)},${y(r.p90)}`).join(" ");
    const p10Rev = [...fanRows].reverse().map((r, i) => `${x(fanRows.length - 1 - i)},${y(r.p10)}`).join(" ");
    const med = fanRows.map((r, i) => `${x(i)},${y(r.med)}`).join(" ");
    const p10 = fanRows.map((r, i) => `${x(i)},${y(r.p10)}`).join(" ");
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Projected portfolio fan chart P10 median P90">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" strokeOpacity="0.22" />
        <polygon points={`${p90} ${p10Rev}`} fill="var(--fo-accent)" fillOpacity="0.2" />
        <polyline points={p90} fill="none" stroke="var(--fo-accent-hi)" strokeOpacity="0.55" strokeDasharray="4 3" strokeWidth="1.5" />
        <polyline points={med} fill="none" stroke="var(--fo-accent-hi)" strokeWidth="2.6" />
        <polyline points={p10} fill="none" stroke="#F5A559" strokeWidth="1.8" />
        {fanRows.map((r, i) => (
          <text key={r.yearOffset} x={x(i)} y={h - 10} textAnchor="middle" fill="currentColor" opacity="0.7" fontSize="10" fontFamily="monospace">
            Age {r.ageAt}
          </text>
        ))}
      </svg>
    );
  }, [fanRows]);

  function downloadPlaybook() {
    const content = [
      `FIDUCIARY OS — PERSONALIZED SYMPHONY PLAYBOOK`,
      `Generated: ${generatedAt} | Age: ${age} | Horizon: ${horizon} yrs (Target Age ${retireAge})`,
      `Income: ${usd(income)} | Portfolio: ${usd(portfolio)} | Monthly Spend: ${usd(monthlySpend)}`,
      `Glidepath: ${equityPct}% Equity / ${bondPct}% Fixed Income (${riskPosture}) | Illustrative Durability: ${successRate}%`,
      ``,
      ...pillars.map((p) => `${p.num}. ${p.title} (${p.impact})\n   ${p.body}\n   Why it matters: ${p.why}`),
      ``,
      `Illustrative educational model only — not individualized investment, tax, or legal advice.`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fiduciary-symphony-playbook.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fo-exp-grid">
      {/* Control Deck */}
      <div className="fo-chrome-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="fo-ns-label">AI PORTFOLIO RECOMMENDATIONS &amp; PERSONALIZED SYMPHONY PLAYBOOK</span>
            <h2 style={{ margin: "6px 0 4px" }}>Symphony Composer</h2>
            <p style={{ color: "var(--fo-muted)", fontSize: 13, margin: 0 }}>
              Coordinate income, glidepath allocation, tax-bracket Roth conversions, protection, and estate readiness in one live model.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="fo-btn"
                onClick={() => {
                  setAge(p.age);
                  setHorizon(p.horizon);
                  setIncome(p.income);
                  setPortfolio(p.portfolio);
                  setMonthlySpend(p.spend);
                  setRiskPosture(p.risk);
                  setToast(`Loaded preset: ${p.label}`);
                  setTimeout(() => setToast(""), 2400);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders + Toggles */}
        <div className="fo-sliders" style={{ marginTop: 14 }}>
          <label>Current Age ({age}) → Target Retire Age {retireAge}<input type="range" min={25} max={74} value={age} onChange={(e) => setAge(Number(e.target.value))} /></label>
          <label>Years to Retirement ({horizon} yrs)<input type="range" min={1} max={35} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></label>
          <label>Annual Income ({usd(income)})<input type="range" min={75000} max={750000} step={15000} value={income} onChange={(e) => setIncome(Number(e.target.value))} /></label>
          <label>Investable Portfolio ({usd(portfolio)})<input type="range" min={100000} max={10000000} step={50000} value={portfolio} onChange={(e) => setPortfolio(Number(e.target.value))} /></label>
          <label>Monthly Retirement Spend ({usd(monthlySpend)}/mo)<input type="range" min={4000} max={22000} step={500} value={monthlySpend} onChange={(e) => setMonthlySpend(Number(e.target.value))} /></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="fo-seg" aria-label="Risk Posture">
              {(["Conservative", "Balanced", "Growth"] as const).map((r) => (
                <button key={r} type="button" aria-pressed={riskPosture === r} onClick={() => setRiskPosture(r)}>{r}</button>
              ))}
            </div>
            <div className="fo-seg" aria-label="Filing Status">
              {(["Married", "Single"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filing === f} onClick={() => setFiling(f)}>{f}</button>
              ))}
            </div>
            <div className="fo-seg" aria-label="Market Stress">
              {([0, 15, 25] as const).map((s) => (
                <button key={s} type="button" aria-pressed={stressShock === s} onClick={() => setStressShock(s)}>
                  {s === 0 ? "Base" : `-${s}% Y1`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Strip */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
          <button
            type="button"
            className="fo-btn fo-btn-primary"
            onClick={() => {
              setGeneratedAt(new Date().toLocaleTimeString());
              setToast("Comprehensive AI Playbook regenerated with live glidepath & tax bands.");
              setTimeout(() => setToast(""), 2800);
            }}
          >
            ▶ GENERATE COMPREHENSIVE AI PLAYBOOK
          </button>
          <button
            type="button"
            className="fo-btn fo-btn-brass"
            onClick={() => {
              pillars.forEach((p) => onSendToProposed(p.title, `${p.impact} — ${p.body}`));
              onOpenProposed();
            }}
          >
            Send All 5 Pillars to Proposed Symphony →
          </button>
          <button type="button" className="fo-btn" onClick={downloadPlaybook}>Download (.TXT)</button>
          <button type="button" className="fo-btn" onClick={() => window.print()}>Print</button>
          <button type="button" className="fo-btn" onClick={() => setShowAssumptions((v) => !v)}>
            {showAssumptions ? "Hide" : "Show"} What This Model Assumes
          </button>
          {toast && <span style={{ fontSize: 12, color: "var(--fo-proof)" }}>{toast}</span>}
        </div>

        {showAssumptions && (
          <div className="fo-assumptions">
            <strong>What this model assumes (Illustrative · Last generated {generatedAt})</strong>
            <ul>
              <li><strong>Glidepath Rule:</strong> Base 70/30 equity/bond split for ≥10-year horizons, stepping down <strong>5%/yr toward fixed income</strong> starting 10 years pre-retirement (adjusted for {riskPosture} posture).</li>
              <li><strong>Projection &amp; Stress:</strong> Median growth assumes ~{(4.5 + (equityPct / 100) * 3.2).toFixed(1)}% nominal blended return; Market Stress applies a Year-1 drawdown of -{stressShock}% to demonstrate Sequence-of-Returns sensitivity.</li>
              <li><strong>Tax Headroom:</strong> Uses illustrative 2026 {filing} standard deduction ({usd(stdDeduction)}) and 24% bracket ceiling ({usd(bracket24Cap)}); verify with your CPA before executing Roth conversions.</li>
            </ul>
          </div>
        )}
      </div>

      {/* Visual Analytics Row: Asset Location + Probability Fan Chart */}
      <div className="fo-wt-two">
        <div className="fo-chrome-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Asset Allocation &amp; Tax Location</h3>
            <span className="td-badge">Glidepath: {equityPct}% Equity / {bondPct}% Fixed Income</span>
          </div>
          <div className="fo-alloc-bar">
            {sleeves.map((s) => (
              <div key={s.ticker} style={{ width: `${s.pct}%`, background: s.color, color: "#04111E" }} title={`${s.name}: ${s.pct}%`}>
                {s.pct >= 10 ? `${s.ticker} ${s.pct}%` : ""}
              </div>
            ))}
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "7px 8px" }}>Sleeve</th>
                  <th style={{ textAlign: "left", padding: "7px 8px" }}>Weight</th>
                  <th style={{ textAlign: "left", padding: "7px 8px" }}>Target ($)</th>
                  <th style={{ textAlign: "left", padding: "7px 8px" }}>Optimal Tax Location</th>
                </tr>
              </thead>
              <tbody>
                {sleeves.map((s) => (
                  <tr key={s.ticker} style={{ borderTop: "1px solid var(--fo-line)" }}>
                    <td style={{ padding: "7px 8px" }}><strong>{s.name}</strong> ({s.ticker})</td>
                    <td style={{ padding: "7px 8px", fontFamily: "ui-monospace, monospace" }}>{s.pct}%</td>
                    <td style={{ padding: "7px 8px", fontFamily: "ui-monospace, monospace" }}>{usd((portfolio * s.pct) / 100)}</td>
                    <td style={{ padding: "7px 8px", color: "var(--fo-muted)" }}>{s.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fo-chrome-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0 }}>30-Year Portfolio Fan &amp; Durability</h3>
            <span className="td-badge">{successRate}% Illustrative Durability*</span>
          </div>
          <div style={{ marginTop: 8 }}>{fanSvg}</div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Age</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>P10 ($k)</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Median ($k)</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>P90 ($k)</th>
                </tr>
              </thead>
              <tbody>
                {fanRows.map((r) => (
                  <tr key={r.yearOffset} style={{ borderTop: "1px solid var(--fo-line)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{r.ageAt}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "#F5A559" }}>${r.p10.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}><strong>${r.med.toLocaleString()}</strong></td>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "var(--fo-proof)" }}>${r.p90.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5-Pillar Interactive Playbook Cards */}
      <div className="fo-chrome-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Your Fiduciary Symphony Playbook (5 Coordinated Pillars)</h3>
          <span style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace", color: "var(--fo-muted)" }}>
            Target Retire Age {retireAge} · {filing} · {riskPosture}
          </span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {pillars.map((p) => (
            <article key={p.num} className="td-item" style={{ gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{p.num}. {p.title}</strong>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="td-badge">{p.impact}</span>
                  <button
                    type="button"
                    className="fo-btn"
                    style={{ padding: "3px 9px", minHeight: 26, fontSize: 11 }}
                    onClick={() => {
                      onSendToProposed(p.title, `${p.impact} — ${p.body}`);
                      setToast(`Sent "${p.title}" to Proposed Symphony.`);
                      setTimeout(() => setToast(""), 2400);
                    }}
                  >
                    + Proposed Symphony
                  </button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>{p.body}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fo-brass)" }}>
                <strong>Why this matters:</strong> {p.why}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
