# Design: Open Issues 209 and 215-217

## Boundaries

- Web safety execution boundary: normalize runtime collections before state mapping and keep execution failures local to the drawer workflow.
- Web asset-reference boundary: derive floor/unit candidates from selected parent IDs and update parent plus descendants atomically.
- Web system-form boundary: model option loading explicitly instead of rendering asynchronous required selects as if they were ready.
- API SaaS catalog boundary: add a read-only tenant-onboarding plan catalog that mirrors scoped-first/default-catalog-fallback resolution without changing scoped plan management.

## Data Flow

### Issue 209

1. Fetch task detail.
2. Validate object shape and normalize `items`, `results`, attachment arrays, and numeric projections.
3. Build result inputs only from normalized arrays.
4. On invalid detail or request failure, retain the list and expose a message; do not commit partially unsafe state to the execution drawer.

### Issue 215

`buildingId -> floors.filter(buildingId) -> floorId -> units.filter(floorId) -> unitId`.
Changing a parent uses a pure transition helper that clears descendants which are no longer members of the derived candidate sets. The same helper is used for form and list filter state.

### Issue 216

The user drawer has explicit `idle/loading/ready/empty/error` option state. Opening and tenant changes clear stale candidates, fetch target login settings, and only then mount/reset the uncontrolled form values (or use controlled values where needed). Save is disabled unless a valid default park belongs to the ready candidate set.

### Issue 217

Add a candidate read path separate from scoped plan CRUD. The service loads enabled, non-deleted plans, ranks exact scope before the default platform catalog, deduplicates by `planCode`, and returns a stable catalog. Tenant creation uses this path; `resolvePlan` remains the write-side authority and is kept semantically aligned through the shared default-scope constant and tests.

## Compatibility And Security

- No schema migration is required.
- Existing API routes and payload field names remain valid.
- Plan management remains scoped; only the onboarding candidate route can read the effective catalog and still requires the existing open-plan read permission.
- Tenant park candidates remain behind the existing super-admin tenant-management checks.
- Existing valid inspection data and explicit attachment replacement semantics remain unchanged.

## Failure And Rollback

- Each issue is implemented as a small separable commit where practical; reverting one issue must not require reverting the others.
- Empty candidate catalogs produce an explicit non-submittable UI rather than guessing a default.
- Malformed runtime projections are reported and ignored at the relevant form boundary rather than persisted.

## Prevention

- Add pure logic tests for collection normalization, hierarchical transitions, option readiness, and effective plan catalog selection.
- Wire new system form tests into the root unit-test gate.
- Record reusable cross-layer rules only after the implementation confirms the exact contracts.
