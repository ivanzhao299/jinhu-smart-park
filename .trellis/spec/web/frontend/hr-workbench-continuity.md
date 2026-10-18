# HR workbench independent reads and scope continuity

- Render the outer HR module/dashboard PermissionGuard before mounting any data-reading workspace. Key the workspace by the complete current user authorization context so changing user, tenant, business scope or permissions synchronously discards previous metrics.
- Derive business navigation from existing permissions, independently of metric request state. A slow metric must never remove authorized business entry links.
- Create lazy metric jobs; publish each success, error or unavailable result independently. Every job reads the current access token at invocation. Use the endpoint authorized for the exact displayed business capability; preserve unrelated modules and server scope. Work-report stats use the modern bounded page contract below.
- Track generations separately per metric and invalidate on replacement/cleanup. Check current mount and generation both before starting delayed jobs and before publishing any resolved/rejected result. React StrictMode cleanup/setup must not revive old requests. A fetch cancellation flag alone is insufficient where API methods lack signal support.
- Refresh supersedes pending metrics; local retry calls only its module. Clear previous values while obtaining new values. Failed and inaccessible metrics remain visible with accurate messages and local retry. Never display an all-clear assertion while an authorized metric is still loading, errored or inaccessible. Qualify the empty summary to loaded indicators.
- Reuse shared DS cards/buttons. Retry buttons occupy their own grid row and retain 44px touch height. Inspect desktop and 390px-class actual component rendering.
- Controlled-promise component tests cover immediate navigation, independent outcomes, local retry call counts, slow siblings, refresh/retry ordering, identity/scope/permission/module changes, unmount and StrictMode. No real payroll calculation or business acceptance follows from these UI checks.

## Work-report business entry and full-scope pending counts

- Work-report statistics require the page atom plus exact SELF_READ for own returned, or TEAM_READ/REVIEW for managed-team pending. Legacy SELF_MANAGE/TEAM_REVIEW are not read authority for these endpoints.
- Both readable scopes create independent jobs and metric states; team authority must not hide personal returned reports. Keep one clear work-report business-navigation entry. Page+DRAFT/SUBMIT may show that entry without reading or inventing any statistics.
- Reuse `hrApi.workReportsPage(team,1,{},token)` and `assertWorkReportPage`; use complete `summary.returned` or `summary.pending`, never filter/count the first20 items or fetch unbounded legacy arrays. Pending includes submitted and resubmitted.
- Validate safe nonnegative disjoint summary counts: pending+returned cannot exceed total. Invalid/failed responses remain individually retryable, not zero or all-clear.
- The actual work-report page must place the module/page guard outside the identity-keyed data workspace, so denied page access cannot mount data-reading hooks or retain a draft. Operation-only navigation does not grant read or review authority.

## Approval team entry and existing scope precedence

- Approval statistics and business entry require `HR_APPROVALS_PAGE`. Pending authority accepts exact `HR_APPROVAL_PARK_REVIEW` or `HR_APPROVAL_TEAM_REVIEW`; `HR_APPROVAL_REVIEW` is already the same literal as park review, not a separate role.
- Review authority takes precedence over `HR_APPROVAL_SELF_MANAGE` for the single approval indicator. Use `pendingApprovals` for park/team/mixed reviewers and count actual `submitted` rows: the service queries that status and the safe projection preserves it. Only self-manage-only uses `myApprovals` and counts draft/submitted rows. Do not use the obsolete `pending` status to fabricate zero for actual submitted requests. Do not sum self/team data or describe the returned queue as an unbounded total.
- Keep navigation available while its lazy metric loads. Missing page/module/dashboard grants must prevent approval reads. Apply the same local retries, latest token, per-key generations and identity replacement safeguards as other workbench metrics; preserve the independent work-report scopes.
- Tests must distinguish TEAM_REVIEW-only, park and compatibility aliases, self-only, mixed review priority, missing page, independent failure and late scope/revocation results.
