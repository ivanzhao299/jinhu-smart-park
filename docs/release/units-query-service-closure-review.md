# JinHu Smart Park 房源查询 Service 拆分收口复核

## 1. 复核目的

本文用于复核房源查询 service 拆分后的当前状态，确认拆分是否保持接口行为稳定，并判断是否达到阶段性收口标准。

本次复核只检查代码边界和既有验证结果，不继续拆 service，不修改业务代码、测试脚本、CI、依赖、migration 或 seed。

## 2. 拆分前状态

拆分前 `apps/api/src/modules/units/units.service.ts` 共 1664 行，是后端纯查询 service 拆分设计阶段盘点出的最大 service。

原 `UnitsService` 同时承担：

- 房源列表、详情、状态日志和基础统计查询。
- 房源创建、更新、删除 / 软删除。
- 状态变更和状态日志写入。
- 图片、平面图等附件绑定。
- 导入、导出和导出审计。
- 资产统计大聚合、状态看板大聚合。
- 工单、隐患、应急、作业票、设备等跨模块聚合。
- 合同可用性检查和写入前校验。

主要问题是查询、写入、状态流转、导入导出、附件、审计和跨模块聚合集中在同一个 service 中，后续维护时容易扩大变更影响面。

## 3. 已完成拆分

本轮已新增 `apps/api/src/modules/units/units-query.service.ts`，当前文件共 228 行。

已迁移到 `UnitsQueryService` 的方法：

- `list`
- `detail`
- `listStatusLogs`
- `statistics`

`UnitsController` 中纯查询接口已改为直接调用 `UnitsQueryService`。`UnitsService` 仍保留同名 facade 方法并转发到 `UnitsQueryService`，用于兼容其它模块或既有内部调用。

当前 `apps/api/src/modules/units/units.service.ts` 共 1583 行，写入、副作用、状态变更、导入导出、附件、审计和大聚合逻辑仍保留在原 service。

## 4. 当前职责边界

### UnitsQueryService

`UnitsQueryService` 当前承接：

- 分页列表查询：筛选、排序、分页、楼栋 / 楼层关联、字段策略过滤。
- 详情查询：楼栋、楼层、平面图关联和字段策略过滤。
- 状态日志查询：房源存在性校验后分页返回状态日志。
- 基础统计查询：总量、面积、空置、出租、按租赁状态、按使用类型、按楼栋聚合和出租率。

该 service 的最小依赖为 `UnitEntity` repository、`UnitStatusLogEntity` repository、`DataScopeService` 和 `FieldPolicyService`。

### UnitsService

`UnitsService` 当前仍保留：

- `create`
- `update`
- `softDelete`
- `changeStatus`
- `getImportTemplate`
- `importExcel`
- `exportCsv`
- `exportExcel`
- `recordExport`
- `uploadPhoto`
- `uploadFloorplan`
- `assetStatistics`
- `unitStatusBoard`
- `workorders`
- `hazards`
- `emergencies`
- `workPermits`
- `devices`
- `checkUnitAvailableForContract`
- 写入前楼栋 / 楼层 / 编码 / 状态校验

`UnitsService` 也保留 `list`、`detail`、`listStatusLogs`、`statistics` facade 方法，用于兼容既有依赖边界。

## 5. 行为保持与验证

行为保持结论：

- API 路径不变：`GET /park-units`、`GET /park-units/statistics`、`GET /park-units/:id`、`GET /park-units/:id/status-logs` 仍由原 controller 路由暴露。
- 请求参数不变：继续使用原 DTO 和原 controller 参数绑定。
- 返回结构不变：列表和状态日志仍返回 `items`、`total`、`page`、`page_size`；详情和统计结构沿用原实现。
- 分页字段不变：`page`、`page_size` 语义保持。
- 筛选字段不变：`building_id`、`floor_id`、`rental_status`、`usage_type`、`keyword`、`min_area`、`max_area` 等查询条件仍由原逻辑处理。
- 排序行为不变：继续使用原 `sort` / `order` 白名单逻辑。
- 权限装饰器不变：controller 的权限声明未因本次拆分改变。
- 租户 / 园区过滤不变：`tenant_id`、`park_id` 和 `is_deleted=false` 仍在 query service 的 scoped builder 中约束。
- 数据范围过滤不变：继续通过 `DataScopeService.buildScopeFilter` 应用园区、楼栋、楼层、房源范围过滤。
- NotFound 异常语义不变：详情前置校验仍抛出 `NotFoundException('Unit not found')`。
- 写入接口仍由原 `UnitsService` 处理，未迁移到 query service。

已完成验证：

- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `node scripts/e2e/first-release-users-assets.mjs`：本地 API 启动后通过。
- `node scripts/e2e/first-release-auth-health.mjs`：生产式认证环境变量下通过。
- `node scripts/e2e/first-release-regression.mjs`：本地 API 启动后通过。

## 6. 剩余风险

- 跨模块聚合查询仍在原 `UnitsService`，包括工单、隐患、应急、作业票和设备聚合。
- 资产统计大聚合 `assetStatistics` 仍在原 `UnitsService`。
- 状态看板大聚合 `unitStatusBoard` 仍在原 `UnitsService`。
- 原 `UnitsService` 当前仍有 1583 行，体量仍然偏大。
- 暂未增加专门的接口快照对比测试。
- 本地回归前为测试库准备过专用管理员登录能力，仅用于本地测试库，不属于代码变更。

## 7. 收口判断

建议房源查询 service 拆分阶段性收口。

判断依据：

- 第一批基础查询入口已迁移到 `UnitsQueryService`。
- controller 路由、DTO、返回结构、权限装饰器和数据过滤行为保持不变。
- `UnitsService` 保留 facade，未破坏其它模块对原 service 的既有依赖。
- 写入、副作用、状态变更、导入导出、附件和审计逻辑仍留在原 service。
- API typecheck、lint、typecheck、build 和首发相关回归已通过。

本轮不建议继续迁移更多房源查询。资产统计大聚合、状态看板大聚合和跨模块聚合查询应后续单独评估，不继续混在本次收口阶段。

## 8. 后续建议

- 房源查询 service 第一批拆分阶段性收口。
- 下一步进入工单查询 service 拆分设计。
- 工单拆分设计阶段只先识别列表、详情、日志、统计、逾期列表等纯查询边界。
- 不要立即迁移工单派单、状态流转、日志写入、附件绑定和 SLA 写入逻辑。
- 房源剩余大聚合查询后续单独设计，避免与工单拆分并行扩大风险面。

## 9. 结论

房源查询 service 第一批拆分已达到阶段性收口标准。建议停止本轮房源 service 继续拆分，将下一阶段工作切换到工单查询 service 拆分设计，并继续保持“先设计、后小步实施、每次只拆纯查询”的节奏。
