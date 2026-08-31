# Implement: IDY-F02/F03

## Resume Point

- Phase: implementation recovery after interrupted process. Partial diff audited; API typecheck/lint and 15 focused tests pass.
- Branch: `codex/fix-idy-02-consent-retention` from `origin/main@a2d6aac0`.
- Issue: #511; parent: #509.
- Next: add PostgreSQL apply/replay/legacy semantics tests and focused governance service contracts; then complete docs/Web decision and full gates.

## Checklist

- [x] Create Issue, Trellis child task and branch after F01 main dual green.
- [x] Research consent, retention, legal hold, subject rights and consumer/test impact.
- [x] Freeze PRD/design and exclusions.
- [x] Add migration and PostgreSQL contract/replay tests. (fresh/replay and real legacy upgrade fixture passed)
- [x] Add shared permissions/contracts and production-safe permission convergence.
- [x] Implement consent fact, retention/legal hold and subject-request services/controllers.
- [x] Update Party and identity projections plus minimal Web controls.
- [x] Preserve homestay check-in atomic fail-closed behavior and housing non-gate behavior.
- [x] Sync docs/specs; validate focused/full gates.
- [x] Commit/push, PR review <=3, CI, merge and main dual green.

## Validation

- Focused API/shared/Web unit tests and schema contracts.
- PostgreSQL 16 migration apply + replay and legacy semantic assertions.
- API/shared/Web lint, typecheck and build.
- Homestay identity check-in regression; housing existing behavior regression.
- Secret scan, HR-path exclusion, `git diff --check`.

## Risks

- Placeholder retention days are operational defaults only; production policy activation requires legal approval.
- Legacy consent is never sufficient for check-in until re-evidenced.
- Destructive retention cannot bypass immutable/referenced evidence; actual outcome must be restriction.

## Recovery Log

