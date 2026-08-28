# PAM audit §15 regression closure UAT — 20260828-122122

## 1. Outcome

- Baseline: `origin/main@74104221` on evidence branch `codex/pam-audit-s15-closure-20260828`.
- Disposable topology: Compose project `jinhu-pam-s15-closure-uat-20260828-122122`, containing PostgreSQL 16 and the API image built from this checkout. PostgreSQL data and API file storage used the project-owned named volumes required by the official safety gate. Web ran on loopback and proxied to the container API.
- Final result after review-fix reruns: **G1–G7 PASS; no product FAIL; no new Issue**.
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
| G2 module combinations/time windows | PASS | Review-fix Chrome evidence covers normal/super/wildcard `enabled_modules`, Sidebar, route and API in legal, disabled, asset-only, no-property-module, future and expired states. Business-without-asset is rejected by the product API with 409. |
| G3 malformed metadata | PASS | A superuser used the product `PATCH /permissions/:id` path to drift `permType`, `action`, and `frontendRoute`; each fresh browser login omitted the canonical housing page and restoration returned it. A test-only malformed-tree contract injects an orphan parent and proves the orphan is skipped rather than promoted. |
| G4 dual representation / first landing | PASS | Carried from `20260828-112051`: browser cases plus API/Web menu and first-href contracts passed. |
| G5 authorization refresh | PASS | Page, action and module mutations all cover two tabs, refresh and explicit relogin. The final action-only delta proves 403 → permissions projection → DTO-layer 400 → revoke → 403 on both tabs. |
| G6 park switch | PASS | Final page-local A→B switch uses genuinely different park-scoped role links and assignments: A wildcard+housing versus B explicit asset-statistics with housing disabled. `/users/me`, Sidebar, route/page state and statistics API converge and exclude A data. |
| G7 original security regression | PASS | The unmodified property API gate passed both suites. Final supplements cover 28 Homestay endpoints under asset-off, five protected biz types each through list/detail/upload/download/delete protection, booking identity/credential/housing finance projections, restricted-unit scope, and maker-checker CAS/idempotency/concurrency/retry/immutable contracts. |

## 4. G2 details

`browser-closure-results.json` records these passing cases:

1. `G2-LEGAL-NORMAL-SUPER-WILDCARD`: normal received its single granted page and retained the expected page-only API 403; wildcard and super received all nine housing pages and a 200 business API response.
2. `G2-G5-MODULE-DISABLE-RELOGIN`: after product API disable, all three principals explicitly logged out and back in with no housing menu; after enable, normal login converged back to the granted page.
3. `G2-FORBIDDEN-BUSINESS-WITHOUT-ASSET`: disabling asset while dependants were active returned 409. After legally disabling both property dependants and asset, enabling housing without asset also returned 409. The original state was restored through product APIs.
4. `G2-FUTURE-WINDOW` and `G2-EXPIRED-WINDOW`: normal, wildcard, and super all excluded housing from `enabled_modules` and Sidebar, used the safe route, and received an explicit 403 from the housing business API.
5. Review-fix `G2-FORBIDDEN-BUSINESS-WITHOUT-ASSET` additionally records all three principals in asset-only and no-property-module states. Each state excluded housing from `enabled_modules`/Sidebar and returned 403; illegal business-without-asset enable returned 409.

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

- G5 final coverage combines the prior `G5-TWO-TAB-ADD-REMOVE-REFRESH` permission case, the explicit relogin case, and review-fix `G5-MODULE-TWO-TAB-REFRESH`. Two already-open `/dashboard` tabs retained cached Sidebar state immediately after the admin toggle, then both removed/restored housing after refresh; fresh `/users/me` and API responses failed closed throughout the transition.
- G6 entered `/assets/statistics`, used `.asset-park-context-selector select`, converged from Park A `20000001` to the isolated product-created Park B `25892265`, and asserted:
  - authoritative `/users/me` returned the target park;
  - `POST /auth/switch-context` returned 200;
  - `GET /assets/statistics` returned 200 after switching;
  - `GET /buildings` returned 200 after switching;
  - the selector left its busy state and the page remained rendered.
- Review-fix response assertions remove the 200-only ambiguity: Park A statistics contained five units and A fixtures; Park B statistics contained zero units and no A building; the Park B `/buildings` response contained `PAMS15BONLY` with `parkId=28379088` and excluded Park A codes.

## 7. G7 details

- Official gate report: `property-api-e2e-report-final.json` with `status=passed`, suites `homestay=passed` and `housing=passed`.
- The gate covered real property workflows and distinct approval actors. Review-fix supplemental evidence separately proves the security cells that the two gate scripts do not claim by themselves.
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
- Review-fix security cases:
  - Homestay dependency: dashboard 200 before disable, 403 with property modules disabled, illegal homestay-before-asset restore 409, then 200 after asset→homestay restoration.
  - Scope: Park B received 404 for Park A lease/file detail/download/delete; a same-park `dataScope=self` principal received 403 for another actor's lease; a second product-created tenant received 404 for the Park A lease/file/detail download.
  - Field projection: a non-super normal role with explicit `housing:tenant:read` received two tenant records with `displayName` removed and `verificationStatus` masked.
  - File chain: pending upload/list/detail/download byte equality/delete/post-delete 404 all passed; deleting the signed bound file returned 409.
  - Maker-checker DB evidence remained 12/12 separated, approved and executed.

## 8. Harness findings and reruns

