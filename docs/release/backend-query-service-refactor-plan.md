# JinHu Smart Park 后端纯查询 Service 拆分设计

## 1. 目的

本文用于识别后端大 service 中查询逻辑和写入逻辑混杂的问题，制定安全拆分路线。

当前阶段只做只读盘点和设计，不直接拆后端代码。目标是先找出适合抽出 query service 的低风险边界，后续实施时以“不改变接口行为、不改变权限、不改变数据库结构”为前提推进。

## 2. 当前阶段判断

- 前端资产房源页面和工单列表页面已完成第一阶段治理，并已阶段性收口。
- 后端 service 拆分风险高于前端展示层拆分，因为 service 同时承载权限过滤、数据范围、事务、副作用、状态流转和跨模块聚合。
- 当前阶段只做设计，不直接拆代码。
- 后续拆分原则是不改变 controller 路由、不改变 DTO、不改变 entity、不改变数据库、不改变 API 返回结构、不改变权限语义。
- 本轮不触碰账务、租赁合同、认证、幂等、migration、seed、测试脚本和 CI workflow。

补充状态：`F后端-1：房源查询 service 拆分` 第一批已完成，基础查询入口已迁移到 `UnitsQueryService`，并已阶段性收口。`F后端-2 / F后端-3：工单查询 service 设计与第一批拆分` 已完成，`list`、`detail`、`logs` 已迁移到 `WorkOrderQueryService` 并收口；工单 query service 第二刀 2A 已完成，`overdue`、`listSlaRules` 已迁移到 `WorkOrderQueryService`；当前进入 `stats` 2B 设计阶段。

## 3. 后端大 service 盘点

以下行数来自 `wc -l` 实际统计，检查范围限定在本阶段指定的后端目录。

| 文件 | 行数 | 模块 | 主要职责 | 查询职责 | 写入职责 | 状态流转 / 副作用 | 风险等级 | 建议动作 |
|---|---:|---|---|---|---|---|---|---|
| `apps/api/src/modules/units/units.service.ts` | 1664 | 房源 | 房源 CRUD、楼栋 / 楼层关系、状态、图片 / 平面图、导入导出、统计、跨模块聚合 | 列表、详情、工单 / 隐患 / 应急 / 作业票 / 设备聚合、状态日志、统计、资产统计、状态看板、导出查询 | 创建、更新、软删除、导入写入 | 状态变更、状态日志、文件绑定、导出审计、跨模块调用 | P1 | 第一批建议只设计并后续拆纯查询 service |
| `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts` | 1609 | 租赁合同 | 合同 CRUD、合同房源、审批、生效、续租、作废、文件、日志、金额和资源占用规则 | 列表、详情、文件、状态日志、动作日志、合同房源 | 创建、更新、软删除、草稿、续租、房源关系写入 | 审批、生效、作废、归档、房源出租状态变更、状态日志 | P0 | 暂不拆，租赁主链和资源占用风险高 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 1591 | 工单 | 工单 CRUD、SLA、派单、状态流转、日志、附件、统计、租户 / 房源聚合 | 列表、详情、SLA 规则列表、逾期列表、统计、租户 360 工单、房源工单、日志列表 | 创建、更新、删除、SLA 规则写入、日志写入 | 派单 / 改派、接单、开始、待料、完成、确认、评价、关闭、取消、退回、驳回、逾期重算、附件绑定 | P1 | 第二批设计候选，第一批不拆状态写入 |
| `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts` | 1203 | 应收 | 应收 CRUD、生成、批量生成、逾期、账龄、状态日志、账务保护 | 列表、详情、状态日志、逾期列表、账龄 | 创建、更新、软删除、单合同生成、批量生成 | 逾期重算、账务状态保护、状态日志、事务、业务去重 | P0 | 暂不拆，账务主链和幂等语义敏感 |
| `apps/api/src/modules/leasing-payments/leasing-payments.service.ts` | 554 | 收款 | 收款 CRUD、核销、附件、应用明细 | 列表、详情、核销明细 | 创建、更新、软删除、核销 | 应收金额回写、付款状态变更、核销记录、事务、状态日志 | P0 | 暂不拆，账务主链敏感 |
| `apps/api/src/shared/services/idempotency.service.ts` | 353 | 幂等 | 幂等请求开始、成功 / 失败记录、回放、清理 | 成功响应查询、记录查询 | 创建 / 更新幂等记录、清理过期记录 | 事务、冲突判定、回放语义 | P0 | 暂不拆，属于幂等底层 |
| `apps/api/src/modules/floors/floors.service.ts` | 298 | 楼层 | 楼层 CRUD、楼栋关联、布局图上传 | 列表、详情 | 创建、更新、软删除 | 文件绑定、楼栋校验 | P2 | 后续随房源边界治理，不作为第一批 |
| `apps/api/src/modules/buildings/buildings.service.ts` | 202 | 楼栋 | 楼栋 CRUD、园区关系 | 列表、详情 | 创建、更新、软删除 | 编码唯一性、园区校验 | P2 | 体量较小，暂不优先拆 |
| `apps/api/src/modules/parks/parks.service.ts` | 195 | 园区 | 园区 CRUD | 列表、详情 | 创建、更新、软删除 | 园区编码唯一性 | P2 | 体量较小，暂不优先拆 |
| `apps/api/src/shared/services/idempotency-cleanup.service.ts` | 94 | 幂等清理 | 定时清理过期幂等记录 | 无独立业务查询 | 调用清理 | 定时任务副作用 | P0 | 暂不拆，属于幂等底层 |

