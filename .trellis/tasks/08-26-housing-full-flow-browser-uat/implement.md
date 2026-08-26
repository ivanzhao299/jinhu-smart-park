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
