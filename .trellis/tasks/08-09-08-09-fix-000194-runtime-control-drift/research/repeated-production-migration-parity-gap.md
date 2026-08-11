# Repeated production migration parity gap

## Incidents

- Run 31263880813 failed before unchanged 000189 because production had an active asset assignment whose park
  projection could not be derived by the clean-schema fixture.
- Run 31286011713 passed the new 000189 gate and unchanged 000189, then failed unchanged 000194 with
  `property-runtime-control-scope-exact-set-drift`.

## Root cause category

This is not one recurring SQL typo. It is a release-model gap: fresh-schema migration-before-seed has no active
business assignment, while production retains assignments before pending migrations run. Exact-set guards derived
from those assignments therefore see an empty expected set in CI and a non-empty set in production.

## Why the previous fix did not prevent this incident

1. PR 233 added a correct, narrow 000189 asset-scope classifier.
2. The workflow treated that migration-specific gate as sufficient predeploy parity.
3. No inventory connected later pending migrations to their own production-data guards.
4. 000194's schema prerequisite created the table but not the 12 rows that unchanged 000194 explicitly expected.
5. Release Smoke ran the full clean manifest before production seed, so the qualifying scope count was zero and the
   exact-set check passed vacuously.

## Correction

- Add an independently historied insert-only 000194 prerequisite that derives the same scope and signed manifest,
  rejects extras/definition drift, inserts only missing disabled controls, and asserts the full old-state exact set.
- Keep unchanged 000194 byte-for-byte frozen and retry only its failed history.
- Add a read-only 000194 classifier before release side effects.
- Add a predecessor-migration + production-shaped assignment + failed-history PostgreSQL replay.

## Prevention contract

For every future migration whose guard derives expected rows from persisted assignments or business state:

1. identify whether clean migration-before-seed can produce an empty expected set;
2. add a non-empty production-order fixture before approval;
3. mirror the guard with a read-only predeploy classifier;
4. distinguish deterministic insert-only repair from evidence that requires manual mapping or mutation;
5. keep each classifier migration-specific and do not claim one passed classifier rehearses all pending migrations.
