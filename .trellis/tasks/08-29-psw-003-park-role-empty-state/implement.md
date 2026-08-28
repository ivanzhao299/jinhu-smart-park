# PSW-003 Implementation Plan

## Checklist

- [x] 创建 Issue #472、分支和 Trellis 子任务；完成三路只读探索。
- [x] 读取 Web/API 规范、共享指南和即将修改的代码，固化 PRD/设计。
- [x] 实现 access-only 判定与 tab-scoped 来源园区恢复状态，清会话时同步清理。
- [x] 在 `DashboardLayout` 内渲染专用可恢复空态，保留桌面/移动选择器和登出，普通 403 不变。
- [x] 添加移动优先设计系统样式与 390px 防溢出契约。
- [x] 添加 Web 纯函数、路由、布局和切换恢复测试。
- [x] 添加 D5 参数化只读 access-only 审计脚本及静态/SQL 契约测试。
- [x] 运行 focused tests、Web/shared typecheck、lint/build 和相关完整回归。
- [x] 使用 `trellis-check`，更新可执行 spec，并将证据写入本文件。
- [ ] commit/push、PR `Closes #472`、最多 3 轮 review、CI、merge、main 双绿与部署清理证据。

## Validation Commands

- `pnpm --filter @jinhu/web test:unit:auth-routing`
- Web system/layout focused node tests discovered from package scripts
- D5 `sh -n` and static SQL contract test
- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm build`
- browser desktop and 390px inspection when an in-app browser is available

## Risk / Rollback Points

- `apps/web/lib/auth.ts`: do not change token rotation semantics; only clear the new tab-local recovery key with session cleanup.
- `apps/web/components/layout/DashboardLayout.tsx`: suppress protected children only for explicit access-only state; leave ordinary denial redirect intact.
- Recovery state must fail closed across user/tenant/park changes and never be stored in localStorage.
- D5 query must remain SELECT-only and must not broaden API diagnostics.

## Resume Log

- 2026-08-29: PSW-002 main double-green captured. Created Issue #472 because #470 is the merged PSW-002 PR, branched from `origin/main`, and linked this task to the PSW queue parent. Three scouts located the Web denial projection, global switcher/layout boundaries, test gates, and read-only diagnostic conventions. Planning is approved by the user's explicit D3/D5 implementation instruction; next point is task activation and implementation.
- 2026-08-29: Implementation and local quality gate complete. Added explicit-false access-only classification, tab-scoped validated recovery source, authenticated desktop/mobile empty-state shell, return switch, logout/ambiguous-session cleanup, 720px mobile rules, and D5 SELECT-only audit with separate legacy-home classification. Auth-routing 56/56, auth-session 50/50, D5 contract 3/3, complete Web unit gate, shared build, workspace lint/typecheck/build, changed-file ESLint, shell syntax and diff check all PASS. No browser executable, Playwright package, or in-app browser is available, so real desktop/390px visual inspection is explicitly SKIPPED; static mobile/overflow contracts passed. No database container or production environment was touched. Next point: commit/push, open PR with `Closes #472`, then max-three-round review/CI/merge/main double-green.
- 2026-08-29: PR #473 review round 1 found four valid P2 boundary gaps. Fixed legacy-home classification to treat any explicit relation (including soft-deleted) as suppressing runtime fallback, excluded non-enabled users and inactive/expired/deleted tenants from D5, and revalidated that the stored source park still has an explicit business role after reload. Added regressions; auth-routing 57/57, auth-session 50/50, D5 3/3, Web typecheck, changed-file ESLint, shell syntax and diff check PASS. Next point: commit/push, reply to findings, request review round 2.
- 2026-08-29: Codex review round 2 on `a3ea7b70` returned “Didn't find any major issues.” CI Lint/Typecheck/Build is green and Release Smoke is running. This evidence-only log commit will receive the final allowed review round 3; no fourth review will be requested. Next point: push this log, request round 3, wait final PR CI, squash merge, then main double-green.
