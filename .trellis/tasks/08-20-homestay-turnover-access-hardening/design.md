# 技术设计

## 边界与合同

周转是民宿的业务聚合；工单仍由工单模块权威管理。民宿只在同一事务中引用既有工单，不创建、不驱动其生命周期。

详情和 mutation 以同一负责人可见性规则保护已分配周转：super、通配权限、`property_task:supervise` 或 unrestricted handler scope 可访问；否则未分配任务保持可领取，已分配任务仅允许 `workorder_handler.allowed_ids` 中的负责人。unit scope 仍是独立且先行的限制。

关联工单使用共享的候选筛选语义：`workorder:read`、tenant/park、非删除、同 unit、非终态，以及所有工单数据范围。mutation 在当前 transaction 的 manager/repository 上以悲观锁重验引用，避免候选展示与提交之间状态漂移。

## 兼容与回滚

这是 fail-closed 的授权收紧，无 schema/migration。可能拒绝此前不应成功的跨负责人或终态关联请求；合法公共队列、未分配任务和有效候选保持不变。可通过独立 PR revert，但不得恢复越权路径。
