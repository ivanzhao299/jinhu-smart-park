# PAM audit §15 regression closure UAT — 20260828-122122

## 1. Outcome

- Baseline: `origin/main@74104221` on evidence branch `codex/pam-audit-s15-closure-20260828`.
- Disposable topology: Compose project `jinhu-pam-s15-closure-uat-20260828-122122`, containing PostgreSQL 16 and the API image built from this checkout. PostgreSQL data and API file storage used the project-owned named volumes required by the official safety gate. Web ran on loopback and proxied to the container API.
- Final result: **G1–G7 PASS; no product FAIL; no new Issue**.
- The first §15 round `20260828-112051` remains the authority for G1/G4 and the G5 two-tab/G6 global-selector subset. This closure round executed every item that §8 left open.
- Evidence root: `/tmp/jinhu-pam-s15-closure-uat-20260828-122122/`.

## 2. Safety and isolation

- API: `127.0.0.1:33001`; PostgreSQL: `127.0.0.1:55432`; Web: `127.0.0.1:33000`.
- Safety snapshot confirms API and PostgreSQL shared the Compose project/network, API used the PostgreSQL service hostname, API port publishing was loopback-only, and the exact volumes were:
  - `jinhu-pam-s15-closure-uat-20260828-122122_postgres-data` → `/var/lib/postgresql/data`
  - `jinhu-pam-s15-closure-uat-20260828-122122_api-files-data` → `/var/lib/jinhu/files`
- Initialization followed migrate → production-safe seed → bootstrap admin → baseline check. The final baseline was `WARN` only for host-shell variables that were explicitly set inside the API container; auth production-safety values remained disabled.
- No shared service, production environment, other user's container, or main Chrome profile was touched. Browser work used dedicated Windows Chrome profiles and raw CDP.

## 3. Final seven-group matrix

| Group | Final | Closure evidence |
| --- | --- | --- |
| G1 permission → menu quadrants | PASS | Carried from `20260828-112051`: both/page-only/action-only/neither/finance/Track-B browser cases all passed. |
| G2 module combinations/time windows | PASS | Real Chrome covered legal normal/super/wildcard projections, module disable and restore, future and expired windows. Forbidden business-without-asset states produced explicit product API 409 responses; future/expired business API calls produced explicit 403 responses. |
| G3 malformed metadata | PASS | A superuser used the product `PATCH /permissions/:id` path to drift `permType`, `action`, and `frontendRoute`; each fresh browser login omitted the canonical housing page and restoration returned it. A test-only malformed-tree contract injects an orphan parent and proves the orphan is skipped rather than promoted. |
| G4 dual representation / first landing | PASS | Carried from `20260828-112051`: browser cases plus API/Web menu and first-href contracts passed. |
| G5 authorization refresh | PASS | Prior two-tab add/remove/refresh result is supplemented by module disable/enable with explicit logout → login convergence for normal, wildcard, and super principals. |
| G6 park switch | PASS | Prior global selector result is supplemented by `/assets/statistics` page-local selector A→B, authoritative `/users/me` park convergence, page-state reload, and 200 responses for scoped statistics/building APIs. |
| G7 original security regression | PASS | Unmodified official `pnpm test:e2e:property-api` passed both Homestay and Housing suites in the accepted Docker topology. Four real Chrome pages then passed: property operations, field-policy unit board, attachment center, and housing approval deep link. DB evidence confirms 12/12 maker-checker separation and execution, six bound files, and the immutable runtime-control baseline. |

## 4. G2 details

`browser-closure-results.json` records these passing cases:

1. `G2-LEGAL-NORMAL-SUPER-WILDCARD`: normal received its single granted page; wildcard and super received all nine housing pages under the currently valid module set.
2. `G2-G5-MODULE-DISABLE-RELOGIN`: after product API disable, all three principals explicitly logged out and back in with no housing menu; after enable, normal login converged back to the granted page.
3. `G2-FORBIDDEN-BUSINESS-WITHOUT-ASSET`: disabling asset while dependants were active returned 409. After legally disabling both property dependants and asset, enabling housing without asset also returned 409. The original state was restored through product APIs.
4. `G2-FUTURE-WINDOW` and `G2-EXPIRED-WINDOW`: normal, wildcard, and super browser menus all failed closed. The normal principal's direct housing business request returned 403 with the API error envelope.

Full request URLs/statuses are in `network/browser-closure-network.json`; product-control-plane setup is in `network/phase-fixture-network.json`.

## 5. G3 details

- The original `housing:dashboard:page` metadata was captured through `GET /permissions/:id`.
- A superuser then performed separate legal product API mutations:
  - `permType: 10`
  - `action: read`
  - `frontendRoute: /housing/not-canonical`
- Each mutation was followed by a fresh Chrome login; the canonical `/housing/dashboard` node was absent. The original triple was restored after every case, and the final fresh login showed the page again.
- `apps/api/src/modules/users/users.service.property-menu.spec.ts` now includes a test explicitly marked `test-only` that injects a page whose `parentId` is missing. The complete tree is flattened and asserts that neither the orphan href nor permission is projected.

## 6. G5 and G6 details

