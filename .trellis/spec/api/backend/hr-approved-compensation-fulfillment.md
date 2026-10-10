# Approved compensation fulfillment and effective-period continuity

The approved salary source queue and fulfillment require PARK_REVIEW + COMPENSATION_MANAGE + COMPENSATION_READ, exact actor tenant/park, scoped approved compensation_change source and minimal audited projection. Employee options require COMPENSATION_READ + COMPENSATION_MANAGE, literal search, repeatable-read selected/count/page snapshot, stable paging, and all nondeleted scoped employees. Assignment ledger supports an optional employeeId filter.

Ordinary and approved writes delegate to one EntityManager-scoped transaction primitive. Source fulfillment first locks the source and checks type/status/employee/expected approval version and unique fulfillment; no nested transaction. Lock the scoped employee anchor, validate and lock active CNY plan and salary periods. Serialize same-employee ordinary/source writes. Exact real YYYY-MM-DD dates are restricted to 1900..2100; money uses normalizeHrMoney, never floats. The plan must cover the entire new salary period; a finite plan cannot cover an open-ended assignment.

Replacement id and expected version are paired. Only an explicitly selected scoped, nondeleted, active same-employee predecessor with strictly earlier start and an end covering the new start can be shortened. CAS its end to the previous calendar day and increment version. Preserve original end and before/after versions. Reject every other active overlapping period, including periods whose referenced plan is abnormal; do not hide those to allow a write. Validate before effects. Predecessor update, new assignment, source linkage, and required body-free audit commit atomically or roll back. Preserve existing frozen payslip and formal-run evidence snapshots.

Receipts retain top-level id for compatibility and provide the full assignment plus optional predecessor metadata; source receipts additionally include source id/version and fulfillment time. IdempotencyInterceptor supplies replay/conflict behavior. Required audit metadata excludes salary amounts and source descriptions.

Forward-only 000356 adds scoped source/employee/new-assignment/predecessor foreign keys, unique source and target linkage, and replacement/version checks. Recognize compatible standalone nonpartial unique identity indexes through pg_index, not only pg_constraint. Never edit an applied predecessor migration or backfill historical salary rows. Validate fresh/upgrade and incompatible-identity cases plus real PostgreSQL service concurrency, stale versions, overlap, scope, audit rollback, and frozen payroll preservation before release.

Payroll reconciliation is calculate-only, owned by Wu Enguo using the latest complete actual production period. That period and current tax/attendance/social-insurance rules require actual evidence and business confirmation; no guessed dates or disbursement.

## 1. Scope / Trigger
New approved-source write and ordinary assignment continuity change API, storage, and UI together. No payroll disbursement or historical import replay.

## 2. Signatures
`GET /hr/compensation/employee-options?page&page_size&keyword&selectedId`; `GET /hr/compensation/assignments?...&employeeId`; `GET /hr/approvals/compensation-fulfillments?page&page_size&keyword`; `POST /hr/compensation/assignments`; `POST /hr/approvals/:id/compensation-fulfillment`. Database linkage: `hr_compensation_approval_fulfillment` in 000356.

## 3. Contracts
Write body: `{employeeId,planId,effectiveFrom,effectiveTo?,baseSalary,allowanceAmount?,variableTarget?,replaceAssignmentId?,expectedReplacementVersion?}`; approved source additionally `expectedApprovalVersion`. Write receipt: `{id,assignment,replaced}`; assignment includes employeeCode/employeeName/planCode/planName and all ledger fields, not only ids. Approved receipt adds `{sourceApprovalId,sourceApprovalVersion,fulfilledAt}`. `replaced` is null or `{id,beforeVersion,afterVersion,effectiveFrom,beforeEffectiveTo,effectiveTo}`. Money is canonical decimal text. No new production environment keys.

## 4. Validation & Error Matrix
Malformed/pairing/date/plan coverage/amount → 400; missing permission or actor scope mismatch → 403; absent approved source/employee → 404; stale source/predecessor, duplicate source, overlap → 409. Required audit or linkage persistence failure rolls back all effects. PostgreSQL CHECK must explicitly reject null versions in the predecessor-present branch; SQL UNKNOWN must not pass required metadata checks.

## 5. Good / Base / Bad Cases
Good: previous open-ended salary starts September1; approved October1 salary explicitly references previous id/version; previous ends September30/version+1, new record and approval link commit together. Base: employee has no period; ordinary first assignment succeeds. Bad: October1 overlaps an unrelated active period or uses a stale predecessor version; neither period nor link changes.

## 6. Tests Required
Real PostgreSQL service fixture: same-source and same-employee ordinary/source race; scope/date/plan coverage/version rejection; audit and linkage failure sentinel reached and both period/link rollback asserted; old frozen payslip and formal-run evidence unchanged. Migration: predecessor standalone identity indexes accepted; incompatible identity and null replacement metadata rejected. Fresh full history must pass required CI Release Smoke before merge.

## 7. Wrong vs Correct
Wrong: `CHECK(predecessor_id IS NOT NULL AND before_version > 0)` permits null versions through UNKNOWN; correct: explicitly require `before_version IS NOT NULL AND after_version IS NOT NULL` in that branch. Wrong: rollback test fails at stale predecessor validation before its injected write failure; correct: use the current valid predecessor and assert the injected sentinel plus before/after state equality.
