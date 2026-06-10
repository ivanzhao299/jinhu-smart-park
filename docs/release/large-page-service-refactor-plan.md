# JinHu Smart Park 大页面 / 大服务拆分设计

## 1. 目的

本文用于盘点当前仓库中的大页面、大组件、大 service、controller、脚本和文档入口，识别职责混杂与后续维护风险，并制定安全拆分计划。

本阶段只做设计，不修改业务代码、不做实际重构。拆分目标是让仓库从“功能可用”继续走向“可维护、可交接、可持续演进”。

## 2. 当前阶段判断

当前项目已经完成首发初始化、认证、migration history/checksum、幂等、账务风险、首发回归和文档索引等多轮质量加固。此时不建议贸然大规模重构，尤其不应直接拆账务、幂等、认证、迁移或刚完成回归的核心链路。

截至阶段五-F，前端资产房源页面和工单列表页面已完成第一阶段结构拆分并阶段性收口。后端房源查询 service 第一批拆分已完成并收口，当前进入工单查询 service 拆分设计。

后续拆分应遵循：

- 小切口
- 可回归
- 低行为变化
- 不改变 URL
- 不改变接口返回
- 不改变数据库结构
- 不做格式化大扫除

## 3. 大文件盘点

以下数据来自 `wc -l` 实际统计。

| 文件 | 类型 | 大致行数 | 主要职责 | 风险等级 | 建议动作 |
|---|---:|---:|---|---|---|
| `apps/web/app/leasing/tenants/page.tsx` | 前端页面 | 2797 | 企业列表、企业表单、360 视图、联系人、资质、风险、合同、应收、收款、工单、安全、IoT 等聚合视图 | P1 | 优先设计拆分，先拆展示 tab 和数据 hook |
| `apps/web/app/leasing/contracts/page.tsx` | 前端页面 | 2772 | 合同列表、合同表单、房源关联、文件、状态流转、应收生成、收款/发票/变更/退租/退款 tab | P0 | 暂不第一批动，租赁主链刚完成大量回归 |
| `apps/web/app/leasing/leads/page.tsx` | 前端页面 | 2353 | 线索、跟进、转化、附件、状态等 CRM 链路 | P2 | 非首发核心，后续治理 |
| `scripts/e2e/first-release-leasing.mjs` | 回归脚本 | 2237 | 首发租赁主链、账务幂等、批量生成、softDelete 保护等回归 | P0 | 暂不拆，刚作为账务收口核心证据 |
| `apps/web/app/assets/units/UnitsPageClient.tsx` | 前端页面 | 1811 | 房源列表、筛选、表单、图片/平面图、导入、状态和统计 | P1 | 第一批候选，优先拆展示和表单 |
| `apps/api/src/modules/units/units.service.ts` | 后端 service | 1664 | 房源 CRUD、楼栋/楼层关系、状态、图片/平面图、批量、统计、导入 | P1 | 后端第一批候选，但先拆纯查询 |
| `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts` | 后端 service | 1609 | 合同 CRUD、房源关联、审批、生效、续租、日志、文件、金额规则 | P0 | 暂不第一批动，租赁主链高风险 |
| `apps/api/src/modules/leasing-leads/leasing-leads.service.ts` | 后端 service | 1597 | 招商线索、跟进、转化、漏斗、统计 | P2 | 二期/非首发优先级低 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 后端 service | 1591 | 工单 CRUD、派单、状态流转、附件、日志、SLA、统计 | P0 | 暂不第一批动，刚补回归且状态流转多 |
| `apps/web/app/workorders/list/page.tsx` | 前端页面 | 1571 | 工单列表、创建、筛选、状态展示、派单和操作入口 | P1 | 第一批候选，先拆表格和查询 hook |
| `apps/api/src/modules/safety-emergency/safety-emergency.service.ts` | 后端 service | 1500 | 应急事件、预案、资源、统计 | P2 | 二期模块，后续治理 |
| `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts` | 后端 service | 1203 | 应收创建、修改、删除、生成、批量生成、逾期、账龄、状态日志 | P0 | 暂不动，账务风险刚收口 |
| `apps/web/lib/menu.ts` | 前端工具 | 492 | 菜单树、首发白名单、模块入口和可见性判断 | P0 | 暂不动，白名单是首发边界 |
| `apps/web/components/video/VideoEvidencePanel.tsx` | 前端组件 | 338 | 视频证据展示、预览、状态和操作 | P2 | 二期视频模块，后续治理 |
| `apps/web/components/assets/AssetCrudPage.tsx` | 前端组件 | 273 | 通用资产 CRUD 页面框架 | P1 | 可作为组件治理候选，但需先确认复用面 |
| `apps/api/src/modules/work-orders/work-orders.controller.ts` | controller | 262 | 工单 CRUD、SLA、日志、状态流转、统计入口 | P1 | controller 可后续按路由域拆分 |
| `apps/api/src/modules/leasing-leads/leasing-leads.controller.ts` | controller | 262 | 招商 CRM 多动作入口 | P2 | 非首发核心，后续治理 |
| `apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts` | controller | 232 | 合同 CRUD、房源、审批、生效、续租、文件/日志入口 | P0 | 暂不动，高风险主链 |

