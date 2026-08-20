# 实施计划

- [x] 复用单一负责人/工单候选授权规则，避免 list、detail、mutation 漂移。
- [x] 在详情和 transaction mutation 中应用规则，并锁定关联工单。
- [x] 补 service/spec 回归；真实 API E2E 跨园区负向覆盖待运行。
- [x] 定向 API 测试、lint、typecheck、Trellis check 和 `git diff --check` 已通过；E2E、PR/Codex/CI 待完成。
