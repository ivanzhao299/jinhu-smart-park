# Trial Launch Finance Readiness Evidence

## 1. Scope

- Task ID: `TRIAL-20260621-001-A2-FINANCE`
- Batch ID: `TRIAL-20260621-001`
- Agent: `agent-2`
- Title: Trial launch leasing finance idempotency and audit evidence
- Branch: `agent-2-leasing-finance`
- Start HEAD: `6cf09bb chore(orchestrator): generate trial launch task queue`
- Environment: local API defaults, `http://127.0.0.1:3001/api/v1` for S3 smoke scripts and `http://localhost:3001/api/v1` for first-release scripts.
- Production write paths: not used.

This evidence pack covers the leasing finance rows in
`docs/release/production-readiness-matrix.md`: contracts, receivables,
payments, invoices, waivers, idempotency, and finance audit sampling.

## 2. Validation Results

| Command | Result | Writes Data | Matrix Coverage |
|---|---|---:|---|
| `git status --short` | Pass | No | Showed only claim-script queue/lock changes before task work. |
| `pnpm typecheck` | Pass | No | Engineering gate for changed evidence and current workspace. |
| `node scripts/e2e/s3c-contract-smoke.mjs` | Pass | Yes, local only | Contract creation, approval, archive/effective, unit links, files, quote conversion, expire filters, module gate. |
| `node scripts/e2e/s3d-payment-smoke.mjs` | Pass | Yes, local only | Receivables, payments, payment application, aging, tenant 360 finance, status logs, op logs, module gate. |
| `node scripts/e2e/s3d-waiver-smoke.mjs` | Pass | Yes, local only | Waiver create/approve/reject, over-limit and settled-receivable rejection, status logs, op logs. |
| `node scripts/e2e/s3d-invoice-smoke.mjs` | Pass | Yes, local only | Invoice create/update/delete, invoice receivable relations, receivable invoice status, tenant 360, op logs. |
| `node scripts/e2e/s3e-contract-lifecycle-smoke.mjs` | Pass | Yes, local only | Contract change, renewal, checkout, settlement, refund, contract action logs, unit status logs, tenant 360. |
| `node scripts/e2e/first-release-leasing.mjs` | Pass | Yes, local only | First-release leasing, receivable/payment idempotency, delete protection, duplicate prevention, financial field protection. |
| `node scripts/e2e/first-release-idempotency.mjs` | Pass | Yes, local only | Missing-key rejection, replay, and conflict semantics for representative first-release write paths. |
| `git status --short` | Pass | No | To be run again after completion recording. |

## 3. Test Data Markers And Cleanup

The write-path checks were executed only against local API defaults. No
production URL, production connection string, production seed, deploy, cleanup,
or destructive database operation was used.

The S3 smoke scripts create local records with timestamped remarks:

- `S3C contract smoke <timestamp>`
- `S3D payment smoke <timestamp>`
- `S3D waiver smoke <timestamp>`
- `S3D invoice smoke <timestamp>`
- `S3E contract lifecycle smoke <timestamp>`

The first-release leasing run reported test run id
`20260621T060040601Z-91faed0d`, creating names and codes that include
`20260621T060040601Z-91FAED0D` plus idempotency keys prefixed with
`first-release-regression`.

The first-release idempotency run reported test run id
`20260621T060045197Z`, creating `REGRESS` user/work-order markers that include
that run id.

Cleanup approach: local/pre-production smoke data can be removed by local
database reset or by targeted cleanup on `remark`, generated code/name prefixes,
and `TEST_RUN_ID` markers listed above. Some checks intentionally exercise
soft-delete behavior for receivables, payments, contract-unit links, and
invoices; those soft-deleted rows remain useful for audit inspection until the
local database is reset.

## 4. Evidence By Domain

### Contracts

Contract smoke passed creation, draft editing, submit, approve, archive,
effective, contract file upload/list/download, contract-unit link and soft
delete, occupied unit rejection, expired-window filters, lead and quote
conversion, duplicate quote conversion rejection, data-scope reads, and leasing
module disabled rejection.

