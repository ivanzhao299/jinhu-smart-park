# Bug Analysis: Per-result inspection photo preservation

## 1. Root Cause Category

- **Category**: B/C/D — Cross-Layer Contract, Change Propagation Failure, and Test
  Coverage Gap
- **Specific Cause**: The previous preservation fix covered only the task-level
  check-in attachment. The repeated `results[]` aggregate still collapsed each
  projection to a display string, unconditionally serialized it as a replacement,
  and defaulted omission to `[]` in the service.

## 2. Why The Previous Fix Was Incomplete

1. Availability was modeled as one task-level state instead of a property of every
   replacement-capable attachment field in the submitted aggregate.
2. API preservation logic was added only to check-in and was not propagated to
   existing result updates.
3. Tests covered the single check-in field but not repeated result entries.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Store availability in each `ResultInput` and conditionally serialize each field | DONE |
| P0 | API contract | Resolve omitted result photos against the matching persisted result | DONE |
| P0 | Test coverage | Cover omit/preserve, explicit empty, explicit replace, and new-result defaults | DONE |
| P1 | Documentation | Require replacement semantics for every nested aggregate member | DONE |

## 4. Systematic Expansion

- **Similar Issues**: Any repeated child form whose optional replacement fields are
  projected through permissions or legacy data.
- **Design Improvement**: Availability belongs beside the exact child value it
  qualifies; a parent-level flag cannot represent heterogeneous child projections.
- **Process Improvement**: When fixing a replacement field, enumerate top-level and
  nested sibling occurrences across the complete payload.

## 5. Knowledge Capture

- [x] Updated Web and API attachment contracts.
- [x] Updated the cross-layer stateful-action checklist.
- [x] Added Web and API regression tests.

## Validation

- Web safety unit tests: 7/7 passed.
- API unit tests: 463/463 passed.
- Web and API lint, typecheck, and production builds passed.
- Web build generated 136 routes.
- Browser desktop/mobile inspection was skipped because the Chrome connector rejected
  the configured sandbox working-directory URI before establishing a browser session.
