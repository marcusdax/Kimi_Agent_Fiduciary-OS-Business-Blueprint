"""
Fiduciary OS — Free Financial Calculators (HuggingFace Spaces)

Five fiduciary-grade calculators: Tax, Retirement Monte Carlo,
Annuity Quote, Suitability Check, SEC Disclosure Watch.

All results are educational illustrations only — not investment, tax,
or legal advice. See README.md for full disclaimers.
"""

from __future__ import annotations

import json
import math
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, List, Optional, Tuple

import numpy as np
import gradio as gr

# ---------------------------------------------------------------------------
# 1. TAX ESTIMATOR (2025 / 2026 federal)
# ---------------------------------------------------------------------------

TAX_BRACKETS = {
    2025: {
        "single": [
            (11925, 0.10),
            (48475, 0.12),
            (103350, 0.22),
            (197300, 0.24),
            (250525, 0.32),
            (626350, 0.35),
            (float("inf"), 0.37),
        ],
        "mfj": [
            (23850, 0.10),
            (96950, 0.12),
            (206700, 0.22),
            (394600, 0.24),
            (501050, 0.32),
            (751600, 0.35),
            (float("inf"), 0.37),
        ],
        "std_deduction": {"single": 15000, "mfj": 30000},
        "ltcg_thresholds": {"single": (48350, 533400), "mfj": (96700, 600050)},
    },
    2026: {
        "single": [
            (12200, 0.10),
            (49500, 0.12),
            (105600, 0.22),
            (202000, 0.24),
            (256050, 0.32),
            (640000, 0.35),
            (float("inf"), 0.37),
        ],
        "mfj": [
            (24400, 0.10),
            (99000, 0.12),
            (211200, 0.22),
            (404000, 0.24),
            (512100, 0.32),
            (768000, 0.35),
            (float("inf"), 0.37),
        ],
        "std_deduction": {"single": 15700, "mfj": 31400},
        "ltcg_thresholds": {"single": (49900, 551350), "mfj": (99800, 619350)},
    },
}


def compute_tax(
    gross_income: float,
    ltcg: float,
    filing_status: str,
    tax_year: int,
    itemized_deductions: float,
) -> str:
    year_data = TAX_BRACKETS[tax_year]
    fs = "single" if filing_status == "Single" else "mfj"
    std = year_data["std_deduction"][fs]
    deduction = max(std, itemized_deductions)
    ordinary_income = max(0.0, gross_income - ltcg - deduction)

    brackets = year_data[fs]
    ordinary_tax = 0.0
    prev = 0.0
    for ceiling, rate in brackets:
        taxable = min(ordinary_income, ceiling) - prev
        if taxable <= 0:
            break
        ordinary_tax += taxable * rate
        prev = ceiling

    ltcg_base = ordinary_income + deduction
    ltcg_lo, ltcg_hi = year_data["ltcg_thresholds"][fs]
    ltcg_tax = 0.0
    if ltcg > 0:
        stack_top = ltcg_base + ltcg
        if stack_top <= ltcg_lo:
            ltcg_tax = 0.0
        elif ltcg_base < ltcg_lo:
            ltcg_tax = (stack_top - ltcg_lo) * 0.15
            if stack_top > ltcg_hi:
                ltcg_tax += (stack_top - ltcg_hi) * 0.05
        else:
            ltcg_tax = ltcg * 0.15
            if stack_top > ltcg_hi:
                ltcg_tax += (stack_top - ltcg_hi) * 0.05

    total_tax = ordinary_tax + ltcg_tax
    eff_rate = total_tax / max(gross_income, 1) * 100

    result = (
        f"**Tax Year {tax_year} — {filing_status}**\n\n"
        f"Gross Income:          ${gross_income:>12,.0f}\n"
        f"Deduction ({'Itemized' if itemized_deductions > std else 'Standard'}): ${deduction:>12,.0f}\n"
        f"Taxable Ordinary:      ${ordinary_income:>12,.0f}\n"
        f"Long-term Cap Gains:   ${ltcg:>12,.0f}\n"
        f"─────────────────────────────────\n"
        f"Federal Ordinary Tax:  ${ordinary_tax:>12,.0f}\n"
        f"Federal LTCG Tax:      ${ltcg_tax:>12,.0f}\n"
        f"**Total Federal Tax:   ${total_tax:>12,.0f}**\n"
        f"Effective Rate:         {eff_rate:>11.1f}%\n\n"
        f"*Source: IRS Rev. Proc. 2024-61 ({tax_year} projected). Educational only.*"
    )
    return result


