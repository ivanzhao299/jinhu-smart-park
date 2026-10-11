# Recruitment Requisition Continuity

`GET /hr/recruitment/requisitions/:id` and `:id/history` use full requisition read or scoped team-read. `PUT :id` and `:id/reference-options` require both `HR_REQUISITION_READ` and `HR_REQUISITION_MANAGE`; options are action-owned, enabled-only, scope-bound and paginated.

The PUT request is partial: omitted metadata preserves stored values. Only `positionId`, `plannedOnboardDate`, and `approvalNote` allow explicit null. It requires `expectedVersion` and a nonblank `changeReason`, compares the locked real requisition version, increments it on success, stores a complete frozen before/after snapshot, and records required body-free audit data in the same transaction. `HR_REQUISITION_VERSION_CONFLICT` identifies only stale CAS; `HR_REQUISITION_CODE_CONFLICT` identifies the active unique requisition-code collision.

Lifecycle is `draft -> open|cancelled`, `open -> paused|closed|cancelled`, `paused -> open|closed|cancelled`, `closed -> open`; cancelled is terminal. Reopening requires effective proposed headcount greater than hired count. Cancelling requires zero hires. Headcount cannot fall below hires. Organization or position cannot change after a hire. Definite domain rejections are `HR_REQUISITION_STATE_CONFLICT`, `HR_REQUISITION_HEADCOUNT_CONFLICT`, and `HR_REQUISITION_HIRED_REFERENCE_CONFLICT`.

Only changed references are revalidated under `FOR SHARE`; changing organization also validates an effective non-null position belongs to the new organization. An unchanged historical inactive organization, position, or owner remains valid for unrelated updates. Candidate conversion owns the candidate lock then requisition lock and advances `hired_count` plus requisition `version` atomically.
