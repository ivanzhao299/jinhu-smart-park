# Issue #253 E2E Evidence

Date: 2026-08-11

## Runtime

- Isolated PostgreSQL container/database copied read-only from a fully migrated local baseline (`209` succeeded migration history rows), then mutated only inside the isolated Issue #253 container.
- Current working-tree API started from TypeScript source in an isolated Node container.
- Current working-tree Web started with its rewrite targeting the isolated API.
- All Issue #253 containers and their ephemeral network were removed after verification.

## API chain

- Create without `planCode` or `moduleCodes`: HTTP 400; tenant search confirmed zero persisted rows.
- Create with BASIC: HTTP 201.
- First administrator password login: HTTP 200.
- `/users/me.enabled_modules`: exactly `asset`, `system`, `workorder`.
- Tenant users, parks, work orders: HTTP 200.
- Platform tenant list: HTTP 403.
- Disabled safety endpoint: HTTP 403.
- Patch only `planCode=PROFESSIONAL`: HTTP 200.
- Same live first-admin token then projected 9 enabled modules and `safety_hazard:read`.
- Safety inspect points changed to HTTP 200; platform tenant list remained HTTP 403.

## Browser chain

- Desktop Edge/Playwright password login reached `/system/orgs`, not `/403`.
- Visible sidebar groups: asset, work order, safety, engineering, system.
- Platform tenant management menu remained hidden.
- Expanding safety and opening inspect points reached `/safety/inspect-points`; its API returned 200.
- 390x844 viewport: create drawer required a plan, switching to PROFESSIONAL displayed the safety module and synchronized quota defaults; document horizontal overflow was 0px.
- Screenshots were retained only in the local temporary directory and were not committed.