def build_tax_tab():
    with gr.Column():
        gr.Markdown("### 🧾 Federal Income Tax Estimator")
        gr.Markdown("2025 / 2026 brackets, standard deduction, and LTCG stacking.")
        with gr.Row():
            gross = gr.Number(label="Gross Income ($)", value=120000, minimum=0)
            ltcg = gr.Number(label="Long-term Cap Gains ($)", value=10000, minimum=0)
        with gr.Row():
            filing = gr.Dropdown(["Single", "Married Filing Jointly"], value="Single", label="Filing Status")
            year = gr.Radio([2025, 2026], value=2025, label="Tax Year")
        itemized = gr.Number(label="Itemized Deductions (0 = use standard)", value=0, minimum=0)
        btn = gr.Button("Estimate Tax", variant="primary")
        out = gr.Markdown()
        btn.click(compute_tax, inputs=[gross, ltcg, filing, year, itemized], outputs=out)


# ---------------------------------------------------------------------------
# 2. RETIREMENT MONTE CARLO
# ---------------------------------------------------------------------------

ASSET_PARAMS = {
    "60/40 (Moderate)":  {"mu": 0.0527, "sigma": 0.1120},
    "80/20 (Growth)":    {"mu": 0.0637, "sigma": 0.1535},
    "40/60 (Conservative)": {"mu": 0.0410, "sigma": 0.0810},
    "100% Equity":       {"mu": 0.0695, "sigma": 0.1735},
}


def run_monte_carlo(
    portfolio: float,
    annual_withdrawal: float,
    years: int,
    allocation: str,
    inflation_pct: float,
    n_trials: int = 2000,
) -> str:
    params = ASSET_PARAMS[allocation]
    mu = params["mu"] - inflation_pct / 100
    sigma = params["sigma"]
    rng = np.random.default_rng(seed=0)

    end_values = []
    successes = 0
    for _ in range(n_trials):
        balance = portfolio
        for _ in range(years):
            r = rng.normal(mu, sigma)
            balance = balance * (1 + r) - annual_withdrawal
            if balance <= 0:
                balance = 0
                break
        end_values.append(max(balance, 0))
        if balance > 0:
            successes += 1

    end_values_sorted = sorted(end_values)
    p10 = end_values_sorted[int(0.10 * n_trials)]
    p25 = end_values_sorted[int(0.25 * n_trials)]
    p50 = end_values_sorted[int(0.50 * n_trials)]
    p75 = end_values_sorted[int(0.75 * n_trials)]
    p90 = end_values_sorted[int(0.90 * n_trials)]
    success_rate = successes / n_trials * 100
    wr = annual_withdrawal / max(portfolio, 1) * 100

    color = "🟢" if success_rate >= 85 else ("🟡" if success_rate >= 70 else "🔴")

    result = (
        f"**Monte Carlo Retirement Analysis** ({n_trials:,} trials)\n\n"
        f"Portfolio:          ${portfolio:>12,.0f}\n"
        f"Annual Withdrawal:  ${annual_withdrawal:>12,.0f} ({wr:.1f}% WR)\n"
        f"Horizon:            {years:>12} years\n"
        f"Allocation:         {allocation}\n"
        f"Inflation:          {inflation_pct:>11.1f}%\n\n"
        f"{color} **Success Rate: {success_rate:.1f}%** (portfolio > $0 at year {years})\n\n"
        f"**End-balance percentiles:**\n"
        f"  10th:  ${p10:>12,.0f}\n"
        f"  25th:  ${p25:>12,.0f}\n"
        f"  50th:  ${p50:>12,.0f} *(median)*\n"
        f"  75th:  ${p75:>12,.0f}\n"
        f"  90th:  ${p90:>12,.0f}\n\n"
        f"*Returns calibrated to FRED historical equity/bond data (real). Educational only.*"
    )
    return result


