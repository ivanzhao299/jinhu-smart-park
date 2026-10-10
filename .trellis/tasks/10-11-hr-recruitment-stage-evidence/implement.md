# Implementation
1. Read applicable AGENTS, package/layer indexes fully in bounded chunks, relevant specs and exact affected source/tests before editing. Do not read giant hr-management blindly; locate and fully read relevant recruitment/authorization/testing sections.
2. Add scoped snapshot history read/query/transport and candidate evaluation/history UI with retained exact-key stage retry and matched receipt handling. No schema/migration/auth/permission changes.
3. Add focused service/DTO/transport and real page interaction tests; isolated opt-in PG spec, using root supplied existing15432 DB and outer SERIALIZABLE transaction rollback. Root owns database creation/migrations/test/drop. Use HR_RECRUITMENT_STAGE_EVIDENCE_PG=1 and HR_RECRUITMENT_STAGE_EVIDENCE_ISOLATED=yes.
4. Run API/Web type checks and targeted lint, focused existing/new tests. Read source to ensure all business boundaries survive. Independent trellis-check mandatory; notify root before frozen source changes.
5. Root true full-schema PG + actual component desktop/390 browser, final source hashes and unique DB cleanup.
6. Fresh fetch/commit/push/PR; root sole release follower through CI, exact-head merge, deployment, actual API/Web immutable runtime revision/health/Docker cleanup. No restart solely on polling timeout.
7. Root updates external checkpoint and predecessor task metadata. Retain real role UAT, actual payroll rules/amounts, dual legacy parity, cutover/recovery and independent HR product acceptance.
