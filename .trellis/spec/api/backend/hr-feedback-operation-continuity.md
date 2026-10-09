# 360 operation continuity

## 1. Scope / Trigger
A cycle manager could create cycles but the ordinary cycle GET requires read/team/self authority. Coupled workspace reads also hid usable assignments when unrelated options failed. Continue the existing feedback360-v2 business domain, configuration versions and anonymity rules without historical reimport.

## 2. Signatures
GET /hr/feedback360-v2/cycles/operation-context requires HR_FEEDBACK_CYCLE_MANAGE. Web feedback360CycleContext(token?,signal?) returns HrFeedback360Cycle[]. Seven existing operation POST adapters accept an optional final idempotencyKey; omitted keys retain original generation behavior. No schema, seed, role or write-domain changes.

## 3. Contracts
Exact cycle authority plus matching principal tenant/park precedes SQL, including super actors. Reuse ordinary scoped cycle query/projection and required metadata-only feedback read audit with operation-context path. UI independently owns tasks/cycles/options/pending/results with abort+generation. Original configuration component stays separate. Nomination UI offers only self/manager/peer/subordinate; collaborator remains unavailable until an authoritative collaboration source is implemented, as the existing backend rejects it. Existing task relation display can still represent it. Answer ratings retain the existing0..100/two-decimal DTO contract and explicit zero. Optional blank answers are omitted. Task/question codes and option references must pass response validation before writes.

## 4. Validation & Error Matrix
Unrelated permission or foreign scope ->403 before query. Required read audit failure ->reject entire read. Resource failure ->visible local retry, stale target cleared, other resources remain. Rejected writes preserve draft/reason. One synchronous operation writer blocks duplicate submit/target switch. Unknown/5xx/409 retry retains original key and payload; changed payload is blocked until original retry or explicit refresh/new operation. Definitive400/403/404/422 clears retry fingerprint/key. Successful write closes draft before refreshing; refresh failure reports committed success and warns against resubmission. Identity change aborts reads and ignores old completion.

## 5. Good/Base/Bad Cases
Good: RESPOND-only completes its own assignment without employee/options reads; CYCLE_MANAGE-only can create and activate through operation context. Base: published model/questionnaire immutable pairing, nomination separation and anonymous aggregate projection remain backend-owned. Bad: one denied options read globally hides tasks; React action reset loses a rejected answer; per-call keys make uncertain retries new requests.

## 6. Tests Required
Actual component tests cover independent failures, cycle-only activation, matching references, failed cycle/nomination/answer/rejection retention, zero/optional blanks, same-key payload preservation, synchronous writer, terminal tasks, precision, postcommit refresh failure and identity replacement. Actual adapters verify all seven caller keys and cancellation read. API tests cover exact atom/controller metadata, foreign super scope, scoped SQL, empty metadata audit and audit failure. Re-run original configuration and goal interactions after shared useHrResource extraction; HR regression and desktop/390px actual component browser. The existing employee options query is capped at500; this slice does not prove complete workforce selection. No new PostgreSQL test is claimed because original SQL and domain transactions are unchanged. Production-role and original-rule acceptance remain separate.

## 7. Wrong vs Correct
Wrong: grant ordinary READ to make a cycle manager continue, or mark synthetic browser results as production acceptance. Correct: exact operation read reuses existing scope/audit; preserve runtime and business acceptance evidence separately. Shared DS record cards stay visible at all widths and controls support44px minimum touch height.
