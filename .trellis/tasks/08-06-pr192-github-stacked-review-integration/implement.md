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

### 2026-08-07 main 前移后的重新封版

- [x] 合并最新 `origin/main@5f62efd56cc5e078fd5ab120dce699b7383464be`，保留 PR192 与
  `admin-issue-runner-repair` 双方 API、Web、shared 与 CI 行为。
- [x] 修复 `000190` 迁移编号冲突：已合入 main 的 admin issue 迁移保持不变，尚未合入的
  Property B compatibility migration 顺延到 `000200`，SQL 字节 SHA-256 保持
  `da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a`。
- [x] 重新签名 v13-v31 baseline/formal source manifests，并通过 v13-v31 全链规格。
- [x] 将已归档 authority 定位到 archive 路径；module-core exact tree 以明确白名单更新为
  17 total / 14 production / 3 specs，保持 fail-closed。
- [x] 修复 runner 激活工作流临时文件清理与密码 argv 暴露风险。
- [x] prerequisite 修复前的集成基线已通过本地 lint、typecheck、unit、build、diff-check；
  当时两项独立审查均 APPROVE，open P0/P1/P2=[]。后续 prerequisite 变更须重新跑当前树门禁。
- [x] final-SHA performance provisioning 发现 `000190_admin_issue_runner_repair.sql` 的
  park-scope role conflict target 与当前 tenant-wide role arbiter 不可推断；保持已合入历史
  migration 字节不变，通过 `database/migration-prerequisites/000190_admin_issue_runner_repair/`
  增加只含兼容索引的 production-safe prerequisite，并以真实 PostgreSQL 重放验证。
- [x] 后续 clean-db provisioning 发现 `000193_property_b_runtime_integrity_forward_fix.sql`
  断言的 `biz_property_runtime_checkpoint` 直到 `000200` 才创建；保持两个历史 migration
  字节不变，在 `000193` 前增加与 `000200` 完全兼容、无 DML 的 table prerequisite，
  并扩展 migration prerequisite contract。
- [x] 隔离库重放确认 `000193` 修复后继续暴露 `000194` 对 `sys_property_runtime_control`
  的同类后向定义依赖；增加第二个与 `000200` 精确一致、默认禁用且无 DML 的 table
  prerequisite，并将 `000194` 历史 SHA 纳入合同冻结。
- [x] `000200` 的 pre-existing catalog guard 要求前置对象已有 B0 definition-hash 签名；
  增加 `000200` prerequisite，先对两张表的 57 个 catalog 对象校验固定聚合 SHA-256，
  再写入与 `000200` 相同的签名注释，结构漂移时 fail closed。
- [x] 独立复核发现 fully-migrated 与 non-empty baseline 路径会按 migration-only manifest
  提前 fast-skip，绕过后来新增的 prerequisite；移除该全局快速退出，改为始终逐 migration
  核验 prerequisite、仅逐项跳过 checksum 匹配记录，并新增静态契约。
- [x] 三类隔离 PostgreSQL 回放通过：clean DB 200/200 + 6/6；fully-migrated 库移除两条
  prerequisite 历史和 runtime index 后，200 migration 全 skip、2 prerequisite 重建并重签；
  non-empty baseline 克隆库 200 migration baseline+skip、6 prerequisite 全执行。双历史差异均为 0，
  两个诊断库已删除且残留为 0。
- [x] 当前 prerequisite/runner 修复树重新通过 contract、Shell syntax、Trellis JSON/JSONL、
  diff-check、lint、typecheck 与 production build（158 个静态页面）。
- [x] 当前 prerequisite/runner 修复树通过最终独立审查；发现并修复 fully-migrated
  fast-skip、prerequisite 契约全集漏审和旧运维文档漂移后，open P0/P1/P2=[]。
- [x] `6ea4063b` formal rollback 在 7/19 后因 Web authority high port 52423 被占用而
  `EADDRINUSE` fail closed；cleanup residual=0。当前主机 ephemeral range 为 44620-48715，
  故证据只支持高端口冲突，不推断占用者。将确定性 API/Web listener 分别移至
  20000-24999 / 25000-29999，并增加低于默认 Linux ephemeral 下界的端口带契约；该旧
  run 只保留失败证据，必须在新 SHA 重新执行 19/19。
- [x] `5f46e7dc` 已取得 GitHub verify/release-smoke PASS 与 formal rollback 19/19 PASS；
  但 performance provisioning 前的独立只读计划审查发现清理错误未纳入 residual 的 P1，
  因此该 SHA 的 rollback/CI 依 evidence invalidation policy 降级为 ancestor-only。
- [x] 修复 performance cleanup fail-open：即使 Compose teardown 报错后资源枚举恰为 0，
  teardown error 仍贡献一个 residual 并使 gate 失败；README 与回归测试同步。
- [x] 澄清并强化 business clock 合同：它是数据集 cutoff/reference clock，不冒充冻结系统
  wall clock；值写入 seed manifest、注入全部四个实测容器，并在 load 前逐容器核验绑定。
- [x] 上述 performance evidence 修复通过第三轮独立代码审查，`open P0/P1/P2=[]`；本地
  performance tests 18/18、lint、typecheck、unit、production build 158 pages 与 diff-check PASS。
- [ ] 提交并推送上述修复，在新的 final SHA 重新取得 GitHub CI、rollback 19/19 和
  formal performance 30/30。
- [ ] prerequisite 修复提交后，重新取得 GitHub verify/release-smoke、rollback 19/19 与
  formal performance 30/30；修复前 `72406a14` 的证据仅保留为失败发现/ancestor 记录。
- [ ] 推送新的 merge commit，并在新 PR head 上重新取得 GitHub verify/release-smoke、
  rollback 19/19 与 formal performance 30/30 证据。

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
