# Contract Finance Release Check Plan

## 1. Scope

- Task ID: `PROD-20260621-002-A2-FINANCE-GATE`
- Batch ID: `PROD-EVIDENCE-20260621-002`
- Owner: `agent-2`
- Domain: leasing finance release readiness
- Branch: `agent-2-leasing-finance`
- Production write paths: prohibited unless the release owner and finance owner explicitly approve the exact test data marker, account, execution window, and cleanup plan.

This plan covers the finance release gate for contracts, receivables, payments, invoices, waivers, tenant financial summaries, idempotency, delete/void protections, and audit-log sampling.

Reference release rows:

- `docs/release/production-readiness-matrix.md`: contract, finance, audit log, and Go / No-Go rows.
- `docs/release/receivables-payments-idempotency-design.md`
- `docs/release/receivable-payment-delete-void-design.md`
- `docs/release/receivable-batch-generation-idempotency-design.md`
- `docs/testing/first-release-regression-plan.md`

## 2. Environment Classification

| Check class | Local | Pre-production | Production |
|---|---:|---:|---:|
| Engineering gate, syntax check, typecheck | Full execution | Full execution | Read-only evidence review only |
| Contract, receivable, payment, invoice, waiver smoke | Full execution with generated test data | Full execution with approved isolated test data | Not allowed by default |
| First-release leasing regression | Full execution with `TEST_RUN_ID` | Full execution with approved isolated `TEST_RUN_ID` | Requires explicit write-path approval |
| Finance read-only sampling | Optional | Required after release candidate deploy | Required |
| Audit-log sampling | Full automated plus manual sample | Full automated plus manual sample | Read-only sample only unless approved |
| Cleanup | Local reset or targeted cleanup is allowed | Targeted cleanup by marker after evidence capture | No cleanup needed for read-only; write-path cleanup requires approval |

Production default is read-only sampling. Any production check that creates, updates, applies, invoices, waives, voids, deletes, or retries a financial write must be treated as a production write path and must not run without approval.

## 3. Local And Pre-production Full Execution

Run from the repository root against a local or pre-production API that has migration, production-safe seed, bootstrap admin, and release baseline completed.

| Area | Command | Required evidence | Pass condition |
|---|---|---|---|
| Workspace gate | `pnpm typecheck` | Exit code, timestamp, branch, commit | Typecheck completes successfully |
| Contract core | `node scripts/e2e/s3c-contract-smoke.mjs` | Script log, smoke remark, created contract ids | Contract create, submit, approve, archive/effective, unit link, files, data-scope, and module guard checks pass |
| Contract lifecycle | `node scripts/e2e/s3e-contract-lifecycle-smoke.mjs` | Script log, smoke remark, lifecycle entity ids | Change, renewal, checkout, settlement, refund, contract logs, unit logs, and tenant 360 nodes pass |
| Receivables and payments | `node scripts/e2e/s3d-payment-smoke.mjs` | Script log, smoke remark, receivable/payment/application ids | Payment creation, application, over-apply rejection, receivable amount/status updates, aging, tenant 360 finance, status logs, and op logs pass |
| Waivers | `node scripts/e2e/s3d-waiver-smoke.mjs` | Script log, smoke remark, waiver ids | Waiver create, approve, reject, over-limit rejection, settled-receivable rejection, status logs, and op logs pass |
| Invoices | `node scripts/e2e/s3d-invoice-smoke.mjs` | Script log, smoke remark, invoice ids | Invoice create, update, delete, relation persistence, invoice status restoration, tenant 360 invoice summary, and op logs pass |
| Idempotency and delete/void | `node scripts/e2e/first-release-leasing.mjs` | `TEST_RUN_ID`, idempotency prefix, entity ids, replay/conflict logs | Missing-key rejection, first request, replay, conflict, duplicate prevention, failed retry, field protection, and delete/void protection pass |
| Cross-domain idempotency sample | `node scripts/e2e/first-release-idempotency.mjs` | `TEST_RUN_ID`, idempotency prefix, replay/conflict logs | Representative first-release write paths reject missing key, replay same-key same-payload, and reject same-key conflicts |

The task-specific validation for this plan only syntax-checks finance smoke scripts. A release execution run must still run the full commands above in the target local or pre-production environment before Go.

## 4. Production Read-only Sampling

