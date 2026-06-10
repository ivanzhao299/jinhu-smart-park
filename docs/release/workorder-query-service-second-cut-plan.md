# JinHu Smart Park 工单查询 Service 第二刀设计

## 1. 目的

本文用于评估 `stats`、`overdue`、`listSlaRules` 是否适合进入 `WorkOrderQueryService` 第二批迁移，并制定低风险拆分路线。

本阶段只做只读盘点和设计，不修改后端代码，不继续拆 service，不修改 controller、DTO、entity、测试脚本、CI、依赖、migration 或 seed。

## 2. 背景

工单查询 service 第一批已经完成：

- 新增 `WorkOrderQueryService`。
- 已迁移 `list`、`detail`、`logs`。
- `WorkOrdersController` 中 `list`、`detail`、`logs` 已改为调用 query service。
- `WorkOrdersService` 保留 `list`、`detail`、`logs` facade，兼容其它模块。
- 写入、副作用、状态流转、日志写入、附件绑定、SLA 写入、逾期重算、统计和跨模块聚合仍保留在 `WorkOrdersService`。

第一批已完成 API typecheck、lint、typecheck、build、工单专项回归和首发统一回归，并已阶段性收口。

第二刀候选为：

- `stats`
- `overdue`
- `listSlaRules`

第二刀仍不触碰状态流转、副作用、日志写入、附件绑定、逾期重算或幂等写入口。

## 3. 当前候选方法盘点

| 方法 | 当前 service | controller 入口 | 当前职责 | 是否纯查询 | 是否写库 | 是否触发状态更新 | 是否触发日志 / 附件副作用 | 主要依赖 | 风险等级 | 建议动作 |
|---|---|---|---|---|---|---|---|---|---|---|
| `listSlaRules` | `WorkOrdersService` | `GET /work-orders/sla-rules` | SLA 规则分页列表 | 是 | 否 | 否 | 否 | `WorkOrderSlaRuleEntity` repository | P1-A | 第二刀 2A 优先迁移 |
| `overdue` | `WorkOrdersService` | `GET /work-orders/overdue` | 逾期工单列表 | 是 | 否 | 否 | 否 | 当前调用 `this.list(scope, { ...query, overdue_only: true }, actor)`，间接使用 `WorkOrderQueryService.list` | P1-A | 第二刀 2A 可随 `listSlaRules` 迁移 |
| `stats` | `WorkOrdersService` | `GET /work-orders/stats` | 工单统计 | 是 | 否 | 否 | 否 | `WorkOrderEntity` repository、`DataScopeService`、统计状态常量、`applyStatsQuery`、`buildStatsResult`、`groupCount`、`optionalMinutesBetween`、`average`、`calculateOverdueMinutes` | P1-B | 第二刀 2B 单独迁移并加强验证 |

三者均不触发 `createWorkOrderLog`，不绑定附件，不调用幂等写入口，不改变状态语义。

## 4. stats 分析

`stats(scope, query, actor)` 当前位于 `apps/api/src/modules/work-orders/work-orders.service.ts`。

controller 入口：

- `GET /work-orders/stats`
- controller method：`stats`
- 权限装饰器：`WORKORDER_STATS`

当前实现：

- 通过 `scopedBuilder(scope)` 构造工单查询。
- 通过 `applyDataScope(builder, actor)` 应用数据范围过滤。
- 通过 `applyStatsQuery(builder, query)` 应用统计筛选。
- 使用 `builder.getMany()` 读取工单集合。
- 通过 `buildStatsResult(workOrders)` 在内存中生成统计结果。

查询口径包括：

- `summary.total_count`
- `summary.pending_count`
- `summary.assigned_count`
- `summary.in_progress_count`
- `summary.done_count`
- `summary.overdue_count`
- `summary.closed_count`
- `summary.avg_dispatch_minutes`
- `summary.avg_finish_minutes`
- `summary.avg_satisfaction`
- `by_status`
- `by_type`
- `by_priority`
- `by_assignee`
- `overdue_top`

依赖项：

