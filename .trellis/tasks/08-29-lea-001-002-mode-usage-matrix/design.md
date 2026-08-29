# LEA-001+002 Technical Design

## Contract boundary

- `packages/shared` is the sole source for named usage values, mode-to-usage allowlists, neutral eligibility reasons, rental-segment derivation and picker projection types.
- API services consume those contracts; SQL may use array/`IN` predicates but must receive values from the shared policy instead of local numeric literals.
- `rental_segment` is a response projection derived from `usage_type`: housing 70 -> residential, office 10 -> office. It has no database column or migration.

## Qualification flow

1. Property control-plane resolves the target/current operation mode and evaluates the unit usage against the shared matrix.
2. Mode transition request validates the target mode while holding the property-unit lock.
3. Approved transition execution reacquires the lock and re-evaluates the target mode and current unit usage before changing the config version, closing the request-to-execution race.
4. Housing and homestay candidate projections expose usage, segment, eligibility and neutral reasons.
5. Every final-write path reuses the same domain policy and continues to apply occupancy, commercial-contract, turnover and version checks.
6. Usage changes lock the unit and reject a value incompatible with current mode or active/pending cross-domain business state.

## Homestay coverage

- Apply `short_stay=[70]` to candidate lists, dashboard rentable/availability queries, rate eligibility/upserts and booking transaction preflight.
- Keep occupancy creation as an independent final safety boundary; do not rely on its former housing-only check as accidental homestay validation.
- Dashboard booking summaries retain historical booking visibility; availability/rentable projections must exclude ineligible current units. Any change to historical summary semantics requires a focused test and explicit rationale.

## Audit delivery

- Add a versioned read-only SQL script under the repository's established audit/report location selected during implementation.
- Query real tenant/park/unit/config/occupancy/housing/homestay/commercial relationship tables.
- Emit conflict categories, IDs, versions, usage/mode/rental status and activity counts. No DML, procedure call, temporary persistent object or automatic repair.
- Contract tests statically enforce read-only behavior and the approved allowlists/conflict categories.

## Compatibility and rollout

- Keep housing permission codes, routes and stored business records compatible.
- Existing office units become eligible only when explicitly configured `long_rent/enabled`; enterprise/commercial contract rules remain authoritative for commercial leasing.
- Existing invalid configs are reported, not mutated. Runtime changes fail closed on incompatible usage.
- Rollback is code-only for policy/projection changes because no schema mutation is planned; audit SQL is independently removable.

## Risk controls

- Avoid candidate/final-write drift by central policy functions and matrix tests.
- Recheck usage after approval to prevent stale request execution.
- Preserve advisory-lock ordering and optimistic version semantics.
- Verify any widened occupancy behavior does not weaken commercial-contract or homestay-turnover conflict checks.