def build_retirement_tab():
    with gr.Column():
        gr.Markdown("### 📈 Retirement Monte Carlo Simulator")
        gr.Markdown("2,000-trial parametric simulation with inflation-adjusted withdrawals.")
        with gr.Row():
            port = gr.Number(label="Current Portfolio ($)", value=1_000_000, minimum=1000)
            withdrawal = gr.Number(label="Annual Withdrawal ($)", value=40_000, minimum=0)
        with gr.Row():
            horizon = gr.Slider(1, 50, value=30, step=1, label="Years in Retirement")
            inflation = gr.Slider(0.0, 6.0, value=2.5, step=0.1, label="Inflation (%)")
        alloc = gr.Dropdown(list(ASSET_PARAMS.keys()), value="60/40 (Moderate)", label="Asset Allocation")
        btn = gr.Button("Run Simulation", variant="primary")
        out = gr.Markdown()
        btn.click(run_monte_carlo, inputs=[port, withdrawal, horizon, alloc, inflation], outputs=out)


# ---------------------------------------------------------------------------
# 3. ANNUITY QUOTE (SSA 2021 Period Life Table)
# ---------------------------------------------------------------------------

SSA_2021_MORTALITY: Dict[int, Tuple[float, float]] = {
    60: (0.007073, 0.004327), 61: (0.007799, 0.004811), 62: (0.008514, 0.005310),
    63: (0.009347, 0.005875), 64: (0.010235, 0.006490), 65: (0.011217, 0.007192),
    66: (0.012276, 0.007959), 67: (0.013497, 0.008845), 68: (0.014866, 0.009856),
    69: (0.016347, 0.010953), 70: (0.018000, 0.012161), 71: (0.019843, 0.013473),
    72: (0.021868, 0.015082), 73: (0.024088, 0.016902), 74: (0.026521, 0.018998),
    75: (0.029241, 0.021396), 76: (0.032289, 0.024121), 77: (0.035662, 0.027235),
    78: (0.039473, 0.030793), 79: (0.043753, 0.034835), 80: (0.048577, 0.039484),
    81: (0.053996, 0.044752), 82: (0.059954, 0.050609), 83: (0.066572, 0.057095),
    84: (0.073938, 0.064256), 85: (0.082109, 0.072190), 86: (0.091135, 0.080945),
    87: (0.101049, 0.090567), 88: (0.111895, 0.101053), 89: (0.123646, 0.112435),
    90: (0.136299, 0.124683), 95: (0.210000, 0.195000), 100: (0.310000, 0.295000),
    105: (0.450000, 0.440000), 110: (1.000000, 1.000000),
}


def _mortality_qx(age: int, is_male: bool) -> float:
    keys = sorted(SSA_2021_MORTALITY.keys())
    if age in SSA_2021_MORTALITY:
        return SSA_2021_MORTALITY[age][0 if is_male else 1]
    for i in range(len(keys) - 1):
        if keys[i] < age < keys[i + 1]:
            lo, hi = keys[i], keys[i + 1]
            t = (age - lo) / (hi - lo)
            lo_q = SSA_2021_MORTALITY[lo][0 if is_male else 1]
            hi_q = SSA_2021_MORTALITY[hi][0 if is_male else 1]
            return lo_q + t * (hi_q - lo_q)
    return 1.0


