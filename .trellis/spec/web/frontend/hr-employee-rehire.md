# Formal Employee Rehire Surface

A departed employee remains an ordinary employee record. Link its detail to the
exact employee filter on `/hr/lifecycle#employee-rehire`; active employees do not
get a rehire entry. The lifecycle panel consumes `entryType=rehire` applications;
the recruitment panel filters `entryType=initial`. These are employment workflow
choices, not a division between legacy and modern data.

- Reuse the onboarding aggregate and public API. Use scoped, paginated rehire
  reference options instead of fetching all employee profiles or limiting choice
  to an arbitrary first set. Employee and manager searches preserve a selected
  employee and its loaded version across pages.
- Department/position/manager are explicit current assignments. Department changes
  clear the selected position. Manager null means the operator chose no manager.
  The old dates are visible historical facts, not fabricated prerequisites.
- Saving sends the chosen employee's loaded version, never an implicit/latest
  version read during submission. Editing a returned draft explicitly reloads
  current employee references before saving the refreshed application.
- Domain read controls mounting and every reference request. Mutation forms need
  onboarding manage plus employee manage and employment transition. Review uses
  park review authority; a maker does not see self-review controls. Confirmation
  uses employee manage/transition and is unavailable before the planned date.
  These UI gates do not replace server authorization.
- Key the child on employee and authenticated context. Abort stale requests on
  remount/unmount; clear previous rows on context/page changes. Reject a list
  response with an initial-entry row or a different employee under exact filtering.
- A failed save keeps the entered fields. Double submits are blocked for the full
  operation. A successful mutation remains successful if the subsequent list
  refresh fails; show refresh failure separately and allow refresh.
- Use shared DS panels, controls and scene-card surfaces. Rehire record text uses a
  single-column layout instead of the shared icon-leading grid. Cards must remain
  visible on desktop. Pagination buttons wrap as whole controls; avoid character
  stacking. Desktop and 390px browser checks must include no horizontal overflow.

Verify real component interactions for employee/version/assignment payloads,
search paging, exact employee filtering, failure retention, refreshed drafts,
park reviewer/maker separation, authority changes, cancellation and future dates.
Local synthetic browser evidence is separate from production role acceptance.

## Formal operation continuity

Rehire controls own complete drafts for names/dates/probation including0/card/remark and current assignments. Selected employee version remains the actual loaded version; editing explicitly refreshes employee options. All existing onboarding write adapters accept optional final idempotency keys without changing default prefixes. Pending unknown outcomes freeze original body/token/key/employee/application version; ordinary4xx reject definitively but the exact backend processing/reservation-changed409 messages retain the original operation. Disable competing edits/searches/pages while unresolved.

Existing application list and mutation projection expose stored application version, with no schema,backfill or rule changes. Rehire reads and mutation receipts require real positive versions; same-ID/employee/rehire target,state and version advancement must match before declaring success. Creation also matches frozen assignment/body. Confirmation requires actual confirmedAt. A success receipt is displayed before a separate refresh; an older/equal inconsistent list cannot erase it,while a genuinely newer version may replace it. Show actual review/confirmation times,card and remarks in the existing authorized scope; approval alone is not effective rehire.

Unmount or full auth/employee-context replacement prevents all late writes from launching further reads or affecting a new identity. Cover actualpublic service version projection and adapters plus retained/rejected/unknown/late/future/self-review component cases. Do not fabricate personnel production writes for acceptance.
