# JinHu Smart Park 工单查询 Service 拆分设计

## 1. 目的

本文用于识别工单 service 中查询逻辑与状态流转 / 副作用逻辑混杂的问题，并制定安全拆分路线。

本阶段只做只读盘点和设计，不直接拆后端代码。后续实施必须以不改变 controller 路由、不改变 DTO、不改变数据库、不改变权限和租户 / 园区过滤、不改变工单状态语义为前提。

## 2. 当前阶段判断

- 前端工单列表页面已完成第一阶段治理并阶段性收口。
- 房源查询 service 已完成第一批拆分并收口，基础查询入口已迁移到 `UnitsQueryService`。
- 工单 service 拆分风险高于房源查询 service，因为工单 service 同时承载状态流转、日志写入、附件绑定、SLA、派单、幂等写入口和多类权限判断。
- 当前阶段只做设计，不直接拆代码。
- 第一批工单拆分应只处理纯查询，状态流转和副作用继续保留在 `WorkOrdersService`。

补充状态：工单查询 service 第一批实施已完成，`list`、`detail`、`logs` 已迁移到 `WorkOrderQueryService`，并建议阶段性收口。第二刀 2A 已实施，`overdue`、`listSlaRules` 已迁移到 `WorkOrderQueryService`。第二刀 2B 已实施，`stats` 已迁移到 `WorkOrderQueryService` 并进入收口复核；`tenant360Workorders` / `unitWorkorders` 继续暂缓。

## 3. 当前工单 service 现状

以下行数来自 `wc -l` 实际统计。

| 文件 | 行数 | 主要职责 | 查询职责 | 写入职责 | 状态流转职责 | 日志 / 附件职责 | 风险等级 | 建议动作 |
|---|---:|---|---|---|---|---|---|---|
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 1591 | 工单 CRUD、SLA 规则、派单、状态流转、日志、附件、统计、租户 / 房源聚合 | `list`、`detail`、`listSlaRules`、`overdue`、`stats`、`tenant360Workorders`、`unitWorkorders`、`logs` | `create`、`update`、`softDelete`、`createSlaRule`、`updateSlaRule`、`deleteSlaRule`、`createLog` | `assign`、`reassign`、`accept`、`start`、`waitMaterial`、`finish`、`confirm`、`evaluate`、`close`、`cancel`、`returnWorkOrder`、`reject`、`recalculateOverdue` | `createWorkOrderLog`、日志附件绑定、完成附件绑定、审计装饰器配合写入口 | P1 / P0 | 只设计 query service；第一批不拆状态流转和副作用 |
| `apps/api/src/modules/work-orders/work-orders.controller.ts` | 262 | 工单 REST 入口 | 列表、详情、SLA 规则列表、逾期列表、统计、日志列表 | 创建、更新、删除、SLA 规则写入、日志创建 | 派单、改派、接单、开始、待料、完成、确认、评价、关闭、取消、退回、驳回、逾期重算 | 审计装饰器、幂等拦截器写入口 | P1 / P0 | 后续实施只改注入和调用边界，路由不变 |
| `apps/api/src/modules/work-orders/work-orders.module.ts` | 42 | 模块注册 | 无独立查询 | provider / export 注册 | 无 | 无 | P1 | 后续新增 `WorkOrderQueryService` 时注册 provider，继续 export `WorkOrdersService` |

当前 `WorkOrdersService` 依赖：

- Repository：`WorkOrderEntity`、`WorkOrderLogEntity`、`WorkOrderSlaRuleEntity`、`ParkTenantEntity`、`UnitEntity`、`BuildingEntity`、`FloorEntity`、`FileEntity`、`UserEntity`、`DictItemEntity`。
- Service：`CodeRulesService`、`DataScopeService`、`FieldPolicyService`。

如果后续新增 `WorkOrderQueryService`，第一批最小依赖建议为：

- `WorkOrderEntity` repository。
- `WorkOrderLogEntity` repository。
- `DataScopeService`。
- `FieldPolicyService`。

如果第一批纳入 SLA 规则列表，再增加 `WorkOrderSlaRuleEntity` repository。如果第一批纳入基础统计，需要同步迁移统计 helper，但不需要新增写入依赖。如果第一批纳入租户 360 / 房源工单聚合，需要继续评估跨模块调用方兼容性，不建议作为第一刀。

## 4. 工单查询接口盘点

