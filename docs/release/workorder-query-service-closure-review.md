# JinHu Smart Park 工单查询 Service 拆分收口复核

## 1. 复核目的

本文用于复核工单查询 service 第一批拆分后的当前状态，确认拆分是否保持接口行为稳定，并判断是否达到阶段性收口标准。

本次复核只检查代码边界和既有验证结果，不继续拆 service，不修改业务代码、测试脚本、CI、依赖、migration 或 seed。

## 2. 拆分前状态

拆分前 `apps/api/src/modules/work-orders/work-orders.service.ts` 共 1591 行，是后端纯查询 service 拆分设计阶段识别出的高风险大 service。

原 `WorkOrdersService` 同时承担：

- 工单列表、详情、日志、统计、逾期列表和 SLA 规则查询。
- 工单创建、更新、删除 / 软删除。
- SLA 规则创建、更新、删除。
- 派单、改派、接单、开始处理、待料、完成、确认、评价、关闭、取消、退回、驳回。
- 日志写入和日志附件绑定。
- 完成附件绑定。
- 逾期重算。
- 租户 360 工单聚合和房源关联工单聚合。
- 工单号 / 日志号生成、字典校验、地点校验、附件校验、处理人校验和状态合法性校验。

主要问题是查询、写入、状态流转、日志写入、附件绑定、SLA、逾期重算、统计和跨模块聚合集中在同一个 service 中，后续维护时容易扩大状态语义和副作用风险。

## 3. 已完成拆分

本轮已新增 `apps/api/src/modules/work-orders/work-order-query.service.ts`，当前文件共 216 行。

已迁移到 `WorkOrderQueryService` 的方法：

- `list`
- `detail`
- `logs`

`WorkOrdersController` 中对应纯查询接口已改为直接调用 `WorkOrderQueryService`。`WorkOrdersService` 仍保留 `list`、`detail`、`logs` 同名 facade 方法并转发到 `WorkOrderQueryService`，用于兼容其它模块或既有内部调用。

当前 `apps/api/src/modules/work-orders/work-orders.service.ts` 共 1568 行，写入、副作用、状态流转、日志写入、附件绑定、SLA、逾期重算、统计和跨模块聚合仍保留在原 service。

## 4. 当前职责边界

### WorkOrderQueryService

`WorkOrderQueryService` 当前承接：

- 工单列表查询：筛选、排序、分页、租户 / 园区过滤、数据范围过滤、字段策略过滤。
- 工单详情查询：基于 `id` 的详情查询、数据范围过滤、字段策略过滤。
- 工单日志只读查询：先校验工单详情访问范围，再按工单分页返回日志。

该 service 的依赖为：

- `WorkOrderEntity` repository。
- `WorkOrderLogEntity` repository。
- `DataScopeService`。
- `FieldPolicyService`。

本轮为控制依赖扩散，在 query service 内复制了只读 helper：`scopedBuilder`、`findOne`、`applyQuery`、`applySort`、`applyDataScope`、`applyConfiguredIdScopeFilter`、`applyHandlerScopeFilter`、`applyDefaultHandlerSelfScope`。

### WorkOrdersService

`WorkOrdersService` 当前仍保留：

- 工单创建 / 更新 / 删除。
- SLA 规则写入。
- `stats`。
- `overdue`。
- `listSlaRules`。
- `tenant360Workorders`。
- `unitWorkorders`。
- 日志写入。
- 附件绑定。
- 逾期重算。
- 派单 / 改派。
- 接单 / 开始处理。
- 待料 / 完成。
- 确认 / 评价 / 关闭。
- 取消 / 退回 / 驳回。
- `list` / `detail` / `logs` facade。

写入前校验、状态合法性校验、处理人权限判断、工单号 / 日志号生成、事务写入和文件 `bizType` / `bizId` 回写仍在原 service。

## 5. 行为保持与验证

行为保持结论：

