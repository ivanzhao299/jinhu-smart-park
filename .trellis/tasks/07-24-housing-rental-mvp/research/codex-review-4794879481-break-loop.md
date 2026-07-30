# Codex Review 4794879481 Break-Loop Analysis

## Bug Analysis: Homestay Permission, Time, Replay, And Queue Consumers

### 1. Root Cause Category

- **Category C — Change Propagation Failure**: unit and turnover pagination were
  implemented at the request/state layer, but not traced through every permission-
  specific selector and post-mutation page state.
- **Category D — Test Coverage Gap**: the previous browser check used an administrator
  with one candidate unit and no open turnover tasks, so booking-only, read-only,
  final-item pagination, and exception-card behavior were not exercised.
- **Category E — Implicit Assumption**: frontend button visibility and idempotency
  middleware were assumed sufficient for lifecycle timing and credential replay,
  even though direct callers and retries with different keys remain possible.

### 2. Why Earlier Fixes Failed

1. The prior candidate fix verified that the API returned only valid short-stay
   units, but did not enumerate every role that consumes those candidates.
2. The prior turnover fix verified bounded `open` pagination, but not the reverse
   transition where an action removes the final row from the current page.
3. Credential issuance received an explicit rapid-click lock, but its sibling
   return action was not included in the same action-family audit.
4. The browser run verified layout and overflow with empty turnover data, so fields
   conditional on `exception` and execute permission were structurally tested only.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Enforce no-show time and credential terminal replay in the service transaction | DONE |
| P0 | Test coverage | Add policy, source-contract, real API replay, desktop, and 390px checks | DONE |
| P1 | Review matrix | Enumerate read/create/manage/execute consumers for every shared dataset | DONE |
| P1 | Pagination gate | Test removal of the last item on the last filtered page | DONE |
| P1 | Action-family audit | Review issue, return, revoke, complete, inspect, and exception siblings together | DONE |

### 4. Systematic Expansion

- **Similar issues**: filtered work-order queues, repair lists, checkout tasks, and
  approval inboxes can all retain an out-of-range page after state transitions.
- **Design improvement**: reusable list helpers should own page clamping, while
  backend services own temporal and terminal-state invariants.
- **Process improvement**: role-based acceptance must use at least one granular
  non-admin profile; empty-state visual checks do not validate conditional controls.

### 5. Knowledge Capture

- [x] Updated property-business executable contracts.
- [x] Updated the cross-layer review checklist.
- [x] Added regression tests for time, replay, permissions, and page clamping.
- [x] Confirmed no generated `src/templates/markdown/spec/` copy exists in this repository.
