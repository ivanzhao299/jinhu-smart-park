# PSW 园区切换权限修复 UAT 复测 — 20260829-061634

## 1. Outcome

- Baseline：`origin/main@eee58bb38575e599b87ed1debe039bd3b32f8c77`，evidence branch `codex/evidence-psw-uat-retest`。
- 执行者：emvia / Codex；执行时间：2026-08-29 05:50–06:16（Asia/Singapore）。
- 结论：**S1a、S1b、S2、S3 与 G1–G7 防回退抽查 PASS；D5 配角前/后审计 PASS。**
- S3/G6 当前权威目标 Park B：`23587739`。fixture manifest、B-only building、浏览器 `/users/me` 与报告只使用这一个目标 ID；历史 `25892265` / `28379088` 仅保留为已废止的证据漂移。
- local-only evidence：`/tmp/jinhu-psw-uat-20260829-D6PRP6/`；截图与运行凭据不入库。

## 2. Safety and topology

- Compose project：`jinhu-psw-uat-20260829-d6prp6`；loopback Web/API/PostgreSQL/CDP：`33140/33141/55482/9631`。
- PostgreSQL 与 API 使用 project-owned `postgres-data` / `api-files-data` named volumes；Web 以本轮受管 PID 运行；Windows Chrome 使用专用 profile `psw-uat-20260829-d6prp6` 和 raw CDP，未操作主 Chrome。
- PSW 场景库完成 migration `270/270`、prerequisites `8/8`、production-safe seed、bootstrap 与 strict baseline PASS。G7 因官方门禁要求数据库名匹配 `jinhu_property_api_e2e_*`，在同一独占 volume 内新建并精确重建容器到 `jinhu_property_api_e2e_psw_20260829_d6prp6`，再次完成相同初始化。
- 未连接生产、共享数据库或共享 API；未停止、删除或修改任何非本轮容器；fixture 业务状态只走产品 API，DB 仅用于初始化、官方 G7 fixture 与只读佐证。

## 3. Design → implementation closure

| Contract | Implementation authority | UAT disposition |
| --- | --- | --- |
| protected tenant `SUPER_ADMIN` crosses same-tenant parks without promoting ordinary wildcard | `.trellis/spec/api/backend/tenant-super-control-plane.md`; auth principal/switch tests | S1a/S1b dynamic PASS |
| access and per-park business roles remain separate; admin can configure an explicit target park | `.trellis/spec/api/backend/park-role-integrity.md`; `POST /users/:id/park-roles` | S2 + D5 dynamic PASS |
| access-only current park renders dedicated recoverable state, not generic 403 | `ParkRoleEmptyState`; `park-role-recovery` | desktop + 390px Chrome PASS |
| switch result rebuilds `/users/me`, Sidebar, route and scoped API/data | auth/menu contracts | S3/G6 dynamic PASS |
| target role diagnostics do not disclose forbidden role details | PSW-002 API/Web unit contracts | targeted gates PASS |

No design gap blocked the matrix.

## 4. Scenario matrix

| Case | Flow | Current-run evidence | Result |
| --- | --- | --- | --- |
| S1a | bootstrap super A → self-created B → A | `logs/s1a-context-switch.log`: switch 200, `/auth/me` super + `*`, activation audit, B asset write/read and A exclusion | PASS |
| S1b | custom wildcard creator in A creates C → bootstrap super A→C | `fixture-results.json`: `otherCreatedParkC=25199110`, protected super and `tenant_super_context_activated` assertions true | PASS |
| S2 | A role → B access-only → dedicated empty state → return A → explicit B role assignment → B work surface | `browser-results.json` S2 PASS; `s2-access-only-{desktop,390}.png`; `s2-target-role-restored.png` | PASS |
| D5 | target B access-only report before/after explicit role | `logs/d5-pre.log` contains the fixture user; `logs/d5-post.log` does not | PASS |
| S3/G6 | ordinary user with different A/B roles → B statistics/buildings | manifest, B-only building and browser park all `23587739`; target APIs 200; A building excluded | PASS |