## 4. 前端大页面拆分建议

### `apps/web/app/leasing/tenants/page.tsx`

当前问题：

- 单文件接近 2800 行。
- 同时包含类型定义、字典加载、企业列表、企业表单、360 视图、联系人、资质、风险变更、文件下载、以及多个业务 tab。
- 页面内有大量 `useState`、`useEffect`、权限按钮、表格渲染和表单提交逻辑。
- 企业 360 视图把租赁、工单、安全、IoT 等跨模块信息聚合在同一页面文件中。

建议拆分方向：

- 页面容器：保留路由、权限壳、全局 message 和主要布局。
- 数据请求 hook：`useParkTenantsPage`、`useTenant360`、`useTenantDictionaries`。
- 表格组件：企业列表表格、联系人表格、资质表格、风险日志表格。
- 表单组件：企业表单、联系人表单、资质表单、风险变更表单。
- 详情组件：企业基础信息卡片、360 tab 容器、各业务 tab。
- 工具函数：字典 label、状态 badge、文件下载 helper。

建议优先级：P1。该页面体量最大，且第一批可以只拆展示层和 hook，不改变 API 行为。

### `apps/web/app/leasing/contracts/page.tsx`

当前问题：

- 单文件接近 2800 行。
- 合同列表、合同表单、合同房源、文件、状态流转、归档、生效、应收生成、收款 / 发票 / 变更 / 退租 / 退款视图混在一起。
- 页面内直接处理多类权限、状态判断、请求提交和复杂 tab。

建议拆分方向：

- 合同列表容器。
- 合同表单组件。
- 合同状态操作按钮组。
- 合同详情 tab 组件。
- 房源关联组件。
- 合同文件组件。
- 应收生成结果组件。
- 数据请求 hook。

风险等级：P0。该页面关联租赁主链和账务回归，近期刚完成大量幂等和账务治理，第一批不建议拆。

### `apps/web/app/assets/units/UnitsPageClient.tsx`

当前问题：

- 单文件约 1811 行。
- 房源列表、筛选、表单、导入、图片 / 平面图、状态展示、统计和操作混在一起。
- 属于首发资产范围，但相对账务风险低。

建议拆分方向：

- 页面容器。
- 房源查询 hook。
- 房源列表表格。
- 房源表单。
- 图片 / 平面图上传组件。
- 导入面板。
- 状态/统计卡片。

建议优先级：P1。适合作为第一批低风险前端拆分候选。

### `apps/web/app/workorders/list/page.tsx`

当前问题：

- 单文件约 1571 行。
- 工单列表、筛选、创建表单、状态展示、派单和操作入口混在一起。
- 首发工单能力会高频演进，但当前已补派单幂等回归。

建议拆分方向：

- 页面容器。
- 查询 hook。
- 工单表格。
- 创建工单表单。
- 工单操作按钮组。
- 状态 badge / 优先级 badge。

