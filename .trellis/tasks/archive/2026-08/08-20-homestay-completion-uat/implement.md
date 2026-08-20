# 实施计划

## 0. 基线与规划

- [x] 只读审计设计、前端、API、数据库、权限、测试和 UAT 状态。
- [x] 复审方案，移除离线高风险 mutation 承诺，收紧 P1/P2 与子任务边界。
- [x] 从 GitHub `main` 最新 SHA 创建隔离分支/worktree。
- [x] 创建父任务和六个子任务。
- [x] 创建/复用对应 GitHub Issues，并回写编号（#325、#327、#326、#328、#329、#330；高风险总承接 #289）。
- [x] 完成子任务 PRD/design/implement，按顺序激活。

## 1. 实施顺序

- [x] P1 task assignee scope。
- [x] P1 task/request deep link。
- [x] P1 booking/guest/finance boundary。
- [x] P2 credential/turnover/repair。
- [x] P2 Web structure/state/test gates。
- [x] API E2E、真实浏览器 UAT、证据同步。

## 2. 每个子任务固定门禁

- [x] 从最新 main/rebase 后检查 diff 和依赖。
- [x] 先补 characterization/失败测试，再做最小实现。
- [x] 运行目标 unit、typecheck、lint、build、PG/API E2E。
- [x] 前端改动执行桌面和 390px 真实浏览器检查。
- [x] `git diff --check`，只 stage 子任务文件。
- [x] 提交、推送、创建 consolidated draft PR #331，评论 `@codex review`。
- [x] 逐条关闭最新 head 的有效 review，推送后重新 review。
- [x] CI 全绿、最新 review 无重大问题、mergeable 后转 ready 并合并。

## 3. 最终门禁

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] API/Web 目标单测与 PG specs。
- [x] `pnpm test:e2e:homestay-api`
- [x] `pnpm test:e2e:property-api`（main Release Smoke）。
- [x] migration 空库/升级库 smoke（PR 与 main Release Smoke）。
- [x] 多角色/跨园区/字段/文件/模块启停矩阵。
- [x] desktop/768/390/360 浏览器 UAT。
- [x] fixture/file/approval residual=0。
- [x] 文档绑定最终 candidate SHA 与环境。

## 4. 合并后

- [x] 监控 main CI、Release Smoke 和 Deploy Production。
- [x] 验证 migration、seed、health/ready、公开保护账号流程。
- [x] 验证 post-deploy Docker cleanup；日志确认 unused images/build cache 清理完成。
- [x] 长等待切换 5 分钟 heartbeat；PR #331 生命周期成功，automation 延续 PR #332 元数据收尾后删除。
- [x] 真人签署不齐时保持 `awaiting_human_gate`，未伪造真人结论。
