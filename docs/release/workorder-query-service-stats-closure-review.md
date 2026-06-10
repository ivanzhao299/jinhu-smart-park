# JinHu Smart Park 工单查询 Service 第二刀 2B：stats 收口复核

## 1. 复核目的

本文用于复核工单 query service 第二刀 2B：`stats` 迁移后的状态，判断是否达到阶段性收口标准，并确认工单 query service 拆分是否应继续推进跨模块聚合查询。

本阶段只做文档复核，不修改业务代码，不继续拆 service，不修改 controller、DTO、entity、测试脚本、CI、依赖、migration 或 seed。

## 2. 拆分前状态

工单 query service 已完成以下拆分：

- 第一批：`list`、`detail`、`logs` 已迁移到 `WorkOrderQueryService` 并收口。
- 第二刀 2A：`overdue`、`listSlaRules` 已迁移到 `WorkOrderQueryService` 并收口。
- 第二刀 2B 设计确认 `stats` 为纯查询，不写库，不触发状态更新，不调用 `recalculateOverdue` / `checkOverdue`，不写日志，不绑定附件，不触碰幂等写入口。

`stats` 虽然是纯查询，但统计口径包含状态分组、平均耗时、满意度、处理人分组和逾期 top，复杂度高于普通列表查询，因此作为 2B 单独迁移。

以下范围在 2B 前继续冻结：

- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 状态流转
- 日志写入
- 附件绑定
- SLA 写入
- 幂等写入口

## 3. 已完成 2B 拆分

2B 已完成以下拆分：

- `stats` 已迁移到 `WorkOrderQueryService`。
- `WorkOrdersService.stats` 保留同名 facade，继续委托 `WorkOrderQueryService.stats`。
- `WorkOrdersController.stats` 已直连 `WorkOrderQueryService.stats`。
- `work-orders.module.ts` 无需修改，现有 provider 已包含 `WorkOrderQueryService`。
- 本次只迁移 `stats` 一个方法。

未迁移内容：

- 未迁移 `tenant360Workorders`。
- 未迁移 `unitWorkorders`。
- 未修改 `recalculateOverdue`。
- 未修改 `createLog`。
- 未修改状态流转、日志写入、附件绑定、SLA 写入或幂等写入口。

## 4. 当前职责边界

### WorkOrderQueryService

当前承接：

- `list`
- `detail`
- `logs`
- `overdue`
- `listSlaRules`
- `stats`

### WorkOrdersService

继续保留：

- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 工单 CRUD
- SLA 创建 / 更新 / 删除
- 派单 / 改派
- 接单 / 开始处理
- 待料 / 完成
- 确认 / 评价 / 关闭
- 取消 / 退回 / 驳回
- 日志写入
- 附件绑定
- 幂等写入口相关逻辑
- query facade

## 5. stats 行为保持

`stats` 行为保持结论：

- API 路径保持 `GET /api/v1/work-orders/stats`。
- DTO 不变，继续使用 `WorkOrderStatsQueryDto`。
- entity 不变。
- 返回结构不变，继续返回 `WorkOrderStatsResult`。
- 统计字段名不变。
- 统计口径不变。
- 筛选字段不变。
- 租户过滤不变。
- 园区过滤不变。
- 数据范围过滤不变。
- 保留 stats 独立筛选口径。
- 未改用 `applyQuery`。

当前 `stats` 仍通过 `scopedBuilder(scope)` 构造查询，保持：

- `workOrder.tenant_id = scope.tenantId`
- `workOrder.park_id = scope.parkId`
- `workOrder.is_deleted = false`

随后继续调用 `applyDataScope(builder, actor)` 应用数据范围过滤，再调用 `applyStatsQuery(builder, query)` 应用 stats 专用筛选。

## 6. stats 统计口径保持

`stats` 继续返回：

- `summary`
- `by_status`
- `by_type`
- `by_priority`
- `by_assignee`
- `overdue_top`

统计内容继续包括：

