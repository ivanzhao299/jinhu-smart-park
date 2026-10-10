# Approval Content Revision and History

Only an applicant with SELF_MANAGE may revise a draft or returned request. Load authoritative request version through history before opening a controlled editor. Title, description and reason are bounded/nonempty; type, applicant, subject and status remain fixed. Preserve edits after known rejection; freeze body/context/idempotency key for uncertain retry.

Use the parent approval write mutex for revision, create, review and submission. Disable section refresh and sibling actions while editing so a readback cannot remount the form and discard unsaved content. On confirmed revision publish the returned version before independent refresh; retain it through stale same-status responses. Changing context aborts history and discards drafts/late completion.

History is chronological and sequential on desktop and phone. Reuse DS record cards with local domain layout; avoid multi-column equal-height chronology and generic definition-list styles that squeeze Chinese labels. Show return opinion, edit reason and before/after content without inventing missing names or snapshots.

API contracts: POST /hr/approvals/:id/revisions accepts expectedVersion/title/description/reason; GET /hr/approvals/:id/history returns request plus stable ordered minimal action projection. Forward000353 appends snapshots and edit action only. Locked version check, request update and edit action are one transaction. History permits own records or permitted review scope; reviewer access excludes another applicant's draft and TEAM covers both applicant and subject. Required read audit must complete before response. Snapshot JSON is projected to title/description/version only.

Verify isolated real-PG upgrade, predecessor action preservation, concurrency, rollback, permission unions and audit failure; component/page tests include original-key retry, edit lock and stale version readback. Browser synthetic evidence and real production role acceptance remain distinct.
