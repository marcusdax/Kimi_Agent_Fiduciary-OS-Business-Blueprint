import { useEffect, useMemo, useRef, useState } from "react";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const LEAD_MAGNETS = [
  {
    id: "dna",
    title: "10-Second Financial DNA Check",
    hook: "Clarity & Reciprocity — show one actionable move before asking for an email.",
    conversion: "18.4%",
    cta: "Get Your Free Score & Next Best Move",
    script: "Scene 1 (0–12s): Most households juggle 6 accounts without knowing their single highest-leverage move.\nScene 2 (12–30s): Your Financial DNA score weights Savings, Protection, Retirement Durability, and Tax Efficiency.\nScene 3 (30–48s): Raising 401(k) deferrals by 3% and closing your term gap adds +13 points.\nScene 4 (48–60s): Explore your full interactive plan free — educational estimate, zero obligation.",
  },
  {
    id: "roth",
    title: "2026 Roth Conversion Window Finder",
    hook: "Loss Aversion — visualize the 'Tax Valley' before age-73 RMDs spike brackets.",
    conversion: "22.1%",
    cta: "Calculate Your 22% / 24% Bracket Headroom",
    script: "Scene 1 (0–12s): Between retirement and age 73 RMDs sits a temporary lower-tax corridor.\nScene 2 (12–30s): Leaving pre-tax IRA balances untouched can trigger higher brackets and Medicare IRMAA surcharges.\nScene 3 (30–48s): Our 5-year Roth ladder maps exact annual conversion room inside today's bracket.\nScene 4 (48–60s): Share the side-by-side tax table directly with your CPA or fiduciary advisor.",
  },
  {
    id: "trust",
    title: "Homestead & Trust Readiness Audit",
    hook: "Protection & Family Peace — catch deed & beneficiary traps before they cost heirs.",
    conversion: "15.7%",
    cta: "Check Your Will, Trust & Beneficiary Alignment",
    script: "Scene 1 (0–12s): A revocable trust only controls assets that are actually retitled into it.\nScene 2 (12–30s): Beneficiary forms on IRAs and life insurance override your will every time.\nScene 3 (30–48s): Walk through our 5-step Estate & Trust Atelier to build an attorney-ready discussion brief.\nScene 4 (48–60s): Educational drafts only — review with licensed state counsel before signing.",
  },
];