## 4. 房源 service 分析

`apps/api/src/modules/units/units.service.ts` 是本轮最适合优先设计拆分的对象，文件 1664 行，是指定检查范围内最大的 service。

当前主要查询入口：

- `list`：房源分页列表，包含楼栋 / 楼层关联、数据范围过滤、筛选、排序、分页、字段策略过滤。
- `detail` / `findDetail`：房源详情，包含楼栋、楼层、平面图文件关联和数据范围过滤。
- `workorders`、`hazards`、`emergencies`、`workPermits`、`devices`：先校验房源详情，再调用工单、安全、应急、作业票、IoT 模块形成房源聚合节点。
- `listStatusLogs`：房源状态日志分页查询。
- `statistics`：总量、面积、空置、出租、按租赁状态、按使用类型、按楼栋聚合。
- `assetStatistics`：资产统计总览、楼栋维度、状态维度、使用类型维度，并加载字典 label。
- `unitStatusBoard`：按楼栋 / 楼层组织房源状态看板，并对输出应用字段策略。
- `exportCsv` / `exportExcel`：虽然是导出接口，但内部依赖 `findForExport` 和查询条件构造，属于只读查询加导出副作用的混合边界。

查询相关 helper 也集中在同一文件内，包括 `applyQuery`、`applyListSort`、`findForExport`、`scopedBuilder`、`assetStatisticsBaseBuilder`、`unitStatusBoardBuilder`、`applyUnitDataScope`、`loadUnitDictLabelMaps`、`groupStats`。

写入和副作用职责同样集中：

- `create`、`update`、`softDelete`。
- `changeStatus` 写入房源状态并记录 `UnitStatusLogEntity`。
- `uploadPhoto`、`uploadFloorplan` 绑定文件。
- `importExcel` 批量校验并写入房源。
- `recordExport` 记录导出审计。
- `mustMatchBuildingAndFloor`、`resolveUnitCode`、导入校验等写入前规则校验。

拆分判断：

- 列表、详情、状态日志、统计、资产统计、状态看板、跨模块只读聚合适合拆到 `UnitsQueryService`。
- `create`、`update`、`softDelete`、`changeStatus`、`importExcel`、文件上传、导出审计仍应保留在原 `UnitsService` 或后续 command / media / import service 中。
- `exportCsv` / `exportExcel` 暂不作为第一刀迁移对象，因为它们是“只读查询 + 文件生成 + 审计调用”的边界，建议在纯查询拆分稳定后再单独治理。
- `applyUnitDataScope` 和字段策略过滤必须保持行为一致；后续实施时可先复制到 query service 或通过私有 helper 下沉，但不能改变权限过滤语义。

