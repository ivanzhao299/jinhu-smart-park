# Repeated 000189 production scope failure

## 1. Root-cause category

- Test coverage gap: Release Smoke modeled a clean/default scope, not the full set of historical active
  production module assignments.
- Implicit assumption: a missing default projection or an existing asset projection were treated as the
  only legacy shapes; a non-default active assignment with no trusted park source was not observed.
- Propagation gap: the prerequisite invariant was checked only after source sync during deployment, so
  production deployment became the first production-shape test.

## 2. Why earlier fixes did not close the loop

- PR #230 repaired legacy scope-column types and migration replay, but still required a canonical park source.
- PR #232 correctly preserved an existing asset projection and bounded the old `JH` fallback to the fixed
  default scope. It intentionally refused arbitrary cross-tenant guessing.
- The new classification exposed `unresolved_source=1`, but Release Smoke only replayed the two known default
  shapes. It therefore proved the implementation contract, not parity with historical production data.
- Read-only run `31265619022` showed the actual third shape: the fixed default scope had zero asset projections,
  two exact-scope business parks, and exactly one global `JH`. The earlier state machine allowed the fixed-key
  source only when the exact-scope count was zero, so the extra business park masked the trusted JH source.

## 3. Prevention mechanisms

- Provide an explicit read-only production diagnostic that uses the same classification as the prerequisite.
- Run the same check in enforce mode after required secret initialization but before API/full deployment performs
  application source sync, migration, seed, or build.
- Output only scope identifiers and aggregate business counts; never infer or mutate a mapping from diagnostics.
- Add every newly observed production shape to isolated PostgreSQL Release Smoke fixtures.
- Permit the fixed unique key to disambiguate multiple rows only inside its fixed documented target scope; retain
  fail-closed behavior for every generic/non-default multiple-source state.

## 4. Systematic expansion

- Search all active module assignments rather than the one default tenant/park pair.
- Classify invalid scope, invalid tenant, duplicate destination, existing destination, exact source, bounded
  default source, and unresolved source separately.
- Compare migration prerequisite, production seed, deploy preflight, and Release Smoke fixtures whenever the
  projection state machine changes.

## 5. Knowledge capture

- `.trellis/spec/api/backend/migration-prerequisites.md` records production-shape parity requirements.
- `.trellis/spec/guides/project-operations.md` records the pre-source-sync fail-closed deployment gate.
- No `src/templates/markdown/spec/` directory exists in this repository, so no generated spec template needs
  synchronization.
