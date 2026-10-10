# Job Change Operation Continuity

Use the dedicated `/hr/job-change-applications` workflow for formal transfer, promotion, demotion, rotation and organization change. Generic `/hr/approvals` status is not a formal assignment result. Approved means pending authorized application on/after the effective date; applied means employee assignment, employment event and application/action were committed together.

`JobChangeApplicationsPanel` preserves controlled draft values, captures a write body/token/idempotency key, uses a synchronous mutex, and retries the original request after an unknown outcome. A confirmed write is rendered before list refresh; failed or stale refresh must not undo it. Existing application version distinguishes stale same-status edit readback. Full user context replacement clears old drafts and suppresses late completions.

Return requires an actual nonempty review opinion, displayed to the applicant. `JobChangeHistory` reads the dedicated endpoint lazily, cancels outdated reads, and displays the stable action sequence with actual comment and minimal actor display name. Do not invent past content snapshots. Unknown action/status labels preserve the source value.

History follows the existing dedicated list park/team/self scope and tenant/park predicates, requires read audit, and exposes no employee snapshots or credential fields. Existing formal apply transaction must reject incompatible current employee status or assignment drift before writing.

Use shared DS forms and visible record cards, with chronological history on desktop and390px. Validate return→edit→resubmit and approved→applied independently from real production role acceptance. Real isolated PostgreSQL establishes transaction behavior; no production test HR mutations.

Job-change employee selection uses shared `HrEmployeeSelection` purpose `job_change` and `/hr/job-change-applications/employee-options` with job-change manage permission and the existing park/managed-organization scope. Search and20-row paging must reach all eligible employees, including beyond500, with strict decimal page parameters, literal wildcard handling and required read audit. Preserve the selected employee and draft through paging/search/errors. Modern clients request `/options?include_employees=false` to avoid the legacy500-row employee batch while old callers retain its default response.
