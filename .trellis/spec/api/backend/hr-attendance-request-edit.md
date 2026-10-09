# Attendance request continuation

## 1. Scope / Trigger
An employee must correct a draft or returned request and continue the same approval. This is modern ongoing operation, with no historical replay, DDL, role grant, payroll mutation or terminal rewrite.

## 2. Signatures
PUT `/hr/attendance/requests/:id`, exact HR_ATTENDANCE_REQUEST, UUID parameter, IdempotencyInterceptor and body-free AuditLog. UpdateHrAttendanceRequestDto extends create fields with positive integer expectedVersion; type is immutable. List/detail may return `editVersion` only for own requests with exact REQUEST/super/wildcard authority; ordinary projections never expose raw version.

## 3. Contracts
Lock employee -> owned nondeleted request -> approval within tenant/park. Only draft/returned and matching expectedVersion; approval must match state and both employee identities. Reuse server timing and nonblank reason validation. Preserve request ID/number/type/source lineage, prior reviewer/comment and approval linkage. Explicit save does not submit; original submit/resubmit/review transitions remain authoritative. Required transactional operation audit records before/after timing and version plus reasonChanged; free-text reasons remain absent from generic audit. This audit proves a change occurred and its time/version, but does not preserve past reason text. Existing approval action table has no edit action; never bypass its action constraint or misuse comment to store content. Required-audit failure rolls back both aggregates.

Web uses real 30-row page/total and Abort/generation-owned reads; filters immediately clear old results, stable server sort is create_time/id descending. Exact REQUEST + self + draft/returned permits editing/submitting; exact APPROVE + other + submitted permits review. Target/version are frozen in selected operation; returned feedback remains visible. Local datetime round-trip uses local calendar components then ISO conversion. Explicit submit preserves failed draft; synchronous write ref disables duplicate submissions and all queue/target switches. Stable operation idempotency key survives unknown transport/5xx/409; definite 400/403/404/422 permits correction. Write success closes completed form before independent refresh, whose failure cannot revert success. Parent identity remount clears scope and drafts.

## 4. Validation & Error Matrix
| Condition | Result |
| --- | --- |
| No REQUEST | Forbidden before transaction |
| Other owner/tenant/park/deleted | Safe not found |
| Submitted/approved/cancelled | Conflict |
| Changed request type or invalid timing | Bad request |
| Stale version or drifted approval | Conflict without overwrite |
| Concurrent saves same version | One success, one conflict |
| Audit failure | Full rollback |
| Old filter response | Ignored after abort/generation change |
| Unknown write result | Exact-key retry; changed payload is not silently resubmitted |
| Follow-up read fails | Keep committed success and refresh warning |

## 5. Good / Base / Bad Cases
Good: returned leave request is edited under the same ID/version, resubmitted and approved through original chain. Base: correction request keeps zero duration and only a date. Bad: cancel/recreate instead of supplement, overwrite approved facts, mint new keys for every unknown-result retry, or show an edit action using broad read permission alone.

## 6. Tests Required
Real isolated PostgreSQL fixture applies original approval/request/lineage migrations; covers own/foreign scope, type immutable, concurrent version conflict, required audit rollback, approval drift, returned edit-resubmit-approve and terminal rejection. Random database is dropped; separate disposable lab only. Unit contract verifies exact decorators, DTO/timing, own-operation token projection and body-free audit. Actual component interactions cover read-only/own/team, edit/version/local time/date-only correction, retained failures/stable key, writer lock, paging, stale response, review and success with failed refresh. API/Web lint/typecheck/build, HR regression and shared CSS desktop/390px actual-component inspection required. Synthetic checks do not prove actual-role UAT or full old-system rule equivalence.

## 7. Wrong vs Correct
Wrong: add 'edit' to old approval-action data without a migration, expose internal version on every read, or reset a failed editor. Correct: use existing required transactional audit, explicit own-operation editVersion and retained explicit-submit forms.