export default function GrowthStudio3D() {
  // 3D Isometric Surface controls
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState(34);
  const [pitch, setPitch] = useState(28);
  const [baseWealth, setBaseWealth] = useState(1450000);

  // 3D Machined Rocker Toggles (grounded in Home Shield, Safety Blanket, Tax, Fees, Flywheel)
  const [levers, setLevers] = useState({
    homeShield: true,
    safetyBlanket: true,
    rothLadder: true,
    feeCompression: true,
    flywheelSync: true,
  });

  // Marketing & Funnel Simulator state
  const [activeMagnet, setActiveMagnet] = useState(LEAD_MAGNETS[0].id);
  const [monthlyVisitors, setMonthlyVisitors] = useState(4000);
  const [freeToPremPct, setFreeToPremPct] = useState(12);
  const [premToAdvPct, setPremToAdvPct] = useState(8);
  const [copyToast, setCopyToast] = useState("");

  const leverBonusPct = useMemo(() => {
    let bonus = 0;
    if (levers.homeShield) bonus += 0.04;
    if (levers.safetyBlanket) bonus += 0.06;
    if (levers.rothLadder) bonus += 0.09;
    if (levers.feeCompression) bonus += 0.07;
    if (levers.flywheelSync) bonus += 0.05;
    return bonus;
  }, [levers]);

  // 4 Regimes × 5 Horizon Milestones (3D Matrix in $k)
  const matrix = useMemo(() => {
    const regimes = [
      { label: "Recession", mult: 0.72, colorTop: "#F5A559", colorSide: "#B85D19" },
      { label: "Inflation", mult: 0.88, colorTop: "#E0B86B", colorSide: "#9A6B29" },
      { label: "Base Case", mult: 1.08, colorTop: "#38BDF8", colorSide: "#1D4ED8" },
      { label: "Growth", mult: 1.28, colorTop: "#34D399", colorSide: "#0F766E" },
    ];
    const horizons = [5, 10, 15, 20, 25];
    return {
      regimes,
      horizons,
      values: regimes.map((r) =>
        horizons.map((yr) =>
          Math.round((baseWealth * (1 + leverBonusPct) * r.mult * Math.pow(1.045, yr)) / 1000),
        ),
      ),
    };
  }, [baseWealth, leverBonusPct]);

  // Render true 3D Isometric Projected Bars on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle Cobalt BGA grid glow
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, w * 0.6);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.14)");
    grad.addColorStop(1, "rgba(5, 12, 29, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const radYaw = (yaw * Math.PI) / 180;
    const radPitch = (pitch * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const sinP = Math.sin(radPitch);
    const cosP = Math.cos(radPitch);

    const maxVal = Math.max(...matrix.values.flat(), 2000);
    const cx = w * 0.5;
    const cy = h * 0.72;
    const cell = 44;

    const project = (x: number, y: number, z: number) => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const sx = cx + rx;
      const sy = cy - y * cosP + rz * sinP;
      return { x: sx, y: sy, depth: rz };
    };

    // Draw base plate
    const b0 = project(-125, 0, -100);
    const b1 = project(135, 0, -100);
    const b2 = project(135, 0, 110);
    const b3 = project(-125, 0, 110);
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b3.x, b3.y);
    ctx.closePath();
    ctx.fillStyle = "rgba(12, 24, 51, 0.78)";
    ctx.strokeStyle = "rgba(125, 211, 252, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();

    // Build painter's-algorithm sorted 3D prisms
    const prisms: {
      depth: number;
      x0: number;
      z0: number;
      bh: number;
      topColor: string;
      sideColor: string;
      val: number;
    }[] = [];

    matrix.regimes.forEach((reg, ri) => {
      matrix.horizons.forEach((_, hi) => {
        const val = matrix.values[ri][hi];
        const bh = Math.max(8, (val / maxVal) * 145);
        const x0 = (hi - 2) * cell;
        const z0 = (ri - 1.5) * cell;
        const center = project(x0, bh / 2, z0);
        prisms.push({ depth: center.depth, x0, z0, bh, topColor: reg.colorTop, sideColor: reg.colorSide, val });
      });
    });

    prisms.sort((a, b) => a.depth - b.depth);

    const half = 13;
    for (const p of prisms) {
      const p00 = project(p.x0 - half, 0, p.z0 - half);
      const p10 = project(p.x0 + half, 0, p.z0 - half);
      const p11 = project(p.x0 + half, 0, p.z0 + half);
      const p01 = project(p.x0 - half, 0, p.z0 + half);

      const t00 = project(p.x0 - half, p.bh, p.z0 - half);
      const t10 = project(p.x0 + half, p.bh, p.z0 - half);
      const t11 = project(p.x0 + half, p.bh, p.z0 + half);
      const t01 = project(p.x0 - half, p.bh, p.z0 + half);

      // Right/front face
      ctx.beginPath();
      ctx.moveTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(t11.x, t11.y);
      ctx.lineTo(t10.x, t10.y);
      ctx.closePath();
      ctx.fillStyle = p.sideColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.stroke();

      // Front/left face
      ctx.beginPath();
      ctx.moveTo(p01.x, p01.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(t11.x, t11.y);
      ctx.lineTo(t01.x, t01.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(10, 22, 46, 0.72)";
      ctx.fill();
      ctx.stroke();

      // Specular metallic top cap
      ctx.beginPath();
      ctx.moveTo(t00.x, t00.y);
      ctx.lineTo(t10.x, t10.y);
      ctx.lineTo(t11.x, t11.y);
      ctx.lineTo(t01.x, t01.y);
      ctx.closePath();
      ctx.fillStyle = p.topColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.stroke();
    }

    // Legend labels
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "#9AB0D4";
    ctx.fillText("X-Axis: +5 to +25 Yrs  ·  Z-Axis: Recession → Inflation → Base → Growth", 14, h - 12);
  }, [matrix, yaw, pitch]);

  // Marketing Funnel Unit Economics
  const freeSignups = Math.round(monthlyVisitors * 0.22);
  const premUsers = Math.round(freeSignups * (freeToPremPct / 100));
  const advLeads = Math.round(premUsers * (premToAdvPct / 100));
  const estMrr = premUsers * 29 + advLeads * 250;
  const magnet = LEAD_MAGNETS.find((m) => m.id === activeMagnet) || LEAD_MAGNETS[0];
  const lifetimeGain = Math.round(baseWealth * leverBonusPct * 2.2);

  return (
    <div className="fo-exp-grid">
      {/* Row 1: 3D Interactive Wealth Surface + 3D Machined Hardware Toggles */}
      <div className="fo-wt-two">
        <div className="fo-chrome-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <span className="fo-ns-label">3D INTERACTIVE WEALTH SURFACE · REGIME × HORIZON</span>
              <h2 style={{ margin: "4px 0 0" }}>3D Portfolio Projection Matrix</h2>
            </div>
            <span className="td-badge">+{Math.round(leverBonusPct * 100)}% Active Lever Lift</span>
          </div>

          <canvas
            ref={canvasRef}
            width={560}
            height={280}
            style={{ width: "100%", height: "auto", display: "block", marginTop: 10, borderRadius: 9, border: "1px solid var(--fo-line)", background: "rgba(3, 8, 20, 0.75)" }}
          />

          <div className="fo-sliders" style={{ marginTop: 10 }}>
            <label>3D Orbit Yaw ({yaw}°)<input type="range" min={10} max={78} value={yaw} onChange={(e) => setYaw(Number(e.target.value))} /></label>
            <label>3D Camera Pitch ({pitch}°)<input type="range" min={14} max={52} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} /></label>
            <label>Starting Portfolio ({usd(baseWealth)})<input type="range" min={250000} max={5000000} step={50000} value={baseWealth} onChange={(e) => setBaseWealth(Number(e.target.value))} /></label>
          </div>
        </div>

        <div className="fo-chrome-card">
          <span className="fo-ns-label">3D TACTILE HARDWARE LEVERS · LIVE IMPACT: +{usd(lifetimeGain)}</span>
          <h3 style={{ margin: "4px 0 10px" }}>Interactive Strategy Rocker Switches</h3>
          <div style={{ display: "grid", gap: 9 }}>
            {[
              { key: "homeShield" as const, label: "Home Shield Buffer", sub: "Property hazard & homestead tax-exemption protection (+4% stability)" },
              { key: "safetyBlanket" as const, label: "Safety Blanket Floor", sub: "Guaranteed monthly income floor + age-55 LTC readiness (+6% durability)" },
              { key: "rothLadder" as const, label: "5-Year Roth Ladder", sub: "Fill 22%/24% federal brackets before age-73 RMDs (+9% after-tax)" },
              { key: "feeCompression" as const, label: "Fee Compression X-Ray", sub: "Trim 45 bps of hidden fund & advisory drag (+7% compounding)" },
              { key: "flywheelSync" as const, label: "Shared-Record Flywheel", sub: "Zero re-entry coordination across Household, CPA & Advisor (+5% execution)" },
            ].map((item) => {
              const on = levers[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`fo-rocker-card ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setLevers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                >
                  <div style={{ textAlign: "left" }}>
                    <strong style={{ fontSize: 13 }}>{item.label}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--fo-muted)" }}>{item.sub}</div>
                  </div>
                  <span className="fo-rocker-switch" aria-hidden="true">
                    <span className="fo-rocker-cap">{on ? "ON" : "OFF"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Synced Accessible Table beside 3D Chart */}
      <div className="fo-chrome-card">
        <span className="fo-ns-label">SYNCED 3D MATRIX DATA TABLE ($ THOUSANDS · ILLUSTRATIVE)</span>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "7px 8px" }}>Market Regime</th>
                {matrix.horizons.map((yr) => (
                  <th key={yr} style={{ textAlign: "left", padding: "7px 8px" }}>+{yr} Years</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.regimes.map((r, ri) => (
                <tr key={r.label} style={{ borderTop: "1px solid var(--fo-line)" }}>
                  <td style={{ padding: "7px 8px" }}><strong style={{ color: r.colorTop }}>{r.label}</strong></td>
                  {matrix.values[ri].map((val, hi) => (
                    <td key={hi} style={{ padding: "7px 8px", fontFamily: "ui-monospace, monospace" }}>${val.toLocaleString()}k</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 2: Growth Marketing Tools & B2C -> B2B Funnel Simulator */}
      <div className="fo-wt-two">
        <div className="fo-chrome-card">
          <span className="fo-ns-label">ADVISOR MARKETING &amp; LEAD-MAGNET STUDIO</span>
          <h3 style={{ margin: "4px 0 8px" }}>Educational Lead Magnets &amp; 60s Video Scripts</h3>
          <div className="td-cats" style={{ marginBottom: 10 }}>
            {LEAD_MAGNETS.map((m) => (
              <button key={m.id} type="button" className="td-cat-pill" aria-pressed={activeMagnet === m.id} onClick={() => setActiveMagnet(m.id)}>
                {m.title}
              </button>
            ))}
          </div>
          <div className="td-item" style={{ gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <strong>{magnet.title}</strong>
              <span className="td-badge">Target Opt-in: {magnet.conversion}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--fo-brass)" }}><strong>Behavioral Hook:</strong> {magnet.hook}</div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, color: "var(--fo-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
              {magnet.script}
            </pre>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="fo-btn fo-btn-primary"
                onClick={() => {
                  navigator.clipboard?.writeText(`${magnet.title}\nCTA: ${magnet.cta}\n\n${magnet.script}`).catch(() => {});
                  setCopyToast("Campaign brief & 60s video script copied.");
                  setTimeout(() => setCopyToast(""), 2400);
                }}
              >
                Copy Campaign &amp; Video Script
              </button>
              {copyToast && <span style={{ fontSize: 12, color: "var(--fo-proof)", alignSelf: "center" }}>{copyToast}</span>}
            </div>
          </div>
        </div>

        <div className="fo-chrome-card">
          <span className="fo-ns-label">B2C → B2B FLYWHEEL UNIT ECONOMICS SIMULATOR</span>
          <h3 style={{ margin: "4px 0 10px" }}>Conversion Funnel &amp; Revenue Modeler</h3>
          <div className="fo-sliders">
            <label>Monthly Visitors ({monthlyVisitors.toLocaleString()})<input type="range" min={500} max={25000} step={500} value={monthlyVisitors} onChange={(e) => setMonthlyVisitors(Number(e.target.value))} /></label>
            <label>Free → Premium ({freeToPremPct}%)<input type="range" min={2} max={30} value={freeToPremPct} onChange={(e) => setFreeToPremPct(Number(e.target.value))} /></label>
            <label>Premium → Advisor ({premToAdvPct}%)<input type="range" min={2} max={25} value={premToAdvPct} onChange={(e) => setPremToAdvPct(Number(e.target.value))} /></label>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {[
              { stage: "1. Free Calculator Signups", count: freeSignups, pct: 100, color: "#38BDF8" },
              { stage: "2. Consumer Premium ($29/mo)", count: premUsers, pct: Math.min(100, freeToPremPct * 3), color: "#E0B86B" },
              { stage: "3. Qualified Advisor Hand-Offs", count: advLeads, pct: Math.min(100, premToAdvPct * 3.5), color: "#34D399" },
            ].map((row) => (
              <div key={row.stage}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{row.stage}</span>
                  <strong style={{ fontFamily: "ui-monospace, monospace" }}>{row.count.toLocaleString()} / mo</strong>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 3 }}>
                  <div style={{ width: `${row.pct}%`, height: "100%", background: row.color, transition: "width 0.2s" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "var(--fo-well)", border: "1px solid var(--fo-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--fo-muted)" }}>Illustrative Monthly Recurring Revenue</span>
            <strong style={{ fontSize: 18, color: "var(--fo-proof)", fontFamily: "ui-monospace, monospace" }}>{usd(estMrr)} / mo</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
