# Validation — 2026-10-10

Baseline: PR926 dfc8ae9790db15d56d7f06f4161fc25630d432a9. Isolated candidate workspace hr-recruitment-reference-selection-20261009.

- Independent implement/check roles completed; unrelated API signature edits reverted. Review fixed frozen source status, business response fields/version checks and original-body/key retry coverage.
- Web interaction14/14 PASS; HR contracts238/238 PASS.
- API job-change contract1/1 PASS; real isolated PostgreSQL3/3 PASS, including stable history, self/team/foreign park boundaries, required-read audit failure, race/single event, assignment and incompatible status conflict without partial write.
- API/Web typecheck and targeted ESLint PASS. API build PASS. Final Web build79422 PASS; an earlier build captured an intermediate optional-version guard and was superseded after check-role fix.
- Final compiled actual component desktop and390px synthetic API browser PASS; clientWidth=scrollWidth385. Evidence /Users/mac/.codex/artifacts/hr-job-change-operation-continuity-20261010/browser, source hashes retained. Desktop return→edit→save→resubmit also exercised; final screenshots focus return/history.
- Empty isolated database installed347 migrations+8 prerequisites and production-safe local baseline seeds. Owned database/container/network cleanup18517 completed afterPG checks. No production business test writes or historical import replay.

CI, merge, actual runtime and real role acceptance remain separate requirements. Ordinary approvals do not enact job changes; the dedicated workflow is reused. Existing500 employee-options cap remains a follow-up operating gap; full legacy parity and independent HR product requirements remain open.
