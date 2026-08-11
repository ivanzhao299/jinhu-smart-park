# Bug Analysis: Homestay asynchronous target and draft ownership

### 1. Root Cause Category

- **Category**: B/C/D/E — Cross-layer contract, propagation, test gap, and implicit assumption.
- **Specific Cause**: The page used current list membership as selected-detail ownership,
  “initialized once” as turnover-draft ownership, and one boolean as rate-target readiness.
  Those assumptions fail after server-side reordering, multi-operator writes, and selector
  changes between render and effects.

### 2. Why Fixes Failed

1. The prior detail fix reloaded after the generic list refresh, but the refresh could
   clear the target first. It fixed the happy path without modeling independent selection.
2. The prior consumable recovery retained local state whenever a task had ever been seen.
   It prevented accidental clearing but could not distinguish a clean cache from an active edit.
3. The prior cancellation confirmation captured only an ID and action, assuming the row
   remained visually obvious after the panel appeared.
4. Permission checks hid submit buttons but did not audit whether the remaining form
   controls still communicated false editability.
5. Error clearing was added for page refresh only; detail loading continued sharing the
   action-message channel.
6. Rate loading rejected late responses, but save readiness was not bound to the exact
   unit ID and could survive until the passive effect invalidated it.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Keep selected booking snapshot independent from visible page | DONE |
| P0 | Architecture | Bind rate readiness to exact loaded unit ID | DONE |
| P0 | State ownership | Track dirty turnover fields per task | DONE |
| P0 | Safety UI | Show booking identity in destructive confirmation | DONE |
| P1 | Error isolation | Separate detail, refresh, and action feedback | DONE |
| P1 | Permission UX | Disable mutable rate controls for read-only actors | DONE |
| P1 | Tests | Add pure state-transition tests and source contract assertions | DONE |

### 4. Systematic Expansion

- **Similar Issues**: Other paginated detail panels, server-backed editable drafts, and
  entity selectors with passive loading effects.
- **Design Improvement**: Every async form owns `{targetId, loadedTargetId, dirtyFields}`;
  every selected detail owns a stable snapshot separate from list pagination.
- **Process Improvement**: Review state ownership across list, detail, form, refresh,
  mutation, and multi-operator paths before requesting review.

### 5. Knowledge Capture

- [x] Updated the property-business executable contract.
- [x] Updated the cross-layer state-ownership checklist.
- [x] Added regression tests for page-independent detail, dirty refresh merge, exact
  rate target readiness, confirmation identity, read-only controls, and error clearing.
- [x] Audited sibling turnover drafts: consumables, exception, and linked work order.
- [x] Confirmed this application repository has no `src/templates/markdown/spec/`
  mirror to synchronize.
