#!/usr/bin/env python3
"""
Fiduciary OS five-year financial model (v2).

Run from the repository root:

    python3 model/build_model.py

Writes 02_B2B_Revenue.csv ... 07_Scenario_Analysis.csv and model/outputs.json, and prints
a summary. Every derived number in the strategy documents should trace back to this file.

Changes from v1 (December 2024 package)
---------------------------------------
1. Performance-partnership revenue (revenue share on insurance premiums) is EXCLUDED.
   It requires a licensed structure, counsel's opinion, and a named licensed channel
   partner before it can be modelled. It appears only as a zero "gated" line.
2. LTV uses ARPU x gross margin / monthly churn. v1 multiplied ARPU by a 50-year
   (600-month) lifetime with no margin, overstating LTV/CAC roughly 10x.
3. Operating expenses are kept at the v1 plan in dollars. Removing revenue does not
   remove headcount or spend, so losses widen rather than costs shrinking with revenue.
4. Income tax applies net-operating-loss carryforward.
5. Equity financing matches Funding_Strategy.md (Seed $5M in Year 1, Series A $15M in
   Year 2). Series B is outside the five-year operating plan.
6. Scenarios scale revenue only; the spend plan is fixed, so the conservative case shows
   the real downside of under-delivering on revenue.
7. Valuation uses the corrected cash flows; enterprise value is not inflated by adding
   future financing cash.

Inputs carried unchanged from v1: customer and user counts, subscription revenue,
ARR, COGS percentages, the v1 operating-expense plan, D&A, SBC, capex.
"""

from __future__ import annotations

import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YEARS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]

# --------------------------------------------------------------------------- inputs (v1)

SOLO_CUSTOMERS = [250, 608.5329920852192, 1107.5968224884073, 1773.881917670356, 2579.651615590664]
GROWTH_CUSTOMERS = [90, 225.07187715067892, 417.73964790587183, 678.4499947617498, 1015.9168295514761]
ENTERPRISE_CUSTOMERS = [12, 30.009583620090524, 57.03195305411625, 95.57217525935448, 147.71980666770463]

SOLO_REVENUE = [276174.99999999994, 672246.3963565415, 1223562.2098029433, 1959607.354450442, 2849741.139743006]
GROWTH_REVENUE = [300303.0, 750997.3324886702, 1393871.8831675225, 2263784.0975215305, 3389809.68516441]
ENTERPRISE_REVENUE = [216000.0, 540172.5051616294, 1026575.1549740925, 1720299.1546683807, 2658956.5200186833]

FREE_USERS = [120000, 284000.0, 518800.0, 843160.0, 1270212.0]
PREMIUM_USERS = [4000, 12861.440350650546, 26889.8090353453, 47188.17956757075, 75009.20884777277]
PREMIUM_REVENUE = [648000.0, 2083553.3368053883, 4356149.063725939, 7644485.089946461, 12151491.833339188]

B2B_ARR = [773860, 1917449.6, 3559446.86, 5807252.7700000005, 8697011.53]
B2C_ARR = [600000, 1929216.0, 4033471.5, 7078227.0, 11251381.500000002]

COGS_PCT = [0.30, 0.26, 0.23, 0.21, 0.20]
RND = [791903.20, 1752715.20, 2793845.86, 3995203.96, 5603510.40]
SALES_MARKETING = [989879.00, 2300438.70, 3868401.96, 5811205.76, 7844914.56]
GENERAL_ADMIN = [395951.60, 766812.90, 1182011.71, 1634401.62, 2241404.16]
DEPRECIATION = [59392.74, 164317.05, 322366.83, 544800.54, 840526.56]  # included in OpEx, as in v1
STOCK_COMP = [50000, 120000, 250000, 400000, 600000]
CAPEX = [150000, 300000, 450000, 600000, 750000]
WORKING_CAPITAL_PCT_OF_REVENUE_GROWTH = 0.05
TAX_RATE = 0.25
BEGINNING_CASH = 500000

# Aligned with Funding_Strategy.md
EQUITY_FINANCING = [5_000_000, 15_000_000, 0, 0, 0]

# --------------------------------------------------------------------------- unit economics