## 5. 工单 service 分析

`apps/api/src/modules/work-orders/work-orders.service.ts` 共 1591 行，是指定检查范围内第三大的 service。它查询体量大，但状态流转和副作用更密集，适合后续拆 query service，不建议第一批直接拆写入链路。

当前主要查询入口：

- `list`：工单分页列表，包含数据范围过滤、筛选、排序、分页、字段策略过滤。
- `detail` / `findOne`：工单详情，包含租户、房源、楼栋、楼层、图片、视频等关联。
- `listSlaRules`：SLA 规则分页查询。
- `overdue`：复用列表查询追加逾期条件。
- `stats`：查询工单集合后在内存中构造统计结果。
- `tenant360Workorders`：租户 360 工单摘要和最近工单。
- `unitWorkorders`：房源维度工单摘要和最近工单。
- `logs`：工单日志分页查询。

查询相关 helper 包括 `scopedBuilder`、`findOne`、`applyQuery`、`applyStatsQuery`、`buildStatsResult`、`secureRecentWorkOrders`、`applySort`、`applyDataScope`。

写入、状态流转和副作用职责包括：

- SLA 规则创建、更新、删除。
- 工单创建、更新、软删除。
- 派单、改派、接单、开始、待料、完成、确认、评价、关闭、取消、退回、驳回。
- `recalculateOverdue` 逾期重算。
- `createLog` 和内部 `createWorkOrderLog` 写日志并绑定附件。
- 多处事务写入、附件 bizType / bizId 回写、SLA 解析、字典校验、地点解析、可指派用户校验。

拆分判断：

- 列表、详情、逾期列表、统计、租户 360 工单、房源工单、日志列表适合后续拆到 `WorkOrderQueryService`。
- SLA 规则列表是否纳入 query service 需后续单独判断，因为同一组 SLA 规则写入方法仍在当前 service。
- 状态流转写入应保留在原 service 或后续 `WorkOrderStateService`，不应与第一批查询拆分同时进行。
- 工单日志写入和附件绑定不应放进纯查询 service；日志列表可拆，日志创建保留。

## 6. 暂不建议拆分范围

以下范围暂不建议在阶段五-F 第一批拆分：

- 应收 service：`apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`。原因是它属于账务主链，包含生成应收、批量生成、逾期重算、账龄、状态日志、事务、业务去重和删除保护。
- 收款 service：`apps/api/src/modules/leasing-payments/leasing-payments.service.ts`。原因是它属于账务主链，核销会回写应收金额和状态，涉及事务和应用明细。
- 租赁合同 service：`apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts`。原因是它承担合同审批、生效、续租、作废、合同房源关系和房源出租状态变更，近期首发回归覆盖较多，行为风险高。
- 幂等相关 service：`apps/api/src/shared/services/idempotency.service.ts`、`apps/api/src/shared/services/idempotency-cleanup.service.ts`。原因是它们属于幂等底层，涉及 replay、conflict、事务和过期清理。
- 认证相关 service / guard / strategy：本轮不在检查范围内，也不应在查询 service 拆分阶段触碰。
- migration / seed：本阶段不改数据库结构和初始化数据。
- release smoke / 回归脚本：本阶段不修改测试脚本，只在后续代码实施时运行相关验证。
- 园区、楼栋、楼层 service：体量较小，查询逻辑有限，拆分收益低于房源和工单；楼层有文件绑定副作用，适合后续跟随资产域整体治理。

## 7. 第一批建议拆分对象

第一批只建议选择一个对象：房源查询 service。

推荐原因：

- 与前端资产房源页面拆分形成呼应，前后端维护边界一致。
- `units.service.ts` 是本轮检查范围内最大 service，查询职责占比高。
- 房源列表、详情、统计、状态看板、跨模块只读聚合是首发范围内高频维护能力。
- 风险低于账务、租赁合同主链和幂等底层。
- 后续可通过原 `UnitsService` 保持兼容 facade，controller 路由和返回结构不变。

