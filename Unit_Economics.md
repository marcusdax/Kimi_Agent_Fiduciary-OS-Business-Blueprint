# Fiduciary OS Unit Economics

**Version:** 2.0 · **Updated:** October 2026 · **Source:** [`model/build_model.py`](model/build_model.py)

*All figures are planning assumptions for a pre-launch product. There are no customers, cohorts, or measured churn yet.*

---

## Summary

| Metric | Solo | Growth | Enterprise | B2C Premium |
|---|---|---|---|---|
| Monthly ARPU | $99 | $299 | $1,500 | $15 |
| Gross margin | 75% | 75% | 80% | 85% |
| Monthly churn | 1.5% | 1.5% | 1.0% | 5.0% |
| **LTV** | **$4,950** | **$14,950** | **$120,000** | **$255** |
| **CAC** | $500 | $1,500 | $8,000 | $30 |
| **LTV/CAC** | **9.9×** | **10.0×** | **15.0×** | **8.5×** |
| **Payback** | 6.7 months | 6.7 months | 6.7 months | 2.4 months |

On these assumptions every segment clears the common 3× LTV/CAC benchmark with payback under a year. The figures are only as good as the churn and CAC inputs, which are unproven.

> **Correction from v1.** The December 2024 version reported LTV/CAC of 90–120×. Its LTV figures equalled ARPU × 600 months (a 50-year customer lifetime) with no gross margin applied, even though the stated formula included margin. Applying the stated formula gives the figures above.

---

## 1. Customer acquisition cost

### Solo tier ($99/month)

| Component | Amount | Share |
|---|---|---|
| Digital marketing (LinkedIn, search) | $200 | 40% |
| Content marketing | $100 | 20% |
| Sales development | $120 | 24% |
| Events | $50 | 10% |
| Partner referral fees (software referrals) | $30 | 6% |
| **Total** | **$500** | |

### Growth tier ($299/month)

| Component | Amount | Share |
|---|---|---|
| Digital marketing | $450 | 30% |
| Content marketing | $225 | 15% |
| Sales (AE, multiple demos) | $525 | 35% |
| Events | $225 | 15% |
| Partner referral fees (software referrals) | $75 | 5% |
| **Total** | **$1,500** | |

### Enterprise ($1,500+/month)

| Component | Amount | Share |
|---|---|---|
| Account-based marketing | $2,400 | 30% |
| Executive events | $1,600 | 20% |
| Dedicated AE + SE | $3,200 | 40% |
| Pilot programs | $640 | 8% |
| Strategic partner fees | $160 | 2% |
| **Total** | **$8,000** | |

### B2C Premium ($15/month)

| Component | Amount | Share |
|---|---|---|
| Paid social | $12.00 | 40% |
| Creator partnerships | $6.00 | 20% |
| Content / SEO | $6.00 | 20% |
| App store | $4.50 | 15% |
| User referral program | $1.50 | 5% |
| **Total** | **$30.00** | |

Referral fees above are for software sign-ups only. Nothing in the plan pays or receives compensation tied to an insurance or investment product placement.

### Blended B2B CAC by year (from the customer mix)

| Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
|---|---|---|---|---|
| $1,011 | $1,021 | $1,034 | $1,048 | $1,067 |

---

## 2. Lifetime value

```
LTV            = Monthly ARPU × Gross margin ÷ Monthly churn
Payback months = CAC ÷ (Monthly ARPU × Gross margin)
```

Worked example, Solo tier:

```
Monthly contribution = $99 × 0.75      = $74.25
LTV                  = $74.25 ÷ 0.015  = $4,950
Payback              = $500 ÷ $74.25   = 6.7 months
```

### Sensitivity of LTV to churn (gross margin held at segment value)

| Monthly churn | Solo | Growth | Enterprise | B2C |
|---|---|---|---|---|
| 0.5% | $14,850 | $44,850 | $240,000 | $2,550 |
| 1.0% | $7,425 | $22,425 | $120,000 | $1,275 |
| 1.5% | $4,950 | $14,950 | $80,000 | $850 |
| 2.0% | $3,712 | $11,212 | $60,000 | $638 |
| 3.0% | $2,475 | $7,475 | $40,000 | $425 |
| 5.0% | $1,485 | $4,485 | $24,000 | $255 |

### LTV/CAC at different churn rates

| Monthly churn | Solo | Growth | Enterprise | B2C |
|---|---|---|---|---|
| 1.0% | 14.8× | 14.9× | 15.0× | 42.5× |
| 2.0% | 7.4× | 7.5× | 7.5× | 21.2× |
| 3.0% | 5.0× | 5.0× | 5.0× | 14.2× |
| 5.0% | 3.0× | 3.0× | 3.0× | 8.5× |

B2B segments stay above 3× up to roughly 5% monthly churn.

---

## 3. Revenue mix

Only subscription revenue is modelled. Insurance performance-partnership revenue was removed in v2 (see [FINANCIAL_MODEL_PACKAGE.md](FINANCIAL_MODEL_PACKAGE.md#revenue-deliberately-excluded)).

| Line | Year 1 | Year 3 | Year 5 |
|---|---|---|---|
| B2B SaaS | 55% | 46% | 42% |
| B2C Premium | 45% | 54% | 58% |

---

## 4. Operating leverage (base case)

| Metric | Year 1 | Year 3 | Year 5 |
|---|---|---|---|
| Gross margin | 70% | 77% | 80% |
| Operating expenses / revenue | 151% | 98% | 75% |
| EBITDA margin | −77% | −17% | 9% |

Operating expenses are the v1 dollar plan. Break-even on EBITDA arrives in Year 5.

---

## 5. What to measure first

These assumptions drive almost all of the value and none has been measured:

| Assumption | Plan value | How to validate |
|---|---|---|
| B2B monthly churn | 1.0–1.5% | First 6 months of paying advisors, monthly cohorts |
| B2C monthly churn | 5.0% | First 3 premium cohorts |
| Free-to-premium conversion | 5% | Funnel analytics from launch |
| B2B CAC | $500–$8,000 by tier | Spend ÷ new customers by channel, monthly |
| Gross margin | 70–80% | Hosting, AI inference, support cost per account |

Replace the plan values in `model/build_model.py` with measured values as they arrive.

---

**Document version:** 2.0 · **Date:** October 2026
