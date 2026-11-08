import { useId, useRef, useState } from "react";
type Info = { title: string; group: string; synonyms: string; method: string };
export const toolInfo: Record<string, Info> = {
  profile: {
    title: "Profile and goals",
    group: "Plan and organize",
    synonyms: "cash flow budget spending surplus runway",
    method:
      "Annual surplus = entered annual income − 12 × entered monthly spending. Runway = liquid assets / monthly spending when spending is positive. No recommendation score.",
  },
  annuity: {
    title: "Term-certain annuity illustration",
    group: "Protect income",
    synonyms: "payout deferral principal income",
    method:
      "Deferred balance = principal × (1 + entered effective annual rate)^deferral. Convert to monthly rate; finite term payment = balance × monthly rate / (1 − (1 + monthly rate)^−months), with the zero-rate limit. No lifetime/carrier quote or underwriting.",
  },
  life: {
    title: "Life coverage needs",
    group: "Protect income",
    synonyms: "insurance protection dependents income replacement",
    method:
      "Undiscounted income × replacement years + debt + education − available assets − existing coverage, floored at zero. No premium, health underwriting or insurer recommendation.",
  },
  investment: {
    title: "Investment growth, fees and allocation",
    group: "Invest and stress test",
    synonyms: "xray x-ray expense ratio equity international cost",
    method:
      "Annual balance = max(0, prior balance × (1 + assumed return) × (1 − fee) + end-of-year contribution). Compare no-fee balance. Entered allocation weights, not connected holdings or risk estimates.",
  },
  risk: {
    title: "Entered risk shocks",
    group: "Invest and stress test",
    synonyms: "crash drawdown what if stress scenario",
    method:
      "Apply one entered shock to each entered asset class; cash is unchanged. Sum stressed values and compare starting assets. No historical recovery, probability or prediction.",
  },
  retirement: {
    title: "Retirement spending scenario",
    group: "Tax and retirement",
    synonyms: "depletion income pension social security inflation",
    method:
      "Annual return then fee, plus end-of-year monthly income less inflation-escalated spending × 12. Floor assets at zero and track unmet spending separately. No stochastic success rate, tax, RMD, spouse optimization or verified SSA benefit.",
  },
  tax: {
    title: "2026 basic federal conversion illustration",
    group: "Tax and retirement",
    synonyms: "roth conversion brackets marginal ordinary income",
    method:
      "2026 single/joint under-65 basic ordinary-income schedule: deduct the basic standard deduction, apply marginal brackets, compare with/without entered taxable conversion. IRS Rev. Proc. 2025-32. No credits, state tax, NIIT, AMT, eligibility or complete current-law certification.",
  },
  estate: {
    title: "Estate inventory and liquidity",
    group: "Legacy and family",
    synonyms: "inheritance settlement debts assets liquidity",
    method:
      "Net inventory = assets − debts; immediate shortfall = max(0, entered settlement needs − liquid assets). Not estate-tax savings or a legal strategy.",
  },
  willtrust: {
    title: "Attorney discussion checklist",
    group: "Legacy and family",
    synonyms: "will trust heirs beneficiaries fiduciaries funding",
    method:
      "Count entered reviewed checklist topics out of four. This does not draft, execute, fund or establish the validity of a will or trust.",
  },
  crypto: {
    title: "Manual digital assets",
    group: "Digital assets",
    synonyms: "btc bitcoin eth ethereum xrp sol ada holdings prices",
    method:
      "Manually entered units × a fresh public USD observation; compare with entered cost basis. Public quotes are not wallet/account balances, trading advice or expected returns. Valuation unavailable when quotes are stale or absent.",
  },
};
const research = [
  {
    title: "Monte Carlo and efficient frontier",
    synonyms: "probability success sharpe sortino var history",
    reason:
      "Research/unvalidated: needs licensed observations, calibrated assumptions and independent method tests. Not a working forecast.",
  },
  {
    title: "Will/trust documents and family tree",
    synonyms: "docx pdf legal legacy heirs",
    reason:
      "Unavailable: reviewed jurisdiction-specific drafting and secure storage are not configured. Use the attorney checklist, not a legal document claim.",
  },
  {
    title: "Vault, carrier quotes and connected accounts",
    synonyms: "upload documents insurance bank brokerage",
    reason:
      "Disconnected: storage/KMS/scanning or explicit provider credentials/consent are required. No upload, account linking or quote execution.",
  },
  {
    title: "AI playbook and advisor household queue",
    synonyms: "symphony dna meetings clients",
    reason:
      "Disconnected/research: no authorized AI or household/calendar source. Sample customers, assets and meetings are not real records.",
  },
];
export default function ToolDiscovery({
  onSelect,
}: {
  onSelect: (key: string) => boolean;
}) {
  const id = useId(),
    modal = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [includeResearch, setIncludeResearch] = useState(false),
    [notice, setNotice] = useState("");
  const q = query.trim().toLowerCase();
  const matches = Object.entries(toolInfo).filter(([, t]) =>
    `${t.title} ${t.group} ${t.synonyms}`.toLowerCase().includes(q),
  );
  const extra = includeResearch
    ? research.filter((t) =>
        `${t.title} ${t.synonyms}`.toLowerCase().includes(q),
      )
    : [];
  function close() {
    modal.current?.close();
    trigger.current?.focus();
  }
  function open() {
    setNotice("");
    if (!modal.current?.showModal) {
      setNotice(
        "This browser does not support the tools dialog. Use the visible workspace module buttons instead.",
      );
      return;
    }
    modal.current.showModal();
    search.current?.focus();
  }
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="tools-trigger"
        onClick={open}
        aria-haspopup="dialog"
      >
        Tools
      </button>
      <dialog
        ref={modal}
        className="tools-dialog"
        aria-labelledby={`${id}-title`}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <h2 id={`${id}-title`}>Find a tool</h2>
        <button type="button" onClick={close}>
          Close tools
        </button>
        <label htmlFor={`${id}-search`}>
          Search tools or a specific feature
        </label>
        <input
          ref={search}
          id={`${id}-search`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Roth conversion, fees, Bitcoin…"
        />
        <label>
          <input
            type="checkbox"
            checked={includeResearch}
            onChange={(e) => setIncludeResearch(e.target.checked)}
          />{" "}
          Include research tools
        </label>
        <p role="status">
          {matches.length} available tools; {extra.length} research or
          disconnected entries. {notice}
        </p>
        <p>
          Saved user inputs and calculated scenarios require sign-in. Public
          observations are separate from personal account balances. A menu is
          not an authorization boundary.
        </p>
        {[...new Set(matches.map(([, t]) => t.group))].map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <ul>
              {matches
                .filter(([, t]) => t.group === group)
                .map(([key, t]) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelect(key)) close();
                        else
                          setNotice(
                            "Resolve unsaved or uncertain changes before switching tools.",
                          );
                      }}
                    >
                      {t.title}
                    </button>
                    <span>Calculated scenario / saved user inputs</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {matches.length === 0 && (
          <p>
            No available tool matches. Try a category or enable research
            entries; no substitute forecast is invented.
          </p>
        )}
        {extra.length > 0 && (
          <section>
            <h3>Research / disconnected — not operational tools</h3>
            <ul>
              {extra.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong>
                  <p>{t.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </dialog>
      {notice && (
        <span className="tool-notice" role="status">
          {notice}
        </span>
      )}
    </>
  );
}