def compute_annuity(
    premium: float, age: int, gender: str, annuity_type: str,
    joint_age: int, joint_pct: float, discount_rate_pct: float,
) -> str:
    is_male = gender == "Male"
    discount = discount_rate_pct / 100
    max_age = 110
    survival = [1.0]
    for a in range(age, max_age):
        qx = _mortality_qx(a, is_male)
        survival.append(survival[-1] * (1 - qx))
    apv = sum(s / (1 + discount) ** (t + 0.5) for t, s in enumerate(survival[:-1]))
    if annuity_type == "Joint & Survivor" and joint_age > 0:
        is_joint_male = not is_male
        survival_j = [1.0]
        for a in range(joint_age, max_age):
            qx = _mortality_qx(a, is_joint_male)
            survival_j.append(survival_j[-1] * (1 - qx))
        apv_j = sum(s / (1 + discount) ** (t + 0.5) for t, s in enumerate(survival_j[:-1]))
        apv = apv + (joint_pct / 100) * apv_j
    monthly_income = (premium / apv) / 12
    life_expectancy = sum(survival) - 0.5
    breakeven_years = premium / (monthly_income * 12)
    return (
        f"**Annuity Illustration — {annuity_type}**\n\n"
        f"Premium:              ${premium:>12,.0f}\n"
        f"Issue Age:            {age:>12}\n"
        f"Gender:               {gender:>12}\n"
        f"Discount Rate:        {discount_rate_pct:>11.2f}%\n\n"
        f"**Monthly Income:     ${monthly_income:>12,.0f}**\n"
        f"Annual Income:        ${monthly_income * 12:>12,.0f}\n"
        f"Payout Rate:          {monthly_income * 12 / max(premium, 1) * 100:>11.2f}%\n\n"
        f"Life Expectancy:      {life_expectancy:>11.1f} yrs\n"
        f"Breakeven:            {breakeven_years:>11.1f} yrs\n\n"
        f"*Source: SSA 2021 Period Life Table. Actual carrier quotes will differ.*\n"
        f"*Insurance figures are always illustrative — no carrier integration.*"
    )


def build_annuity_tab():
    with gr.Column():
        gr.Markdown("### 💰 Annuity Illustration")
        gr.Markdown("SSA 2021 Period Life Table + Treasury 10yr discount proxy. Illustrative only.")
        with gr.Row():
            premium = gr.Number(label="Premium ($)", value=250_000, minimum=1000)
            discount = gr.Number(label="Discount Rate (%)", value=4.5, minimum=0.1, maximum=15)
        with gr.Row():
            age = gr.Slider(50, 85, value=65, step=1, label="Issue Age")
            gender = gr.Radio(["Female", "Male"], value="Female", label="Gender")
        ann_type = gr.Dropdown(["Life Only", "Joint & Survivor"], value="Life Only", label="Annuity Type")
        with gr.Row():
            joint_age = gr.Slider(50, 85, value=62, step=1, label="Joint Annuitant Age (J&S only)")
            joint_pct = gr.Slider(50, 100, value=100, step=5, label="Survivor Benefit (%)")
        btn = gr.Button("Quote Annuity", variant="primary")
        out = gr.Markdown()
        btn.click(compute_annuity, inputs=[premium, age, gender, ann_type, joint_age, joint_pct, discount], outputs=out)


# ---------------------------------------------------------------------------
# 4. SUITABILITY CHECK (Reg BI / FINRA deterministic gate)
# ---------------------------------------------------------------------------

SUITABILITY_RULES = [
    {"id": "age_horizon", "description": "Age-horizon mismatch: age > 75 with horizon > 20 years",
     "check": lambda p: not (p["age"] > 75 and p["horizon"] > 20), "flag": "FAIL",
     "rationale": "FINRA Rule 2111: Long-horizon products unsuitable for elderly investors without documented exception."},
    {"id": "risk_income", "description": "High-risk allocation with low income",
     "check": lambda p: not (p["risk_tolerance"] == "Aggressive" and p["annual_income"] < 50_000), "flag": "WARN",
     "rationale": "Reg BI: Aggressive allocation unsuitable without sufficient income cushion."},
    {"id": "liquidity_need", "description": "Illiquid product with high near-term liquidity need",
     "check": lambda p: not (p["liquidity_need"] == "High" and p["product_liquidity"] == "Illiquid"), "flag": "FAIL",
     "rationale": "FINRA Rule 2111: Illiquid products unsuitable for clients with high near-term liquidity needs."},
    {"id": "leverage_experience", "description": "Leveraged product with no derivatives experience",
     "check": lambda p: not (p["uses_leverage"] and p["derivatives_experience"] == "None"), "flag": "FAIL",
     "rationale": "FINRA Rule 2360: Leveraged positions require documented options/derivatives experience."},
    {"id": "concentration", "description": "Single position > 25% of liquid net worth",
     "check": lambda p: p["position_pct"] <= 25, "flag": "WARN",
     "rationale": "Reg BI: Concentrated positions require explicit client acknowledgment and enhanced due diligence."},
    {"id": "tax_bracket_mismatch", "description": "Tax-exempt bond for low-bracket investor",
     "check": lambda p: not (p["product_type"] == "Muni Bond" and p["tax_bracket_pct"] < 22), "flag": "WARN",
     "rationale": "After-tax yield of munis typically uncompetitive for clients in brackets below 22%."},
    {"id": "annuity_in_ira", "description": "Variable annuity inside a qualified account",
     "check": lambda p: not (p["product_type"] in ("Variable Annuity", "Fixed Indexed Annuity") and p["account_type"] == "IRA/401k"), "flag": "WARN",
     "rationale": "Reg BI: Layering annuity tax-deferral on top of an already tax-deferred account has limited benefit and must be justified."},
]


