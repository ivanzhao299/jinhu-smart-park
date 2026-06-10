# JinHu Smart Park 工单查询 Service 第二刀 2B：stats 设计

## 1. 目的

本文用于评估 `stats` 是否适合从 `WorkOrdersService` 迁移到 `WorkOrderQueryService`，并明确统计口径、依赖、风险、实施边界和验证方案。

本阶段只做只读设计，不修改后端代码，不修改 controller、DTO、entity、测试脚本、CI、依赖、migration 或 seed。

## 2. 背景

工单查询 service 已完成两批低风险拆分：

- 第一批：`list`、`detail`、`logs` 已迁移到 `WorkOrderQueryService` 并收口。
- 第二刀 2A：`overdue`、`listSlaRules` 已迁移到 `WorkOrderQueryService` 并收口。

当前 `WorkOrderQueryService` 已承接：

- `list`
- `detail`
- `logs`
- `overdue`
- `listSlaRules`

`stats` 因统计口径复杂，被第二刀设计单独放入 2B。本阶段只确认是否适合迁移以及如何迁移，不直接改代码。

## 3. stats 当前实现盘点

| 方法 | 当前 service | controller 入口 | 请求 DTO / 参数 | 返回结构 | 主要指标 | 是否纯查询 | 是否写库 | 是否触发状态更新 | 是否触发日志 / 附件副作用 | 主要依赖 | 风险等级 | 建议动作 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `stats` | `WorkOrdersService` | `GET /work-orders/stats` | `WorkOrderStatsQueryDto`，参数为 `start_date`、`end_date`、`wo_type`、`building_id`、`assignee_id`、`park_tenant_id` | `WorkOrderStatsResult`：`summary`、`by_status`、`by_type`、`by_priority`、`by_assignee`、`overdue_top` | 总量、状态摘要、逾期数量、平均派单耗时、平均完成耗时、平均满意度、状态 / 类型 / 优先级 / 处理人分组、逾期 top | 是 | 否 | 否 | 否 | `WorkOrderEntity` repository、`scopedBuilder`、`applyDataScope`、`applyStatsQuery`、`buildStatsResult`、`groupCount`、`optionalMinutesBetween`、`average`、`calculateOverdueMinutes`、状态常量 | P1-B | 可迁移，但必须单独小批实施并做统计专项验证 |

当前实现位于 `apps/api/src/modules/work-orders/work-orders.service.ts`：

```ts
const builder = this.scopedBuilder(scope);
await this.applyDataScope(builder, actor);
this.applyStatsQuery(builder, query);
const workOrders = await builder.getMany();
return this.buildStatsResult(workOrders);
```

controller 当前仍调用 `WorkOrdersService.stats(scope, query, user)`。

## 4. stats 统计口径分析

当前 `stats` 统计口径以查询出的 `WorkOrderEntity[]` 为基础，在内存中聚合生成结果。

### summary

`summary` 当前包含：

- `total_count`：查询范围内工单总数。
- `pending_count`：状态为 `WORK_ORDER_STATUS_SUBMITTED` 的工单数。
- `assigned_count`：状态为 `WORK_ORDER_STATUS_ASSIGNED` 的工单数。
- `in_progress_count`：状态为 `WORK_ORDER_STATUS_ACCEPTED`、`WORK_ORDER_STATUS_PROCESSING`、`WORK_ORDER_STATUS_WAIT_MATERIAL` 的工单数。
- `done_count`：状态为 `WORK_ORDER_STATUS_FINISHED`、`WORK_ORDER_STATUS_CONFIRMED`、`WORK_ORDER_STATUS_EVALUATED`、`WORK_ORDER_STATUS_CLOSED` 的工单数。
- `overdue_count`：`overdueFlag` 为 true 的工单数。
- `closed_count`：状态为 `WORK_ORDER_STATUS_CLOSED` 的工单数。
- `avg_dispatch_minutes`：`createTime` 到 `dispatchTime` 的平均分钟数。
- `avg_finish_minutes`：`acceptTime ?? dispatchTime ?? createTime` 到 `finishTime` 的平均分钟数。
- `avg_satisfaction`：已有 `satisfaction` 数值的平均值。

