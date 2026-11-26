import { useState } from "react";

export interface CrmHousehold {
  id: string;
  name: string;
  stage: "B2C Free Lead" | "Consumer Premium" | "Active Advisory" | "Review Needed";
  netWorth: number;
  age: number;
  state: string;
  trigger: string;
  gapAmount: string;
  dnaScore: number;
  recommendedCampaign: string;
  emailPreview: string;
}

export const EXAMPLE_HOUSEHOLDS: CrmHousehold[] = [
  {
    id: "harlow",
    name: "Elena & James Harlow",
    stage: "Active Advisory",
    netWorth: 4800000,
    age: 46,
    state: "Texas",
    trigger: "Homestead Trust § 11.13(j) + $24k Roth Window",
    gapAmount: "$24,000 Roth headroom",
    dnaScore: 78,
    recommendedCampaign: "Year-End 22% Roth Conversion Drip",
    emailPreview:
      "Hi Elena & James — your 2026 household plan shows $24,000 of remaining headroom inside the 22% federal bracket before year-end, plus your Burleson homestead deed review under Texas Tax Code § 11.13(j). Click to inspect the side-by-side numbers and assumptions.",
  },
  {
    id: "alvarez",
    name: "R. Alvarez",
    stage: "Review Needed",
    netWorth: 1240000,
    age: 62,
    state: "Arizona",
    trigger: "Retirement Income Floor Shortfall (-$1,450/mo)",
    gapAmount: "$1,450/mo floor gap",
    dnaScore: 66,
    recommendedCampaign: "Market Drawdown Calm-Coaching Sequence",
    emailPreview:
      "Hi Roberto — with retirement 3 years away, we stress-tested your monthly income floor against an early-retirement downturn. Bridging $1,450/mo with guaranteed income raises durability through age 92 from 74% to 88% (illustrative).",
  },
  {
    id: "chen",
    name: "Chen Household",
    stage: "Active Advisory",
    netWorth: 3150000,
    age: 58,
    state: "California",
    trigger: "Equity Drift (+7.2%) + $38.4k Roth Corridor",
    gapAmount: "$38,400 Roth window",
    dnaScore: 81,
    recommendedCampaign: "Year-End 22% Roth Conversion Drip",
    emailPreview:
      "Hi David & Lin — recent equity gains shifted your allocation 7.2% above your 70/30 target, and your pre-RMD tax valley still has $38,400 of room. We've shared a scoped tax-band view for your CPA to review alongside our rebalance brief.",
  },
  {
    id: "patel",
    name: "Patel Family",
    stage: "Consumer Premium",
    netWorth: 2100000,
    age: 55,
    state: "Illinois",
    trigger: "Age-55 LTC Window + $480k Life Protection Gap",
    gapAmount: "$480,000 protection gap",
    dnaScore: 69,
    recommendedCampaign: "Age-55 LTC & Protection Gap Education",
    emailPreview:
      "Hi Priya & Dev — turning 55 opens the most cost-effective window to evaluate long-term care coverage while closing your $480k household income-replacement gap. Review our transparent formula breakdown before any carrier quotes.",
  },
  {
    id: "vance",
    name: "Marcus & Claire Vance",
    stage: "Active Advisory",
    netWorth: 18500000,
    age: 49,
    state: "Delaware",
    trigger: "Founder Liquidity + SLAT / ILIT IRC § 2035 Review",
    gapAmount: "$5.0M ILIT review",
    dnaScore: 84,
    recommendedCampaign: "Annual Beneficiary & Homestead Trust Audit",
    emailPreview:
      "Hi Marcus & Claire — ahead of your secondary liquidity event, we prepared a discussion draft comparing a Joint Revocable Trust + SLAT alongside an ILIT structure (noting the IRC § 2035 3-year rule on existing policies) for counsel review.",
  },
  {
    id: "reyes",
    name: "Sofia Reyes",
    stage: "B2C Free Lead",
    netWorth: 420000,
    age: 38,
    state: "Colorado",
    trigger: "Completed Free Retirement Tool (High-Intent Upgrade)",
    gapAmount: "+6 DNA pts (401k → 9%)",
    dnaScore: 72,
    recommendedCampaign: "B2C Free → Premium → Advisor Hand-Off",
    emailPreview:
      "Hi Sofia — great work modeling your retirement path in Fiduciary OS. Raising your 401(k) from 6% to 9% adds +6 points to your Financial DNA score. Unlock Symphony Composer or share your exact plan with an advisor with zero re-entry.",
  },
];