建议优先级：P1。可作为第一批前端拆分候选，但应避免同时改状态流转行为。

## 5. 后端大 service 拆分建议

### `apps/api/src/modules/units/units.service.ts`

当前职责：

- 房源 CRUD。
- 楼栋 / 楼层 / 房源关系校验。
- 房源状态和租赁状态。
- 图片 / 平面图上传关联。
- 批量导入。
- 列表、统计和聚合查询。

建议拆分方向：

- `UnitsQueryService`：列表、详情、统计、选项查询。
- `UnitsCommandService`：创建、修改、删除、状态变更。
- `UnitMediaService`：图片、平面图、附件关系。
- `UnitImportService`：导入解析、校验、批量写入。
- `UnitValidationService` 或 helper：楼栋 / 楼层 / 编码 / 面积等规则。

建议优先级：P1。后端第一批可以只抽纯查询 service，降低行为变化风险。

### `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts`

当前职责：

- 合同 CRUD。
- 合同房源关联。
- 审批、生效、归档、续租、作废。
- 文件、日志、金额和资源占用校验。

建议拆分方向：

- 查询 service。
- 命令 service。
- 状态流转 service。
- 房源关联 service。
- 合同规则 / 校验 helper。
- 日志 service。

风险等级：P0。租赁主链刚完成回归和幂等治理，不建议第一批拆。

### `apps/api/src/modules/work-orders/work-orders.service.ts`

当前职责：

- 工单 CRUD。
- 派单 / 改派。
- 多个状态流转。
- 附件处理。
- 日志。
- SLA 和统计。

建议拆分方向：

- `WorkOrderQueryService`。
- `WorkOrderCommandService`。
- `WorkOrderStateService`。
- `WorkOrderAssignmentService`。
- `WorkOrderLogService`。
- `WorkOrderStatsService`。

风险等级：P0/P1。体量很大，但状态流转较多，第一批不建议拆状态写入；可后续先抽纯查询。

### `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`

当前职责：

- 应收列表 / 详情 / 状态日志。
- 手工创建 / 修改 / softDelete。
- 单合同生成应收。
- 批量生成应收。
- 逾期重算和账龄。
- 账务状态保护、业务级去重和事务语义。

建议拆分方向：

- 查询 service。
- 命令 service。
- 生成 service。
- 批量生成 service。
- 状态日志 service。
- 账龄 / 逾期聚合 service。

风险等级：P0。账务主链刚完成风险收口，短期不建议拆。

## 6. 第一批建议拆分范围

第一批只建议选 1～2 个低风险对象。

推荐对象：

1. `apps/web/app/assets/units/UnitsPageClient.tsx`
   - 原因：体量大、首发相关、但账务/认证/幂等风险低于租赁合同和应收收款。
   - 第一刀建议：只抽 `UnitsTable`、`UnitForm`、`useUnitsPageData`，不改请求 URL 和字段。
   - 验证：现有首发 users + assets read 回归、手工房源页面冒烟。

2. `apps/web/app/workorders/list/page.tsx`
   - 原因：体量大，工单后续会高频迭代；可以先拆展示层和创建表单，不碰状态流转 service。
   - 第一刀建议：只抽 `WorkOrderTable`、`WorkOrderCreateForm`、`useWorkOrderList`。
   - 验证：`first-release-workorders.mjs`。

备选对象：

- `apps/api/src/modules/units/units.service.ts` 的纯查询拆分。
- 只抽 `list` / `detail` / `stats` 到 `UnitsQueryService`，保留原 service 作为兼容 facade。

## 7. 不建议现在拆分的范围

以下范围暂不建议第一批拆分：

- 账务主链：
  - `leasing-receivables.service.ts`
  - `leasing-payments.service.ts`
  - 批量生成应收相关逻辑
- 幂等相关：
  - `IdempotencyInterceptor`
  - `IdempotencyKeyGuard`
  - `IdempotencyService`
