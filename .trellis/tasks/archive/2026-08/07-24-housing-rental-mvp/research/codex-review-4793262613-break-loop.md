# Bug Analysis: Review 4793262613 cross-layer gaps

## 1. Root Cause Category

- **Category**: B/C/D - Cross-layer contract, change propagation, and test coverage gaps
- **Specific Cause**: Exact lease money was preserved at HTTP and persistence boundaries,
  but billing converted it back to JavaScript `number`. Guest terminal-state validation
  was added without serializing the guest write against lifecycle transitions. Housing
  repair files reused a generic work-order type whose authorization was broader than the
  housing workflow, and unitless purchase references were incorrectly treated as needing
  no property-scope check.

## 2. Why Fixes Failed

1. **Incomplete propagation**: The prior money fix stopped at storage instead of tracing
   the value through proration and receivable creation.
2. **Surface state check**: Guest registration checked terminal status but did not lock
   the same aggregate row used by terminal transitions.
3. **Infrastructure reuse assumption**: Shared upload policy was mistaken for shared
   authorization; `workorder_create` could not express housing-specific access.
4. **Null-scope assumption**: A missing unit was interpreted as unrestricted access
   instead of a project-wide record requiring unrestricted scope.
5. **Historical-file review noise**: The timezone comment targeted migration `000176`,
   while forward migration `000179` already replaces both functions. Editing the applied
   migration would violate the repository migration policy.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Use exact rational month fractions and integer cents for fixed billing | DONE |
| P0 | Concurrency | Lock aggregate rows for child writes that terminal transitions must close | DONE |
| P0 | Authorization | Assign protected domain file types instead of generic workflow types | DONE |
| P0 | Data scope | Treat null unit references as project-wide, not scope-free | DONE |
| P1 | Review process | Evaluate the latest forward migration before changing historical SQL | DONE |
| P1 | Tests | Add boundary-money, booking-lock, file-permission, and unitless-scope regressions | DONE |

## 4. Systematic Expansion

- **Similar Issues**: Other persisted decimal strings may still enter approximate
  calculations; every financial calculation needs an end-to-end representation audit.
- **Design Improvement**: Business attachment type must own both upload policy and
  authorization policy; these are separate contracts.
- **Process Improvement**: For every terminal status guard, list all child-write paths
  and verify they lock the same aggregate. For migration review, inspect later
  `CREATE OR REPLACE` migrations and live function definitions.

## 5. Knowledge Capture

- [x] Updated property-business financial, concurrency, and attachment contracts.
- [x] Updated backend file-upload authorization contracts.
- [x] Updated the cross-layer exact-calculation and protected-type checklist.
- [x] Preserved forward-only migration history and strengthened `000179` verification.
