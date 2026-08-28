# PSW 园区切换权限修复 UAT 复测 — 20260829-061634

## 1. Outcome

- Baseline：`origin/main@eee58bb38575e599b87ed1debe039bd3b32f8c77`，evidence branch `codex/evidence-psw-uat-retest`。
- 执行者：emvia / Codex；执行时间：2026-08-29 05:50–06:41（Asia/Singapore）。
- 结论：**S1a、S1b、S2、S3 与 G1–G7 防回退抽查 PASS；D5 配角前/后审计 PASS。**
- S3/G6 当前权威目标 Park B：`25030409`。fixture manifest、B-only building、浏览器 `/users/me` 与报告只使用这一个目标 ID；历史 `25892265` / `28379088` 仅保留为已废止的证据漂移。
- RUN_ID：`20260829-061634`；local-only evidence：`/tmp/jinhu-psw-uat-20260829-061634/`；截图与运行凭据不入库。

## 2. Safety and topology

- Compose project：`jinhu-psw-uat-20260829-061634`；database：`jinhu_property_api_e2e_psw_20260829_061634`；loopback Web/API/PostgreSQL/CDP：`33150/33151/55483/9632`。
- PostgreSQL 与 API 使用 project-owned `postgres-data` / `api-files-data` named volumes；Web listener PID `2675519`，API container host PID `52376`。Windows Chrome `151.0.7922.138` 使用专用 profile `psw-uat-20260829-061634` 和 raw CDP；未使用 chrome-devtools MCP，因此 MCP version 为 N/A。
- 主验收 phase 的同一数据库从开始即满足官方 G7 命名门禁，完成 migration `270/270`、prerequisites `8/8`、production-safe seed、bootstrap 与 strict baseline PASS；S1b/S2/S3/D5 与 G7 共用这一 RUN_ID/project/database。为把 S1a 日志也收敛到同一 RUN_ID，主 phase teardown 后以同名 project/database 和 fresh project-owned volume 单独执行 S1a regression phase，再次完成初始化与 teardown；两 phase 不并发、不混用 Park ID。
- Accepted runtime logs：`logs/migrate.log`, `logs/baseline.log`, `logs/api-build.log`, `logs/api-container.log`, `logs/browser.log`, `logs/g7-property-api.log`。Accepted run 无 failure log。首轮 review 前的非权威浏览器失败保留在 preliminary evidence root `/tmp/jinhu-psw-uat-20260829-D6PRP6/`；失败摘要为 `browser-failure.txt`，对应 runner log 为 `logs/browser-r2.log`。该 root 只用于审计两次 business-browser attempt 的失败历史，不参与当前 PASS authority。
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
| S1b | custom wildcard creator in A creates C → bootstrap super A→C | `fixture-results.json`: `otherCreatedParkC=24450643`, protected super and `tenant_super_context_activated` assertions true | PASS |
| S2 | A role → B access-only → dedicated empty state → return A → explicit B role assignment → B work surface | `browser-results.json` S2 PASS; `s2-access-only-{desktop,390}.png`; `s2-target-role-restored.png` | PASS |
| D5 | target B access-only report before/after explicit role | `logs/d5-pre.log` contains the fixture user; `logs/d5-post.log` does not | PASS |
| S3/G6 | ordinary user with different A/B roles → B statistics/buildings | manifest, B-only building and browser park all `25030409`; target APIs 200; A building excluded | PASS |

### S2 responsive facts

- Desktop actual viewport `1440×960`, `scrollWidth=clientWidth=1440`。
- Narrow actual viewport `390×844`, `scrollWidth=clientWidth=390`；`maxTouchPoints=10`, pointer fine=true/coarse=false。该结果只描述本轮 Windows Chrome CDP，不冒充真机。
- 目检确认专用文案、返回原园区、顶部园区入口和退出入口可见；配角后恢复 B 的资产统计页。

### Browser review correction

Review round 1 correctly identified that the preliminary narrow B role omitted `floor:read` and `system:dict-item:list`; the statistics page loads those lookups in one `Promise.all`, so its six 403s were a real failed browser flow, not harmless console noise. That preliminary result is not current authority. The second and final business-browser attempt assigned the complete page dependency set; `browser-results.json` is root `status=PASS`, both S2/S3 cases PASS, and `consoleErrors=[]`.

## 5. G1–G7 anti-regression

| Group | Current-run gate | Result |
| --- | --- | --- |
| G1 permission→menu quadrants | API property-menu + Web menu contracts | PASS |
| G2 module dependency/windows | API SaaS module dependency target set | PASS |
| G3 metadata drift/orphan | property-menu seeded metadata/orphan contract | PASS |
| G4 canonical/legacy landing | Web menu + auth-routing (`57/57`) | PASS |
| G5 authorization refresh | auth-routing/session unit gate + S2 logout/relogin after role mutation | PASS |
| G6 park convergence | current S3 real Chrome/API, single B `25030409` | PASS |
| G7 property/security regression | official property gate contract; Homestay and Housing real API suites | PASS |

Targeted API set: `109/109` PASS；Web menu `12/12`、auth-routing `57/57`、permission `3/3` PASS。Official G7 report status `passed`, suites `homestay=passed`, `housing=passed`。

## 6. Repository quality and harness retries

- `pnpm lint`: PASS。
- `pnpm typecheck`: first run failed because `@jinhu/shared` dist predated current HR exports; `pnpm --filter @jinhu/shared build` then the single rerun PASS。No HR file was modified.
- `pnpm test:unit`: same stale-dist first run had three HR failures; after shared rebuild the single rerun PASS。
- `pnpm build`: PASS。
- Harness corrections: quoted `ADMIN_NAME`; exported three auth/storage baseline variables; changed Web `PORT` to the workspace's `WEB_PORT`; aligned asset permission codes to production seed. Review round 1 then required the complete statistics lookup dependency set. The first launch that lost Web before login was preflight, not a business Case; the preliminary 403 run and corrected final run are the two business-browser attempts.

## 7. Residual, secrets, and teardown

- Before volume destruction G7 retained immutable evidence: 12 approval requests, 12 decisions, 72 approval audits and 6 files; immutable decision/audit triggers remained enabled. These were not deleted or bypassed.
- 主验收 phase 与 fresh-volume S1a phase 均执行精确 `docker compose down -v --remove-orphans`；每次结果都是 containers `0`, project volumes `0`, project networks `0`, declared listeners `0`，host file root absent。
- Dedicated Chrome profile removed; Web ended through its owned managed session; CDP/Web/API/DB ports are free。
- Actual secret-value scan across non-env evidence: `0` matches。Temporary env files were deleted after teardown。`evidence-SHA256SUMS` indexes the non-secret local-only evidence.

## 8. Queue and release status

- PSW-001：Issue #463 / PR #466。
- PSW-002：Issue #468 / PR #470。
- PSW-003 + D5：Issue #472 / PR #473。#470 is not the PSW-003 Issue; it is the PSW-002 PR。
- UAT is PASS. The UAT child and queue parent remain active through report PR review (≤3), PR CI, squash merge, main CI/Deploy and production cleanup evidence; only then will a separate archive change close them. UAT PASS alone is not Deploy status.
