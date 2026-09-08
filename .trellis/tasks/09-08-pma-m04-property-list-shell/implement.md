# Implementation Plan: PMA M-04 PropertyListShell

## 1. Shared shell

- [x] 新增 `PropertyListShell` 及必要的 module CSS，组合现有 DS primitives。
- [x] 扩展 property-shared exports，并增加壳层 contract spec。
- [x] 保持 records descriptor 的桌面/移动同源与无障碍语义。

## 2. First-wave migrations

- [x] 迁移 receivables：同源字段、移动 cards、filter apply/reset/chips、分页。
- [x] 迁移 payments：同源字段、移动 cards、filter apply/reset/chips、分页。
- [x] 迁移 checkouts：同源字段、移动 cards、filter apply/reset/chips、分页；不改审批/结算/生效流程。
- [x] 迁移 units/`UnitsTable`：移除移动宽操作列依赖，保留园区切换、导入导出、抽屉与权限动作。
- [x] 搜索并确认四页不再依赖 desktop-only list rendering。

## 3. Validation

- [x] `pnpm --filter @jinhu/web test:unit:property`
- [x] `pnpm --filter @jinhu/web test:unit:assets`
- [x] 运行新增目标页 contract tests。
- [x] `pnpm --filter @jinhu/web lint`
- [x] `pnpm --filter @jinhu/web typecheck`
- [x] `pnpm --filter @jinhu/web build`
- [ ] 隔离浏览器检查四条目标路由 desktop 1440×960 与 mobile 390×844：降级移交 L-04，M-04 不宣称浏览器 PASS。

## 4. Closure

- [ ] Trellis check：spec、lint/typecheck/tests、cross-layer/reuse/consistency。
- [ ] 更新必要 spec（仅有可复用新契约时），记录验证证据与成本摘要。
- [ ] commit、push feature branch，创建关联 #700 的 PR。
- [ ] review 最多 3 轮；同根因最多自动修复 2 次。
- [ ] PR CI 通过后 squash merge；仅通过 `gh pr merge` 更新 main。
- [ ] 观察 merge SHA 的 main CI 与 Deploy Production 双绿；不手工操作生产。
- [ ] 确认 #700 closed，归档任务并记录 session。

## Rollback Points

- 共享壳层提交与四页迁移保持可审查的逻辑分层；单页出现回归时只回退该页接入，不拆除其余已验证页面。
- 若隔离浏览器认证/环境不可用，保留真实阻塞证据，不用源码扫描冒充 UAT；该项未通过则不得宣称 M-04 完成。

## Cost Guard

- 使用一次跨目录定位结果，后续只读将修改的具体文件。
- 每页采用同一迁移模式并批量验证；不重复全仓扫描。
- 同一根因两次修复仍失败时进入 `COST_GUARD`，做一次聚焦根因审计后再决定。

## Continuation Status — 2026-09-08

### Completed implementation

- [x] 新增并导出 `PropertyListShell`，提供 header/context、折叠筛选、应用/重置、chips、可选 bulk bar、panel 与分页 slots。
- [x] receivables/payments/checkouts 使用 draft/applied filters、同源 `PropertyFieldDescriptor` 与 `PropertyResponsiveRecords`。
- [x] units 接入 shell；`UnitsTable` 改为同源 responsive records，移除 480px 固定操作列与页内重复分页。
- [x] 新增首批页面 contract spec；未改 API、金融 mutation、权限或数据库。

### Passed checks

- `pnpm --filter @jinhu/web test:unit:property` — 47/47 pass。
- `pnpm --filter @jinhu/web test:unit:assets` — 21/21 pass。
- `pnpm --filter @jinhu/web lint` — pass。
- `pnpm --filter @jinhu/web typecheck` — pass。
- `pnpm --filter @jinhu/web build` — pass，192/192 static pages generated。
- disposable environment — fresh schema 307/307 migrations、8/8 prerequisites、production seed、bootstrap admin、API/Web readiness 均通过；本轮 project/volume/PID/Chrome 已清理。

### COST_GUARD blocker

- Browser runner first exposed an invalid duplicate Web port invocation, then API startup required the Party keyring. A focused startup-validator audit added the disposable UAT contract to `.trellis/spec/guides/project-operations.md` (commit `90f67379`).
- Host Playwright Chromium lacked required shared libraries, so a dedicated official Playwright container was used; its private CDP endpoint and host-app connectivity passed preflight.
- Final desktop report remained `FAIL`, `pages_checked=0`, reason `browser UAT UI login failed ... no_authenticated_session`; network evidence contained no login POST. Report SHA-256: `40f83eb103c0ab922250e316cb5f751b8c11f43ffecb78d01c6d74de3a830e8c` at `/tmp/pma-m04-final-evidence/desktop-report.json`.
- A speculative controlled-input timing change to the runner did not change the outcome and was fully reverted; runner and its contract test have no working-tree diff.
- Per same-root retry limit, automatic fixes stopped at this point. The subsequent user-approved focused audit and downgrade decision below supersede the earlier browser-only closure requirement.

## Focused login root-cause audit — 2026-09-08

- Confirmed contract mismatch: the login page is an Ant Design controlled `Form` whose `onFinish` owns the `/auth/login` POST, while the runner used the native value setter plus synthetic `input`/`change` and `submit.click()`. The runner had no React/AntD hydration gate and did not assert the login POST before classifying the session failure.
- Runner now waits for the hydrated enabled form, uses `Input.dispatchKeyEvent` to clear/type both fields and submit with Enter, verifies typed DOM values, and fails distinctly with `login_post_not_observed` when the POST is absent. Static runner contract: 3/3 pass.
- The one real validation path did not establish a session because the dedicated Chromium boundary could not reach the host Web origin: browser Network evidence recorded `GET /login` as `net::ERR_CONNECTION_REFUSED`; the runner therefore failed closed at `login_form_not_hydrated`. No login POST or product login rejection occurred.
- Per the user-approved downgrade path, M-04 closes with the component event-wiring interaction spec plus property 48/48, assets 21/21, lint, typecheck and build 192/192. This is not mounted DOM/browser evidence; desktop and 390px validation for all four routes is explicitly transferred to L-04 together with the browser-visible-origin preflight.
- Two disposable environments were cleaned by scoped traps; the first exposed non-reachable container-private CDP, the second exposed browser-container loopback isolation. No production, shared Chrome, fixed-name development container, HR behavior, migration source, or financial mutation was touched.

### Cost Summary

- Agents: 3 one-round read-only explorations (scope/issue, code map, browser recipe); no delegated code changes.
- Heavy gates: one Web build after final page migration; property/assets suites batched. Disposable browser environment repeated because fresh-schema cleanup was fail-closed; entered `COST_GUARD` before further login-runner work.
- Production/manual operations: none. Existing fixed-name development container and main Chrome untouched.
