# Financial Model Assumptions — Educational Program Path
**Version:** 1.0 · November 14, 2026  
**Status:** All figures [ASSUMPTION] or [FOUNDER MODEL] until measured  
**Purpose:** Overlay on existing model v2 to reflect education-first GTM. Commercial B2B revenue is delayed.

## Key Changes vs. Original Model

| Driver | Original model v2 | Educational path | Label |
|--------|-------------------|------------------|-------|
| Launch positioning | Dual-sided SaaS | Education-only program | Decision |
| Near-term buyers | Advisors + households | Public institutions + households | [ASSUMPTION] |
| B2B commercial start | Year 1 | Year 2–3 (after density + counsel) | [ASSUMPTION] |
| Public-sector price | — | $0 – $2,000 site / year | [ASSUMPTION] |
| Consumer price | $15 / mo | $0 free / $12 blended paid | [ASSUMPTION] |
| Insurance / placement revenue | Excluded | Still excluded | Locked |

## Bottom-Up Volume Assumptions (Educational Phase)

**Public-sector institutions**
- Year 1: 8 pilots (4 free, 4 paid at $1,500 avg site license) → $6,000 revenue [ASSUMPTION]
- Year 2: 40 institutions (mix free/paid, $2,500 avg) → $80,000 [ASSUMPTION]
- Success metric: ≥60 % of pilots convert to paid or expand seats

**Household educational users**
- Year 1: 15,000 registered free → 800 paid @ $12 / mo → ~$115,000 ARR [ASSUMPTION]
- Year 2: 80,000 free → 6,000 paid → ~$864,000 ARR [ASSUMPTION]
- Conversion free→paid: 5 % after institutional exposure [ASSUMPTION]
- Monthly churn (paid): 6 % [ASSUMPTION]

**Commercial licensing (delayed)**
- Year 2: first 40 advisor seats at $99–$299 blended → modest [ASSUMPTION]
- Year 3+: ramp toward original model targets once density is proven

## Unit Economics (Educational Tiers) — [ASSUMPTION]

| Segment | ARPU | Gross margin | Monthly churn | LTV | CAC or density cost | LTV/CAC |
|---------|------|--------------|---------------|-----|---------------------|---------|
| Public site | $2,000 / yr | 85 % | 15 % annual | $11,300 | $1,500 (sales + success) | 7.5× |
| Household paid | $12 / mo | 90 % | 6 % | $180 | $25 (content + organic) | 7.2× |

## Cash & Runway Notes

- Near-term revenue is lower than original Year-1 base case.  
- Burn is reduced by delaying paid advisor sales team.  
- Primary use of seed capital remains product (educational UX + disclaimers), public-sector success, and legal review.  
- Model must be rebuilt in the spreadsheet once pilot data exists. All numbers above are planning assumptions only.

**Source of truth:** Original CSVs 01–07 remain the commercial long-term target. This file is the educational overlay. Rebuild with `model/build_model.py` when measured data is available.