- `WorkOrderEntity` repository。
- `scopedBuilder`。
- `applyDataScope` 及其数据范围 helper。
- `applyStatsQuery`。
- `buildStatsResult`。
- `groupCount`。
- `optionalMinutesBetween`。
- `average`。
- `calculateOverdueMinutes`。
- 多个状态常量：`WORK_ORDER_STATUS_SUBMITTED`、`WORK_ORDER_STATUS_ASSIGNED`、`WORK_ORDER_STATUS_ACCEPTED`、`WORK_ORDER_STATUS_PROCESSING`、`WORK_ORDER_STATUS_WAIT_MATERIAL`、`WORK_ORDER_STATUS_FINISHED`、`WORK_ORDER_STATUS_CONFIRMED`、`WORK_ORDER_STATUS_EVALUATED`、`WORK_ORDER_STATUS_CLOSED`。

判断：

- `stats` 是纯查询，不写库，不触发日志，不绑定附件，不调用 `recalculateOverdue`。
- 它依赖权限、租户、园区和数据范围过滤，必须保持 `applyDataScope` 行为一致。
- 它的统计口径较复杂，并且部分 helper 也被 `tenant360Workorders` / `unitWorkorders` 等跨模块聚合使用，例如 `average`。
- `calculateOverdueMinutes` 只用于统计结果中的 `overdue_top` 计算；它不同于 `checkOverdue`，不写库、不改变逾期标记。

建议：

- `stats` 适合迁移，但不建议和所有候选一次性迁移。
- 建议作为 2B 单独迁移。
- 迁移时可以复制统计相关 helper 到 query service，避免移动原 service 中仍被跨模块聚合或写入链路间接依赖的 helper。
- 后续实施必须专项验证 `GET /work-orders/stats` 的返回结构和统计字段。

## 5. overdue 分析

`overdue(scope, query, actor)` 当前位于 `apps/api/src/modules/work-orders/work-orders.service.ts`。

controller 入口：

- `GET /work-orders/overdue`
- controller method：`overdue`
- 权限装饰器：`WORKORDER_OVERDUE`

当前实现：

```ts
const overdueQuery = { ...query, overdue_only: true };
return this.list(scope, overdueQuery, actor);
```

判断：

- 当前 `overdue` 只是逾期列表查询。
- 当前 `overdue` 不调用、也不间接触发 `recalculateOverdue`。
- 当前 `overdue` 不写库，不改变 `overdueFlag`，不写日志，不绑定附件。
- 由于第一批中 `WorkOrdersService.list` facade 已委托给 `WorkOrderQueryService.list`，当前 `overdue` 已间接使用 query service 的列表查询实现。

建议：

- `overdue` 适合迁移到 `WorkOrderQueryService`，风险低于 `stats`。
- 如迁移，query service 中只能保留 “`overdue_only=true` 的列表查询包装”。
- 必须明确禁止 `recalculateOverdue`、`checkOverdue`、日志写入和任何逾期状态回写进入 query service。

## 6. listSlaRules 分析

`listSlaRules(scope, query)` 当前位于 `apps/api/src/modules/work-orders/work-orders.service.ts`。

controller 入口：

- `GET /work-orders/sla-rules`
- controller method：`listSlaRules`
- 权限装饰器：`WORKORDER_SLA_READ`

当前实现：

- 使用 `workOrderSlaRulesRepository.createQueryBuilder("rule")`。
- 按 `tenant_id`、`park_id`、`is_deleted=false` 过滤。
- 支持 `wo_type`、`urgency`、`priority`、`status` 筛选。
- 按 `rule.update_time DESC` 排序。
- 返回 `{ items, total, page, page_size }`。

判断：

- `listSlaRules` 是 SLA 规则列表读取。
- 不写库，不触发状态更新，不写日志，不绑定附件。
- 与 `createSlaRule`、`updateSlaRule`、`deleteSlaRule` 写入方法在同一 repository 上，但实现边界清晰。
- 不依赖 `CodeRulesService`、字典校验、唯一性校验或 SLA 写入 helper。

建议：

- `listSlaRules` 是第二刀第一优先候选。
- 迁移时 `WorkOrderQueryService` 需要新增 `WorkOrderSlaRuleEntity` repository 依赖。
- 原 `WorkOrdersService` 保留 `listSlaRules` facade，避免破坏既有依赖。
- SLA 写入方法和 helper 必须继续留在原 `WorkOrdersService`。