def check_suitability(
    age, annual_income, liquid_net_worth, investment_amount, risk_tolerance,
    liquidity_need, horizon, product_type, product_liquidity, uses_leverage,
    derivatives_experience, account_type, tax_bracket_pct,
) -> str:
    params = {
        "age": age, "annual_income": annual_income, "liquid_net_worth": liquid_net_worth,
        "risk_tolerance": risk_tolerance, "liquidity_need": liquidity_need, "horizon": horizon,
        "product_type": product_type, "product_liquidity": product_liquidity,
        "uses_leverage": uses_leverage, "derivatives_experience": derivatives_experience,
        "account_type": account_type, "tax_bracket_pct": tax_bracket_pct,
        "position_pct": investment_amount / max(liquid_net_worth, 1) * 100,
    }
    fails, warns = [], []
    for rule in SUITABILITY_RULES:
        if not rule["check"](params):
            (fails if rule["flag"] == "FAIL" else warns).append(rule)
    overall = "🔴 FAIL" if fails else ("🟡 WARN" if warns else "🟢 PASS")
    lines = [f"**Suitability Gate: {overall}**\n", f"Position size: {params['position_pct']:.1f}% of liquid net worth\n"]
    if fails:
        lines.append("**Hard Fails (Reg BI / FINRA):**")
        for r in fails:
            lines += [f"  ❌ {r['description']}", f"     _{r['rationale']}_"]
    if warns:
        lines.append("\n**Warnings (enhanced documentation required):**")
        for r in warns:
            lines += [f"  ⚠️  {r['description']}", f"     _{r['rationale']}_"]
    if not fails and not warns:
        lines.append("No suitability flags detected under the 7 deterministic rules.")
    lines.append("\n*Deterministic rule check only — not a substitute for full Reg BI suitability analysis.*")
    return "\n".join(lines)


def build_suitability_tab():
    with gr.Column():
        gr.Markdown("### ✅ Suitability Check (Reg BI / FINRA)")
        gr.Markdown("7-rule deterministic gate. Fails and warnings require advisor documentation.")
        with gr.Row():
            age = gr.Slider(18, 95, value=65, step=1, label="Client Age")
            horizon = gr.Slider(1, 40, value=15, step=1, label="Investment Horizon (yrs)")
        with gr.Row():
            income = gr.Number(label="Annual Income ($)", value=85_000)
            lnw = gr.Number(label="Liquid Net Worth ($)", value=500_000)
        with gr.Row():
            inv = gr.Number(label="Investment Amount ($)", value=100_000)
            bracket = gr.Slider(10, 37, value=24, step=1, label="Fed Tax Bracket (%)")
        with gr.Row():
            risk = gr.Dropdown(["Conservative", "Moderate", "Aggressive"], value="Moderate", label="Risk Tolerance")
            liquidity = gr.Dropdown(["Low", "Medium", "High"], value="Low", label="Near-term Liquidity Need")
        with gr.Row():
            product_type = gr.Dropdown(
                ["Equity Fund", "Bond Fund", "Muni Bond", "Variable Annuity",
                 "Fixed Indexed Annuity", "REIT", "Direct Participation Program", "Other"],
                value="Equity Fund", label="Product Type",
            )
            product_liq = gr.Dropdown(["Liquid", "Semi-liquid", "Illiquid"], value="Liquid", label="Product Liquidity")
        with gr.Row():
            leverage = gr.Checkbox(label="Uses Leverage / Margin", value=False)
            deriv_exp = gr.Dropdown(["None", "Limited", "Extensive"], value="None", label="Derivatives Experience")
        acct_type = gr.Dropdown(["Taxable", "IRA/401k", "529", "Trust"], value="Taxable", label="Account Type")
        btn = gr.Button("Run Suitability Check", variant="primary")
        out = gr.Markdown()
        btn.click(
            check_suitability,
            inputs=[age, income, lnw, inv, risk, liquidity, horizon,
                    product_type, product_liq, leverage, deriv_exp, acct_type, bracket],
            outputs=out,
        )


