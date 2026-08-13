# Asset Park Context Writes

## 1. Scope / Trigger

- Trigger: a current-park business page lets a user select another accessible park before creating scoped data.

## 2. Signatures

- Candidate source: `GET /users/me` → `accessible_parks[]` and `current_park`.
- Context transition: `POST /auth/switch-context { parkId: string }` → rotated access token and HttpOnly refresh cookie.
- Scoped write: the domain endpoint continues to derive `tenantId/parkId` from `@CurrentScope`; it does not trust a target scope in its DTO.
- Asset hierarchy DB keys: building `(tenant_id,park_id,id)`, floor `(tenant_id,park_id,building_id,id)`, unit child FKs include the complete parent scope.

## 3. Contracts

- The Web serializes context rotation, fetches authoritative `/users/me` with the new token, then publishes token+user through `setSession`.
- Same-target concurrent calls coalesce; a different target while rotation is pending fails locally.
- Existing scoped records are not moved by ordinary update DTOs. Moving a building requires a separate high-risk transaction covering every denormalized descendant and business reference.
- Redundant `tenant_id/park_id` child columns are protected by composite FKs. Active business codes are unique in `(tenant_id,park_id,code)`, not globally.

## 4. Validation & Error Matrix

- target absent from enabled `accessible_parks` → reject before request.
- switch endpoint rejects deleted/disabled/cross-tenant/unassigned park → no domain write.
- rotated response lacks token or `/users/me.park_id` differs → fail closed; never publish mixed session state.
- migration finds parent/child scope drift or a building without an active canonical park scope → abort before constraints/index changes.

## 5. Good / Base / Bad Cases

- Good: choose an authorized second park, rotate context, publish the new session, then create under `CurrentScope`.
- Base: target is the current park; skip rotation and perform the normal scoped write.
- Bad: add `parkId` to a domain DTO and persist it without context authorization, or update `building.park_id` without descendants.

## 6. Tests Required

- Web unit: authoritative new-token `/users/me`, atomic session publication, same-target coalescing, competing-target rejection, forged/disabled candidate rejection.
- Auth/controller: strict Origin/Referer cookie policy and refresh-token rotation.
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