| 接口 | controller method | service method | 业务动作 | 是否纯查询 | 是否涉及权限 / 租户 / 园区过滤 | 是否适合第一批迁移 | 备注 |
|---|---|---|---|---|---|---|---|
| `GET /work-orders` | `list` | `list` | 工单分页列表 | 是 | controller 权限 `WORKORDER_READ`；service 内 `tenant_id`、`park_id`、`is_deleted=false`、`applyDataScope`、字段策略过滤 | 是 | 第一批首选，需完整保留筛选、排序、分页和字段策略 |
| `GET /work-orders/sla-rules` | `listSlaRules` | `listSlaRules` | SLA 规则分页列表 | 是 | controller 权限 `WORKORDER_SLA_READ`；service 内租户 / 园区 / 软删除过滤 | 可选 | 查询稳定，但与 SLA 规则写入同域，建议第一批可暂缓或第二刀迁移 |
| `GET /work-orders/overdue` | `overdue` | `overdue` | 逾期工单列表 | 是 | controller 权限 `WORKORDER_OVERDUE`；复用 `list` 的数据范围和字段策略 | 可选 | 当前只是 `list` + `overdue_only=true`，可在 `list` 稳定后迁移 |
| `GET /work-orders/stats` | `stats` | `stats` | 工单基础统计 | 是 | controller 权限 `WORKORDER_STATS`；service 内 `applyDataScope` 和统计筛选 | 谨慎候选 | 统计依赖多个状态常量和 helper，第一批可迁移或暂缓到第二刀 |
| `GET /work-orders/:id/logs` | `logs` | `logs` | 工单日志列表 | 是 | controller 权限 `WORKORDER_LOG_READ`；先 `findOne` 应用数据范围，再按租户 / 园区 / 工单过滤日志 | 是 | 第一批首选，但只能迁移只读列表，不能迁移日志写入 |
| `GET /work-orders/:id` | `detail` | `detail` / `findOne` | 工单详情 | 是 | controller 权限 `WORKORDER_READ`；service 内 `applyDataScope` 和字段策略过滤 | 是 | 第一批首选，需保留 `NotFoundException('Work order not found')` |
| 内部调用 | 无 controller 入口 | `tenant360Workorders` | 租户 360 工单摘要 | 是 | 通过 `applyDataScope` 和字段策略过滤最近工单 | P2 | 被 `park-tenants` 模块调用，跨模块聚合较多，暂不第一批迁移 |
| 内部调用 | 无 controller 入口 | `unitWorkorders` | 房源关联工单摘要 | 是 | 通过 `applyDataScope` 和字段策略过滤最近工单 | P2 | 被 `units` 模块调用，涉及房源查询边界，暂不第一批迁移 |

当前查询相关 helper：

- `scopedBuilder`
- `findOne`
- `applyQuery`
- `applyStatsQuery`
- `buildStatsResult`
- `groupCount`
- `optionalMinutesBetween`
- `average`
- `isOpenWorkOrder`
- `secureRecentWorkOrders`
- `calculateOverdueMinutes`
- `applySort`
- `applyDataScope`
- `applyConfiguredIdScopeFilter`
- `applyHandlerScopeFilter`
- `applyDefaultHandlerSelfScope`

## 5. 工单状态流转 / 副作用接口盘点

以下内容 P0，第一批不迁移到 query service：

