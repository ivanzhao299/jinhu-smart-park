# Implementation plan — complete formal activation

Freeze candidate2026-10-17 at ef715dc497e6cbae10d0c149021ef5b3b32eeea7. Execute [contract](research/formal-activation-contract.md) as one complete parent-D slice; do not split another standalone preflight/draft/note deliverable. Root first reviews/freezes this contract and rebases the accepted373/374 source; preserve all accepted behavior.

## Ownership and sequence

One backend/shared/SQL writer owns the complete transaction and guard implementation. A Web writer may work independently only after shared API contract freezes; disjoint files below. Independent checker reviews the union; no writer edits during check. Root owns bookkeeping/release/finalWebbuild/native/runtime. Production importer remains separately controlled; this task never imports source data.

1. Capture input migration/function/ACL/source fingerprints and confirm next free migration number. Build the complete real-chain synthetic fixture first, reusing existing importer tests without receipt mocks. This resolves whether scoped facade works under restricted business SQL before implementing UI promises.
2. Add strict shared activation DTO/projection/mapping and SQL375 receipt/guards/qualification. Keep372rev1 and old migrations exact. SQL direct-write negative cases accompany each boundary. Implement only the pure read allowlist; never grant importer capability.
3. Extract EntityManager-internal ordinary template/publish/cycle helpers and retain ordinary public wrapper behavior. Implement activation guarded transaction, safe receipt/idempotency, projected history/preview, production DI. Required new PG/HTTP plus affected oldworkflow/dimension paths must pass0skip.
4. Add full source→formal Web path, fold evidence, explicit manual current mode, config copy/derive, read recovery and pending-difference continuity. Existing ordinary lifecycle pages remain the continuation target. Complete all field carriers and full paged sets.
5. Independent all-scope review/fix against contract, focused lint/type/build and required test matrix. Freeze exact owned hashes and return ownership. Root runs finalWebbuild/native desktop390px, release/CI/runtime checks and actual-role acceptance. Preserve separate July trial:2026-07/all imported rows/all books with data/wuenguo/calculate-only/NOT_EXECUTED.

## Exact affected files

Backend/shared/SQL writer (NEW entries created only here):
- NEW `database/migrations/000375_hr_performance_source_activation.sql` (or next free number after root rebase).
- NEW `packages/shared/src/hr-performance-source-activation.ts` and `scripts/e2e/hr-performance-source-activation.contract.mjs`; update `packages/shared/src/index.ts` export only.
- NEW `apps/api/src/modules/hr/hr-performance-source-activation.controller.ts`, `.service.ts`, `.guard.ts`, `.pg.spec.ts`.
- NEW `apps/api/src/modules/hr/dto/hr-performance-source-activation.dto.ts`.
- `apps/api/src/modules/hr/hr-performance-review.service.ts` transaction extraction/reserved IDs; `hr-performance-channel-workflow.service.ts` narrow baseline helper and existing masking reuse; `hr.module.ts` production providers/controllers/DI.
- NEW `apps/api/src/modules/hr/testing/hr-performance-source-activation-fixture.ts`: actual full-migration isolated fixture and real guarded source loader calls. Existing e2e source scripts are read-only reuse references; no broad test-script refactor.
- `apps/api/src/modules/hr/hr-performance-channel-workflow.pg.spec.ts` and `hr-performance-review.pg.spec.ts` only focused regression assertions if extraction exposes a new gap; reuse unchanged checks where valid.
- NEW `.trellis/spec/api/backend/hr-performance-source-activation.md`, `docs/testing/hr-performance-source-activation.md`; link API index. Update workflow/source-drafts specs only additive activation boundary, no redesign.

Web writer:
- NEW `apps/web/app/hr/performance/PerformanceSourceActivation.tsx` (preview/configuration/target action component).
- `apps/web/app/hr/performance/PerformanceSourceDraftsPanel.tsx` integrate stable draft context/actions/receipts; `performance-source-drafts.module.css` only domain layout, shared DS classes first.
- `apps/web/lib/hr-api.ts` exact activation adapters and exported projections from shared.
- NEW `apps/web/test/interaction/hr-performance-source-activation.test.tsx`, `hr-performance-source-activation-api.test.tsx`.
- `apps/web/test/interaction/hr-performance-source-drafts.test.tsx` focused parent busy/knownreceipt read recovery test if needed.
- NEW `.trellis/spec/web/frontend/hr-performance-source-activation.md` and link web frontend index.
- Existing `PerformanceChannelDefinitionEditor.tsx`/`PerformanceChannelWorkflowPolicyEditor.tsx` are reused components, no changes unless explicit contract-parity gap is demonstrated. Ordinary performance pages change only for safe source-origin/link presentation if existing routing cannot reach the new review; ownership then assigned before edits.

No edits to historical migrations, production workflows, import loaders, source facts/maps, auth infrastructure, grants of existing functions, calculation core370 or accepted373/374 features. No no-op test duplication or unrelated formatting.

## Validation and handoff

Contract section9 is normative acceptance matrix. Record exact commands and exit/skip counts, owned Docker handles, schema/app/function hashes, inherited evidence only when relevant inputs unchanged. API validation uses actual ValidationPipe/live guard/Idempotency/Audit and realDB, not only mocked service tests. Direct SQL must independently enforce cohort/receipt/init, including unknown JSON keys and null handling. All sensitive fixture/results private0700/0600.

Final reviewer reports code/test findings and fixes, exact file manifest, missing runtime/real-role/business evidence, and explicit ownership release. Parent D is not complete merely because source drafts373, notes374, or this design is accepted. No further planning loop is needed after root freeze; scoped implementation begins with the real-chain fixture.

## Reviewed test-path reconciliation (2026-10-17)

The originally named shared `hr-performance-source-activation.spec.ts` and API `.spec.ts` were not created. The delivered shared `scripts/e2e/hr-performance-source-activation.contract.mjs` runs against freshly built producer exports and covers closed bodies, paired target CAS, complete catalog/detail derivation, plus the SQL replacement/facade allowlist. The delivered API `.pg.spec.ts` runs real Nest ValidationPipe, live DB guards, idempotency/audit and services against the full migration fixture; it covers direct SQL denial and the complete formal lifecycle. This is accepted equivalent behavioral coverage for the planned unit/API contract boundaries, not a claim that the planned filenames exist. New regression cases cover selected-master note independence, immutable receipt-bound cycle identity and Unicode request text. Web interaction coverage verifies policy copying, parent/version pairing, frozen retries, receipt/read independence, translated difference fields and complete code-point text input.

The synthetic batch now contains 102 independent detail facts and three masters: the primary master selects all 101 repeated-item details, another master shares that session, and the third selects one note-free detail in a separate session. Qualification still verifies the entire batch; note-policy readiness and baseline construction must use only selected detail identities.
