# Fiduciary OS Valuation Analysis

**Version:** 2.0 · **Updated:** October 2026 · **Supersedes:** v1.0 (December 2024)
**Stage:** Pre-revenue, pre-launch · **Source:** [`model/build_model.py`](model/build_model.py) (`model/outputs.json` → `valuation`)

*Confidential. For planning and negotiation preparation. Not investment advice.*

---

## Summary

| Method | Conservative | Base | Optimistic |
|---|---|---|---|
| DCF, 8× Year-5 EBITDA terminal value | Not meaningful (negative) | **$5.6M** | $48.1M |
| DCF, Gordon growth terminal value (3%) | Not meaningful (negative) | $6.1M | $60.3M |
| 10× planned Year-1 ARR | $9.6M | $13.7M | $19.2M |
| 15× planned Year-1 ARR | $14.4M | $20.6M | $28.9M |
| VC method, IPO exit (implied post-money today) | $5.9M | $11.2M | $19.6M |
| VC method, acquisition exit (implied post-money today) | $5.9M | $12.6M | $23.6M |

**Reading this table.** In the base case the methods cluster between roughly **$6M and $21M**. The v1 recommendation of a $45–55M seed pre-money depended on revenue that has been removed (insurance revenue share) and on LTV/CAC figures that were overstated about tenfold. It is not supported by the corrected model.

For a pre-revenue company, seed pricing is set by investor demand, team, and evidence of demand far more than by a DCF. Use these numbers to check that a proposed price is defensible, not as a target.

> **What changed from v1**
> - Revenue excludes performance-partnership revenue (Year 5 revenue $21.05M, previously $28.02M).
> - Enterprise value no longer adds projected future cash (which came from future financing rounds).
> - The comparable-company and precedent-transaction tables were removed: several entries mixed funding rounds with acquisitions, used the wrong year, or quoted market data that could not be traced to a source. Rebuild them from a current data provider (for example PitchBook or S&P Capital IQ) before using either method.

---

## 1. Assumptions

| Parameter | Conservative | Base | Optimistic |
|---|---|---|---|
| Revenue vs base plan | 70% | 100% | 140% |
| Operating-expense plan | Same dollars in every case | | |
| Discount rate (WACC) | 15% | 12% | 10% |
| Terminal value | 8× Year-5 EBITDA, cross-checked with 3% Gordon growth | | |
| Tax rate | 25% after NOL carryforward | | |
| Projection period | 5 years | | |

---

## 2. Discounted cash flow

### Base-case free cash flow

| Year | Revenue | EBITDA | Capex | Free cash flow |
|---|---|---|---|---|
| 1 | $1.44M | −$1.11M | $0.15M | −$1.21M |
| 2 | $4.05M | −$1.66M | $0.30M | −$1.97M |
| 3 | $8.00M | −$1.36M | $0.45M | −$1.76M |
| 4 | $13.59M | −$0.16M | $0.60M | −$0.64M |
| 5 | $21.05M | $1.99M | $0.75M | $1.47M |

### DCF build-up

| Component | Conservative | Base | Optimistic |
|---|---|---|---|
| PV of Year 1–5 FCF | −$9.7M | −$3.5M | $4.7M |
| Year-5 EBITDA | −$3.1M | $2.0M | $8.7M |
| Terminal value (8× EBITDA) | n/m | $15.9M | $69.8M |
| PV of terminal value | n/m | $9.0M | $43.3M |
| **Enterprise value** | **n/m** | **$5.6M** | **$48.1M** |

The spread between base and optimistic shows how much of the value sits in hitting the revenue plan with a fixed cost base: 40% more revenue raises Year-5 EBITDA more than fourfold.

---

## 3. ARR multiples

Applied to **planned** Year-1 ARR. No ARR has been achieved, so this method prices the plan, not the business.

| | Conservative | Base | Optimistic |
|---|---|---|---|
| Planned Year-1 ARR | $0.96M | $1.37M | $1.92M |
| 10× | $9.6M | $13.7M | $19.2M |
| 15× | $14.4M | $20.6M | $28.9M |

Multiples to apply should come from current, sourced comparables (see note above).

---

## 4. Venture capital method

Implied post-money today = (Year-5 revenue × exit multiple) ÷ target return multiple.

| Exit | Scenario | Year-5 revenue | Exit multiple | Exit value | Target return | Post-money today |
|---|---|---|---|---|---|---|
| IPO | Conservative | $14.7M | 6× | $88.4M | 15× | $5.9M |
| IPO | Base | $21.0M | 8× | $168.4M | 15× | $11.2M |
| IPO | Optimistic | $29.5M | 10× | $294.7M | 15× | $19.6M |
| Acquisition | Conservative | $14.7M | 4× | $58.9M | 10× | $5.9M |
| Acquisition | Base | $21.0M | 6× | $126.3M | 10× | $12.6M |
| Acquisition | Optimistic | $29.5M | 8× | $235.8M | 10× | $23.6M |

---

## 5. Dilution at different seed prices

For a $5M seed, before any option-pool expansion:

| Pre-money | Post-money | Investor ownership |
|---|---|---|
| $8M | $13M | 38.5% |
| $12M | $17M | 29.4% |
| $15M | $20M | 25.0% |
| $20M | $25M | 20.0% |

The model consumes about $5.6M of operating cash through Year 4 in the base case, so a smaller seed (or a seed plus a smaller Series A) is worth testing against dilution.

---

## 6. Risks that move value most

| Risk | Effect on value | Mitigation |
|---|---|---|
| Revenue below plan with fixed spend | Conservative case has negative DCF value | Gate hiring to revenue milestones |
| Churn above plan | LTV and NRR fall directly | Measure monthly cohorts from launch |
| Insurance features treated as unlicensed activity | Could block the advisor product | Illustrative-only outputs; licensed partner and counsel before any placement-linked revenue |
| AI output treated as personalised advice | Regulatory and liability exposure | Disclosures, guardrails, supervision log, evaluation suite |

---

*Prepared for planning purposes only. Projections are management estimates and are not a guarantee of future results. This is not an offer to sell or a solicitation of an offer to buy securities.*

**Document version:** 2.0 · **Date:** October 2026
