# D5 identity check-in and property-foundation PostgreSQL proof handoff

Date: 2026-08-03  
Scope: real PostgreSQL evidence for homestay identity check-in and property-foundation approval proof/reconcile.

## Outcome

- Identity check-in: PASS. A valid identity was created through the `000185` CAS functions. The real `HomestayService -> PropertyIdentityVerificationService -> PropertyIdentityService` path persisted frozen submission/file evidence on success. A second connection then held and changed the evidence file; the check-in connection was observed waiting on a PostgreSQL `Lock`, resumed after the competing commit, failed with `identity-snapshot-stale`, and left booking status, actual check-in time, and action log unchanged.
- Property foundation: PASS after one production defect fix. Proof and reconcile now require both the audit row and the matching resulting aggregate. Mode-transition and occupancy-release complete cases pass. Logical audit-only, aggregate-only, version/state drift, deleted aggregate, and occupancy source drift fail closed.
- Production defects closed:
  - Homestay check-in referenced nonexistent `biz_homestay_booking_guest`; corrected to authoritative `rel_homestay_booking_guest` and frozen in schema contract coverage.
  - Property-foundation reconcile previously counted only audit rows and could report `complete` with no matching aggregate; it now counts matching aggregate evidence and only completes for `count=1, matchingCount=1`.

## Exact source hashes

SHA-256 at the time of this handoff:

```text
a9e80be48238b13918d2ffcb6b696ac44ba1d0f3e2621a87ff47e2f4737b2dce  apps/api/src/modules/homestay/homestay-identity-checkin-atomic.pg.spec.ts
edfc38823074c80d7b6fdf7723f4a69f6363c74cf9ebeb7f801c572318f4129d  apps/api/src/modules/homestay/homestay.service.ts
07f6a07a64d9d02255fe6eb64a27a49f64191b352472d71bcaccfe47cf0fb6fd  apps/api/src/modules/homestay/homestay.schema.spec.ts
829decfcf477b6be5b0b29302b5b64bda12344f9f5aa13c2aa6ad135a6962d30  apps/api/src/modules/property-operations/property-foundation-approval.pg.spec.ts
47497b03178bb55ed03f233cfd0e471e8fe4127a746d8d52cd70c0824f64a523  apps/api/src/modules/property-operations/property-foundation-approval.adapter.ts
```

Recalculate with:

```bash
sha256sum apps/api/src/modules/homestay/homestay-identity-checkin-atomic.pg.spec.ts apps/api/src/modules/homestay/homestay.service.ts apps/api/src/modules/homestay/homestay.schema.spec.ts apps/api/src/modules/property-operations/property-foundation-approval.pg.spec.ts apps/api/src/modules/property-operations/property-foundation-approval.adapter.ts
```

## Commands and results

Commands are written with a secret-free test URL variable; the executed databases were local disposable clones.

```bash
PROPERTY_IDENTITY_PG_URL="$PROPERTY_TEST_DATABASE_URL" node --test --require ts-node/register src/modules/homestay/homestay-identity-checkin-atomic.pg.spec.ts
# PASS 1/1

node --test --require ts-node/register src/modules/homestay/homestay.schema.spec.ts src/modules/property-identity/property-identity.service.spec.ts
# PASS 26/26

PROPERTY_FOUNDATION_PG_URL="$PROPERTY_TEST_DATABASE_URL" node --test --require ts-node/register src/modules/property-operations/property-foundation-approval.pg.spec.ts
# PASS 1/1

node --test --require ts-node/register src/modules/property-operations/property-foundation-approval.adapter.spec.ts
# PASS 3/3

pnpm --filter @jinhu/api typecheck
# PASS

pnpm exec eslint apps/api/src/modules/homestay/homestay.service.ts apps/api/src/modules/homestay/homestay.schema.spec.ts apps/api/src/modules/homestay/homestay-identity-checkin-atomic.pg.spec.ts apps/api/src/modules/property-operations/property-foundation-approval.adapter.ts apps/api/src/modules/property-operations/property-foundation-approval.pg.spec.ts
# PASS
```

## Disposable database audit

- Identity database: `jinhu_identity_checkin_pg_20260803a`; created from an existing runtime test template, applied `000191` inside that disposable database only, test passed, database dropped, follow-up catalog count `0`.
- Foundation database: `jinhu_foundation_pg_20260803a`; created from the same runtime test template, applied `000191` inside that disposable database only, test passed, database dropped, follow-up catalog count `0`.
- Default local database was not migrated, reset, or mutated by these proof runs.

## Open P0/P1

- P0: none remaining from these two proof gates.
- P1: official Codex in-app browser desktop/mobile/zoom/forced-colors evidence remains environment-blocked because the browser Node REPL rejects the workspace `sandboxCwd` before test code runs (`sandboxCwd is not a local file URI`). No Playwright/static-HTML substitute was used.
- Operational note: an earlier independent run advanced the default local development database through migration `000188`; these proof runs did not change that database. Parent closeout should retain this note.