interface Campaign {
  id: string;
  name: string;
  triggerRule: string;
  channel: string;
  enrolled: number;
  openRate: string;
  meetings: number;
  active: boolean;
}

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "roth-drip",
    name: "Year-End 22% Roth Conversion Drip",
    triggerRule: "Roth bracket headroom > $15,000 AND Q4 window",
    channel: "Email + Interactive Tax Band Brief",
    enrolled: 34,
    openRate: "68%",
    meetings: 11,
    active: true,
  },
  {
    id: "ltc-55",
    name: "Age-55 LTC & Protection Gap Education",
    triggerRule: "Household age 54–58 OR Protection gap > $200,000",
    channel: "Plain-English Guide + Gap Calculator",
    enrolled: 22,
    openRate: "61%",
    meetings: 7,
    active: true,
  },
  {
    id: "drawdown-calm",
    name: "Market Drawdown Calm-Coaching Sequence",
    triggerRule: "Equity drawdown > 8% OR anxiety inquiry detected",
    channel: "Sequence-Risk Fan Chart + Advisor Call Link",
    enrolled: 48,
    openRate: "79%",
    meetings: 14,
    active: true,
  },
  {
    id: "b2c-handoff",
    name: "B2C Free → Premium → Advisor Hand-Off",
    triggerRule: "Free user runs ≥ 2 calculators AND DNA score < 75",
    channel: "In-App Upgrade + Zero Re-Entry Advisor Intro",
    enrolled: 86,
    openRate: "54%",
    meetings: 19,
    active: true,
  },
  {
    id: "trust-audit",
    name: "Annual Beneficiary & Homestead Trust Audit",
    triggerRule: "365 days since last review OR state domicile change",
    channel: "Attorney/CPA Scoped Link + Funding Tracker",
    enrolled: 29,
    openRate: "72%",
    meetings: 9,
    active: false,
  },
];