# ---------------------------------------------------------------------------
# 5. SEC DISCLOSURE WATCH (EDGAR full-text search)
# ---------------------------------------------------------------------------

def search_edgar(query: str, form_types: str, start_date: str, end_date: str) -> str:
    if not query.strip():
        return "Enter a search query to begin."
    encoded_query = urllib.parse.quote(f'"{query}"')
    url = (
        f"https://efts.sec.gov/LATEST/search-index"
        f"?q={encoded_query}"
        f"&forms={urllib.parse.quote(form_types)}"
        f"&dateRange=custom&startdt={start_date}&enddt={end_date}"
        f"&hits.hits._source=entity_name,file_date,period_of_report,form_type"
    )
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "FiduciaryOS-Spaces/1.0 (educational; contact via HuggingFace)"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return f"EDGAR API error: {e}\n\nTry: https://efts.sec.gov/LATEST/search-index"
    hits = data.get("hits", {}).get("hits", [])
    total = data.get("hits", {}).get("total", {}).get("value", 0)
    if not hits:
        return f"No EDGAR filings found for **{query}** in forms `{form_types}` ({start_date} to {end_date})."
    lines = [
        f"**EDGAR Disclosure Watch: {total:,} filing(s) found** (showing top {len(hits)})\n",
        f"Query: `{query}` | Forms: `{form_types}` | {start_date} to {end_date}\n",
    ]
    for h in hits[:10]:
        src = h.get("_source", {})
        lines.append(
            f"- **{src.get('entity_name', 'Unknown')}** · {src.get('form_type', '')} · "
            f"Filed: {src.get('file_date', '')} · Period: {src.get('period_of_report', '')}"
        )
    lines.append("\n*Full search: https://efts.sec.gov/LATEST/search-index — results from EDGAR full-text search.*")
    return "\n".join(lines)


def build_disclosure_tab():
    with gr.Column():
        gr.Markdown("### 🔍 SEC Disclosure Watch")
        gr.Markdown("EDGAR full-text search for advisor/fund filings. Enter a firm name, keyword, or ticker.")
        query = gr.Textbox(label="Search Query", placeholder='e.g. \"revenue sharing\" or \"conflict of interest\"')
        with gr.Row():
            forms = gr.Textbox(label="Form Types (comma-separated)", value="ADV,N-14,8-K,S-1")
            with gr.Column():
                start_dt = gr.Textbox(label="Start Date", value="2024-01-01")
                end_dt = gr.Textbox(label="End Date", value="2025-12-31")
        btn = gr.Button("Search EDGAR", variant="primary")
        out = gr.Markdown()
        btn.click(search_edgar, inputs=[query, forms, start_dt, end_dt], outputs=out)


# ---------------------------------------------------------------------------
# App assembly
# ---------------------------------------------------------------------------

def build_app():
    with gr.Blocks(title="Fiduciary OS Calculators", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            "# 🏦 Fiduciary OS — Free Financial Calculators\n"
            "Five fiduciary-grade calculators. **Educational illustrations only — not investment, tax, or legal advice.**"
        )
        with gr.Tabs():
            with gr.Tab("🧾 Tax Estimator"):
                build_tax_tab()
            with gr.Tab("📈 Retirement Monte Carlo"):
                build_retirement_tab()
            with gr.Tab("💰 Annuity Quote"):
                build_annuity_tab()
            with gr.Tab("✅ Suitability Check"):
                build_suitability_tab()
            with gr.Tab("🔍 SEC Disclosure Watch"):
                build_disclosure_tab()
        gr.Markdown(
            "---\n"
            "*Powered by [Fiduciary OS](https://github.com/marcusdax/kimi_agent_fiduciary-os-business-blueprint) · "
            "Phase 5 Competitive Moat · All results educational only.*"
        )
    return demo


if __name__ == "__main__":
    app = build_app()
    app.launch()
