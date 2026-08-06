# PR192 GitHub 主干集成实施计划

## Phase 0：冻结与预检

- [x] 获取最新 `origin/main`，记录 SHA 与 divergence。
- [x] 启动本任务并提交只含本任务目录的 coordination SHA；核验其相对 `f19ab4d5`
  无业务/配置变化。
- [x] 核验 snapshot、cutpoints、commit ancestry 和远端 ref 不碰撞。
- [x] 生成 branch/ref manifest 与 SHA-256。
- [x] 核验工作树只含既有 `.codex/config.toml`、`NUL`；不得暂存。
- [x] 推送 immutable snapshot、coordination 与必要 compare refs，禁止 force。

Stop point：任何 ref 已存在且目标不同，立即停止，不覆盖。

## Phase 1：独立集成 worktree

- [x] 从最新 `origin/main` 创建 `codex/pr192-main-integration`。
- [x] 使用独立 worktree，不切换当前用户工作树。
- [x] 以 `--no-ff --no-commit` 合并 coordination SHA。
- [x] 输出冲突清单和逐文件裁决记录。
- [x] 先运行冲突相关 targeted tests，再创建 merge commit。

Stop point：权限、财务、Identity、Files、迁移或 seed 语义无法从现有 contract 判定时，
保持未提交 merge 并请求独立 reviewer，不猜测。

## Phase 2：主干差异与平行修复审计

- [x] 核验已合并 agent/refix 聚合分支不会重复进入。
- [x] 对单项 UAT 需求逐项检查最终 tree，而不是 merge 旧 tips。
- [x] 缺失修复只以基于 integration HEAD 的窄提交补齐。
- [x] 生成 `15b6e8f6..HEAD` closure diff 和风险分类。

## Phase 3：本地质量门

按风险由窄到宽：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web lint
pnpm typecheck
pnpm test:unit
pnpm build
git diff --check
```

- [x] Files/Identity/Property/offline/upload targeted tests PASS。
- [x] Migration/seed/production-init contract PASS。
- [x] 全量 verify 等价命令 PASS。
- [x] 失败必须修复或明确为与本任务无关的既有 baseline；P0/P1 不得跳过。

## Phase 4：GitHub Draft PR 与 CI

- [x] 推送 integration branch（无 force）。
- [x] 创建唯一 Draft PR 到 `main`。
- [x] PR body 含 Track 分层、冲突裁决、ancestor-only evidence 声明和 remaining gates。
- [x] GitHub verify PASS。
- [x] 添加 `run-release-smoke` label，release-smoke PASS。
- [x] 记录 PR head SHA；后续 Gate 全部绑定该 SHA。

## Phase 5：Final-SHA 正式验收

- [ ] 在 final PR head 上完成 rollback 19/19。
- [ ] 在 final PR head 上完成 fresh 30-cell formal performance。
- [ ] formal evidence gate PASS，expected/observed=30/30。
- [ ] cleanup containers/networks/volumes/secrets residual=0。
- [ ] 独立 code/evidence/cleanup reviewers APPROVE，open P0/P1=[]。
- [ ] PR head 未变化；若变化，按 evidence invalidation policy 重跑。

## Phase 6：Ready 与交接

- [ ] 更新 PR body 为 final evidence SHA/链接。
- [ ] 从 Draft 改为 Ready for review。
- [ ] 请求领域、安全、数据库和发布 reviewer。
- [ ] 不启用 auto-merge；人工确认后再合入。
- [ ] 更新父 Trellis 路线图，但不冒充 human/production readiness。

## 回退点

- Phase 0：删除新建的同目标本地 ref；远端 ref 不强删，先确认无人消费。
- Phase 1–3：删除专用 worktree/本地 integration branch 后从记录的 main SHA 重建。
- Phase 4–6：关闭 Draft PR；保留 snapshot 和证据，集成分支不 force rewrite。