SEGMENTS = {
    # name: (monthly ARPU, gross margin, monthly churn, CAC)
    "Solo": (99.0, 0.75, 0.015, 500.0),
    "Growth": (299.0, 0.75, 0.015, 1500.0),
    "Enterprise": (1500.0, 0.80, 0.010, 8000.0),
    "B2C Premium": (15.0, 0.85, 0.050, 30.0),
}

# --------------------------------------------------------------------------- scenarios / valuation

SCENARIOS = {"Conservative": 0.70, "Base": 1.00, "Optimistic": 1.40}
WACC = {"Conservative": 0.15, "Base": 0.12, "Optimistic": 0.10}
TERMINAL_GROWTH = 0.03
TERMINAL_EBITDA_MULTIPLE = 8.0
VC_METHOD = [
    # (label, exit multiple of Year-5 revenue, target return multiple)
    ("IPO", {"Conservative": 6, "Base": 8, "Optimistic": 10}, 15),
    ("Acquisition", {"Conservative": 4, "Base": 6, "Optimistic": 8}, 10),
]


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def build(factor: float = 1.0) -> dict:
    """Operating model. `factor` scales revenue (and customers) for scenarios; the
    operating-expense plan, D&A, SBC and capex stay fixed in dollars."""
    n = len(YEARS)
    saas = [(SOLO_REVENUE[i] + GROWTH_REVENUE[i] + ENTERPRISE_REVENUE[i]) * factor for i in range(n)]
    b2b_revenue = saas[:]  # performance partnership excluded
    b2c_revenue = [v * factor for v in PREMIUM_REVENUE]
    revenue = [b2b_revenue[i] + b2c_revenue[i] for i in range(n)]
    b2b_customers = [(SOLO_CUSTOMERS[i] + GROWTH_CUSTOMERS[i] + ENTERPRISE_CUSTOMERS[i]) * factor for i in range(n)]

    cogs = [revenue[i] * COGS_PCT[i] for i in range(n)]
    gross_profit = [revenue[i] - cogs[i] for i in range(n)]
    opex = [RND[i] + SALES_MARKETING[i] + GENERAL_ADMIN[i] for i in range(n)]
    ebit = [gross_profit[i] - opex[i] for i in range(n)]
    ebitda = [ebit[i] + DEPRECIATION[i] for i in range(n)]

    taxes, nol = [], 0.0
    for e in ebit:
        if e < 0:
            nol += -e
            taxes.append(0.0)
        else:
            used = min(nol, e)
            nol -= used
            taxes.append((e - used) * TAX_RATE)
    net_income = [ebit[i] - taxes[i] for i in range(n)]

    delta_wc = [0.0] + [
        -WORKING_CAPITAL_PCT_OF_REVENUE_GROWTH * max(0.0, revenue[i] - revenue[i - 1]) for i in range(1, n)
    ]
    cfo = [net_income[i] + DEPRECIATION[i] + STOCK_COMP[i] + delta_wc[i] for i in range(n)]
    fcf = [cfo[i] - CAPEX[i] for i in range(n)]
    cash_begin, cash_end, cash = [], [], BEGINNING_CASH
    for i in range(n):
        cash_begin.append(cash)
        cash = cash + fcf[i] + EQUITY_FINANCING[i]
        cash_end.append(cash)
    min_cash = min(cash_end)

    arr = [(B2B_ARR[i] + B2C_ARR[i]) * factor for i in range(n)]

    unit = {}
    for name, (arpu, gm, churn, cac) in SEGMENTS.items():
        contribution = arpu * gm
        ltv = contribution / churn
        unit[name] = {
            "monthly_arpu": arpu,
            "gross_margin": gm,
            "monthly_churn": churn,
            "lifetime_months": 1 / churn,
            "ltv": ltv,
            "cac": cac,
            "ltv_cac": ltv / cac,
            "payback_months": cac / contribution,
        }

    blended_cac = [
        (SOLO_CUSTOMERS[i] * 500 + GROWTH_CUSTOMERS[i] * 1500 + ENTERPRISE_CUSTOMERS[i] * 8000) / b2b_customers[i]
        for i in range(n)
    ]

    return {
        "revenue": revenue,
        "b2b_revenue": b2b_revenue,
        "b2c_revenue": b2c_revenue,
        "saas": saas,
        "b2b_customers": b2b_customers,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "opex": opex,
        "ebit": ebit,
        "ebitda": ebitda,
        "taxes": taxes,
        "net_income": net_income,
        "delta_wc": delta_wc,
        "cfo": cfo,
        "fcf": fcf,
        "cash_begin": cash_begin,
        "cash_end": cash_end,
        "min_cash": min_cash,
        "arr": arr,
        "unit": unit,
        "blended_cac": blended_cac,
    }


