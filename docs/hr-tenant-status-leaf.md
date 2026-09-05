# HR shared tenant-status leaf

This P0/P1 dependency slice moves the existing `assertTenantActive` implementation into
`TenantStatusService` and exposes it through `TenantStatusModule`. Auth and JWT depend directly
on that leaf; the tenant management service delegates to it. There is one implementation of
missing/disabled/expired checks, with unchanged error messages and expiry boundary semantics.

The leaf registers only the existing `TenantEntity` repository. It does not import tenant
management, files, property operations, parks, or assets. No schema, credentials, authentication
configuration, permission rules, production data, or authorization gates are changed.

The synthetic Nest test starts the real leaf module and JWT strategy with database/user
infrastructure doubles, verifies both allowed and disabled-tenant paths, and inspects the
resolved module graph. Existing JWT, password-lockout, context-switch and tenant-management
tests remain required. This is not a real database/HTTP login acceptance test.

Auth still imports `UsersModule`; scope/identity/RBAC and independent deployment remain unfinished.
Removing this dependency edge does not prove the full Auth graph or HR product is independent.
The next identity slice must introduce genuine enterprise scopes, not a fabricated park.

## Local verification

From the repository root, shared build, API typecheck, lint and build passed. From `apps/api`,
the following bounded regression passed 76 tests:

```sh
node --test --test-concurrency=2 --require ts-node/register \
  src/modules/tenants/tenant-status.service.spec.ts \
  src/modules/tenants/tenants.permission-derivation.spec.ts \
  src/modules/auth/strategies/jwt.strategy.spec.ts \
  src/modules/auth/auth.service.lockout.spec.ts \
  src/modules/auth/auth.service.switch-context.spec.ts
```

The initial offline dependency installation intentionally skipped lifecycle scripts, so the first
test attempt could not load the bcrypt native binding. Installing the existing locked bcrypt
5.1.1 native binding resolved that environment issue; no dependency version or lockfile changed.
No production login, independent-enterprise HTTP chain, full database migration or UI acceptance
was executed by this slice.
