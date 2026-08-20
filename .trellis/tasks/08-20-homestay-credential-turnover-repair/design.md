# 技术设计

复用 work-order 与 property occupancy，不建立第二套维修模型；新增动作使用稳定 idempotency key、行锁和审计。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