### 分组统计

当前返回以下分组：

- `by_status`：按 `status` 分组计数。
- `by_type`：按 `woType` 分组计数。
- `by_priority`：按 `priority` 分组计数。
- `by_assignee`：按 `assigneeId` 分组，包含 `assignee_id`、`assignee_name`、`count`、`done_count`、`overdue_count`、`avg_finish_minutes`，按 `count` 和 `done_count` 降序取前 20。
- `overdue_top`：仅包含存在逾期工单的处理人，包含 `assignee_id`、`assignee_name`、`overdue_count`、`max_overdue_minutes`，按 `overdue_count` 和 `max_overdue_minutes` 降序取前 10。

### 当前不存在的指标

当前代码未实现以下指标：

- 按紧急度分组。
- 近 N 天趋势。
- 平均响应时间独立字段。
- SLA 达标率。
- 按来源渠道分组。

后续迁移不应新增这些指标，避免改变返回结构和统计口径。

## 5. 过滤与权限边界

`stats` 当前使用 `scopedBuilder(scope)` 构造查询，天然包含：

- `workOrder.tenant_id = scope.tenantId`
- `workOrder.park_id = scope.parkId`
- `workOrder.is_deleted = false`

随后调用 `applyDataScope(builder, actor)`，应用数据范围过滤：

- 园区范围。
- 楼栋范围。
- 房源范围。
- 企业范围。
- 工单处理人范围。
- 非全量工单权限时的处理人 / 报修人 / 创建人自我范围。

`stats` 自身使用 `applyStatsQuery`，支持以下筛选：

- `wo_type`
- `building_id`
- `assignee_id`
- `park_tenant_id`
- `start_date`
- `end_date`

时间范围口径：

- `start_date`：`workOrder.create_time >= :startDate`
- `end_date`：`workOrder.create_time < (:endDate::date + INTERVAL '1 day')`

与 `list` 的过滤口径关系：

- `stats` 与 `list` 共享租户、园区、软删除和数据范围过滤。
- `stats` 的业务筛选字段少于 `list`，没有 `keyword`、`status`、`priority`、`urgency`、`reporter_id`、`unit_id`、`device_id`、`source_type`、`overdue_only`。
- `stats` 不使用排序和分页。

后续迁移必须保持上述差异，不应为了复用 `list` 的 `applyQuery` 而扩大或改变统计筛选口径。

## 6. 副作用检查

`stats` 当前副作用检查结论：

- 不写库。
- 不调用 `recalculateOverdue`。
- 不调用 `checkOverdue`。
- 不修改 `overdueFlag`。
- 不写工单日志。
- 不绑定附件。
- 不触发状态变更。
- 不触碰幂等写入口。
- 不调用 SLA 创建 / 更新 / 删除。
- 不调用派单、改派、接单、开始、待料、完成、确认、评价、关闭、取消、退回或驳回。

`calculateOverdueMinutes` 只用于统计 `overdue_top.max_overdue_minutes`，以当前时间和工单 SLA 字段计算逾期分钟数，不回写数据库。

## 7. 迁移可行性判断

结论：建议迁移 `stats`，但必须作为第二刀 2B 单独一刀实施。

风险等级：P1-B。

理由：

- `stats` 是纯查询。
- `stats` 不写库，不触发状态更新，不写日志，不绑定附件。
- `stats` 依赖租户、园区和数据范围过滤，需要保持权限口径。
- `stats` 返回结构和统计口径较复杂，需要专项验证。
- `stats` 依赖多个 helper 和状态常量，不适合和其它方法混合迁移。

后续实施建议：

