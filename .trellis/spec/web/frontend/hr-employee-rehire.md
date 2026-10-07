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
