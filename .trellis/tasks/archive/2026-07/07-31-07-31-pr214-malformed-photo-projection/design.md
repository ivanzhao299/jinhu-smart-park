# Bug Analysis: Partially malformed photo projection

## 1. Root Cause Category

- **Category**: D/E — Test Coverage Gap and Implicit Assumption
- **Specific Cause**: The boundary normalizer treated `Array.isArray` as sufficient
  proof of availability, then silently discarded non-string members. That
  display-oriented sanitization is unsafe for replacement payloads because it can
  convert unavailable runtime data into an intentional partial or empty replacement.

## 2. Why The Previous Fix Was Incomplete

1. It distinguished non-arrays from valid arrays but did not validate every array
   member before marking the projection available.
2. Its regression test encoded the lossy-filtering behavior instead of exercising
   the evidence-preservation invariant for mixed arrays.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Fail the whole replacement projection when any member is malformed | DONE |
| P0 | Test coverage | Cover `[null]` and `["file-id", null]` as unavailable | DONE |
| P1 | Documentation | Record strict replacement-array validation in Web and cross-layer specs | DONE |

## 4. Systematic Expansion

- **Similar Issues**: Any permission-aware or legacy array projection copied into a
  replacement-style form payload.
- **Design Improvement**: Availability validation must be lossless and precede
  display normalization.
- **Process Improvement**: Boundary tests must distinguish malformed, missing,
  explicitly empty, and valid non-empty projections.

## 5. Knowledge Capture

- [x] Updated the Web file-upload/form-control contract.
- [x] Updated the cross-layer replacement-field checklist.
- [x] Added regression coverage at the route-local boundary normalizer.