- 总工单数：`summary.total_count`
- 待提交数量：`summary.pending_count`
- 已派单数量：`summary.assigned_count`
- 处理中数量：`summary.in_progress_count`
- 完成数量：`summary.done_count`
- 关闭数量：`summary.closed_count`
- 逾期数量：`summary.overdue_count`
- 平均派单耗时：`summary.avg_dispatch_minutes`
- 平均完成耗时：`summary.avg_finish_minutes`
- 平均满意度：`summary.avg_satisfaction`
- 状态分组：`by_status`
- 类型分组：`by_type`
- 优先级分组：`by_priority`
- 处理人分组：`by_assignee`
- 逾期 top：`overdue_top`

统计排序口径保持：

- `by_status`、`by_type`、`by_priority` 按 `count` 降序。
- `by_assignee` 按 `count`、`done_count` 降序取前 20。
- `overdue_top` 按 `overdue_count`、`max_overdue_minutes` 降序取前 10。

## 7. 副作用边界

2B 拆分后，`stats` 仍未触发：

- `recalculateOverdue`
- `checkOverdue`
- 写库
- 状态更新
- 日志写入
- 附件绑定
- SLA 创建 / 更新 / 删除
- 幂等写入口

`calculateOverdueMinutes` 仅用于计算统计响应中的 `overdue_top.max_overdue_minutes`，不回写 `overdueFlag`，不改变状态语义。

## 8. 响应对照与验证

已完成迁移前后真实接口响应对照：

- `/tmp/jinhu-regression/workorder-stats-before.data.json`
- `/tmp/jinhu-regression/workorder-stats-after.data.json`

对照结果：

- `diff -u /tmp/jinhu-regression/workorder-stats-before.data.json /tmp/jinhu-regression/workorder-stats-after.data.json` 结果为空。
- `data` 完全一致。

已完成验证：

- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。
- `node scripts/e2e/first-release-workorders.mjs`：通过。
- `node scripts/e2e/first-release-regression.mjs`：通过，最终输出 `First-release regression completed`。

## 9. 剩余风险

- 未新增专门自动化 stats 快照测试。
- `tenant360Workorders` / `unitWorkorders` 仍作为跨模块聚合暂缓。
- query helper 复制后需避免长期分叉。
- 工单 service 仍包含复杂状态流转和副作用，不应继续低估拆分风险。
- 若后续评估跨模块聚合查询，需要重新确认调用方、字段策略、数据范围过滤和返回结构。

## 10. 收口判断

建议工单 query service 第二刀 2B 阶段性收口。

判断依据：

- `stats` 已迁移到 `WorkOrderQueryService`。
- `WorkOrdersService.stats` 保留 facade，兼容既有调用边界。
- `WorkOrdersController.stats` 已直连 query service。
- stats 迁移前后真实接口响应 `data` 完全一致。
- 工单专项回归通过。
- 首发统一回归通过。
- 状态流转、写入、副作用、SLA 写入、逾期重算和幂等写入口均未修改。

不建议继续直接迁移 `tenant360Workorders` / `unitWorkorders`。

原因：

- 两者是跨模块聚合查询，分别涉及租户 360 和房源关联工单。
- 两者依赖其它模块调用边界和字段策略输出。
- 拆分收益存在，但风险与复核成本高于当前已完成的 controller 查询入口。

建议先暂停工单 query service 拆分，转入阶段性总结。

## 11. 后续建议

- 工单查询 service 第二刀 2B 阶段性收口。
- 不直接迁移跨模块聚合。
- 后续可做工单 query service 阶段性总结。
- 若评估 `tenant360Workorders` / `unitWorkorders`，只先做只读设计，不直接实施。
- 继续冻结状态流转、日志写入、附件绑定、逾期重算、SLA 写入和幂等写入口。

## 12. 结论

工单 query service 第二刀 2B：`stats` 已达到阶段性收口标准。建议停止本轮继续拆分，先进入工单 query service 阶段性总结；跨模块聚合查询后续只做独立设计，不直接进入实施。

补充状态：下一阶段已进入工单 query service 阶段性总结。
