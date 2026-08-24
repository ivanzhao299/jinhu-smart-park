# Design: tenant bootstrap admin landing contract

## Contract boundary

`UserContext` is the cross-end authority. The API derives a boolean identity signal from persisted tenant/user/role data; Web consumes only that signal and never infers identity from roles or menu order.

## Authority and compatibility

```text
has active TENANT_ADMIN in the requested park
AND (
  tenant.contact_user_id == user.id
  OR (tenant.contact_user_id is null AND user.create_by is null)
)
```

The pointer is authoritative for tenants created through `TenantsService.create`. For pointer-less legacy tenants, the bootstrap script's null creator is the immutable creation provenance; mutable remarks are only historical evidence and never identity authority. Normal API-created users retain a creator. Requiring an active current-park `TENANT_ADMIN` role prevents stale provenance from preserving identity after role removal and keeps park switching scoped to the target context.

No migration is needed. Existing clients can omit the optional field; the API always emits a boolean for new responses.

## Data flow

1. `/auth/me` or `/users/me` calls `getCurrentUserContext(scope, userId)`.
2. The existing user query loads role relations; the service performs one tenant lookup by `tenantId`.
3. The service derives `is_tenant_bootstrap_admin` from tenant pointer/legacy provenance and current-park active roles.
4. Park switch already fetches a new `/auth/me`, so `nextUser` carries the field without another transport change.

## Routing priority

| Context | Priority |
| --- | --- |
| Desktop | wildcard/super dashboard → tenant bootstrap admin dashboard → first accessible menu → existing fallbacks |
| Mobile | engineering terminal → operations terminal → first accessible menu/dashboard; bootstrap identity does not override terminals |

`/dashboard` remains module-free. This selects a landing route only and does not bypass route authorization.

## Rollout and rollback

The field is additive and optional, so API and Web can roll together without persisted-state changes. Code rollback restores menu-order landing; no database rollback is required.
