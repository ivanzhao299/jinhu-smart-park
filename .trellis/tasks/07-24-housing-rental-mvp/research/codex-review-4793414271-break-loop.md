# Bug Analysis: Review 4793414271 invariant closure

## 1. Root Cause Category

- **Category**: B/C/D - Cross-layer contract, lifecycle invariant, and negative-test gaps
- **Specific Cause**: Validation and tests were organized around individual endpoints.
  They did not trace money through DTO, service, aggregate, and summary boundaries or
  enumerate every state transition that must preserve credentials, purchase transfers,
  and evidence references.

## 2. Why Earlier Fixes Did Not Prevent This Review

1. Exact decimal strings were added for lease and purchase creation, but settlement,
   deposit, checkout, and reporting paths still converted persisted values to `number`.
2. Charge-plan requirements existed as service guards but were not encoded in the DTO
   contract, so invalid requests survived request validation.
3. Booking cancellation and credential issuance did not share one aggregate lock and
   cancellation released occupancy without first revoking issued access.
4. Purchase voiding checked transferred lines, but refunding was treated as an unrelated
   payment-status transition even though it has the same financial dependency.
5. File authorization answered who may delete a file, but no invariant checked whether
   the owning workflow already relied on that evidence.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Money boundary | Keep housing monetary values as decimal strings and integer cents through settlement, deposit, checkout, and summaries | DONE |
| P0 | DTO contract | Make source-specific charge-plan fields conditionally required | DONE |
| P0 | Lifecycle | Revoke issued credentials before occupancy release and serialize issuance/cancellation | DONE |
| P0 | Finance | Apply transferred-line guards to refund and void | DONE |
| P0 | Evidence | Lock files and block generic deletion once referenced | DONE |
| P1 | Tests | Add extreme-cent, missing-field, lifecycle-order, transfer, and evidence-reference regressions | DONE |

## 4. Systematic Expansion

- For each persisted `numeric` field, trace HTTP input, transformation, computation,
  comparison, persistence, aggregation, and API output; a string-only first or last step
  is insufficient.
- For each terminal action, list every child resource that can outlive the aggregate and
  define whether it must be returned, voided, reversed, or retained.
- For each generic CRUD endpoint, check both actor authorization and domain reference
  state. Permission alone never authorizes breaking a finalized aggregate.
- When two transitions share a dependency, centralize the dependency query so a later
  action cannot silently omit it.

## 5. Knowledge Capture

- [x] Updated property-business financial and lifecycle contracts.
- [x] Updated protected file deletion contracts.
- [x] Added DTO and scaled-integer settlement regression tests.
- [x] Added booking credential ordering and referenced-evidence regression tests.
