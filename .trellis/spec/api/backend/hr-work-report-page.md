# Work-report bounded browsing

## 1. Scope / Trigger
Modern `/hr/work-reports` needs independent self/team authority and bounded records. Existing array endpoints remain compatible. This slice adds read endpoints only; draft/submit/return/resubmit/confirm writes, immutable submissions, notifications, audit and idempotency stay on the existing state machine. No DDL or permission changes.

## 2. Signatures
- `GET /hr/work-reports/me/page`: `HR_WORK_REPORT_SELF_READ`.
- `GET /hr/work-reports/team/page`: `HR_WORK_REPORT_TEAM_READ` OR `HR_WORK_REPORT_REVIEW`.
- `HrGoalReportService.reportsPage(scope, actor, query, team=false)` repeats exact authority before querying.
- `hrApi.workReportsPage(team, page, filters, token?, signal?)` is the Web adapter.

## 3. Contracts
`HrWorkReportPageQueryDto`: integer `page` 1..1,000,000, default 1; `page_size` exactly 20, default 20. Optional `report_type`: daily/weekly/monthly; `status`: draft/submitted/resubmitted/confirmed/returned.

Response: `{items: HrWorkReport[], total, page, page_size:20, summary:{pending,returned}}`. Pending counts submitted/resubmitted. Counts describe the complete same filtered scope, including unloaded pages. Items retain the existing safe projection and goal-suggestion numeric text (zero included).

Tenant/park and active employee/report filters apply before count and page. Self is a linked scoped employee; team is the existing active managed organization subtree. One REPEATABLE READ transaction covers count, stable `period_start DESC, create_time DESC, id DESC` page and batch suggestion query for current report IDs. Empty responses still require `recordHrSensitiveRead`; audit failure rejects the response. No new environment variables.

## 4. Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| Missing exact read atom | Forbidden before database access |
| Invalid page/size/type/status | Bad request before page query |
| Unlinked self account | Not found; no other employee fallback |
| Empty/high page | Empty items with accurate total and required audit |
| Required audit write fails | Reject response |
| One Web list fails | Other authorized list and draft remain usable |
| Optional goals fail/no exact goal read | Continue report operations; no unauthorized goal fetch |
| Write fails | Preserve draft/review decision/comment |
| Write succeeds, refresh fails | Keep committed notice; do not suggest repeat submission |
| Malformed page response | Visible read error and retry, no fabricated total |
| Identity/filter/page changes | Abort and ignore stale responses; remount identity state |

## 5. Good / Base / Bad Cases
Good: reviewer-only account sees scoped team pages without self or goal reads; 43 records produce 20/20/3 rows with accurate totals. Base: no matching reports gives zero summary and audited empty items. Bad: sibling organization, another tenant/park, deleted employee/report must never enter page or totals.

## 6. Tests Required
- `hr-work-report-page.spec.ts`: DTO/direct service bounds, exact atoms, empty audit/failure.
- `hr-work-report-page.pg.spec.ts`: independent PostgreSQL fixture, deterministic paging, recursive org scope, cross-scope/deleted exclusions, filtered totals, batched links/zero preservation; temp database cleanup. This query fixture does not replace full migration or state-machine acceptance.
- Existing goal/report contracts remain passing.
- `hr-work-report-bounded-workflow.test.tsx`: actual component role-only navigation, independent failures, stale responses, malformed/shrinking pages, exact write payload/zero, failed input retention, committed/read separation and identity changes.
- Desktop and 390px browser check with real component/global CSS: records visible, no overflow, controls >=44px. Synthetic evidence is not production role UAT.

## 7. Wrong vs Correct
Wrong: one unconditional `Promise.all` for self/team/goals, or reporting current-page length as total. Correct: independently authorized abortable paged loads and database filtered aggregate.

Wrong: `ds-mobile-record-list` alone as the only desktop record surface (globally hidden on desktop). Correct: retain shared DS card styling and add scoped `.workspace .records {display:grid;gap:12px;margin-top:16px}` for the all-width domain ledger. Global constrained-input selectors have higher specificity; the scoped 44px rule must match their exclusions and be checked by actual computed dimensions.