| 接口 | controller method | service method | 类型 | 暂不迁移原因 |
|---|---|---|---|---|
| `POST /work-orders` | `create` | `create` | 写入 | 使用 `IdempotencyInterceptor`，生成工单号，校验字典 / 租户 / 房源 / 文件，事务写入工单和日志 |
| `PUT /work-orders/:id` | `update` | `update` | 写入 | 更新工单字段，校验地点和附件，事务写日志 |
| `DELETE /work-orders/:id` | `remove` | `softDelete` | 写入 | 只允许取消状态删除，涉及状态语义 |
| `POST /work-orders/sla-rules` | `createSlaRule` | `createSlaRule` | 写入 | SLA 字典校验、唯一性校验、写入规则 |
| `PUT /work-orders/sla-rules/:id` | `updateSlaRule` | `updateSlaRule` | 写入 | 修改 SLA 规则并保持唯一性 |
| `DELETE /work-orders/sla-rules/:id` | `deleteSlaRule` | `deleteSlaRule` | 写入 | 软删除 SLA 规则 |
| `POST /work-orders/recalculate-overdue` | `recalculateOverdue` | `recalculateOverdue` | 状态重算 / 副作用 | 批量检查逾期，可能更新工单并写日志 |
| `POST /work-orders/:id/logs` | `createLog` | `createLog` | 日志写入 / 附件绑定 | 写日志并可回写文件 `bizType` / `bizId` |
| `POST /work-orders/:id/assign` | `assign` | `assign` | 派单 | 使用 `IdempotencyInterceptor`，写 assignee / assigner / dispatchTime 并写日志 |
| `POST /work-orders/:id/reassign` | `reassign` | `reassign` | 改派 | 要求原因，写派单信息和日志 |
| `POST /work-orders/:id/accept` | `accept` | `accept` | 状态流转 | 校验处理人权限和状态，从已派单到已接单 |
| `POST /work-orders/:id/start` | `start` | `start` | 状态流转 | 开始 / 恢复处理，写开始时间和日志 |
| `POST /work-orders/:id/wait-material` | `waitMaterial` | `waitMaterial` | 状态流转 | 要求原因，进入待物料并写日志 |
| `POST /work-orders/:id/finish` | `finish` | `finish` | 状态流转 / 附件绑定 | 写完成信息、合并完成图片、回写文件绑定并写日志 |
| `POST /work-orders/:id/confirm` | `confirm` | `confirm` | 状态流转 | 校验确认权限和状态，写确认时间和日志 |
| `POST /work-orders/:id/evaluate` | `evaluate` | `evaluate` | 状态流转 / 评价 | 写满意度和评价内容 |
| `POST /work-orders/:id/close` | `close` | `close` | 状态流转 | 仅管理者关闭，写关闭时间和日志 |
| `POST /work-orders/:id/cancel` | `cancel` | `cancel` | 状态流转 | 取消状态语义敏感，写日志 |
| `POST /work-orders/:id/return` | `returnWorkOrder` | `returnWorkOrder` | 状态流转 | 退回状态语义敏感，写日志 |
| `POST /work-orders/:id/reject` | `reject` | `reject` | 状态流转 | 驳回到退回状态，状态语义敏感 |

内部副作用 helper 也不迁移到 query service：

- `assignInternal`
- `transitionWorkOrder`
- `createWorkOrderLog`
- `validateFileIds`
- `resolveAssignableUser`
- `resolveWorkOrderCode`
- `assertWorkOrderCodeAvailable`
- `validateDictionaryValues`
- `validateSlaRuleDictionaryValues`
- `assertSlaRuleAvailable`
- `resolveLocation`
- `resolveSlaSettings`
- `checkOverdue`，除非后续只作为统计 helper 单独复制并验证行为。

## 6. 建议新增 WorkOrderQueryService 边界

后续实施建议新增 `WorkOrderQueryService`，承接：

- 工单列表查询：`list`。
- 工单详情查询：`detail` / 只读版 `findOne`。
- 工单日志只读查询：`logs`。
- 基础统计查询：`stats`，如第一批评估可控。
- 逾期列表查询：`overdue`，在 `list` 迁移稳定后迁移。
- SLA 规则只读查询：`listSlaRules`，在确认不影响 SLA 写入边界后迁移。

`WorkOrderQueryService` 暂不承接：

- 工单创建、更新、删除。
- SLA 规则创建、更新、删除。
- 派单、改派、接单、开始处理、待物料、完成、确认、评价、关闭、取消、退回、驳回。
- 附件绑定和文件 `bizType` / `bizId` 回写。
- 日志写入。
- 逾期重算。
- 工单号、日志号生成。
- 状态语义、状态合法性校验和处理人权限判断。

后续实施时可让 `WorkOrdersService` 保留 `list`、`detail`、`logs`、`stats` 等 facade 方法并转发到 `WorkOrderQueryService`，避免破坏 `units`、`park-tenants`、`safety-*`、`iot` 等模块对 `WorkOrdersService` 的既有依赖。

## 7. 第一批建议迁移范围

第一批建议只迁移 3 个最稳定查询方法：

1. `list`
2. `detail`
3. `logs`

推荐理由：

- 三者都是 controller 直接暴露的只读入口。
- 三者当前已集中依赖 `scopedBuilder`、`findOne`、`applyQuery`、`applySort`、`applyDataScope` 和字段策略。
- 三者不写工单、不写日志、不绑定附件、不改变状态。
- `logs` 虽然读取日志，但只读分页查询和 `createLog` 写入边界清晰。

谨慎候选：

- `stats`：是纯查询，但依赖状态常量、统计 helper、逾期分钟计算和满意度聚合。可在第一批迁移后紧跟第二刀处理，或在第一批中迁移但必须加强回归。
- `overdue`：当前复用 `list` 并追加 `overdue_only=true`，适合在 `list` 迁移稳定后同步迁移。
- `listSlaRules`：纯查询，但与 SLA 写入方法同域。可作为第二刀或低风险补充，不建议和状态流转拆分混在一起。

