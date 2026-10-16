# Performance source formal activation

Migration 375 adds the explicit bridge from a persisted 373 draft into the ordinary 372/374 five-channel workflow. Source intake alone is not activation. The normative task contract is `.trellis/tasks/10-16-hr-performance-formal-source-continuation/research/formal-activation-contract.md`.

## HTTP and authority

Scoped base `/hr/performance-v2/source-drafts/:id` has `GET activation-preview?expectedRevisionId`, `POST activate-template`, `POST activate-review`, and paged `GET activations` (default20, max100). Shared activation types and closed validators are authoritative. Review writes require both current DB performance-manage and template-manage. The route live guard runs before the actual DB idempotency interceptor, including replay. Malformed UUIDs fail400 before DB casts. Reads audit metadata only; writes disable body capture. No unscoped receipt read exists.

Write responses contain only receiptId/draftId/draftRevisionId/templateId/templateVersionId/cycleId/reviewId/inputRevisionId/outcome. Exact request retries deduplicate by immutable source identity across idempotency keys; a changed request conflicts. No trusted/sourceQualified/actor/input fields are accepted. Target existing parents require current version/definition/workflow CAS together.

## SQL and transaction

`hr_performance_source_activation_qualification` is a fixed allowlist STABLE SECURITY DEFINER pure reader with fixed search_path and PUBLIC EXECUTE revoked. It joins genuine succeeded308/309/310/311 receipts, exact migration checksums, parent operation/T0 evidence, whole-batch conservation, selected profile and every selected subject against current scoped source facts. It never calls importer capability/consume/apply/chain-lock helpers. Runtime EXECUTE on this new facade is a separate deployment prerequisite; no preexisting ACLs change.

An immutable receipt reserves target IDs before fresh target insertion. Its internal closed `request jsonb` stores route-body metadata necessary for independent SQL digest/three-CAS validation. It never contains salary values, input, raw payload or manifest and is never returned or audited. BEFORE and deferred guards independently validate identity, request digest, target freshness, source qualification, actual same-batch mapping, binding, source text policy, exact pristine targets and final current generation.

One EntityManager transaction reuses ordinary template/version publication, explicit single employee cycle publication, goal/evidence freezing and input initialization. Ordinary wrappers retain transaction ownership; internal helpers never nest transactions. Revision1 remains entirely UNPROVIDED. Only qualified_source receives the unique receipt-bound original-manifest revision2; actor/time/evidence are server facts. Source null remains UNPROVIDED, decimal and salary19,4 remain strings. Human source-record edits are pending differences and cannot overwrite the original baseline. manual_current stops at empty revision1 and never upgrades historical qualification. All later submissions, calibration, acknowledgement, confirmation and appeal use ordinary workflow.

Only the three formal cycle/employee/input guards are replaced in place; existing OIDs/ACLs and calculation core370 are preserved. Cycle receipt/cohort/binding and baseline links remain immutable; source cycle code/name must equal the closed receipt request. Detail-appraisal policy requirements inspect only detail identities mapped to the selected master, while qualification continues to verify the entire batch. Closed request text uses the same Unicode whitespace and code-point bounds as shared validation. Ordinary org-wide and confirmed-predecessor correction behavior remains applicable outside the narrow receipt branch.

## Projection and privacy

Preview exposes full selected catalogs and all independently identified details, configuration proposals, mapping, safe qualification gates/counts, readiness issues and opaque difference acknowledgement. It never selects another master narrative/pay. Salary diff values require performance-read plus payroll-detail-read; baseline nonnull salary additionally requires performance-read, performance-manage and compensation-manage. Current/history reuse existing per-stage cell masks and omit hidden carriers. Safe sourceOrigin is null or receipt/draft/revision/mode/qualification-at-activation/inputRevisionId metadata only; it contains no hidden cells.

## Validation

`HR_PERFORMANCE_SOURCE_ACTIVATION_PG_REQUIRED=1` enables the required owned full-migration PG/HTTP test. It must not skip and must use the genuine production-shaped synthetic receipt chain in a private tmpfs DB. Run shared contract, API checks, both existing374 workflow variants and ordinary dimension regression after transaction extraction. Local synthetic acceptance does not prove production grants, source import authorization, original formula equivalence or business approval.
