# Design — M-03 shared control-plane E2E

## Shape

- Add one child suite aligned with the existing homestay/housing HTTP runner conventions.
- Reuse the existing disposable property API fixtures and only extend them where a direct shared-control-plane actor/object is required.
- Use product APIs for the exercised behavior. SQL fixtures may establish immutable test prerequisites, but must be deterministic and run-scoped.
- Aggregate the suite through the existing gate rather than creating a second environment orchestrator.

## Required flows

1. Property operations: read/update operating mode and prove occupancy or lifecycle blockers reject unsafe transitions.
2. Identity: maker submits, eligible checker claims/decides, and same-actor or invalid-state attempts are rejected.
3. Approval runtime: an enabled runtime produces the expected approval path; a disabled/missing or unauthorized path is rejected without bypassing audit.

Exact endpoints and fixture reuse are resolved from current controllers, DTOs, existing E2E scripts, and runtime-control specs before implementation.

## Safety and cleanup

- `PROPERTY_API_E2E_ISOLATED=yes`, loopback API binding, disposable database, named volumes, and explicit `TEST_RUN_ID` remain mandatory.
- Gate supplies `${rootRunId}-control-plane`; suite derives unique business keys and idempotency keys from it.
- Script cleanup only aborts in-flight requests. Database/file cleanup remains workflow-owned `docker compose down -v --remove-orphans`, with residual topology checks already enforced by CI.
