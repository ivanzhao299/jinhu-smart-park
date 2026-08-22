# 补齐园区切换前后端闭环 Design

## Architecture

The backend already owns the authoritative tenant/park scope through JWT principal resolution and `POST /auth/switch-context`. Building management also has an explicit target-park API, but it resolves the target through `resolveJwtPrincipal`, module checks, and target permissions. Floor management remains current-scope only. The Web should expose a global park switcher and make floor creation follow the same authenticated current-scope model after switching.

## Frontend Flow

1. `DashboardLayout` keeps the current `UserContext` as the single source of truth.
2. `AuthUserContext` should expose both `user` and a refresh/update function, or a scoped `onUserChanged` callback, so `UserMenu` can publish a successful switch without full logout.
3. `UserMenu` shows current park and enabled accessible parks. For one accessible park, it is display-only. For multiple parks, choosing another park calls `switchParkContext`.
4. On success, update `DashboardLayout` user state from the returned `UserContext`, then refresh the current route so scoped lists reload under the new token.
5. On failure, keep the current route and session. Show a concise inline message near the switcher.

## Asset Create Flow

### Building

- Load enabled accessible parks from `useAuthUser()`.
- Keep `parkId` in the create payload because the current backend already validates target park access before writing.
- Default to current `user.park_id`.
- Keep the existing target-park create/list behavior because the backend already validates target access and audit scope.
- Remove any failed-save path that logs the user out for a pre-rotation or target access rejection.
- Keep visible drawer-local errors and reload the selected park list after save.

### Floor

- Add UI park selector defaulting to current `user.park_id`.
- On park selection change, switch the browser context to that park, publish the returned user context, then reload building candidates and floor list with the new token.
- Clear `buildingId` when park changes unless the existing building belongs to the new candidate set.
- Do not default `buildingId` to the first building unless the list filter explicitly selected that building.
- Do not add `parkId` to the floor create payload.

## Backend

- Keep `switch-context` as the source of truth for scope transition.
- Keep `resolveJwtPrincipal` tenant, enabled `rel_user_park`, and active `biz_park` checks.
- Optionally make ordinary `refresh` rotation atomic, matching `switchContext`'s claim-update pattern, if tests show the change is contained.
- Do not add `parkId` to `CreateFloorDto`.
- Keep `CreateBuildingDto.parkId` guarded by target principal, target module, target permission, and audit-scope override.

## E2E

Add a first-release smoke script that prepares or discovers a second active park for the default tenant, confirms the admin can access it, switches context through HTTP, then verifies:

- initial `/auth/me` is default park.
- `accessible_parks` includes both parks.
- `POST /auth/switch-context` returns a new access token.
- switched `/auth/me` is target park.
- creating a building/floor after switch persists to target park.
- switching or accessing an unauthorized/cross-tenant park fails.

## Trade-Offs

- Full per-form temporary park access without changing global context would require backend DTO/API changes and risks bypassing the established scope model. The chosen design keeps the backend's current security boundary.
- Switching context when selecting a different park changes the whole session, which is visible and predictable; it avoids hidden per-request scope behavior.
- Browser UAT and E2E are both required because unit tests already cover much of the session helper but did not prevent missing UI adoption.

## Rollback

- Revert Web switcher and asset form changes to return to current single-scope behavior.
- E2E script addition is independent and can be removed from first-release runner if it blocks unrelated emergency releases, but that should be reported explicitly.
