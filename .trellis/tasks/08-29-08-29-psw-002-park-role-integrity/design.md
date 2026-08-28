# PSW-002 Technical Design

## Boundaries

- Shared contract extends `UserParkContext` with a minimal role summary usable by both management projection and the authenticated user's switcher.
- Users API owns management diagnostics and target-park assignment.
- Existing `/auth/switch-context` remains authoritative for switching; role summaries are display-only and never authorize a switch.
- Web user management and both global switchers consume the shared projection; no page-local permission inference.

## Contract

`UserParkContext` gains an optional summary compatible with older clients:

- `role_summary.role_names: string[]`
- `role_summary.role_count: number`
- `role_summary.has_business_role: boolean`

The API calculates only active, in-scope role bindings. A protected tenant super binding is projected as an effective `SUPER_ADMIN` role for every live park, matching PSW-001 runtime semantics.

Management role context keeps `GET /users/:id/roles` for compatibility but honors explicit `tenantId/parkId`. A new mutation `POST /users/:id/park-roles` accepts `{ parkId, roleIds }`. The old `POST /users/:id/roles` remains default-park compatible for existing callers during rollout; the Web moves to the explicit endpoint.

## Authorization

The controller requires `USER_ASSIGN_ROLES` for mutation and the existing user-detail/assign-role boundary for role context. Service authorization is additionally target-aware:

1. Load the target user inside the actor's tenant boundary.
2. Verify target park is active, belongs to the same tenant, and is in the target user's effective accessible parks.
3. Allow protected tenant super/wildcard actors for any same-tenant target park.
4. Otherwise require `targetParkId === actor.parkId`; this permits a park administrator to configure a user whose default park differs but who has access to the administrator's current park.
5. Validate every role is active, assignable, same tenant, and tenant-scoped or scoped to the target park.

Failures use generic not-found/forbidden semantics and never enumerate foreign roles or parks.

## Data Flow

### Management projection

`toViews` bulk-loads active user-role links and attaches summaries to each accessible park. It must avoid per-park queries. User list/detail already require protected user-management permissions, so they may include role names needed for configuration diagnosis.

### Target-park role configuration

The new endpoint reuses the existing pessimistic user-organization lock and user-role transaction. It soft-deletes only manageable role links at `(user, tenant, targetPark)` and inserts the requested role IDs. Audit scope is overridden to the target park.

### Switcher summary

`getCurrentUserContext` attaches the authenticated user's own role summary to each effective accessible park. This contains display names/count only. No permissions, candidate roles, data scope, protected flags, or assignability reasons are exposed. The switch still calls `/auth/switch-context` and resolves a fresh principal.

## Compatibility

- New summary fields are optional in shared contracts.
- Existing default-park role endpoint remains operational; no database migration is required.
- Role changes follow the existing refresh/relogin/context-refresh activation contract.

## Rollback

- Web can ignore optional summaries and fall back to park names.
- Removing the new endpoint and optional projection restores prior behavior without data rollback.
- No automatic data mutation or migration is introduced.

## Risks

- N+1 queries: prevent by deriving summaries from the existing batched role-link load.
- Tenant-super projection drift: reuse protected-super helpers rather than role code string heuristics.
- Information leakage: keep management diagnostics behind existing user permissions and self summaries minimal.
- Cross-park privilege escalation: enforce actor target scope in service even when controller permission passes.