Lifecycle smoke passed contract change preview, submit, approve, effective,
renewal conflict rejection, renewal draft creation, draft renewal rejection,
checkout submit/approve/effective, settlement preview and confirmation, refund
creation, over-refund rejection, terminated-contract change rejection, contract
action logs, unit status logs, and tenant 360 contract-change/checkout/refund
nodes.

### Receivables

The first-release leasing regression passed receivable generation missing-key
rejection, first request, replay, conflict, duplicate prevention on same-payload
requests, quick-repeat duplicate prevention, and failed-request retry behavior.

Manual receivable create/update/delete passed missing-key rejection, replay,
conflict, and no duplicate side effects. Financial field protection rejected
direct edits to `amount_paid`, `amount_waived`, `invoice_status`, `status`, and
`amount_due` without mutating existing values.

### Delete And Void Protection

Allowed receivable and payment deletes used idempotent soft-delete semantics:
missing key was rejected, first delete succeeded, replay returned the cached
response, conflict returned 409, and deleted records disappeared from normal
detail/list visibility.

Protected delete cases passed:

- Receivable with payment/application activity rejected delete and remained
  visible after retry.
- Payment with application activity rejected delete and remained visible after
  retry.
- Failed delete retries remained failed rather than replaying a successful
  mutation.

### Payments

Payment smoke passed normal-user create denial, invalid amount rejection,
payment creation, partial application, over-apply rejection, full multi-
receivable application, application list, receivable amount/status updates,
aging and overdue lists, tenant 360 finance summaries, payment status logs, and
operation logs.

The first-release leasing regression additionally passed payment create, update,
apply, and delete missing-key, replay, conflict, and duplicate-prevention paths.

### Invoices

Invoice smoke passed normal-user create denial, invoice amount-sum validation,
partial and multi-receivable invoice creation, invoice receivable relation
listing, receivable invoice-status updates, invoice update, invoice list query,
tenant 360 invoice summary, invoice delete with receivable invoice-status
restoration, relation persistence, and invoice operation logs.

### Waivers

Waiver smoke passed normal-user create denial, over-remain rejection, waiver
creation, reject-reason validation, approve flow, partial and full waiver
amount/status updates on receivables, settled-receivable waiver rejection,
reject flow persistence, waiver list query, waiver approval status logs, and
waiver operation logs.

### Idempotency

The leasing regression passed replay/conflict checks for contract create,
contract-unit link, contract effective, batch receivable generation, contract
receivable generation, manual receivable create/update/delete, payment
create/update/apply/delete, and protected delete retry behavior.

The first-release idempotency regression passed missing-key, first request,
replay, and conflict checks for `POST /users` and `POST /work-orders`.

`POST /leasing/receivables/generate-batch` passed local duplicate-prevention and
replay/conflict checks in this run. Future documentation should continue to
describe the actual current route behavior rather than assuming generic
guard-only idempotency is equivalent to replay/conflict coverage.

### Audit Sampling

Automated smoke checks verified:

- Receivable status logs for payment application, waiver approval, and invoice
  registration.
- Payment operation logs for create/apply.
- Waiver operation logs for create/approve/reject.
- Invoice operation logs for create/update/delete.
- Contract action logs for lifecycle operations.
- Unit status logs for checkout/effective unit release.

This is local automated audit evidence. Target-environment release still needs
approved read-only audit sampling after pre-production or production release
smoke.

## 5. Remaining Risks

- Evidence is local-only and does not prove production database, production
  seed, deployment health, file volume, backup, rollback, Docker cleanup, or
  target-environment audit readiness.
- Production write-path e2e remains prohibited unless a release owner approves a
  test account, test data marker, and cleanup plan.
- Local smoke data remains in the local database unless reset or targeted
  cleanup is performed.
- No business code, migration, seed, auth, CI, Docker, deploy, SMS, or WeChat
  runtime configuration was changed in this task.
- No merge and no push were performed.
