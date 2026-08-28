# PAM audit §15 regression UAT — 20260828-112051

## 1. Conclusion

- Baseline: `origin/main@f39540a35c0b83f5e8e675c766880c220fa0d7c9` (PR #450 merge revision).
- Isolation: Compose project `jinhu-pam-s15-uat-20260828-112051`; PostgreSQL/API/Web/CDP ports `56631/3291/3292/9601`.
- Outcome: **2 groups PASS, 3 groups PASS with contract-test substitution, 2 groups BLOCKED; no product FAIL**.
- Archive decision: **do not archive** `.trellis/tasks/08-27-permission-mechanism-compliance-audit`. Section 15 is not fully closed.
- Product issues: none opened. The blockers are missing legal fixture/test infrastructure, not observed product defects.

## 2. Phase 0 and environment

The authoritative cases were transcribed from `docs/reviews/permission-mechanism-compliance-2026-08-27.md` §15 into:

- `preflight/design-basis.md`
- `preflight/design-implementation-audit.md`
- `preflight/role-flow-matrix.md`

All three are hashed by `preflight/SHA256SUMS`. Fixtures used product APIs only. The bootstrap administrator's primary Park A was not changed; Park B access was appended and the administrator entered Park B through `POST /auth/switch-context`.

Initialization completed migrations, production-safe seed, bootstrap admin, and strict baseline. Curl login passed. The first Chrome precheck attempt failed because the initial API/Web processes had not exported the temporary environment; after restarting the same isolated services with exported variables, the second and final precheck passed with Chrome `151.0.7922.138`, title `金湖科创产业园 SaaS 平台`, all three login selectors, `1440×960`, and target `http://127.0.0.1:3292/login`.

Raw CDP was used under the user's explicit exception. No production service, HR branch/PR, another user's container, or the primary Chrome profile was touched.

## 3. Seven-group matrix

| §15 group | Result | Browser assertion | Network evidence | DB evidence / equivalent proof |
| --- | --- | --- | --- | --- |
| 1. permission→menu quadrants | **PASS** | Chrome cases `G1-BOTH`, `G1-PAGE-ONLY`, `G1-ACTION-ONLY`, `G1-NEITHER`, `G1-FINANCE`, `G1-TRACK-B` verified Sidebar, landing and permission separation. Track-B exposed `/housing/tasks` without `/housing/dashboard`; finance exposed `/housing/finance`. | `network/browser-cases-network.json`, `network/api-fixture-network.json` | `db/touched-before.txt`, `db/touched-after-fixture.txt`; API/Web permission/menu contract suites PASS. |
| 2. module combinations/time windows | **BLOCKED** | The enabled housing+asset state and module fail-closed behavior were exercised indirectly by G1 and G6, but the complete normal/super/`*` Cartesian matrix was not run in Chrome. | Legal enable/disable paths exist, but business-only conflicts with the asset dependency; system future/expiry states are rejected by product rules. | `saas-modules.property-dependency.spec.ts`, property-menu, Web permissions/menu suites PASS for disabled/expired/future and super/`*`. These do not replace the requested full browser matrix. |
| 3. malformed menu metadata | **PASS with substitution, one BLOCKED subcase** | Canonical metadata and legal display projection were exercised through G1. Malformed persisted states were not inserted. | Product API/UI cannot create duplicate permission codes or route/module/type/action drift; no SQL insertion was used. | API property-menu tests PASS for duplicate code, wrong route/type/action and `visible=false`. No existing orphan-parent contract test or legal construction path was found; that subcase is **BLOCKED**. |
| 4. dual representation / first landing | **PASS with substitution** | Every G1 login landing was either `/dashboard` or an href in the actual Sidebar; G6 Park B landing belonged to Park B Sidebar. | `/users/me` and `switch-context` paths are captured. | Web menu and auth-routing suites PASS for legacy+canonical pruning, explicit empty tree authority, login and park-switch normalized landing. |
| 5. authorization refresh | **PASS** | `G5-TWO-TAB-ADD-REMOVE-REFRESH`: current tab retained cached Sidebar after add; a newly logged-in second tab received the page; both retained cached state after revoke; refresh converged both to the revoked state. | Admin role-permission writes and both tabs' `/users/me` paths are captured. | Role/permission/user links are included in before/after table counts. This matches the approved “refresh/relogin” contract and does not claim active push. |
| 6. park switch | **PASS** | `G6-PARK-SWITCH`: Park A → Park B converged `parkId`, selector, Sidebar and landing; final logout returned to `/login`. | A 2xx `/auth/switch-context` response is required by the runner and captured. | Product API created Park B and per-park role links; the bootstrap admin primary park remained A. R5 16-table park set was frozen and extended for users/auth/role policy. |
| 7. original security regression | **BLOCKED** | This run did not execute the complete Homestay asset toggle, cross-scope, actor-separation, hidden/masked, five-file-chain and housing approval deep-link browser matrix. | Focused API/unit suites passed for dependency, scope, decisions/effects, field projection, file business access and housing projection. | The repository's full property API E2E gate requires both API and PostgreSQL to run inside the same disposable Compose project with audited DB and file volumes. The reused R5 topology containerized PostgreSQL only, so bypassing the gate would violate its safety contract. Existing focused tests are supplementary, not a complete §15 UAT replacement. |

## 4. Browser case results

`browser-results.json` records eight PASS cases:

1. `G1-BOTH`
2. `G1-PAGE-ONLY`
3. `G1-ACTION-ONLY`
4. `G1-NEITHER`
5. `G1-FINANCE`
6. `G1-TRACK-B`
7. `G5-TWO-TAB-ADD-REMOVE-REFRESH`
8. `G6-PARK-SWITCH`

The first business runner attempt captured `g1-both.png` and then stopped on a harness-only invalid `about:blank` URL composition. The URL helper was corrected and the full matrix reran from the beginning; the retry passed. API fixture attempts similarly preserve one parameter-type harness error and one expired refresh-token setup error before a fresh real administrator login produced a successful idempotent fixture. None was classified as a product failure.

## 5. Contract-test evidence

The following commands passed:

```text
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/users/users.service.property-menu.spec.ts \
  src/modules/saas-modules/saas-modules.property-dependency.spec.ts \
  src/modules/homestay/homestay.controller.spec.ts \
  src/modules/homestay/homestay-scope-matrix.spec.ts \
  src/modules/property-approvals/property-approval.decision.spec.ts \
  src/modules/property-approvals/property-approval.execution.spec.ts \
  src/modules/field-policies/field-policy.service.spec.ts \
  src/modules/files/file-business-access.service.spec.ts \
  src/modules/housing/housing-projection-access.spec.ts
pnpm --filter @jinhu/web test:unit:menu
pnpm --filter @jinhu/web test:unit:auth-routing
```

Logs are `logs/s15-api-contract-tests.log`, `logs/s15-web-menu-tests.log`, and `logs/s15-web-auth-routing-tests.log`.

## 6. Evidence index

Root: `/tmp/jinhu-pam-s15-20260828-112051/`

- Initialization: `logs/migrate.log`, `logs/seed.log`, `logs/baseline-before.log`, `logs/bootstrap.log`, `logs/baseline-after.log`.
- Precheck: `ready-body.json`, `admin-login-evidence.json`, `login-precheck.json`, `screenshots/00-login-precheck.png`.
- Fixture: `api-fixture-results.json`, `network/api-fixture-network.json`, preserved attempt logs.
- Browser: `browser-results.json`, `network/browser-cases-network.json`, `screenshots/g1-*.png`, `screenshots/g5-two-tab-refresh.png`, `screenshots/g6-park-switch.png`, `screenshots/g6-final-logout.png`.
- DB: `db/touched-before.txt`, `db/touched-after-fixture.txt` and query-error logs for tables absent from this revision.
- Integrity: `preflight/SHA256SUMS`, `screenshots/SHA256SUMS`, `evidence-SHA256SUMS`.

No secret env file or token is included in a manifest or report.

## 7. Teardown and residuals

The browser sequence ended with UI logout → `/login` → `about:blank` → `Browser.close` → dedicated profile deletion. API/Web were stopped. Compose was brought down with the exact `-p/--env-file/-f` tuple and `-v --remove-orphans`.

- Compose containers after: `0`
- Compose volumes after: `0`
- Compose networks after: `0`
- Ports `56631/3291/3292/9601`: all free

The isolated database volume was destroyed, which is the zero-residual boundary for immutable audit/effect rows. No broad SQL cleanup, trigger bypass, `TRUNCATE`, or `session_replication_role` change was used.

## 8. Remaining closure work

The parent task can be archived only after a new isolated run provides:

1. the complete G2 normal/super/`*` module/time-window browser matrix using only legal product states and explicit negative API evidence for forbidden states;
2. an orphan-parent fail-closed contract test or a legal product construction path;
3. a Dockerized API+PostgreSQL+file-volume topology accepted by `property-api-e2e-safety.mjs`, followed by the complete G7 browser/network/DB matrix.

Until then, §15 is partially executed and the parent remains `in_progress`.
