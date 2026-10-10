# HR Approval Operation Continuity

## Scope
`HrApprovalsClient.tsx` uses existing approval endpoints only. Approval state/audit does not establish employment, profile or payroll effects. Returned-request editing and action-history viewing require separate business work.

## Permissions
Read/create/self actions require `HR_APPROVAL_SELF_MANAGE`; pending/review accept `HR_APPROVAL_PARK_REVIEW` or `HR_APPROVAL_TEAM_REVIEW`. Do not call an endpoint without its permission. Backend retains team scope and maker/checker enforcement.

## Independent reads
Mine and pending have independent loading/error/refresh state and abort signals. Context generations discard late reads/writes. Replacing context clears drafts, unresolved operations and write locks. A previous operation must not unlock a newer operation.

## Writes and retries
Use controlled forms and a synchronous ref mutex. Freeze target, action, body, context and idempotency key for uncertain writes; retry the original request. Known rejection retains editable form content. Validate success target/status and create payload before publishing.

## Confirmed state
Publish confirmed success before independent refresh. Abort the preceding section read; retain confirmed mine records/status and hide reviewed pending IDs until readback acknowledges them. Stale or failed refresh must not reverse a confirmed operation.

## Layout
Use shared `ds-mobile-record` with the existing always-visible `employeeRecordList` grid for approval records. `ds-scene-card` expects an icon/copy two-column structure; placing title/description/form directly into it narrows text into the icon column. Verify actual compiled component on desktop and 390px phone width.

## Verification
Interaction tests cover permission separation, independent failures, form retention, mutex/original-key retry, invalid responses, late context completions, stale/failed readback and cross-context lock ownership. Local synthetic browser evidence is separate from real-role production acceptance.
