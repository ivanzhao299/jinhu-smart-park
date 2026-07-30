# Codex Review 4794293056: Break-Loop Analysis

## Bug Analysis: Integration Consumers and Self-Conflict

### 1. Root Cause Category

- **Category**: B/C/D/E — cross-layer contract, propagation failure, test gap, and
  implicit concurrency assumptions.
- **Specific cause**: the prior change added new shared blockers and a pending-file
  recovery endpoint, but did not enumerate the writer that creates a projection for
  the blocker itself or the production page that must consume the recovery endpoint.
  Existing rate and unit-selector UI also assumed one operator, one unit page, and
  safe hard-coded form defaults.

### 2. Why Earlier Fixes Failed

1. The turnover fix covered later booking cancellation but not checkout's task-first,
   occupancy-second order, so the new blocker rejected its own projection.
2. Pending receipt recovery was validated through API E2E only; the housing page was
   never reloaded after an interrupted upload.
3. Rate tests covered values and rounding, not concurrent first creation or edit-form
   hydration when the selected unit changes.
4. Booking pagination was checked, but its sibling unit candidate dataset retained a
   fixed first-page request.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
|---|---|---|---|
| P0 | Architecture | Pass exact source exclusions for self-representing shared projections | Done |
| P0 | Database | Use atomic upsert for first rate creation | Done |
| P0 | UI contract | Hydrate complete rate form and disable save until authoritative load | Done |
| P1 | Integration | Restore pending receipts in the production refresh path | Done |
| P1 | Pagination | Page unit candidates and synchronize selections | Done |

### 4. Systematic Expansion

- **Similar issues**: attachment drafts, operational tasks mirrored into occupancy,
  edit forms seeded from defaults, and all candidate selectors with fixed limits.
- **Design improvement**: treat recovery endpoints and shared projections as incomplete
  until every writer and production consumer is included in the flow map.
- **Process improvement**: review state-changing features with creation order,
  interrupted-session recovery, concurrent first write, and datasets larger than one page.

### 5. Knowledge Capture

- [x] Updated property-business backend contracts.
- [x] Updated backend and frontend upload contracts.
- [x] Expanded the cross-layer stateful-action checklist.
- [x] Added API and frontend regressions.
