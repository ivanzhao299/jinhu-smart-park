# Execution Plan

## Phase 0 — audit

- [ ] 亲读 SOP、设计源、既有住房/民宿报告与相关 specs。
- [ ] 冻结设计-实现闭环审计表、状态机、端点/页面/权限表、multi-tenant 与 asset/approval gap。
- [ ] 排除未实现链条并冻结 residual 表/谓词。

## Phase 1 — matrix

- [ ] 推导角色 × 业务流程链与分支 Case，明确 desktop/phone-width、预期状态与证据。
- [ ] 准备 UI fixture 建链顺序和账号切换序列。

## Phase 2 — isolated environment

- [ ] 从候选 SHA 创建授权证据分支，实测空闲端口与容器冲突。
- [ ] 建立 0600 env、专用 compose、独立 DB/API/Web/file root；完成 migrate/seed/bootstrap/baseline/health/ready。
- [ ] 核验 CDP 9222 专用 Chrome、独立 profile/origin 与 `/tmp` 截图冒烟。

## Phase 3 — first-pass browser UAT

- [ ] 用真实 UI 建 asset、party、角色/用户与住房业务 fixture。
- [ ] 执行主链、分支、403/scope、dashboard、responsive/a11y/console/network/idempotency Case。
- [ ] 保存截图/evaluate/snapshot/日志 manifest，记录 PASS/FAIL/BLOCKED/gap。
- [ ] UI logout、逐表 residual after=0、精确清理进程/compose/端口/文件根。
- [ ] 写首轮报告；运行文档/仓库检查；commit/push/PR/review≤3/CI/merge/main CI+Deploy。

## Phase 4 — defect queue

- [ ] 对每个产品 finding 建独立 issue 和 Trellis 子任务。
- [ ] 每项在 `codex/fix-housing-*` 上最小修复、单测/PG spec、review≤3、CI、merge、main 双绿并归档子任务。
- [ ] migration 变更先检查编号、逐租户语义、checksum/failure 历史和部署停止条件。

## Phase 5 — retest and archive

- [ ] 从全修复后的 main 建复测环境；重跑 FAIL/gap、防回退、权限、asset、幂等、PG spec。
- [ ] residual 六类及 housing/asset 扩展表逐表 before/after=0；截图真实落盘并生成 manifest。
- [ ] 写 before/after 复测报告；PR/review/CI/merge/main 双绿。
- [ ] 运行 Trellis quality/finish 流程；仅 PASS 时归档 UAT 与修复任务。

## Validation gates

- `git diff --check`
- targeted housing API/Web/shared tests discovered during audit
- `DATABASE_URL=... pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/housing/housing-checkout-concurrency.pg.spec.ts`
- `pnpm lint`, `pnpm typecheck`, relevant builds/tests in proportion to each product diff
- PR required checks plus merged main CI and Deploy Production

## Rollback points

- 首轮验收发现产品 FAIL：停止该 Case，不改产品代码。
- 同一环境/部署失败两次：停止自动重试并报告。
- 任何 PID/container/project 身份不匹配：停止清理，保留证据人工核查。
- 复测非全 PASS：保持任务 in_progress，不归档。

## Campaign closure evidence (2026-08-27)

- 三轮 UAT 原始结论保持不变：首轮 `20260826-120125` 为 FAIL，修复轮 `20260826-193245` 为 PARTIAL，最终轮 `20260827-114806` 在旧 residual 条款下为 PARTIAL；三份报告共同记录缺陷发现、修复推进与最终业务链 PASS，不能表述为“三轮整体 PASS”。
- 六项修复均已上线并复测：#408 mode executor、#409 dialog feedback、#410 approver task read、#413 deep link、#414 非生产 runtime 入口、Issue #420 的修复 PR #423；最终轮同时 PASS 五源 reconciliation、正确押金退款、C02 409/审批深链和 Dashboard KPI。
- 最终报告由 PR [#426](https://github.com/ivanzhao299/jinhu-smart-park/pull/426) 经 review/CI/squash merge，main CI 与 Deploy 双绿。
- PR [#428](https://github.com/ivanzhao299/jinhu-smart-park/pull/428) 修订 residual gate 后，最终轮 immutable 审计/效果表按新口径重分类为 PASS：报告保留聚合 before、trigger/table/不可删原因；同一 `RUN_ID` 的 compose 数据卷已整体销毁，project 容器/卷/网络为 0，四端口监听为 0。全过程未禁用审计 trigger、未使用 `session_replication_role`、未 TRUNCATE。
- 真人岗位具名签署、跨园区（本轮仅单园区 fixture）与 Chrome MCP（最终轮 `N/A (not available)`）属于如实保留的外部门/覆盖限制，不因任务归档而宣称完成。
- 据用户确认的新验收口径，六个修复子任务与本父任务现可归档；历史报告与 local-only evidence 保持原样，归档 PR 只补充可核验的收尾依据。
