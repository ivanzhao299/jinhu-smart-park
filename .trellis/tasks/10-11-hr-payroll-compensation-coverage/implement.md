# Implementation
1. Read applicable AGENTS, API/Web/shared indexes and relevant predev specs fully in bounded reads; exact source before edits.
2. Implement reusable amount-free salary range checks and options contract/API/UI; keep monetary arithmetic and mutation behavior stable.
3. Focused old+new compensation/projector/composer tests, DTO/authority/transport/UI cases, sharedbuild/typecheck/lint. Add full-schema opt-in PG case HR_PAYROLL_COMPENSATION_COVERAGE_PG=1 and HR_PAYROLL_COMPENSATION_COVERAGE_ISOLATED=yes; root executes only.
4. Independent trellis-check; source freeze; root PG+desktop390 browser evidence; retain source hashes.
5. Freshfetch baseline, commit/push/PR, CI, exact-head merge, deploy, actual immutable API/Web revisions, health/Dockercleanup and receipt. Root sole release follower; timeout not terminal.
6. Update checkpoint; retain real role, actual amounts/rules/month, legacy parity, cutover and independent HR acceptance. No historical replay.
