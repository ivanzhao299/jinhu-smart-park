# S1.5 Engineering Governance Hardening

This document records the S1.5 governance checks and commands.

## Scope

- Git baseline
- Minimal test script
- S1 smoke e2e
- Migration and seed execution scripts
- Development seed and production seed separation
- S1 module, route, and API existence checks

No S2 business modules are included in this scope.

## Commands

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed:dev
pnpm test
pnpm lint
pnpm build
```

Production-safe seed execution is explicit:

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
```

## Minimal E2E Coverage

`pnpm test` runs `scripts/e2e/s1-smoke.mjs`.

You can also run the S1 e2e directly:

```bash
pnpm test:e2e
```

The smoke test covers:

- Admin login success
- Normal user login success
- Login failure
- `/users/me` without token
- `/users/me` with token and full context
- Normal user denied from audit logs
- Admin audit log access
- File upload, download permission denial, admin download, soft delete
- Dict create
- User create
- User role assignment
- Role permission assignment
- Operation log query
- Login log query
- Direct `sys_login_log` assertion for login success
- Direct `sys_login_log` assertion for login failure
- Direct `sys_op_log` assertion for file download
- Direct `sys_file` soft-delete assertion

The test uses the development seed accounts and must not be pointed at production.