## 7. 第二刀推荐范围

不建议一次迁移 `listSlaRules`、`overdue`、`stats` 三个方法。

推荐拆成 2A / 2B：

### 方案 B：拆成 2A / 2B

推荐方案：

- 2A：迁移 `listSlaRules` / `overdue`
- 2B：迁移 `stats`

推荐理由：

- `listSlaRules` 是独立 repository 的只读分页查询，依赖少，返回结构稳定。
- `overdue` 当前只是 `list` 的只读包装，并且第一批后已经间接依赖 query service 的 `list`。
- `stats` 虽然纯查询，但统计口径复杂，依赖状态常量和多个统计 helper，更适合单独小批迁移和验证。

备选方案：

- 方案 A：一次迁移 `listSlaRules` / `stats` / `overdue`。

不推荐原因：

- 一次迁移会同时改变 SLA 规则查询、逾期列表和统计查询三个 controller 读入口。
- `stats` 需要复制或迁移更多 helper，容易和 2A 的低风险查询混在一起扩大复核范围。

## 8. 暂缓范围

继续暂缓：

- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 附件绑定
- 所有状态流转
- 所有写入
- 幂等写入口
- `checkOverdue`
- `resolveSlaSettings`
- `findSlaRule`
- SLA 创建 / 更新 / 删除 helper
- 工单号 / 日志号生成 helper

原因：

- `tenant360Workorders` 和 `unitWorkorders` 属于跨模块聚合，分别被租户和房源模块调用。
- `recalculateOverdue` 会写工单逾期状态并写日志，属于 P0。
- 日志写入、附件绑定、状态流转和幂等写入口都属于工单主流程副作用，不能进入 query service。
- SLA 写入 helper 与字典校验、唯一性校验和规则写入相关，应保留在原 service。

## 9. 后续实施原则

第二刀实施时必须遵守：

- 不改 controller 路由。
- 不改 DTO。
- 不改返回结构。
- 不改权限装饰器。
- 不改租户 / 园区 / 数据范围过滤。
- 不改状态流转语义。
- 不触发任何写库。
- 不移动写入 helper。
- 不迁移 `recalculateOverdue`。
- 不迁移日志写入、附件绑定或幂等写入口。
- 原 `WorkOrdersService` 保留 facade。
- 每次最多迁移一个小批次。
- 不做格式化大扫除。
- 必须补跑工单专项回归和统一回归。

## 10. 验证计划

后续实施时执行：

- `pnpm --filter @jinhu/api typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `node scripts/e2e/first-release-workorders.mjs`
- `node scripts/e2e/first-release-regression.mjs`
- `git diff --check`

重点验证：

- `GET /work-orders/sla-rules`
- `GET /work-orders/overdue`
- `GET /work-orders/stats`
- `GET /work-orders`
- `GET /work-orders/:id`
- `GET /work-orders/:id/logs`
- `POST /work-orders`
- `POST /work-orders/:id/assign`
- 状态流转、日志写入、附件绑定不能回归。

如果 2A 只迁移 `listSlaRules` / `overdue`，验证重点是 SLA 规则分页、逾期列表、工单列表、详情、日志和派单幂等。

如果 2B 迁移 `stats`，需要额外检查统计返回字段和统计口径。

## 11. 结论

建议进入第二刀实施前，先按本文完成设计收口。

第二刀第一批建议为 2A：

- `listSlaRules`
- `overdue`

第二刀第二批建议为 2B：

- `stats`

不建议一次迁移三个方法。`tenant360Workorders`、`unitWorkorders`、`recalculateOverdue`、日志写入、附件绑定、状态流转和幂等写入口继续暂缓。

补充状态：第二刀 2A 已完成，`overdue` 与 `listSlaRules` 已迁移到 `WorkOrderQueryService`，并建议阶段性收口。2B：`stats` 已进入设计；不建议在设计收口前直接实施。

补充状态：第二刀 2B `stats` 已完成实施并进入收口复核。`tenant360Workorders` / `unitWorkorders` 继续作为跨模块聚合暂缓，不直接进入实施。
