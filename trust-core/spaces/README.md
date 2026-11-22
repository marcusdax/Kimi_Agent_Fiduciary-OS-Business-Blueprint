---
title: Fiduciary OS — 5 Deterministic Trust-Core Calculators
emoji: 🛡️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3002
pinned: false
license: mit
---

# Fiduciary OS `trust-core` — HuggingFace Spaces Bundle (Phase 5)

Public top-of-funnel B2C deployment manifest exposing Fiduciary OS's 5 deterministic, provenance-verified financial planning calculators:

1. **Federal Tax Engine** (`2025/2026` brackets & effective/marginal rates)
2. **Monte Carlo Retirement Simulator** (block-bootstrap + regime stress)
3. **Annuity Pricing & Longevity Engine** (SSA period life tables)
4. **Macroeconomic Calibration** (FRED / BLS / US Treasury live provenance)
5. **Suitability & Evidence Ledger Gate** (Ed25519 + MASTERNEX Merkle audit trail)

## Deploy to HuggingFace Spaces

```bash
# From trust-core/
docker build -t fiduciary-trust-core-space .
docker run -p 3002:3002 -e PORT=3002 -e LEDGER_MODE=memory fiduciary-trust-core-space
```