Use approved production read-only or operator accounts. Do not create or mutate finance records during this sampling.

| Area | Read-only sample | Evidence fields | No-Go trigger |
|---|---|---|---|
| Contracts | Open contract list and at least three representative contract details, including one effective contract if present | URL or API route, record ids/codes, status, tenant, unit relation, sampled at, sampled by | Contract status, tenant, or unit relation is visibly inconsistent |
| Receivables | Sample receivable list, detail, status logs, overdue/aging if available | Receivable ids/codes, amount due, amount paid, amount waived, invoice status, status log ids | Amount/status mismatch or missing status log for known state transition |
| Payments | Sample payment list, detail, application relation if available | Payment ids/codes, amount, applied amount, unapplied amount, status, application ids | Applied amount/status mismatch or missing application relation |
| Invoices | Sample invoice list, detail, receivable relation if available | Invoice ids/codes, invoice amount, relation ids, linked receivable ids/status | Invoice relation missing or receivable invoice status inconsistent |
| Waivers | Sample waiver list and approved/rejected detail if available | Waiver ids, amount, status, linked receivable ids/status | Approved waiver not reflected in receivable amount/status |
| Financial summaries | Sample tenant 360 finance, aging, overdue, and invoice summaries | Tenant id, summary amounts/counts, sampled filter, sampled time | Summary visibly disagrees with sampled detail records |
| Audit logs | Query finance-related operation logs and status logs for sampled records | Audit log id, biz type, biz id, action, operator, operation time, request id if available | Critical write or protected failure has no audit/status trace |
| Idempotency evidence | Review pre-production/local replay/conflict logs and production application logs for absence of duplicate finance writes | Test run id, idempotency key prefix, route, response status, entity id count | Duplicate receivable/payment or idempotency conflict behavior failure is found |

Production read-only sampling is not a substitute for local/pre-production full execution. It verifies that the released target environment exposes coherent financial data and audit evidence without adding test data.

## 5. Production Write-path Approval Gate

Production write-path finance checks are blocked unless all fields below are recorded before execution:

| Required field | Required value |
|---|---|
| Release owner approval | Name, timestamp, and approved execution window |
| Finance owner approval | Name, timestamp, and accepted financial scope |
| Target account | Approved non-personal test/operator account; no real password in the record |
| Test data marker | `PROD-EVIDENCE-20260621-002-A2-FINANCE-GATE-<YYYYMMDDTHHMMSSZ>` |
| `TEST_RUN_ID` | Same marker or a marker with the same prefix plus a short random suffix |
| `IDEMPOTENCY_KEY_PREFIX` | `prod-evidence-20260621-002-a2-finance-gate` |
| Tenant and park scope | Approved `TENANT_ID` and `PARK_ID`, with confirmation that data is test-only |
| Allowed routes | Exact route list and expected mutation type |
| Cleanup owner | Name and rollback/cleanup decision authority |
| Cleanup method | Targeted cleanup or approved business reversal by marker; no truncate, reset, or hard-delete |
| Evidence retention | Script logs, response ids, audit logs, and cleanup proof retained in the release evidence pack |

Approved production write-path execution should prefer the smallest possible sample and must stop at the first No-Go trigger. Do not run broad finance smoke scripts against production unless the release owner explicitly approves the full generated data set and cleanup plan.

## 6. Test Data Markers

Required markers for local and pre-production full execution:

- S3 contract smoke: `S3C contract smoke <timestamp>`
- S3 payment smoke: `S3D payment smoke <timestamp>`
- S3 waiver smoke: `S3D waiver smoke <timestamp>`
- S3 invoice smoke: `S3D invoice smoke <timestamp>`
- First-release leasing: `TEST_RUN_ID=PROD-EVIDENCE-20260621-002-A2-FINANCE-GATE-<YYYYMMDDTHHMMSSZ>`
- Idempotency key prefix: `IDEMPOTENCY_KEY_PREFIX=prod-evidence-20260621-002-a2-finance-gate`

Every evidence record should capture the effective marker, not just the command. If a script generates its own timestamp or random suffix, copy the emitted test run id and the timestamped remark from the log into the evidence record.

## 7. Cleanup Expectations

Local cleanup:

- Local database reset is acceptable only in local development environments.
- Targeted cleanup can use generated remarks, codes, names, `TEST_RUN_ID`, and idempotency key prefixes.
- Preserve logs long enough to support the release evidence review.

Pre-production cleanup:

- Do not truncate, reset, or hard-delete shared pre-production data.
- Cleanup must target only records carrying the approved marker.
- Preserve financial audit evidence until the release owner and finance owner sign off.
- Soft-deleted or voided finance rows may remain as audit evidence if the finance owner accepts them.

Production cleanup:

- Read-only sampling requires no cleanup.
- Approved write-path cleanup must use approved business flows only.
- Do not delete or void records that acquired financial activity during the test unless the finance owner approves the exact reversal/void path.
- Do not remove audit logs.

## 8. Audit Evidence Fields

Capture these fields for each finance evidence item:

- Environment: local, pre-production, or production.
- Target API/Web base, without secrets.
- Branch and commit hash.
- Command or manual sampling method.
- Operator and approver.
- Timestamp with timezone.
- `TEST_RUN_ID`, smoke remark, and idempotency key prefix.
- Tenant id and park id.
- Route or page sampled.
- Entity ids and business codes for contract, receivable, payment, invoice, waiver, application, and unit records.
- Amount fields: amount due, amount paid, amount waived, invoice amount, payment amount, applied amount, and unapplied amount where relevant.
- Before/after statuses for writes.
- HTTP status, response request id, and server time where available.
- Audit log id, `biz_type`, `biz_id`, `action`, operator, operation time, and request id where available.
- Status log id and action for receivable/payment/contract/unit status transitions where available.
- Cleanup status and cleanup evidence if write-path data was created.

## 9. Finance Owner Sign-off

| Sign-off item | Required signer | Decision values | Evidence required |
|---|---|---|---|
| Local/pre-production full finance execution | QA/release owner | Pass / Fail / Waived with reason | Command logs and entity markers |
| Production read-only finance sampling | Finance owner | Pass / Fail / Needs follow-up | Sampled records and audit evidence |
| Production write-path approval | Release owner and finance owner | Approved / Rejected | Approval record, marker, scope, cleanup owner |
| Cleanup acceptance | Finance owner | Accepted / Rejected / Not applicable | Cleanup proof or read-only confirmation |
| Residual risk acceptance | Release owner and finance owner | Accepted / Not accepted | Open risks and owner/date |

The finance gate is not closed until the finance owner has signed off the production read-only sampling result or explicitly accepted a scoped residual risk.

## 10. No-Go Rules

Any item below is a release No-Go for the finance domain until fixed or formally descoped from the release:

- Duplicate receivable is created for the same contract, fee type, and billing period when replaying or retrying a finance write.
- Duplicate payment is created by same-key replay, quick retry, or same-payload duplicate-prevention checks.
- Missing idempotency key is accepted for a protected finance write path.
- Same key plus different payload does not return conflict behavior for covered finance routes.
- Same key plus same payload creates a second side effect instead of replaying the first result.
- Failed request retry replays as success for receivable/payment delete, update, apply, or batch generation.
- Paid, partially paid, waived, invoiced, voided, application-linked, or otherwise financially active receivable can be deleted through the normal delete path.
- Applied, partially applied, application-linked, voided, or otherwise financially active payment can be deleted through the normal delete path.
- Invoice create/update/delete fails to maintain receivable invoice status and invoice-receivable relation consistency.
- Waiver approve/reject fails to maintain receivable waived amount, status, or approval state.
- Financial summary, aging, overdue, tenant 360, invoice summary, or payment application detail visibly disagrees with sampled source records.
- Critical finance write, protected delete failure, invoice operation, waiver operation, payment application, or contract status transition has no audit log or status log evidence.
- Production write-path execution lacks release owner approval, finance owner approval, test data marker, cleanup owner, or cleanup plan.
- Production write-path cleanup fails or removes data outside the approved marker scope.

## 11. Release Decision

This document is a check plan, not completed execution evidence. The current gate status is `NOT VERIFIED` until:

1. Local or pre-production full execution passes.
2. Production read-only sampling passes.
3. Any production write-path sample, if requested, has approval and cleanup evidence.
4. Finance owner sign-off is recorded.

No production deploy, merge, push, database reset, destructive cleanup, or production finance write was performed while creating this plan.