def value(m: dict, scen: str) -> dict:
    """DCF on unlevered FCF (financing excluded) plus the VC method, for one scenario."""
    n = len(YEARS)
    w = WACC[scen]
    fcf, revenue, arr = m["fcf"], m["revenue"], m["arr"]
    pv_fcf = sum(fcf[i] / (1 + w) ** (i + 1) for i in range(n))
    disc = (1 + w) ** n
    tv_multiple = m["ebitda"][-1] * TERMINAL_EBITDA_MULTIPLE
    tv_gordon = fcf[-1] * (1 + TERMINAL_GROWTH) / (w - TERMINAL_GROWTH)
    return {
        "wacc": w,
        "year5_revenue": revenue[-1],
        "year5_ebitda": m["ebitda"][-1],
        "pv_fcf": pv_fcf,
        "terminal_value_multiple": tv_multiple,
        "pv_terminal_value_multiple": tv_multiple / disc,
        "ev_dcf_multiple": pv_fcf + tv_multiple / disc,
        "terminal_value_gordon": tv_gordon,
        "ev_dcf_gordon": pv_fcf + tv_gordon / disc,
        "year1_arr": arr[0],
        "arr_10x_year1": arr[0] * 10,
        "arr_15x_year1": arr[0] * 15,
        "min_cash": m["min_cash"],
        "vc_method": {
            label: {
                "exit_multiple": mults[scen],
                "exit_value": revenue[-1] * mults[scen],
                "target_return": ret,
                "post_money_today": revenue[-1] * mults[scen] / ret,
            }
            for label, mults, ret in VC_METHOD
        },
    }


def write_csv(name: str, rows: list[list]) -> None:
    with open(os.path.join(ROOT, name), "w", newline="") as f:
        csv.writer(f).writerows(rows)


def r(values, digits=0):
    return [round(v, digits) if digits else round(v) for v in values]