不建议第一批迁移：

- `tenant360Workorders`
- `unitWorkorders`

这两个方法是只读，但属于跨模块聚合，分别被 `park-tenants` 和 `units` 模块调用。建议在 controller 直接查询入口稳定后再单独处理。

## 8. 暂缓范围

暂缓范围：

- 状态流转。
- 派单 / 改派。
- 接单 / 开始处理 / 待物料 / 完成 / 确认 / 关闭。
- 取消 / 退回 / 驳回。
- 评价。
- 附件绑定。
- 日志写入。
- 逾期重算。
- SLA 规则写入。
- 跨模块复杂聚合。
- 工单状态语义相关逻辑。
- 幂等写入口相关逻辑。

这些逻辑包含事务、状态合法性、处理人权限、附件回写、日志生成、审计记录或幂等拦截器，拆错会直接改变工单主流程行为，因此不进入第一批 query service 拆分。

## 9. 后续实施设计

### 后端拆分第二批：工单查询 service 拆分

目标：

- 新增 `WorkOrderQueryService`。
- 将 `list`、`detail`、`logs` 迁移到 query service。
- 原 `WorkOrdersService` 保留状态流转、写入、附件、日志写入、SLA 写入和逾期重算等副作用逻辑。
- `WorkOrdersService` 保留查询 facade，兼容其它模块依赖。
- `WorkOrdersController` 查询接口可改为注入并调用 `WorkOrderQueryService`。
- controller 路由不变。
- DTO 不变。
- entity 不变。
- 数据库不变。
- 返回结构不变。
- 权限装饰器不变。
- 租户 / 园区 / 数据范围过滤不变。

建议最小安全步骤：

1. 新增 `work-orders-query.service.ts`，注册到 `WorkOrdersModule` provider。
2. 复制并迁移只读所需 helper：`scopedBuilder`、`findOne`、`applyQuery`、`applySort`、`applyDataScope` 及其数据范围 helper。
3. 迁移 `list`、`detail`、`logs`。
4. `WorkOrdersService` 注入 `WorkOrderQueryService`，保留同名 facade。
5. `WorkOrdersController` 的查询入口改为调用 `WorkOrderQueryService`；写入口继续调用 `WorkOrdersService`。
6. 验证通过后，再单独评估 `stats`、`overdue`、`listSlaRules`。

## 10. 验证计划

后续代码实施时需要验证：

- `pnpm --filter @jinhu/api typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `node scripts/e2e/first-release-workorders.mjs`
- `node scripts/e2e/first-release-regression.mjs`

建议使用 production-like 本地 API 环境执行首发统一回归，重点确认：

- 工单分页、筛选、排序不变。
- 工单详情不变。
- 工单日志列表不变。
- 权限装饰器不变。
- 租户 / 园区 / 数据范围过滤不变。
- 状态流转、派单、日志写入、附件绑定行为不变。

本阶段是纯文档设计，不执行 lint、typecheck、build。

## 11. 实施原则

- 每次只拆一批纯查询。
- 不改变 controller 路由。
- 不改变 DTO。
- 不改变 entity。
- 不改变数据库。
- 不改变权限和租户 / 园区过滤。
- 不改变数据范围过滤。
- 不改变状态流转语义。
- 不改变幂等写入口。
- 保留原 service 兼容边界。
- 不做格式化大扫除。
- 不同时改账务、合同、认证、幂等、migration、seed、测试脚本和 CI。
- 每次拆分必须有回归验证。

## 12. 结论

下一步推荐进入 `F后端-3：工单查询 service 拆分`，但第一批实施范围应严格限制为 `list`、`detail`、`logs`。

`stats`、`overdue`、`listSlaRules` 可作为第二刀候选；`tenant360Workorders`、`unitWorkorders` 和所有状态流转 / 副作用逻辑暂缓。这样可以复用房源 query service 拆分经验，同时避免触碰工单状态语义和首发写入链路。

当前状态：第一批 `list` / `detail` / `logs` 已完成并收口；第二刀 2A `overdue` / `listSlaRules` 已完成并收口；第二刀 2B `stats` 已完成并收口。工单 query service 主要只读查询已完成拆分，当前进入阶段性总结；`tenant360Workorders` / `unitWorkorders` 继续作为跨模块聚合暂缓。
