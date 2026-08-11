# Codex Review 4793899770: Break-Loop Analysis

## Findings

The review exposed five boundary classes that ordinary happy-path tests did not cover:

1. A persisted six-decimal meter usage value was reused for money calculation, so
   rounding occurred before the final charge boundary.
2. Protected purchase-receipt authorization ran before the pending-list ownership
   query, making an uploader's unassociated files impossible to recover.
3. PostgreSQL nullable unique-key semantics allowed duplicate external order numbers
   when `channel_name` was null.
4. A refund changed payment state but the purchase-cost KPI filtered only approval state.
5. A turnover task could outlive its booking occupancy; shared availability and mode
   transition inspected occupancy but not the surviving operational constraint.

## Why Earlier Verification Missed Them

The existing checks proved ordinary values, forward lifecycle paths, and source
presence. They did not systematically cover rounding order, null members of composite
keys, unassociated transient records, reverse actions in derived projections, or a
dependent record surviving a later parent-state change.

## Prevention Contract

- Name every decimal rounding boundary and test a value that changes when rounding is
  moved earlier.
- Audit every nullable column used in a business unique key and execute the migration
  against PostgreSQL.
- Include pending/unbound ownership flows in protected-file API E2E.
- For every refund/void/cancel action, enumerate all KPIs and projections that consume
  the original record.
- Model operational constraints independently of occupancy when they can outlive it;
  test availability and mode transition after the parent occupancy is released.
- Prefer behavioral API/database regressions; source assertions are secondary guards.