- 2026-08-31: Audited all 21 partial changes before editing. Found one stale response-key assertion plus missing subject-request detail/completion and legacy-retention classification paths.
- 2026-08-31: Added explicit approved -> completed subject-request transition; erasure/restriction completion records requested action and actual `processing_restricted` fallback without claiming physical deletion.
- 2026-08-31: Added legal-review-gated, advisory-locked, idempotent legacy assignment classification based on persisted object timestamps; provenance remains `legacy_unknown`.
- 2026-08-31: Corrected protected-audit UUID recognition and consent withdrawal time-order constraint.
- 2026-08-31 validation: `pnpm --filter @jinhu/api typecheck` PASS; `pnpm --filter @jinhu/api lint` PASS; focused schema/party tests 15/15 PASS.
- 2026-08-31 migration evidence: isolated PostgreSQL 16 formal runner fresh apply 278/278 PASS; checksum replay 278/278 SKIP/PASS.
- 2026-08-31 upgrade fixture initially exposed deferred-trigger/late-ALTER ordering failures. Moved current-fact FK before backfill and flushed deferred projection checks before later Party DDL; the same pre-000287 legacy `granted` fixture then applied atomically.
- 2026-08-31 legacy assertion PASS: compatibility projection remained `granted`; fact became `pending_evidence|legacy_unknown|observed=granted`; notice/effective/revoked/channel/operator fields all remained NULL.
- 2026-08-31 recovery review: removed stale Web direct `consent_status` writes, added independent consent fact/withdraw controls, made policy GET side-effect free, fixed protected-audit Party ownership and tenant/park-scoped due updates, and persisted legal-hold release reason codes.
- 2026-08-31 independent check findings fixed: request-body fingerprint conflicts, requested/actual retention outcomes, held-assignment release recovery, scoped hold-object ownership, controlled reason codes, and complete GET endpoint manifest coverage.
- 2026-08-31 final validation: migration fresh 278/278 PASS and checksum replay 278/278 PASS; focused API 17/17 PASS; Web property 29/29 PASS; shared contract 20/20 PASS; API exact contract 42/42 PASS; API full unit 1635 pass / 41 environment skips / 0 fail; workspace lint/typecheck/build PASS; `git diff --check` PASS.
- 2026-08-31 remaining validation risk: the final real PostgreSQL homestay atomic spec was attempted twice and both runs ended with host-to-container `Connection terminated unexpectedly` before any business assertion while the dedicated PostgreSQL container remained healthy. Per same-topic retry limit it was not retried again; do not claim this final re-run passed. The fixture/schema drift found after attempt one was corrected.
- 2026-08-31 cleanup: removed the dedicated `test-only-idy-f02-postgres` container, network, volume, temporary migration copy, and compose file; no other container was touched.
- 2026-08-31 PR #512 review round 1: CI failed only at shared permission-count contract (expected 97, actual 101). Codex reported 8 findings (2 P1, 6 P2); verified against implementation/PRD. Began fixes for withdrawal replay ordering, rejected outcome persistence, scope-wide audit UUID safety, due-execution legal approval, Web lawful-basis mapping, and shared count drift. Processing-restriction consumer coverage plus migration photo/protected-audit lifecycle remain open before push.
- 2026-08-31 PR #512 review round 1 fixes completed: restriction now gates identity commands after completed-replay resolution, Party/domain writes and projections, and all identity-evidence access paths; photo retention uses scoped `sys_file.create_time`; protected audit backfill/hooks cover `sys_op_log` identity-submission records plus assignment-audit and decision facts, and legacy classification uses each source timestamp.
- 2026-08-31 review-fix validation: focused API contracts 65/65 PASS; shared 33/33 PASS; Web property 29/29 PASS; API/shared/Web typecheck PASS; API/Web/shared lint PASS; API full unit 1633 pass / 41 environment skips / 1 Node 24 V8 native crash, with the sole crashed engineering state-machine file rerun 4/4 PASS; `git diff --check` PASS.
- 2026-08-31 local fresh-schema validation not obtained: two attempts stopped before SQL because the formal runner requires a Compose-owned postgres service and the isolated test container was external. Per same-topic retry limit, no third attempt; the isolated container/temp compose file were removed. PR Release Smoke remains a required blocking gate and must not be reported green until it executes the migration.
- 2026-08-31 PR CI after `abc2ff12`: verify PASS; Release Smoke reached 000287 and failed transactionally before commit because `sys_op_log.biz_id` is UUID and the protected-audit filter applied `~*` without a text cast. Added explicit `op.biz_id::text` / `NEW.biz_id::text` casts and a regression source contract; no migration before 000287 was changed.
- 2026-08-31 PR CI after `457e41dc`: verify PASS; Release Smoke fresh migration/replay, production seed and pre-E2E PostgreSQL gates PASS. Property API E2E then exposed `requiredAudit` protected-assignment SQL parameter inference (`$1` text versus varchar). Artifact `postgres.log` identified the exact statement; scope placeholders are now explicitly `::varchar` in both SELECT and policy predicates with a regression contract.
- 2026-08-31 PR CI after `ed7523ff`: verify PASS; Release Smoke again passed migration, replay, seed and earlier property identity flows. Housing E2E then exposed a stale valid-create fixture that still supplied the removed direct `consent_status` field. The fixture now separately asserts direct consent injection is rejected and creates the valid tenant without fabricating consent provenance.
- 2026-08-31 housing fixture check: `node --check scripts/e2e/housing-rental-api-e2e.mjs` PASS. Direct single-file ESLint is not an applicable gate for this standalone script because the repository lint config does not declare its Node/Web globals (40 pre-existing `no-undef` reports such as `process`, `fetch`, and `FormData`); rely on the already-passing workspace lint and the Release Smoke execution for this fixture.
- 2026-08-31 PR CI at `7f892c9f`: Detect Release Smoke Scope PASS (8s), Lint/Typecheck/Build PASS (14m11s), Release Smoke PASS (21m46s), including migration/replay/seed/login and the complete property/housing API E2E gate.
- 2026-08-31 Codex review round 2: completed against `7f892c9fed`; no new inline findings were emitted. Review queue is clear after two total rounds.
- 2026-08-31 closure: PR #512 squash-merged as main `1e888d8e`; Issue #511 closed; main CI `33384573249` and Deploy `33384573281` both PASS.