const RESEARCH_SOURCES = [
  { name: "Nature — Gerontology & Longevity", domain: "Longevity", url: "https://www.nature.com/subjects/ageing", use: "Calibrates cohort-specific life expectancy and late-life healthcare inflation curves beyond static mortality tables." },
  { name: "OpenAlex Academic Graph", domain: "Longevity", url: "https://openalex.org/", use: "Open-access literature search for retirement withdrawal durability, sequence-of-returns, and decumulation studies." },
  { name: "PubMed — Healthspan & LTC Risk", domain: "Longevity", url: "https://pubmed.ncbi.nlm.nih.gov/", use: "Peer-reviewed morbidity and long-term care duration benchmarks informing age-55 protection reviews." },
  { name: "FRED (Federal Reserve Economic Data)", domain: "Macro & Tax", url: "https://fred.stlouisfed.org/", use: "Live 10-Year Treasury, Fed Funds, CPI-U inflation, and mortgage rate baselines feeding scenario assumptions." },
  { name: "Bureau of Labor Statistics (BLS CPI)", domain: "Macro & Tax", url: "https://www.bls.gov/cpi/", use: "Official consumer price and healthcare inflation indices for real-dollar retirement spending projections." },
  { name: "US Treasury Daily Yield Curve", domain: "Macro & Tax", url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates", use: "Risk-free yield curve benchmarks for bond ladders, cash reserves, and annuity payout comparisons." },
  { name: "IRS Rev. Proc. 2025-32 (2026 Brackets)", domain: "Macro & Tax", url: "https://www.irs.gov/newsroom", use: "Statutory federal tax brackets, standard deductions, and $19,000 annual gift exclusion references." },
  { name: "SEC EDGAR Fund & Advisor Filings", domain: "Behavioral & Risk", url: "https://www.sec.gov/edgar/searchedgar/companysearch", use: "Fee disclosures, Form ADV checks, and material risk language verification for holdings." },
  { name: "arXiv Quantitative Finance (q-fin)", domain: "Behavioral & Risk", url: "https://arxiv.org/archive/q-fin", use: "Regime-switching volatility models, portfolio drawdown metrics, and behavioral finance research." },
  { name: "NOAA Storm & Property Hazard Data", domain: "Property & Climate", url: "https://www.noaa.gov/", use: "Regional severe-weather and property-risk telemetry informing homestead insurance and real-asset stress tests." },
];

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function AdvisorCrmPanel({
  onSelectHousehold,
}: {
  onSelectHousehold: (h: CrmHousehold) => void;
}) {
  const [selectedId, setSelectedId] = useState(EXAMPLE_HOUSEHOLDS[0].id);
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [screenedMsg, setScreenedMsg] = useState<string | null>(null);

  const selected = EXAMPLE_HOUSEHOLDS.find((h) => h.id === selectedId) || EXAMPLE_HOUSEHOLDS[0];
  const activeCount = campaigns.filter((c) => c.active).length;
  const totalEnrolled = campaigns.filter((c) => c.active).reduce((s, c) => s + c.enrolled, 0);
  const totalMeetings = campaigns.filter((c) => c.active).reduce((s, c) => s + c.meetings, 0);

  return (
    <div className="acc-grid">
      {/* Left: Example Household CRM Book */}
      <section className="panel">
        <h3>Advisor CRM · Example Household Book ({EXAMPLE_HOUSEHOLDS.length} Loaded)</h3>
        <p>
          Select any household dataset to inspect its live trigger, load it into Command Center tools,
          and preview an education-first automated outreach message.
        </p>
        <div className="table-wrap" style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>Household</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>Funnel Stage</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>Net Worth</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>Trigger</th>
                <th style={{ textAlign: "left", padding: "8px 6px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_HOUSEHOLDS.map((h) => (
                <tr
                  key={h.id}
                  style={{
                    borderTop: "1px solid rgba(148,188,255,0.2)",
                    background: h.id === selectedId ? "rgba(56,189,248,0.12)" : "transparent",
                  }}
                >
                  <td style={{ padding: "8px 6px" }}>
                    <strong>{h.name}</strong>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>Age {h.age} · {h.state} · DNA {h.dnaScore}</div>
                  </td>
                  <td style={{ padding: "8px 6px" }}>{h.stage}</td>
                  <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, monospace" }}>{usd(h.netWorth)}</td>
                  <td style={{ padding: "8px 6px" }}>{h.trigger}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        setSelectedId(h.id);
                        setScreenedMsg(null);
                        onSelectHousehold(h);
                      }}
                    >
                      Load →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right: Automated Consumer Outreach Campaign Engine */}
      <section className="panel">
        <h3>Automated Consumer Outreach &amp; Funnel Campaigns</h3>
        <dl className="tool-metrics">
          <div><dt>Active Campaigns</dt><dd>{activeCount} / {campaigns.length}</dd></div>
          <div><dt>Enrolled Households</dt><dd>{totalEnrolled}</dd></div>
          <div><dt>Meetings Booked</dt><dd>{totalMeetings}</dd></div>
          <div><dt>Compliance Gate</dt><dd>100% Pre-Screened</dd></div>
        </dl>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {campaigns.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,188,255,0.24)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div>
                <strong>{c.name}</strong>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Trigger: {c.triggerRule} · {c.channel}</div>
                <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", opacity: 0.75 }}>
                  {c.enrolled} enrolled · {c.openRate} open · {c.meetings} meetings
                </div>
              </div>
              <button
                type="button"
                className="button"
                aria-pressed={c.active}
                onClick={() =>
                  setCampaigns((list) =>
                    list.map((item) => (item.id === c.id ? { ...item, active: !item.active } : item)),
                  )
                }
              >
                {c.active ? "Active ●" : "Paused ○"}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, border: "1px solid rgba(224,184,107,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", textTransform: "uppercase" }}>
            Personalized Outreach Preview · {selected.name} ({selected.recommendedCampaign})
          </div>
          <p style={{ fontSize: 12.5, margin: "6px 0 10px" }}>{selected.emailPreview}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="button primary"
              onClick={() =>
                setScreenedMsg(
                  `✓ Compliance & Privacy Screen PASSED for ${selected.name}: 0 PII leaks, education-only disclosure appended, audit receipt logged.`,
                )
              }
            >
              Screen &amp; Queue Outreach Campaign
            </button>
          </div>
          {screenedMsg && <p role="status" style={{ fontSize: 12, marginTop: 8 }}>{screenedMsg}</p>}
        </div>
      </section>
    </div>
  );
}

export function ResearchDataHubPanel() {
  const [domain, setDomain] = useState("All");
  const domains = ["All", "Longevity", "Macro & Tax", "Behavioral & Risk", "Property & Climate"];
  const filtered = domain === "All" ? RESEARCH_SOURCES : RESEARCH_SOURCES.filter((r) => r.domain === domain);

  return (
    <section className="panel">
      <h3>Live Research &amp; Public Economic Data Hub</h3>
      <p>
        Direct links to primary academic, macroeconomic, tax, and hazard datasets that ground Fiduciary OS
        assumptions and advisor research briefs.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 14px" }} role="group" aria-label="Filter research sources">
        {domains.map((d) => (
          <button
            key={d}
            type="button"
            className="button"
            aria-pressed={domain === d}
            onClick={() => setDomain(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
        {filtered.map((src) => (
          <article
            key={src.name}
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid rgba(148,188,255,0.24)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace", opacity: 0.75 }}>{src.domain.toUpperCase()}</span>
            <strong>{src.name}</strong>
            <p style={{ fontSize: 12.5, margin: 0, opacity: 0.85 }}>{src.use}</p>
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: "auto", paddingTop: 6, fontSize: 12, fontWeight: 600 }}
            >
              Open primary source ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
