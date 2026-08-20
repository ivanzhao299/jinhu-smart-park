# 技术设计

周转聚合只引用工单模块的既有工单，不创建或驱动其生命周期。详情和 mutation 使用等价的负责人范围：super、通配权限、`property_task:supervise` 或 unrestricted handler scope 可访问；否则未分配任务保持可领取，已分配任务只允许 `workorder_handler.allowed_ids`。

关联工单必须在当前 mutation transaction 中重新读取并加锁，校验 `workorder:read`、tenant/park、同 unit、非删除、非终态和工单数据范围。该改动为 fail-closed 权限收紧，无 schema/migration；可独立 revert，但不得恢复越权路径。
