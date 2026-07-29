# Codex Review 4803235263 Break-Loop Analysis

## 1. Root Cause Category

- **B — cross-layer contract:** granular action permissions were separated in the UI,
  but the booking list/detail endpoints still required booking-read. The target record
  was therefore unreachable for action-only permission combinations.
- **C — change propagation failure:** backend turnover DTO fields for exception detail
  and consumables were implemented but never propagated to the production form.
- **D — test coverage gap:** pagination tests used fewer than one page of history;
  mutation tests refreshed the list but did not assert selected detail freshness.
- **E — implicit assumption:** generic cancellation and exception text was treated as
  sufficient audit evidence, and one message state was assumed to represent both
  refresh health and action feedback.

## 2. Why Previous Fixes Failed

1. The previous permission fix separated visible sub-controls but did not draw the
   permission graph from action button back to the list/detail endpoint that supplies
   its booking ID.
2. Terminal-detail browser validation proved that finance controls could render for an
   administrator; it did not test a custom permission combination without booking-read.
3. Existing E2E data had not reliably crossed the 20-record page boundary, so ascending
   historical ordering appeared harmless.
4. The turnover audit verified that an existing exception description could be read,
   but did not verify that the production UI could create a task-specific description
   or submit consumables.
5. `runAction` refreshed the booking list, which looked correct visually, while the
   separately cached ledger summary remained stale.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Enforce booking-read plus action permission on every booking-bound write | DONE |
| P0 | UI safety | Require confirmation and real reason for cancellation/no-show | DONE |
| P0 | Test coverage | Rank operational bookings first and assert page-one reachability beyond history | DONE |
| P0 | Data round trip | Expose and E2E-test turnover exception and consumables payloads | DONE |
| P1 | State model | Separate refresh failure from action feedback and reload selected detail after mutation | DONE |
| P1 | Concurrency | Add synchronous locks and stable retry keys to booking and turnover actions | DONE |

## 4. Systematic Expansion

- **Similar issues:** every workflow permission must be checked against the list/detail
  endpoint that supplies its target ID, not only against the mutation endpoint.
- **Design improvement:** operational forms must be derived from the complete MVP DTO,
  including optional fields that carry audit or cost meaning.
- **Process improvement:** pagination acceptance requires datasets larger than one page;
  mutation acceptance requires both list and selected-detail projections.
- **Review improvement:** destructive actions are incomplete until consequence,
  confirmation, reason, replay behavior, and post-action refresh are all tested.

## 5. Knowledge Capture

- [x] Updated the property-business code-spec with composite permissions, ordering,
  refresh, destructive-action, exception, and consumables contracts.
- [x] Updated the cross-layer checklist with permission-graph, payload-consumer,
  destructive-confirmation, and projection-refresh checks.
- [x] Added frontend behavioral/source regressions and real API E2E assertions.
- [x] Audited the current homestay surface across permissions, pagination, refresh,
  booking terminal actions, and turnover forms.

No mirrored project-specific template exists under `src/templates/markdown/spec/` or
`.trellis/templates/`, so there is no template copy to synchronize.
