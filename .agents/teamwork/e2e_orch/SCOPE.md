# E2E Testing Track — Exclusive Scope

## Exclusive File Ownership
- `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/TEST_INFRA.md`
- `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/TEST_READY.md`
- `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/fiduciary-os/e2e/**`
- `/home/antigravity/marcusdax/Kimi_Agent_Fiduciary-OS-Business-Blueprint/.agents/teamwork/e2e_orch/**`

## Hard Boundaries
- NEVER modify implementation code outside `fiduciary-os/e2e/`.
- Tests MUST be strictly opaque-box and requirement-driven (derived from `ORIGINAL_REQUEST.md` and `PROJECT.md` Interface Contracts).
- Tests MUST cover all 18 features (F1–F18) across 4 Tiers:
  - **Tier 1**: Isolated feature happy-path coverage (F1–F18).
  - **Tier 2**: Boundary & corner cases (empty/zero/negative/max-size/overflow/invalid inputs, PII redaction edge cases, banned-phrase variants, Temporal >2 MB payload guard, Plaid Free-tier cap, Compulife missing `REMOTE_IP`, unsourced static ratio rejection).
  - **Tier 3**: Cross-feature pairwise combinations (Consent Ledger blocking Twilio/SES; Risk Drawer + Accessible Data Table + Albers/Itten palette on all 6 charts; Honeybee 4-Scout non-convergence triggering Gate 3 HITL Escalation Pause; CRM Household Graph feeding Multi-Gen Constellation Chart; Masternex zero-reference check).
  - **Tier 4**: Real-world application scenarios (≥6 end-to-end household stewardship & advisor workflows).