### S2 responsive facts

- Desktop actual viewport `1440×960`, `scrollWidth=clientWidth=1440`。
- Narrow actual viewport `390×844`, `scrollWidth=clientWidth=390`；`maxTouchPoints=10`, pointer fine=true/coarse=false。该结果只描述本轮 Windows Chrome CDP，不冒充真机。
- 目检确认专用文案、返回原园区、顶部园区入口和退出入口可见；配角后恢复 B 的资产统计页。

### Explained browser observation

`browser-results.json` 的两个业务 Case 都已写为 PASS，但 runner 最后的“任何 console 403 都失败”总断言使文件根状态为 FAIL。保存的六个 403 全部是窄角色加载页面时对 `/floors` 与两个字典辅助接口的预期 fail-closed 请求；S2 空态、恢复和 S3 权威 API 不依赖这些请求。遵守同题最多两次，本轮不做第三次重跑；该项记为 fixture granularity observation，不伪写 runner 根状态，也不判为 PSW 产品 FAIL。

## 5. G1–G7 anti-regression

| Group | Current-run gate | Result |
| --- | --- | --- |
| G1 permission→menu quadrants | API property-menu + Web menu contracts | PASS |
| G2 module dependency/windows | API SaaS module dependency target set | PASS |
| G3 metadata drift/orphan | property-menu seeded metadata/orphan contract | PASS |
| G4 canonical/legacy landing | Web menu + auth-routing (`57/57`) | PASS |
| G5 authorization refresh | auth-routing/session unit gate + S2 logout/relogin after role mutation | PASS |
| G6 park convergence | current S3 real Chrome/API, single B `23587739` | PASS |
| G7 property/security regression | official property gate contract; Homestay and Housing real API suites | PASS |

Targeted API set: `109/109` PASS；Web menu `12/12`、auth-routing `57/57`、permission `3/3` PASS。Official G7 report status `passed`, suites `homestay=passed`, `housing=passed`。

## 6. Repository quality and harness retries

- `pnpm lint`: PASS。
- `pnpm typecheck`: first run failed because `@jinhu/shared` dist predated current HR exports; `pnpm --filter @jinhu/shared build` then the single rerun PASS。No HR file was modified.
- `pnpm test:unit`: same stale-dist first run had three HR failures; after shared rebuild the single rerun PASS。
- `pnpm build`: PASS。
- Harness corrections: quoted `ADMIN_NAME`; exported three auth/storage baseline variables; changed Web `PORT` to the workspace's `WEB_PORT`; aligned asset permission codes to production seed. Each accepted stage stayed within the two-attempt limit.

## 7. Residual, secrets, and teardown

- Before volume destruction G7 retained immutable evidence: 12 approval requests, 12 decisions, 72 approval audits and 6 files; immutable decision/audit triggers remained enabled. These were not deleted or bypassed.
- Exact `docker compose down -v --remove-orphans` result: containers `0`, project volumes `0`, project networks `0`, declared listeners `0`, host file root absent。
- Dedicated Chrome profile removed; Web ended through its owned managed session; CDP/Web/API/DB ports are free。
- Actual secret-value scan across non-env evidence: `0` matches。Temporary env files were deleted after teardown。`evidence-SHA256SUMS` indexes the non-secret local-only evidence.

## 8. Queue and release status

- PSW-001：Issue #463 / PR #466。
- PSW-002：Issue #468 / PR #470。
- PSW-003 + D5：Issue #472 / PR #473。#470 is not the PSW-003 Issue; it is the PSW-002 PR。
- UAT is PASS. Task archival, report PR review (≤3), PR CI, squash merge, main CI/Deploy and production cleanup evidence are tracked after this report commit; UAT PASS alone is not Deploy status.
