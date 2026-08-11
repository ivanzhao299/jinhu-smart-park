# Codex Review 4792838349 — Break-loop record

## What escaped

The review found eleven boundary failures across deposit accounting, decimal precision, billing-period overlap, charge-plan concurrency, identity mutation, occupancy replacement, early checkout reporting, business-file authorization, and idempotent response serialization.

## Root cause

The PR spans a large cross-domain surface, while earlier checks concentrated on happy-path lifecycle completion and source-pattern assertions. Several invariants were implemented in one entry path but not its sibling path, such as occupancy creation versus period replacement. Other failures appeared only across layers: numeric strings became JavaScript numbers at the DTO or recharge boundary, generic file permissions bypassed domain permissions, and `Date` objects were altered only when a response entered the idempotency cache.

## Why prior self-test did not catch it

Self-tests were run, but the scenario set was incomplete. The previous suite verified that main workflows worked; it did not systematically exercise equivalent entry types, overlapping rather than identical periods, near-boundary decimals, post-creation configuration changes, generic endpoint bypasses, or cached responses with non-plain objects.

## Prevention contract

Before pushing a property-business change:

1. Build an invariant matrix across create, update, activate, replace, retry, and generic access paths.
2. Test adversarial neighbors: overlap versus equality, type changes without companion fields, early completion dates, and unauthorized generic routes.
3. Keep financial decimal values as strings or scaled integers end to end.
4. Put concurrency invariants in both a transaction lock and a database constraint.
5. Treat file-center permission as necessary but insufficient for business attachments.
6. Include at least one real database/API E2E assertion for each changed financial or occupancy invariant.
7. Use source-contract tests only as a supplement to behavioral and database tests.

## Evidence added in this round

- Exact decimal DTO and arithmetic tests.
- Deposit-payment normalization and overlapping-period assertions in the real housing API E2E.
- Database migration checks for charge-plan uniqueness and billing-period exclusion.
- Business-file permission and unit-scope tests.
- Cached `Date` response test.
- Source regression checks for identity clearing, occupancy replacement, and early-checkout dashboard semantics.
