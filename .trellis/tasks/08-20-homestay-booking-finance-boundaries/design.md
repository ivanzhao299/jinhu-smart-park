# 技术设计

在 domain policy 中集中定义允许状态；候选必须 keyword+limit；住客新增在 booking 行锁事务内计数。现有更严格身份/审批规则保持下限。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