def main() -> None:
    m = build()
    scen_models = {k: build(f) for k, f in SCENARIOS.items()}
    m["valuation"] = {k: value(scen_models[k], k) for k in SCENARIOS}
    m["scenarios"] = {k: {key: scen_models[k][key] for key in ("revenue", "arr", "ebitda", "net_income", "cash_end")} for k in SCENARIOS}
    n = len(YEARS)
    head = ["Metric"] + YEARS
    blank = [""] * (n + 1)

    write_csv("02_B2B_Revenue.csv", [
        head,
        ["=== CUSTOMER COUNTS (EOP) ===", *[""] * n],
        ["Solo Customers", *r(SOLO_CUSTOMERS)],
        ["Growth Teams", *r(GROWTH_CUSTOMERS)],
        ["Enterprise Clients", *r(ENTERPRISE_CUSTOMERS)],
        ["Total B2B Clients", *r(m["b2b_customers"])],
        blank,
        ["=== SAAS SUBSCRIPTION REVENUE ===", *[""] * n],
        ["Solo Tier Revenue", *r(SOLO_REVENUE)],
        ["Growth Tier Revenue", *r(GROWTH_REVENUE)],
        ["Enterprise Revenue", *r(ENTERPRISE_REVENUE)],
        ["Total SaaS Revenue", *r(m["saas"])],
        blank,
        ["=== PERFORMANCE PARTNERSHIP REVENUE (GATED - NOT MODELLED) ===", *[""] * n],
        ["Revenue Share Income", *[0] * n],
        blank,
        ["Total B2B Revenue", *r(m["b2b_revenue"])],
        blank,
        ["=== KEY B2B METRICS ===", *[""] * n],
        ["ARPU (annual, SaaS)", *[round(m["saas"][i] / m["b2b_customers"][i]) for i in range(n)]],
        ["Net Revenue Retention (target)", "N/A", "110%", "115%", "118%", "120%"],
        ["Logo Churn (annual, target)", *["15%"] * n],
    ])

    write_csv("03_B2C_Revenue.csv", [
        head,
        ["=== USER COUNTS (EOP) ===", *[""] * n],
        ["Free Users", *r(FREE_USERS)],
        ["Premium Users", *r(PREMIUM_USERS)],
        ["Total B2C Users", *r([FREE_USERS[i] + PREMIUM_USERS[i] for i in range(n)])],
        blank,
        ["=== CONVERSION METRICS (assumptions) ===", *[""] * n],
        ["Free-to-Premium Conversion Rate", *["5.0%"] * n],
        ["Monthly Premium Churn", *["5.0%"] * n],
        blank,
        ["=== B2C REVENUE ===", *[""] * n],
        ["Premium Subscription Revenue", *r(PREMIUM_REVENUE)],
        ["Performance Partnership Revenue (GATED - NOT MODELLED)", *[0] * n],
        ["Total B2C Revenue", *r(m["b2c_revenue"])],
    ])

    g = m["revenue"]
    write_csv("04_Income_Statement.csv", [
        ["Line Item"] + YEARS,
        ["REVENUE", *[""] * n],
        ["B2B Revenue (SaaS)", *r(m["b2b_revenue"])],
        ["B2C Revenue (Premium)", *r(m["b2c_revenue"])],
        ["Total Revenue", *r(g)],
        ["YoY Growth %", "N/A", *[pct(g[i] / g[i - 1] - 1) for i in range(1, n)]],
        blank,
        ["COGS", *r(m["cogs"])],
        ["COGS %", *[pct(c) for c in COGS_PCT]],
        ["Gross Profit", *r(m["gross_profit"])],
        ["Gross Margin %", *[pct(m["gross_profit"][i] / g[i]) for i in range(n)]],
        blank,
        ["OPERATING EXPENSES (v1 plan, unchanged in dollars)", *[""] * n],
        ["R&D", *r(RND)],
        ["Sales & Marketing", *r(SALES_MARKETING)],
        ["G&A", *r(GENERAL_ADMIN)],
        ["Total OpEx (includes D&A)", *r(m["opex"])],
        ["OpEx % of Revenue", *[pct(m["opex"][i] / g[i]) for i in range(n)]],
        blank,
        ["EBIT", *r(m["ebit"])],
        ["Operating Margin %", *[pct(m["ebit"][i] / g[i]) for i in range(n)]],
        ["EBITDA", *r(m["ebitda"])],
        ["EBITDA Margin %", *[pct(m["ebitda"][i] / g[i]) for i in range(n)]],
        ["Income Tax (25%, after NOL carryforward)", *r(m["taxes"])],
        ["Net Income", *r(m["net_income"])],
        ["Net Margin %", *[pct(m["net_income"][i] / g[i]) for i in range(n)]],
    ])

    write_csv("05_Cash_Flow.csv", [
        ["Line Item"] + YEARS,
        ["OPERATING ACTIVITIES", *[""] * n],
        ["Net Income", *r(m["net_income"])],
        ["Add: Depreciation & Amortization", *r(DEPRECIATION)],
        ["Add: Stock-Based Compensation", *r(STOCK_COMP)],
        ["Change in Working Capital (5% of revenue growth)", *r(m["delta_wc"])],
        ["Cash from Operations", *r(m["cfo"])],
        blank,
        ["Capital Expenditures", *[-c for c in CAPEX]],
        ["Free Cash Flow", *r(m["fcf"])],
        ["FCF Margin %", *[pct(m["fcf"][i] / g[i]) for i in range(n)]],
        blank,
        ["FINANCING ACTIVITIES (per Funding_Strategy.md)", *[""] * n],
        ["Equity Financing", *EQUITY_FINANCING],
        blank,
        ["CASH POSITION", *[""] * n],
        ["Beginning Cash", *r(m["cash_begin"])],
        ["Ending Cash", *r(m["cash_end"])],
    ])

    u = m["unit"]
    arr = m["arr"]
    sm = SALES_MARKETING
    write_csv("06_SaaS_Metrics.csv", [
        head,
        ["=== ARR ===", *[""] * n],
        ["B2B ARR", *r(B2B_ARR)],
        ["B2C ARR", *r(B2C_ARR)],
        ["Total ARR", *r(arr)],
        ["ARR Growth %", "N/A", *[pct(arr[i] / arr[i - 1] - 1) for i in range(1, n)]],
        ["Total MRR", *r([a / 12 for a in arr])],
        blank,
        ["=== CUSTOMERS ===", *[""] * n],
        ["B2B Customers (EOP)", *r(m["b2b_customers"])],
        ["B2C Premium Users (EOP)", *r(PREMIUM_USERS)],
        ["Blended B2B CAC ($)", *r(m["blended_cac"])],
        blank,
        ["=== UNIT ECONOMICS (LTV = monthly ARPU x gross margin / monthly churn) ===", *[""] * n],
        *[[f"LTV - {k} ($)", *[round(v["ltv"])] * n] for k, v in u.items()],
        *[[f"CAC - {k} ($)", *[round(v["cac"])] * n] for k, v in u.items()],
        *[[f"LTV/CAC - {k}", *[f'{v["ltv_cac"]:.1f}x'] * n] for k, v in u.items()],
        *[[f"Payback - {k} (months)", *[round(v["payback_months"], 1)] * n] for k, v in u.items()],
        blank,
        ["=== EFFICIENCY ===", *[""] * n],
        ["Magic Number (net new ARR / prior-year S&M)", "N/A", *[f"{(arr[i] - arr[i - 1]) / sm[i - 1]:.2f}" for i in range(1, n)]],
        ["Rule of 40 (revenue growth % + EBITDA margin %)", "N/A",
         *[round((g[i] / g[i - 1] - 1) * 100 + m["ebitda"][i] / g[i] * 100) for i in range(1, n)]],
        ["Net Revenue Retention (target)", "N/A", "110%", "115%", "118%", "120%"],
    ])

    rows = [head]
    for label, key in [("Revenue", "revenue"), ("ARR", "arr"), ("EBITDA", "ebitda")]:
        rows.append([f"=== {label.upper()} SCENARIOS ===", *[""] * n])
        for scen in SCENARIOS:
            rows.append([f"{scen} {label}", *r(scen_models[scen][key])])
        rows.append(blank)
    rows += [
        ["=== METHOD ===", *[""] * n],
        ["Conservative and Optimistic scale revenue and customers to 70% and 140% of base.", *[""] * n],
        ["Operating-expense plan, D&A, SBC and capex stay fixed in dollars in every scenario.", *[""] * n],
        ["Performance-partnership revenue is excluded from every scenario.", *[""] * n],
    ]
    write_csv("07_Scenario_Analysis.csv", rows)

    with open(os.path.join(ROOT, "model", "outputs.json"), "w") as f:
        json.dump(m, f, indent=2)

    print("Revenue    ", [f"{v / 1e6:.2f}M" for v in g])
    print("ARR        ", [f"{v / 1e6:.2f}M" for v in arr])
    print("EBITDA     ", [f"{v / 1e6:.2f}M" for v in m["ebitda"]])
    print("Net income ", [f"{v / 1e6:.2f}M" for v in m["net_income"]])
    print("FCF        ", [f"{v / 1e6:.2f}M" for v in m["fcf"]])
    print("Ending cash", [f"{v / 1e6:.2f}M" for v in m["cash_end"]])
    for k, v in u.items():
        print(f"{k:12s} LTV ${v['ltv']:,.0f}  CAC ${v['cac']:,.0f}  LTV/CAC {v['ltv_cac']:.1f}x  payback {v['payback_months']:.1f} mo")
    for scen in SCENARIOS:
        print(scen, "EBITDA", [f"{v / 1e6:.2f}M" for v in scen_models[scen]["ebitda"]], "min cash", f"{scen_models[scen]['min_cash'] / 1e6:.2f}M")
    for scen, v in m["valuation"].items():
        print(scen, {k: (round(x / 1e6, 1) if isinstance(x, float) and abs(x) > 1000 else x)
                     for k, x in v.items() if k != "vc_method"},
              {lab: round(d["post_money_today"] / 1e6, 1) for lab, d in v["vc_method"].items()})


if __name__ == "__main__":
    main()
