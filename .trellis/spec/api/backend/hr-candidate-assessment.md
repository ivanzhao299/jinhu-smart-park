# Candidate assessment continuity

## 1. Scope / Trigger
Formal candidates maintain the original desktop salary.accept assessment fields. This is source-field storage/edit/history parity; it does not prove GroupWeb Rec_tInterArrange scheduling, interview result reports, original scoring weights, historical candidate import or actual HR acceptance.

## 2. Signatures
GET /hr/recruitment/candidates/:id/assessment; GET /hr/recruitment/candidates/:id/assessment-history?page&page_size; PUT /hr/recruitment/candidates/:id/assessment with IdempotencyInterceptor. Existing HR_CANDIDATE_READ authorizes reads; HR_CANDIDATE_MANAGE authorizes maintenance. Both controller and service enforce permissions. Migration000357 adds hr_candidate_assessment and hr_candidate_assessment_history without backfill or seed.

## 3. Contracts
The full write snapshot contains expectedVersion and all14 nullable fields. heartTest/heartMemo, knowledgeTest/knowledgeMemo, jobTest/jobMemo, assignmentTest/assignmentMemo map hearttest/heartmemo, knowledgetest/knowledgememo, jobtest/jobmemo, assignmenttest/assignmentmemo. Scores are signed numeric(18,0) strings. knowhowTest/knowhowMemo, faceTest/faceMemo and totalTest/totalTestMemo map knowhowtest/knowhowmemo, facetest/facememo and totaltest/totaltestmemo; scores are signed numeric(18,2) strings (at most16 integer digits and2 decimals). Evaluations are at most200 characters. Null means cleared; "0" is a score. Total is manual; no invented range, formula, weight or stage transition.

No saved assessment returns version0 and explicit null fields. Writes lock the scoped non-deleted candidate, compare expectedVersion, then save current snapshot, append-only complete history and required audit in one actual transaction. Audit failure rolls all writes back. Reads use a consistent transaction and required audit before responding. History exposes version, complete fields, id/time and scoped actor display name; no actor identity IDs/contact fields. History update/delete trigger rejects edits. Scores stay strings across SQL/API/Web without JavaScript numeric conversion. SQL projection columns in joins must be alias-qualified. TypeORM PG UPDATE RETURNING returns [rows,rowCount], unlike INSERT rows; normalize before projecting the snapshot.

## 4. Validation & Error Matrix
Invalid score precision, number instead of string, missing full-snapshot field, extra field or long evaluation ->400. Missing permission ->403 before DB access. Foreign scope/deleted candidate ->safe404. Stale expectedVersion ->409 with no history added. Required audit failure ->request failure and atomic rollback. History mutation ->append-only database failure. Reads and writes cannot change candidate stage, employee, payroll or messages.

## 5. Good/Base/Bad Cases
Good: two writers save version1; only one creates version2. Base: no previous score renders empty, an explicit "0" survives reload. Bad: coerce18-digit score to Number, silently round3 decimals, calculate an unverified total, or rebase an uncertain retry to a new version/key.

## 6. Tests Required
hr-candidate-assessment.spec.ts checks exact DTO boundaries/null/omission/extra fields and permission rejection before queries. hr-candidate-assessment.pg.spec.ts uses actual DataSource transactions against root-owned full migrated isolated DB: concurrent winner/conflict, second UPDATE RETURNING shape, precision/clear/page_size1 traversal, required audit rollback/read rejection, immutable history, scope/deletion/permissions and zero unrelated-domain effects. Harness must require loopback15432, explicit isolation and unique jinhu_hr_migration_lab_review_final_* DB name; root drops database and proves residual0. Frontend interaction/browser tests separately prove drafts/retry/conflict/role/layout; synthetic data is not real-role production proof.

## 7. Wrong vs Correct
Wrong: `const score = Number(input); const saved = (await manager.query(updateReturning))[0];` loses numeric precision and returns an array for UPDATE.
Correct: retain the validated string, unwrap the driver-specific UPDATE rows, and assert returned version in an actual PostgreSQL second-update test. Keep current/history request generations independent, preserve original expectedVersion/key after uncertain save, and require explicit server-versus-draft comparison before rebasing a conflict.
