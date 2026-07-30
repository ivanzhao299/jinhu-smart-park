# Codex Review 4796911414 Break-Loop

## Findings

The review exposed four sibling-contract gaps:

1. Homestay booking writes trusted an enabled short-stay configuration without also
   requiring the underlying unit row to remain active.
2. Check-in trusted the booking status and stored occupancy ID without proving that the
   exact occupancy was still active after a supported force release.
3. Each nightly rate fit `numeric(18,2)`, but their exact sum could exceed the booking
   total column before persistence.
4. Booking rows obtained their unit label from the current candidate page, so historical
   or off-page bookings fell back to a UUID.

## Root Cause

- **Boundary incompleteness:** operation configuration and unit lifecycle were treated as
  one bookability signal even though they can change independently.
- **Lifecycle incompleteness:** occupancy existence at confirmation was treated as durable
  authorization for check-in, despite a supported administrative force-release path.
- **Aggregate incompleteness:** exact decimal parsing was covered, but the target column
  bound was not rechecked after summing multiple valid values.
- **Projection incompleteness:** stable row identity was fixed for housing leases and
  turnover tasks but was not applied to the sibling booking list.

The previous review round added a sibling-parity release gate, but the new gate was
documented after the named fixes and was not retroactively executed against every existing
homestay lifecycle and list path before requesting review again.

## Prevention

- Treat active unit status, operation mode/status, and exact active occupancy as separate
  lifecycle invariants and check each invariant at every state-advancing write.
- Keep generic occupancy create/activate/period-replacement rules aligned with owning
  domain workflows.
- Validate exact aggregate values against their persistence column after calculation and
  before the first write.
- Make every operational list row own its human-readable identity independently from
  selector pages and active-candidate filters.
- Require adversarial real-API checks for inactive units, force-released occupancy,
  aggregate overflow, and off-page/historical labels before another review request.
- Do not treat updating this document or a spec as completion until the current diff has
  been audited and tested against the resulting matrix.
