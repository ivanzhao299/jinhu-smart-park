# 实施计划

## 0. 基线与规划

- [x] 只读审计设计、前端、API、数据库、权限、测试和 UAT 状态。
- [x] 复审方案，移除离线高风险 mutation 承诺，收紧 P1/P2 与子任务边界。
- [x] 从 GitHub `main` 最新 SHA 创建隔离分支/worktree。
- [x] 创建父任务和六个子任务。
- [x] 创建/复用对应 GitHub Issues，并回写编号（#325、#327、#326、#328、#329、#330；高风险总承接 #289）。
- [ ] 完成子任务 PRD/design/implement，按顺序激活。

## 1. 实施顺序

- [ ] P1 task assignee scope。
- [ ] P1 task/request deep link。
- [ ] P1 booking/guest/finance boundary。
- [ ] P2 credential/turnover/repair。
- [ ] P2 Web structure/state/test gates。
- [ ] API E2E、真实浏览器 UAT、证据同步。

## 2. 每个子任务固定门禁

- [ ] 从最新 main/rebase 后检查 diff 和依赖。
- [ ] 先补 characterization/失败测试，再做最小实现。
- [ ] 运行目标 unit、typecheck、lint、build、PG/API E2E。
- [ ] 前端改动执行桌面和 390px 真实浏览器检查。
- [ ] `git diff --check`，只 stage 子任务文件。
- [ ] 提交、推送、创建 draft PR，评论 `@codex review`。
- [ ] 逐条关闭最新 head 的有效 review，推送后重新 review。
- [ ] CI 全绿、最新 review 无重大问题、mergeable 后转 ready 并合并。

## 3. 最终门禁

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] API/Web 目标单测与 PG specs。
- [ ] `pnpm test:e2e:homestay-api`
- [ ] `pnpm test:e2e:property-api`
- [ ] migration 空库/升级库 smoke。
- [ ] 多角色/跨园区/字段/文件/模块启停矩阵。
- [ ] desktop/768/390/360 浏览器 UAT。
- [ ] fixture/file/approval residual=0。
- [ ] 文档绑定最终 candidate SHA 与环境。

## 4. 合并后

- [ ] 监控 main CI、Release Smoke 和 Deploy Production。
- [ ] 验证 migration、seed、health/ready、公开保护账号流程。
- [ ] 验证 post-deploy Docker cleanup；失败时明确报告并停止宣称闭环。
- [ ] 长等待切换 5 分钟 heartbeat，成功后删除自动化。
- [ ] 真人签署不齐时保持 awaiting_human_gate。
