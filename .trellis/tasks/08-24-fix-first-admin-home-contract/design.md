# Design: tenant bootstrap admin landing contract

## Contract boundary

`UserContext` is the cross-end authority. The API derives a boolean identity signal from persisted tenant/user/role data; Web consumes only that signal and never infers identity from roles or menu order.

## Authority and compatibility

```text
tenant.contact_user_id == user.id
```

The pointer is authoritative for every tenant. `TenantsService.create` already writes it in the onboarding transaction. A forward-only migration backfills pointer-less legacy tenants from enabled, non-deleted users with enabled, non-deleted tenant-scoped `TENANT_ADMIN` bindings. The tenant-wide role may be reused by target-park bindings whose park differs from the role row. Multiple valid candidates are ordered by `create_time ASC, id ASC`; zero candidates remain NULL; structurally inconsistent tenant identities fail preflight. Runtime role, remark, and creator provenance never redefine the persisted identity.

Existing clients can omit the optional field; the API always emits a boolean for new responses. The migration changes data only and is forward-only; rollback restores application code but does not erase an authoritative pointer.

## Data flow

1. `/auth/me` or `/users/me` calls `getCurrentUserContext(scope, userId)`.
2. The existing user query loads role relations; the service performs one tenant lookup by `tenantId`.
3. The service derives `is_tenant_bootstrap_admin` only by exact tenant pointer equality.
4. Park switch already fetches a new `/auth/me`, so `nextUser` carries the field without another transport change.

## Routing priority

| Context | Priority |
| --- | --- |
| Desktop | wildcard/super dashboard → tenant bootstrap admin dashboard → first accessible menu → existing fallbacks |
| Mobile | engineering terminal → operations terminal → first accessible menu/dashboard; bootstrap identity does not override terminals |

`/dashboard` remains module-free. This selects a landing route only and does not bypass route authorization.

## Rollout and rollback

The field is additive and optional, so API and Web can roll together. Code rollback restores menu-order landing; the forward-only pointer backfill remains valid tenant identity data.