- API 路径不变：`GET /work-orders`、`GET /work-orders/:id`、`GET /work-orders/:id/logs` 仍由原 controller 路由暴露。
- DTO 不变：继续使用原 `WorkOrderQueryDto` 和 `WorkOrderLogQueryDto`。
- 请求参数不变：controller 参数绑定未变。
- 返回结构不变：列表和日志仍返回 `items`、`total`、`page`、`page_size`；详情结构沿用原实现。
- 分页字段不变：`page`、`page_size` 语义保持。
- 筛选字段不变：列表查询继续支持原 `keyword`、`status`、`wo_type`、`priority`、`urgency`、`assignee_id`、`reporter_id`、`park_tenant_id`、`unit_id`、`device_id`、`building_id`、`source_type`、`overdue_only`、`start_date`、`end_date`。
- 排序行为不变：继续使用原 `sort` 白名单和默认 `workOrder.createTime DESC`。
- 权限装饰器不变：controller 的权限声明未因本次拆分改变。
- 租户 / 园区过滤不变：`tenant_id`、`park_id`、`is_deleted=false` 仍在 query service 的 scoped builder 中约束。
- 数据范围过滤不变：继续通过 `DataScopeService.buildScopeFilter` 应用园区、楼栋、房源、企业、工单处理人范围过滤。
- `Work order not found` 异常语义不变。
- 状态流转语义不变。
- 幂等写入口未修改：`POST /work-orders` 和 `POST /work-orders/:id/assign` 的 `IdempotencyInterceptor` 未变。
- 写入接口仍由原 `WorkOrdersService` 处理。

已完成验证：

- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。
- `node scripts/e2e/first-release-workorders.mjs`：本地 API 启动后通过。
- `node scripts/e2e/first-release-regression.mjs`：本地 API 启动后通过。

## 6. 剩余风险

- `stats` 仍在原 `WorkOrdersService`。
- `overdue` 仍在原 `WorkOrdersService`。
- `listSlaRules` 仍在原 `WorkOrdersService`。
- 租户 360 / 房源工单属于跨模块聚合，仍在原 `WorkOrdersService`。
- 原 `WorkOrdersService` 当前仍有 1568 行，体量仍然偏大。
- 本轮通过复制只读 helper 控制依赖扩散，后续需要避免 helper 分叉长期扩大。
- 暂未增加专门的接口快照对比测试。

## 7. 收口判断

建议工单查询 service 第一批拆分阶段性收口。

判断依据：

- 当前最稳定的 `list`、`detail`、`logs` 已迁移到 `WorkOrderQueryService`。
- controller 路由、DTO、返回结构、权限装饰器和数据过滤行为保持不变。
- `WorkOrdersService` 保留同名 facade，未破坏其它模块对原 service 的既有依赖。
- 写入、副作用、状态流转、日志写入、附件绑定、SLA、逾期重算、统计和跨模块聚合仍留在原 service。
- 工单专项回归和首发统一回归已通过。

本轮不建议直接继续迁移更多工单查询。`stats`、`overdue`、`listSlaRules` 可作为第二刀候选，但应先单独设计，不要直接实施。

## 8. 后续建议

- 工单查询 service 第一批拆分阶段性收口。
- 下一步可以进入工单 query service 第二刀设计。
- 第二刀候选为 `stats`、`overdue`、`listSlaRules`。
- 暂不迁移 `tenant360Workorders` / `unitWorkorders`。
- 暂不触碰状态流转、日志写入、附件绑定、幂等写入口。
- 第二刀设计需重点处理 query helper 分叉、统计状态常量复用和 SLA 查询边界。

补充状态：第二刀 2A 已完成，`overdue` 与 `listSlaRules` 已迁移到 `WorkOrderQueryService`，并进入收口复核。`stats` 不直接实施，建议先进入 2B 设计。

## 9. 结论

工单查询 service 第一批拆分已达到阶段性收口标准。第二刀 2A 已完成并建议阶段性收口；下一阶段工作切换到 `stats` 的 2B 设计，在设计完成和风险边界明确前，不直接实施 `stats`。
