# 技术设计

后端 query 在生成 task CTE 前解析 `workorder_handler` data-scope，使用同一 SQL 条件供列表与 count；不能只在前端过滤。

范围谓词只作用于已分配的 `homestay_turnover`：公共到店/离店、未分配周转继续作为可领取队列可见；self/custom 只看允许负责人集合，`current_park`/unrestricted 和 `property_task:supervise` 查看园区全队列。该规则与 property-task 的队列读取及动作授权契约保持一致。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
