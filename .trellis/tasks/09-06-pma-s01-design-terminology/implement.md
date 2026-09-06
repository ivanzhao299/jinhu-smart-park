# Implementation Progress

## Plan

- [x] 保全 HCD R4 基线：`codex/hcd-uat-deep-final@4c6edf10` 已 push；契约测试 3/3 PASS。
- [x] 从 `origin/main@a3fac83f` 创建 `codex/fix-pma-s01`；因 `main` 被其他 worktree 占用，不触碰其 worktree。
- [x] 创建 GitHub Issue #647 与本 Trellis 任务。
- [x] 核验当前 shared enum、API 状态和全部拟改术语引用。
- [x] 新增当前态设计索引并修订 architecture/docs 索引。
- [x] 收敛 shared 显示字典与权限 bundle；签名角色名保留为 frozen ABI，并以契约测试明确兼容边界。
- [x] 仅向仍有误导风险的历史证据追加现名/历史注记。
- [x] 运行链接检查、shared 定向测试、lint、workspace typecheck/build、diff 检查。
- [ ] 更新本文件记录实际结果；提交并 push。
- [ ] 创建 PR；最多三轮 review；等待 CI 并合并。
- [ ] 等待 main CI 与 Deploy 双绿后归档 Trellis 任务。

## Validation Plan

- `git diff --check`
- 本地 Markdown 相对链接检查（限定改动文件）
- `pnpm --filter @jinhu/shared test`（若脚本存在，否则运行匹配的 Node test）
- `pnpm --filter @jinhu/shared build`
- `pnpm typecheck`（资源允许时）
- GitHub PR checks；merge 后 main CI 与 Deploy

## Risks / Rollback Points

- 批量替换会改写历史语义：禁止全仓机械替换，逐文件审阅。
- shared 文案可能被快照/契约消费：先搜索全部值与消费者，定向更新断言。
- 状态机材料可能滞后：以 shared enum、API transition 和 DB 为事实源，未知项明确标注。
- 每次提交前确认没有 HR #565~#646 相关文件。

## Evidence Log

- 2026-09-06：`node --test scripts/e2e/lea-post-deploy-uat.contract.mjs`，3 pass / 0 fail（HCD R4 保全分支）。
- 2026-09-06：Issue #647 创建成功。
- 2026-09-06：首次直接运行 shared tests 因切分支后旧 `dist` 触发 5 个 HR 导出假失败；未修改 HR。执行 shared build 刷新产物后同一套测试恢复全绿。
- 2026-09-06：`pnpm --filter @jinhu/shared build` PASS；`pnpm --filter @jinhu/shared test` 42 pass / 0 fail；`pnpm --filter @jinhu/shared typecheck` PASS；`pnpm --filter @jinhu/shared lint` PASS。
- 2026-09-06：`pnpm typecheck` PASS（shared/ui/api/web 全部通过）。
- 2026-09-06：8 个改动 Markdown 文件的本地相对链接检查 PASS；`git diff --check` PASS。
- 2026-09-06：PR #648 第 1 轮 Codex review 提出 3 条 P2。已修正签署状态说明和 Trellis `base_branch`；角色 bundle 现名采用“先校验存储签名、再按稳定 code 投影显示名”，保持零迁移且不改 released hash/权限集合。
- 2026-09-06：review 修订后 shared build/test 42/42、API/shared lint、API typecheck、`git diff --check` PASS。本地 API 单测 runner 因当前 worktree 未安装 `tsx`/`ts-node` 无法启动；交由完整依赖环境的第 2 轮 CI unit tests 验证，不安装依赖污染现场。
- 2026-09-06：PR #648 第 2 轮 review 发现 `property-housing-task-supervisor` 仍会回退旧名。已全量枚举 migration 中 4 个 housing bundle 并补齐最后一个 override；第 3 轮为最终 review 轮。
