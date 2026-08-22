# 实施计划

- [ ] 提取或复用单一负责人/工单候选授权规则，避免 list、detail、mutation 漂移。
- [ ] 在周转详情与 transaction 内 mutation 应用该规则，并锁定关联工单。
- [ ] 补 service/spec 与真实 API E2E 跨园区负向覆盖。
- [ ] 运行 API 定向测试、lint、typecheck、E2E 和 `git diff --check`。
- [ ] 执行 Trellis 检查、更新防回归规范、提交/推送、中文请求 Codex 复审。
