# Bug Analysis: Entity policy and route/filter context confusion

## 1. Root Cause Category

- **Category**: B/E — Cross-Layer Contract and Implicit Assumption
- **Specific Cause**: Two convenient derived booleans were reused beyond their
  ownership boundaries: the parent task photo policy was applied to child-result
  photos, and the effective overdue query state was treated as dedicated route
  context.

## 2. Why The Previous Fix Was Incomplete

1. Per-result availability was modeled correctly, but its permission source was not
   traced to the independent `inspect_task_result` policy defined by the migration.
2. Creation suppression used a boolean whose name represented both route context and
   mutable filtering, so the ordinary page lost capability when its filter changed.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Name and evaluate task/result policies independently | DONE |
| P0 | Architecture | Make the create helper accept explicit forced-route context | DONE |
| P0 | Test coverage | Assert independent policy entity and ordinary/forced route cases | DONE |
| P1 | Documentation | Record entity-policy ownership and route/filter separation | DONE |

## 4. Systematic Expansion

- **Similar Issues**: Nested aggregates with separate field-policy entities; shared
  pages where query filters and route modes overlap.
- **Design Improvement**: Capability decisions take named context objects rather than
  ambiguous derived booleans.
- **Process Improvement**: Trace each policy lookup to its migration entity/field key,
  and separate query state from persisted state and route-owned capability state.

## 5. Knowledge Capture

- [x] Updated Web field-control contract.
- [x] Updated cross-layer stateful-action checklist.
- [x] Added safety regression coverage.

## Validation

- Web safety unit tests: 9/9 passed.
- Web lint and typecheck passed.
- Web production build passed and generated 136 routes.
- Browser desktop/mobile inspection was skipped because the Chrome connector had
  already rejected the configured sandbox working-directory URI in this task.
