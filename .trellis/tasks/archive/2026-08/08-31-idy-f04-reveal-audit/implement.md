# Implement: IDY-F04 Reveal Audit

## Status

- Branch: `codex/fix-idy-04-reveal-audit` from `origin/main@1e888d8e`.
- Issue: #513; parent: #509.
- F02/F03 predecessor: PR #512 merged as `1e888d8e`; Issue #511 closed; main CI #33384573249 and Deploy #33384573281 PASS; remote branch deleted and refs pruned.
- Implemented: ordinary Party detail no longer selects/decrypts plaintext; shared ordinary response removed `identityNumber`.
- Implemented: atomic `party:identity_reveal`, controlled reason codes, dedicated POST action, tenant/park scoped lookup, transaction-bound required audit, and separate Web reveal state.
- Implemented: forward-only `000288` per-tenant permission convergence plus production-safe default-scope reconciliation.
- Verified so far: shared build; API/Web typecheck; 39 focused API contract/service/controller tests PASS.
- Verified: Web contract PASS; PostgreSQL 16 preflight/fresh/replay/two-tenant checks PASS with exact temporary-database cleanup.
- Verified: API/Web lint and typecheck PASS; focused API contracts PASS; full API unit reached all suites with one corrected contract drift, then a Node 24 V8 crash in an unrelated idempotency test; that file and all affected contracts pass in isolated rerun.
- Independent review round 1: migration eligibility preflight strengthened; reveal intentionally remains outside response replay cache so every access receives a fresh required audit.
- PR #514 opened (`Closes #513`). CI contract drifts for the intentional +1 permission/action/endpoint were synchronized; shared contracts pass 33/33 and the API B0 digest contract passes 9/9.
- Hosted review round 1: two contract findings already resolved by follow-up commits; accepted two P1 findings and changed migration/seed definition parity plus pessimistic row locking for reveal/restriction serialization.
- Hosted review round 2 completed with no new findings. CI full unit/build passed; Release Smoke exposed the downstream role-template visible-definition cardinality freeze, now synchronized from 25 to 26.
- Hosted review round 3 completed; no further review requests are permitted. Release Smoke then exposed three matching 25-count assertions in the isolated 000194 retry harness; synchronized only those property assertions to 26.
- Final Release Smoke passed every migration/seed/retry gate and reached housing API E2E, where a legacy assertion still expected plaintext Party detail. Replaced it with plaintext absence plus canonical masked-value assertions.
- PR #514 squash-merged as `7045c318`; the post-merge housing E2E contract correction was isolated in PR #516 and squash-merged as `4aecb6a7`. Superseded conflicting PR #515 was closed without merge.
- Final evidence: PR #516 Detect Release Smoke Scope PASS (6s), Lint/Typecheck/Build PASS (13m12s), Release Smoke PASS (22m28s). `main@4aecb6a7` CI run #33403442390 PASS, including Lint/Typecheck/Build (10m37s), Release Smoke (19m21s), property API E2E and container teardown; Deploy Production run #33403442373 PASS, including protected acceptance-account verification.
- Issue #513 closed by merged PR #514. Hosted review completed in three rounds (round 2 no findings; no requests beyond the agreed maximum).
- Status: implementation, review, CI, deployment and main verification complete; ready to archive.