- 新增 `WorkOrderQueryService.stats`。
- `WorkOrdersService.stats` 保留 facade，委托给 `WorkOrderQueryService.stats`。
- controller 可改为直连 `WorkOrderQueryService.stats`，与 `list`、`detail`、`logs`、`overdue`、`listSlaRules` 保持一致。
- 不新增 repository；`WorkOrderQueryService` 已有 `WorkOrderEntity` repository、`DataScopeService`。
- 需要复制或迁移 stats 专用 helper：`applyStatsQuery`、`buildStatsResult`、`groupCount`、`optionalMinutesBetween`、`average`、`calculateOverdueMinutes`。
- `average`、`isOpenWorkOrder` 目前也被 `tenant360Workorders` / `unitWorkorders` 使用；为避免扩大改动，2B 实施时优先在 query service 内复制 stats 所需 helper，不移动原 service helper。
- `isOpenWorkOrder` 当前不被 `stats` 使用，不应为迁移 `stats` 而移动。

## 8. 后续实施设计

### 工单查询 service 第二刀 2B 实施：迁移 stats

目标：

- 将 `stats` 迁移到 `WorkOrderQueryService`。
- `WorkOrdersService` 保留 `stats` facade。
- controller 可直连 query service。
- 不改变接口路径。
- 不改变 DTO。
- 不改变返回结构。
- 不改变统计口径。
- 不改变过滤口径。
- 不触碰状态流转和副作用。

最小修改范围：

- `apps/api/src/modules/work-orders/work-order-query.service.ts`
- `apps/api/src/modules/work-orders/work-orders.service.ts`
- `apps/api/src/modules/work-orders/work-orders.controller.ts`

预计不需要修改 `work-orders.module.ts`，因为 `WorkOrderQueryService` 已注册，`WorkOrderEntity` repository 已在当前模块注册。

## 9. 验证计划

实施时必须执行：

- `pnpm --filter @jinhu/api typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `node scripts/e2e/first-release-workorders.mjs`
- `node scripts/e2e/first-release-regression.mjs`
- `git diff --check`

建议新增或补充：

- `GET /work-orders/stats` 迁移前后响应对照。
- 固定测试数据下的 `summary`、`by_status`、`by_type`、`by_priority`、`by_assignee`、`overdue_top` 字段对照。
- 至少记录迁移前后关键字段一致性。

如果暂不新增自动化，也应在 PR 说明中列出人工对照口径：

- 同一账号。
- 同一租户 / 园区。
- 同一数据范围。
- 同一筛选条件。
- 同一数据库数据集。
- 对比 `summary` 全字段。
- 对比各分组数组的 key、count 和排序。

## 10. 继续暂缓范围

继续暂缓：

- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 附件绑定
- 所有状态流转
- 所有写入口
- SLA 写入
- 幂等写入口相关逻辑

这些逻辑包含跨模块聚合、事务、副作用、日志、附件、状态语义或幂等行为，不属于 2B stats 迁移范围。

## 11. 实施原则

- 每次只迁移 `stats`。
- 不合并其它查询迁移。
- 不改 controller 路由。
- 不改 DTO。
- 不改 entity。
- 不改返回结构。
- 不改统计口径。
- 不改权限 / 租户 / 园区过滤。
- 不触发任何写库。
- 原 service 保留 facade。
- 必须有工单专项和统一回归。
- 尽量做 stats 前后响应对照。
- 不做格式化大扫除。

## 12. 结论

`stats` 适合迁移到 `WorkOrderQueryService`，但风险等级为 P1-B，必须单独作为第二刀 2B 小批实施。

下一步建议进入 `stats` 实施前的最小方案确认，实施时只迁移 `stats`，保留 `WorkOrdersService.stats` facade，不触碰跨模块聚合、状态流转、日志写入、附件绑定、逾期重算、SLA 写入和幂等写入口。

补充状态：2B `stats` 已完成实施，迁移前后真实接口响应 `data` 对照完全一致，已进入收口复核。
