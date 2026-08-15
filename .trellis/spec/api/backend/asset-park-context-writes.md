# Asset Park Context Writes

## 1. Scope / Trigger

- Trigger: a current-park business page lets a user select another accessible park before creating scoped data.

## 2. Signatures

- Candidate source: `GET /users/me` → `accessible_parks[]` and `current_park`.
- Context transition: `POST /auth/switch-context { parkId: string }` → rotated access token and HttpOnly refresh cookie.
- Scoped write: most domain endpoints derive `tenantId/parkId` from `@CurrentScope`; exceptions such as `POST /buildings` may accept an explicit same-tenant target `parkId` only when the service resolves the target JWT principal, re-checks the target permission, and overrides the audit scope.
- Asset hierarchy DB keys: building `(tenant_id,park_id,id)`, floor `(tenant_id,park_id,building_id,id)`, unit child FKs include the complete parent scope.

## 3. Contracts

- The Web serializes context rotation, fetches authoritative `/users/me` with the new token, then publishes token+user through `setSession`.
- Same-target concurrent calls coalesce; a different target while rotation is pending fails locally.
- A page that cannot safely rotate auth cookies from the current request origin must not call `switch-context` before the business write. It must send only the selected `parkId`; the API owns same-tenant authorization, code generation, persistence, and `request.auditScopeOverride` for that target scope.
- Existing scoped records are not moved by ordinary update DTOs. Moving a building requires a separate high-risk transaction covering every denormalized descendant and business reference.
- Redundant `tenant_id/park_id` child columns are protected by composite FKs. Active business codes are unique in `(tenant_id,park_id,code)`, not globally.

## 4. Validation & Error Matrix

- target absent from enabled `accessible_parks` → reject before request or fail server-side target principal resolution.
- switch endpoint rejects deleted/disabled/cross-tenant/unassigned park → no domain write.
- rotated response lacks token or `/users/me.park_id` differs → fail closed; never publish mixed session state.
- explicit target `parkId` is cross-tenant, inaccessible, or lacks write permission → service rejects before persistence.
- migration finds parent/child scope drift or a building without an active canonical park scope → abort before constraints/index changes.

## 5. Good / Base / Bad Cases

- Good: choose an authorized second park, rotate context, publish the new session, then create under `CurrentScope`.
- Good: for building create from an origin that cannot rotate the auth cookie, submit the selected `parkId`; the service resolves the target principal, checks `building:create`, writes the target scope, and records the target audit scope.
- Base: target is the current park; skip rotation and perform the normal scoped write.
- Bad: add `parkId` to a domain DTO and persist it without target principal resolution, target permission checks, and audit scope override; or update `building.park_id` without descendants.

## 6. Tests Required

- Web unit: authoritative new-token `/users/me`, atomic session publication, same-target coalescing, competing-target rejection, forged/disabled candidate rejection, and no unsafe `switch-context` call in explicit-target create flows.
- Auth/controller: strict Origin/Referer cookie policy and refresh-token rotation.
- API unit: explicit-target create resolves the target principal, checks target permission, persists the target scope, and propagates `auditScopeOverride`.
- Migration: fresh schema plus non-empty upgrade fixture, cross-park child mutation rejection, exact validated constraint/index catalog.
- Browser: current and alternate park labels, submit loading/error states, desktop and 390px layout.

## 7. Wrong vs Correct

### Wrong

```ts
await apiRequest("/buildings", { body: { ...form, parkId: selectedParkId } });
```

### Correct

```ts
await switchParkContext(selectedParkId);
await apiRequest("/buildings", { token: getToken(), body: buildingFields });
```

```ts
await apiRequest("/buildings", { body: { ...buildingFields, parkId: selectedParkId } });
// Service resolves target principal, checks building:create, and sets request.auditScopeOverride.
```