- G5 final coverage combines the prior `G5-TWO-TAB-ADD-REMOVE-REFRESH` case with this round's module toggle and explicit relogin case. It therefore covers cached tabs, refresh, logout, relogin, permission changes, and module changes.
- G6 entered `/assets/statistics`, used `.asset-park-context-selector select`, converged from Park A `20000001` to the isolated product-created Park B `25892265`, and asserted:
  - authoritative `/users/me` returned the target park;
  - `POST /auth/switch-context` returned 200;
  - `GET /assets/statistics` returned 200 after switching;
  - `GET /buildings` returned 200 after switching;
  - the selector left its busy state and the page remained rendered.

## 7. G7 details

- Official gate report: `property-api-e2e-report-final.json` with `status=passed`, suites `homestay=passed` and `housing=passed`.
- The gate covered real asset operating-state changes, cross-scope denials, distinct approval actors, hidden/masked field policies, and the five-part file chain including upload/list/detail-download/delete protection and `biz_id` association. Housing approval/effect flows passed through checkout.
- Real Chrome follow-up passed:
  - `/assets/property-operations` with `GET /property/operations` 200;
  - `/assets/unit-status-board` with `GET /assets/unit-status-board` 200;
  - `/system/files` with `GET /files?...` 200;
  - `/housing/tasks?requestId=76c36952-ace5-405d-820d-05281b4932ab` with an `aria-current=true` target and `GET /property/approvals/:id` 200.
- DB after-state:
  - 12 runtime controls and 24 immutable contract audits;
  - 12 approval requests and 12 decisions;
  - all 12 decisions had `requester_id <> actor_id`, `decision_status=approved`, and `execution_status=executed`;
  - six files existed and all six had a non-null business association;
  - 180 active hidden/masked field policies existed in the isolated tenant.

## 8. Harness findings and reruns

- Initial API-image startup exposed an unquoted temporary `ADMIN_NAME`; the temporary env file was corrected before initialization evidence was accepted.
- The first official gate attempt had the approval runtime scheduler disabled in temporary Compose, so an approved request remained `not_started`. The topology was aligned with CI and the unmodified gate passed. This was an environment failure.
- Running G2 asset disable after the G7 fixture produced `Asset runtime control state is partial or inconsistent`: the G7 fixture had intentionally enabled two version-4 runtime controls. The disposable project was destroyed with both volumes, recreated, and the deterministic order was changed to G2/G3/G5/G6 → G7 fixture/gate. The final run passed. This was an environment-order conflict, not a product failure.
- The first orphan-parent contract assertion incorrectly expected the entire fallback menu to be empty; it was corrected to assert the orphan itself is absent. The final 13/13 test file passed.
- The G7 Chrome login form did not dispatch a request under the small standalone Ant Form harness. The final accepted run called the real login API, kept the access token in memory only, injected it into the dedicated same-origin CDP profile, and executed every page/network assertion in Chrome.

## 9. Evidence index

- Initialization: `logs/migrate-reinit.log`, `logs/seed-reinit.log`, `logs/bootstrap-reinit.log`, `logs/baseline-reinit.log`.
- Docker safety: `logs/compose-final-ps.txt`, `logs/docker-safety-binding.txt`.
- G2/G3/G5/G6: `phase-fixture-results.json`, `browser-closure-results.json`, `network/phase-fixture-network.json`, `network/browser-closure-network.json`, `logs/browser-closure-after-reinit.log`.
- G3 orphan contract: `logs/g3-orphan-parent-contract-r2.log`.
- G7 API: `logs/property-api-e2e-fixtures-final.log`, `logs/property-api-e2e-final.log`, `property-api-e2e-report-final.json`.
- G7 browser: `g7-browser-results.json`, `network/g7-browser-network.json`, `logs/g7-browser-cdp-injection.log`.
- G7 DB: `db/g7-before-counts.txt`, `db/g7-after-counts.txt`, `db/g7-actor-separation.txt`.
- Screenshots: 19 PNG files under `screenshots/`, including G2 legal/disabled/window states, G3 drift/restoration, G6 local switch, and four G7 pages.
- Integrity: `evidence-SHA256SUMS` and `screenshots/SHA256SUMS` (62 evidence files and 19 screenshots at manifest creation time). Temporary env and runner source files were excluded; no credentials or tokens are present in the report/manifests.

## 10. Teardown and archive decision

- Dedicated Chrome profiles were closed and removed; Web dev was stopped.
- `docker compose down -v --remove-orphans` removed the API and PostgreSQL containers, project network, PostgreSQL volume, and API file volume.
- Final independent checks: project containers `0`, project volumes `0`, project network `0`, ports `33000/33001/55432` free.
- **Archive decision: §15 is fully closed. The parent task may be archived after PR review, PR CI, squash merge, and main CI/Deploy are green.**

## 11. Repository quality checks

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test:unit`: PASS (exit code 0; database-dependent cases that require an explicit test database were skipped by their existing guards).
- Targeted property-menu contract: PASS, 13/13.
- `git diff --check`: PASS.
- Trellis task validation: PASS, with only pre-existing context-size warnings.
- `pnpm test`: not accepted as a repository-quality result in this post-teardown phase because this command starts the S1 API/database smoke and the disposable API had already been intentionally removed; it stopped at `API did not become reachable`. The authoritative isolated API safety gate had already passed before teardown.