- 认证相关：
  - `auth.service.ts`
  - auth controller / guard / strategy
- migration 相关：
  - migration runner
  - migration history/checksum
- release smoke / 首发回归脚本：
  - `first-release-leasing.mjs`
  - `first-release-regression.mjs`
- 租赁合同主链：
  - `leasing-contracts.service.ts`
  - `apps/web/app/leasing/contracts/page.tsx`
- 首发菜单白名单：
  - `apps/web/lib/menu.ts`

原因：

- 这些链路近期刚完成质量加固并通过回归。
- 牵涉账务、幂等、认证、迁移或发布门禁。
- 拆分收益暂时低于行为回归风险。

## 8. 拆分实施原则

- 每次只拆一个模块或一个页面。
- 不改变接口行为。
- 不改变 URL。
- 不改变数据库结构。
- 不改变权限、幂等、认证、状态机和账务规则。
- 每次拆分必须有回归验证。
- 优先保留导出兼容层或 facade。
- 不做格式化大扫除。
- 不把“移动代码”和“改业务逻辑”放在同一 PR。
- 文件拆分后必须保持可读命名，例如 `components/`、`hooks/`、`services/`、`utils/`。

## 9. 后续实施拆分

### 当前实施状态

- `apps/web/app/assets/units/UnitsPageClient.tsx` 第一阶段展示层拆分已完成并阶段性收口。
- 收口复核见：[assets-units-refactor-closure-review.md](assets-units-refactor-closure-review.md)。
- `apps/web/app/workorders/list/page.tsx` 第一阶段展示层拆分已完成并建议阶段性收口。
- 工单列表收口复核见：[workorders-list-refactor-closure-review.md](workorders-list-refactor-closure-review.md)。
- 下一候选方向建议切换到后端纯查询 service 拆分，或其它低风险前端页面治理。

### F1：前端低风险大页面拆分

- 目标：拆 `UnitsPageClient.tsx` 或 `workorders/list/page.tsx`。
- 建议文件：
  - `apps/web/app/assets/units/components/*`
  - `apps/web/app/assets/units/hooks/*`
  - 或 `apps/web/app/workorders/list/components/*`
  - 或 `apps/web/app/workorders/list/hooks/*`
- 验收标准：
  - 页面行为不变。
  - 首发相关 e2e 脚本通过。
  - 不改 API 字段和 URL。

### F2：后端纯查询 service 拆分

- 目标：从 `units.service.ts` 或 `work-orders.service.ts` 抽纯查询逻辑。
- 建议方式：
  - 新增 query service。
  - 原 service 保留同名方法作为 facade。
  - controller 暂不改或只做最小注入调整。
- 验收标准：
  - typecheck 通过。
  - 相关 read regression 通过。
  - 无数据库结构变化。

### F3：高风险账务 service 拆分设计

- 目标：只设计，不立即实施。
- 范围：
  - `leasing-receivables.service.ts`
  - `leasing-payments.service.ts`
  - `leasing-contracts.service.ts`
- 前置条件：
  - 账务回归稳定。
  - 拆分边界已形成单独设计。
  - 每个拆分点都有 replay / conflict / 状态保护回归。

### F4：组件与 hook 复用治理

- 目标：抽通用表格、筛选、字典 badge、权限按钮组合、附件预览等 UI 复用。
- 注意：
  - 不要一次性替换全站。
  - 先在一个页面验证模式。
  - 形成约定后再推广。

## 10. 结论

当前仓库已经从首发功能可用阶段进入可维护性治理阶段。最大的大页面集中在租赁和资产，最大的大 service 集中在房源、租赁合同、招商线索、工单、安全和应收。

下一步推荐：

1. 第一批先拆 `UnitsPageClient.tsx` 或 `workorders/list/page.tsx` 的前端展示层。
2. 第二批再拆 `units.service.ts` 的纯查询逻辑。
3. 租赁合同、应收、收款、幂等、认证、migration 和首发回归脚本暂不动。
4. 账务 service 拆分应另起专项设计，不能和普通可维护性重构混在一起。