- Initial API-image startup exposed an unquoted temporary `ADMIN_NAME`; the temporary env file was corrected before initialization evidence was accepted.
- The first official gate attempt had the approval runtime scheduler disabled in temporary Compose, so an approved request remained `not_started`. The topology was aligned with CI and the unmodified gate passed. This was an environment failure.
- Running G2 asset disable after the G7 fixture produced `Asset runtime control state is partial or inconsistent`: the G7 fixture had intentionally enabled two version-4 runtime controls. The disposable project was destroyed with both volumes, recreated, and the deterministic order was changed to G2/G3/G5/G6 → G7 fixture/gate. The final run passed. This was an environment-order conflict, not a product failure.
- The first orphan-parent contract assertion incorrectly expected the entire fallback menu to be empty; it was corrected to assert the orphan itself is absent. The final 13/13 test file passed.
- The G7 Chrome login form did not dispatch a request under the small standalone Ant Form harness. The final accepted run called the real login API, kept the access token in memory only, injected it into the dedicated same-origin CDP profile, and executed every page/network assertion in Chrome.
- Review round 1 produced five valid coverage/authority findings. Early review-fix runner attempts calibrated page-only API expectations (403 by design) and the sticky `/403` route; the accepted G5 run used two already-open module-free `/dashboard` tabs, matching the refresh-after-change contract. These were harness expectation failures, not product failures.
- Review round 2 produced seven valid granularity findings. The first final-lifecycle attempt ran asset-off after approval runtime data existed and correctly hit `Asset runtime control state is partial or inconsistent`; the disposable project and both volumes were destroyed and rebuilt. Accepted order was asset-off/restore first, then the official gate and protected-file chains. The root-workspace bcrypt lookup also failed once before fixtures; rerun used `@jinhu/api`'s declared dependency. Neither harness failure entered an accepted business run.

## 9. Evidence index

- Initialization: `logs/migrate-reinit.log`, `logs/seed-reinit.log`, `logs/bootstrap-reinit.log`, `logs/baseline-reinit.log`.
- Docker safety: `logs/compose-final-ps.txt`, `logs/docker-safety-binding.txt`.
- G2/G3/G5/G6: `phase-fixture-results.json`, `browser-closure-results.json`, `network/phase-fixture-network.json`, `network/browser-closure-network.json`, `logs/browser-closure-after-reinit.log`.
- G3 orphan contract: `logs/g3-orphan-parent-contract-r2.log`.
- G7 API: `logs/property-api-e2e-fixtures-final.log`, `logs/property-api-e2e-final.log`, `property-api-e2e-report-final.json`.
- G7 browser: `g7-browser-results.json`, `network/g7-browser-network.json`, `logs/g7-browser-cdp-injection.log`.
- G7 DB: `db/g7-before-counts.txt`, `db/g7-after-counts.txt`, `db/g7-actor-separation.txt`.
- Review fixes: `review-fix-setup-results.json`, `browser-review-fix-results.json`, `g5-review-diagnostic.json`, `g7-security-review-fix-results.json`, `g7-asset-dependency-review-fix-results.json`, matching `network/*review-fix*.json`, `db/g7-review-fix-*.txt`, and accepted `logs/*review-fix*.log`.
- Review round 2: `review3-asset-off-matrix-results.json` (28 denied endpoints + 6 restored GETs), `property-api-e2e-report-review3-final.json`, `review3-file-sensitive-matrix-results.json` (five distinct biz types), `browser-review3-results.json` (G5/G6 2/2), `db/review3-actor-summary.txt`, and `logs/review3-targeted-security-tests.log` (72 PASS, 7 guarded SKIP, 0 FAIL).
- Screenshots: 28 PNG files under `screenshots/`, including G2 legal/disabled/window states, G3 drift/restoration, G5 action two-tab, G6 different-role/module local switch, and four G7 pages.
- Integrity: final `evidence-SHA256SUMS-review3` contains 186 entries. No credential or token value is indexed in the repository; `/tmp` evidence remains local and disposable.

## 10. Teardown and archive decision

- Dedicated Chrome profiles were closed and removed; Web dev was stopped.
- `docker compose down -v --remove-orphans` removed the API and PostgreSQL containers, project network, PostgreSQL volume, and API file volume.
- Review fixes used two additional fresh project-owned volume lifecycles: one for the complete matrix/security rerun and one minimal Homestay dependency restore rerun. Each ended with `docker compose down -v --remove-orphans`.
- Final independent checks after the last rerun: project containers `0`, project volumes `0`, project network `0`, ports `33000/33001/55432/9615/9616` free.
- **Archive decision: §15 is fully closed. The parent task may be archived after PR review, PR CI, squash merge, and main CI/Deploy are green.**

## 11. Repository quality checks

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test:unit`: PASS (exit code 0; database-dependent cases that require an explicit test database were skipped by their existing guards).
- Targeted property-menu contract: PASS, 13/13.
- `git diff --check`: PASS.
- Trellis task validation: PASS, with only pre-existing context-size warnings.
- `pnpm test`: not accepted as a repository-quality result in this post-teardown phase because this command starts the S1 API/database smoke and the disposable API had already been intentionally removed; it stopped at `API did not become reachable`. The authoritative isolated API safety gate had already passed before teardown.

## 12. Review closure

- PR #452 review round 1 returned five findings; all were accepted as valid and addressed with real reruns or authority synchronization.
- Accepted review-fix outcomes: G2 Cartesian cells PASS, G5 module two-tab/refresh PASS, G6 Park-B-specific response assertions PASS, G7 supplemental security chain PASS, and both authoritative audit status records updated in the same PR.
- Review round 2 outcomes: all seven findings closed by fresh runtime evidence or the repository's executable authority contracts. Targeted security set: 79 tests, 72 PASS, 7 existing explicit-PG guards SKIP, 0 FAIL. Final DB summary: 12 requests, 12 approved, 12 executed, 12 maker-checker separated.
- No product failure was observed during the accepted runs. No Issue was opened.