## 8. 第一批实施设计

### 后端拆分第一批：房源查询 service 拆分

目标：

- 新增 `UnitsQueryService`。
- 将房源列表查询、详情查询、状态日志查询、统计查询、资产统计、房源状态看板、只读跨模块聚合迁移过去。
- 原 `UnitsService` 保留写入、状态变更、导入导出、附件、导出审计等副作用逻辑。
- `UnitsController` 行为不变。
- API 路径不变。
- DTO、entity、权限装饰器、数据库结构不变。
- 返回结构不变。

建议最小安全范围：

1. 先新增 query service 并在 `UnitsModule` provider 中注册。
2. 原 `UnitsService` 注入 `UnitsQueryService`，公开方法签名保持不变。
3. 第一刀只迁移 `list`、`detail`、`listStatusLogs`、`statistics`。
4. 第二刀再迁移 `assetStatistics`、`unitStatusBoard` 和跨模块只读聚合。
5. 暂缓迁移 `exportCsv`、`exportExcel`、`recordExport`、`importExcel`、`changeStatus`、上传和写入前校验。
6. 每一步迁移后运行 API 类型检查和首发资产相关回归。

后续实施时需要特别保护：

- `applyUnitDataScope` 的数据范围过滤。
- `fieldPolicyService.applyFieldPolicies` 和 `applyFieldPoliciesToList`。
- 列表筛选、排序、分页字段。
- 楼栋 / 楼层 / 园区关联加载。
- 跨模块聚合前的房源存在性和权限校验。

## 9. 验证计划

后续进入代码实施时需要验证：

- `pnpm --filter @jinhu/api build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `node scripts/e2e/first-release-users-assets.mjs`
- 如存在资产相关专项 e2e，执行对应脚本。
- 手工或自动验证房源分页、筛选、排序、详情、统计、状态看板、权限过滤不变。

本阶段是纯文档设计，不执行 lint、typecheck、build。

## 10. 实施原则

- 每次只拆一个 service。
- 先拆纯查询，不拆写入。
- 不改变 controller 路由。
- 不改变 DTO。
- 不改变 entity。
- 不改变数据库。
- 不改变权限装饰器和数据范围语义。
- 保留原 service 兼容边界。
- 不做格式化大扫除。
- 不同时改账务、合同、认证、幂等、migration、seed。
- 每次拆分必须有回归验证。

## 11. 后续路线

### F后端-1：房源查询 service 拆分

新增 `UnitsQueryService`，优先迁移列表、详情、状态日志、统计等纯查询入口，保留原 controller 和 API 行为。

当前状态：第一批拆分已完成并建议阶段性收口；房源资产统计大聚合、状态看板大聚合和跨模块聚合查询后续单独评估。

### F后端-2：工单查询 service 拆分设计

在房源拆分稳定后，针对 `WorkOrdersService` 单独设计 query service 边界，明确哪些读入口可拆、哪些状态流转和日志写入必须保留。

当前状态：已进入设计阶段。第一批建议只考虑 `list`、`detail`、`logs` 等纯查询入口，状态流转、日志写入、附件绑定、逾期重算和幂等写入口继续保留在原 service。

### F后端-3：工单查询 service 拆分

只拆工单列表、详情、逾期列表、统计、日志列表、租户 / 房源聚合等查询入口，不拆派单和状态流转。

当前状态：第一批只迁移 `list`、`detail`、`logs`，已完成并建议阶段性收口；第二刀 2A 已完成，`overdue`、`listSlaRules` 已迁移到 `WorkOrderQueryService`。`stats` 已进入 2B 设计，设计收口前不直接实施。

### F后端-4：账务 service 仅继续设计，不急于拆

应收、收款、合同主链继续保持 P0，最多做只读文档盘点和测试保护设计，不急于实施拆分。

## 12. 结论

下一步推荐进入 `F后端-1：房源查询 service 拆分`，并把实施范围限制在 `UnitsQueryService` 的纯查询迁移。第一批不碰工单状态流转、不碰账务、不碰合同主链、不碰认证、幂等、migration、seed、测试脚本和 CI。
