# Candidate interview workflow

## 1. Scope / Trigger

Modern recruiting maintains repeatable, scoped candidate interviews: schedule, reschedule, record a completed result, cancel, and correct terminal evidence. This is a modern business contract. It does not establish original GroupWeb field/rule parity, score formulas, candidate-import replay, or real-role acceptance.

## 2. Signatures

`GET /hr/recruitment/candidates/:id/interviews?page&page_size`, `GET /hr/recruitment/candidates/:id/interviews/:interviewId`, and `GET /hr/recruitment/candidates/:id/interviews/:interviewId/history?page&page_size` require `HR_CANDIDATE_READ`. `POST /hr/recruitment/candidates/:id/interviews` and `PUT /hr/recruitment/candidates/:id/interviews/:interviewId` require `HR_CANDIDATE_MANAGE` and `IdempotencyInterceptor`. The service repeats permission checks before it starts any transaction. Migration `000358` owns the current and append-only history tables; it has no seed or backfill.

## 3. Contracts

The complete write snapshot has `expectedVersion`, `roundLabel` (1..120), `startsAt`, `endsAt`, `location` (1..240), `interviewerName` (1..100), `status`, `outcome`, `resultNotes`, and `cancellationReason`. Required strings trim and cannot be blank. Times are valid ISO timestamps with seconds and an explicit `Z` or numeric UTC offset; `endsAt > startsAt`. `scheduled` requires `pending` and both nullable fields `null`; `completed` requires `pass`/`fail`/`hold`, nonblank notes, and a null cancellation reason; `cancelled` requires `pending`, null notes, and a nonblank cancellation reason. Creates are scheduled version zero only. Completed/cancelled records can correct their own evidence but cannot become another status.

Every write locks the scoped non-deleted candidate, compares the current version, and saves the current row, one complete immutable history snapshot, and the required audit inside one actual `DataSource` transaction. List/detail/history reads are repeatable-read scoped transactions with required read audits. Detail is required for a conflict reread because a reschedule may move its record to another list page. Public rows omit actor user IDs and candidate contact/identity fields; history shows only its scoped actor display name.

## 4. Validation & Error Matrix

Missing/extra snapshot fields, fractional/no-offset timestamps, invalid date/time order, blank/overlong text, illegal state combinations, or bad expected version return 400. Missing permission is 403 before SQL. Foreign scope, soft-deleted candidate, or interview/candidate mismatch is a safe 404. A stale version returns 409 and writes no history. A required audit failure rejects the request and rolls back current/history. Database checks reject invalid current/history rows; the composite history foreign key rejects a mismatched candidate; history UPDATE/DELETE triggers reject mutation.

## 5. Good / Base / Bad Cases

Good: schedule version one, reschedule version two, complete version three, then correct completed notes/version four while all snapshots remain available. Base: an already hired candidate may still receive a historical correction; past dates and explicit external interviewer names are allowed. Bad: infer interview duration limits, schedule overlap rules, staff/user reads, candidate-stage changes, hiring, payroll, employee creation, messages, or an automatic conflict rebase.

## 6. Tests Required

`hr-candidate-interview.spec.ts` covers DTO strict timestamps/null omission/text limits, service state checks, terminal state protection, permission-before-SQL, pagination and required-audited detail. `hr-candidate-interview.pg.spec.ts` runs only with `HR_CANDIDATE_INTERVIEW_PG=1`, explicit isolation, loopback `127.0.0.1:15432`, and a `jinhu_hr_migration_lab_review_final_*` database supplied by root. It covers create/reschedule/complete/correct/cancel, full page-one history traversal, concurrent CAS winner/conflict, required write rollback and read rejection, scope/soft-delete/read-only rejection, database constraints/history immutability, and zero employee/payroll/message/stage effects. Root alone creates, migrates, executes against, and drops the isolated database.

## 7. Wrong vs Correct

Wrong: use the visible first list page as the conflict source, update a terminal record back to scheduled, or append history after the current/audit transaction commits.

Correct: fetch the scoped record detail for the comparison, retain the client intent until explicit conflict acknowledgement, preserve terminal status, and commit current row, complete history, and required audit atomically.
