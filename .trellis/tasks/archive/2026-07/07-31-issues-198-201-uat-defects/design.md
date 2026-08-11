# Design

## Root-cause map

1. #198 crossed the generic and domain-specific multipart contracts in one
   component. Build FormData through one pure helper that keys association
   fields off the actual upload route.
2. #199 violated ownership of JSON serialization. `apiRequest` remains the sole
   serializer; callers pass structured values.
3. #200 duplicated dictionary loading and coupled a business page to an
   administration endpoint. Replace it with the existing code-based loader.
4. #201 originally ended the create flow before the mandatory unit relation
   could be added. Current main already transitions into the unit tab; verify
   permissions and strengthen tests/documented contract instead of weakening
   the submit invariant.

## Compatibility and safety

- No database migration or production seed behavior change is planned.
- No permission broadening is planned; existing operator bundles are verified.
- API validation remains strict.
- Custom upload endpoints continue deriving `biz_type` and `biz_id` from their
  route/service adapter.

## Test strategy

- Pure unit tests for multipart fields and exactly-once JSON serialization.
- Source-contract tests for the three SLA codes and contract create-to-unit
  transition.
- Workspace lint/typecheck/build, relevant package tests, full E2E.
- In-app Chrome desktop and 390px inspection of floor upload, contract changes,
  SLA rule form, and contract unit linking when the local environment permits.
