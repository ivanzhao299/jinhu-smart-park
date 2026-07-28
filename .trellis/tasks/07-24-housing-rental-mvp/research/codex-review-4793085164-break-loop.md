# Codex Review 4793085164 - Break-loop record

## What escaped

The review found nine adjacent invariant gaps: non-online energy meters, writes
after lease termination, lease-money precision, unlocked occupant writes,
identical-period billing under a new idempotency key, voiding transferred
purchases, tenant-data exposure to finance-only readers, caller-created deposit
deductions, and stale signature references during activation.

## Root cause

The implementation treated several lifecycle checks as endpoint-local rules.
It did not maintain one action-by-state matrix covering sibling write paths,
reverse transitions, permission projections, and references that may change
between workflow steps. One outdated test contract also confused business
deduplication with transport-level idempotent replay.

## Why prior self-test did not catch it

Tests had been run, but they concentrated on successful end-to-end completion
and the exact defects from earlier reviews. They did not systematically pair
each allowed action with its closest forbidden state, revoke a referenced file
between workflow steps, test a finance-only reader, or distinguish a same-key
replay from a new-key request with the same billing period.

## Prevention contract

1. Define a state/action matrix for every lifecycle aggregate and apply terminal
   immutability to all generic and domain-specific writes.
2. Revalidate mutable references inside the transaction that consumes them.
3. Test both forward and reverse/void transitions when dependent records exist.
4. Keep transport idempotency separate from business uniqueness and overlap rules.
5. Define field-level response projections for each granular permission.
6. Preserve `numeric` money as decimal strings across every layer.
7. Require behavioral negative-path tests in addition to source-contract checks.

## Evidence added in this round

- DTO tests for exact lease rent and deposit strings.
- Real API E2E checks for stale signatures, identical billing periods, transferred
  purchase voids, manual deposit deductions, and final-lease writes.
- Service guards for online meters, final leases, attachment revalidation, and
  finance-only privacy projection.
- Updated property-business contracts and cross-layer action-matrix checklist.
