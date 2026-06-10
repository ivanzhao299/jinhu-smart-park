# JinHu Smart Park 工单列表页面拆分收口复核

## 1. 复核目的

本文用于复核工单列表页面经过多轮低风险结构拆分后的当前状态，判断该页面是否已经达到阶段性可维护状态，以及后续是否继续拆该页面或切换到其它治理方向。

本次复核只做只读检查和文档记录，不继续修改业务代码。

## 2. 拆分前状态

- 原页面：`apps/web/app/workorders/list/page.tsx`。
- 原页面行数：约 1571 行。
- 原页面职责：工单列表、筛选、分页、新增 / 编辑、详情、时间线 / 操作日志、派单 / 改派、状态流转、附件上传入口、权限判断、API 请求和刷新编排。
- 原主要问题：展示 JSX、状态流转表单、权限按钮、请求逻辑和页面状态管理集中在同一个文件中，单文件职责较重，后续维护和回归定位成本较高。

## 3. 已完成拆分

第一批：列表 / 筛选 / 表格拆分。

- 拆出工单表格、分页和空状态。
- 拆出筛选工具栏。
- 拆出行操作按钮。
- 拆出状态展示和优先级展示。
- 拆出局部类型和展示工具函数。

第二批：新增 / 编辑表单抽屉拆分。

- 拆出工单新增 / 编辑表单抽屉展示组件。
- 补充工单表单局部类型。
- 新增 / 编辑请求、默认值填充和提交后刷新仍保留在页面。

第三批：详情抽屉 / 详情信息面板拆分。

- 拆出工单详情抽屉展示组件。
- 拆出工单详情基础信息展示组件。
- 拆出工单时间线 / 操作日志面板。
- 补充详情、日志表单和状态动作相关局部类型。

第四批：状态流转抽屉 / 状态操作面板拆分。

- 拆出工单状态操作面板。
- 拆出派单 / 改派抽屉展示组件。
- 拆出待物料 / 完成处理抽屉展示组件。
- 拆出确认完成 / 评价 / 关闭抽屉展示组件。
- 拆出取消 / 退回 / 驳回抽屉展示组件。
- 补充状态流转表单和 action state 局部类型。

## 4. 当前页面状态

- 当前主页面行数：约 968 行。
- 当前组件结构：
  - `components/WorkOrdersTable.tsx`
  - `components/WorkOrdersToolbar.tsx`
  - `components/WorkOrderActionButtons.tsx`
  - `components/WorkOrderStatusBadge.tsx`
  - `components/WorkOrderPriorityBadge.tsx`
  - `components/WorkOrderFormDialog.tsx`
  - `components/WorkOrderDetailDrawer.tsx`
  - `components/WorkOrderDetailSummary.tsx`
  - `components/WorkOrderProcessRecordsPanel.tsx`
  - `components/WorkOrderStatusActionPanel.tsx`
  - `components/WorkOrderAssignDialog.tsx`
  - `components/WorkOrderProcessActionDialog.tsx`
  - `components/WorkOrderCloseDialog.tsx`
  - `components/WorkOrderExceptionActionDialog.tsx`
  - `lib/workorder-page-utils.ts`
  - `types.ts`
- 当前主页面剩余职责：
  - 页面级状态管理。
  - 字典、租户、房源、用户等关联数据加载。
  - 工单列表查询。
  - 新增 / 编辑请求和提交后刷新。
  - 详情打开、日志加载和日志提交。
  - 派单 / 改派、处理、确认 / 评价 / 关闭、异常动作等状态流转请求。
  - 权限判断核心逻辑。
  - 字段脱敏判断和脱敏结果传入展示组件。

当前页面仍有职责混杂，但主要集中在页面编排、请求协调和权限 / 状态判断；大块展示 JSX 已基本拆出。

## 5. 行为保持与验证

前四批拆分均要求保持：

- 页面 URL 不变。
- API 请求路径不变。
- API 请求体语义不变。
- 权限逻辑不变。
- 工单状态流转语义不变。
- 后端代码不变。
- 数据库 migration / seed 不变。
- CI workflow 不变。
- `package.json` 不变。
- 不新增依赖。

累计验证口径：

- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

构建过程中存在既有 Next.js ESLint plugin 未检测 warning，但不阻断 build。

## 6. 剩余风险

- 尚未补充浏览器交互回归截图或端到端人工走查记录。
- 主页面仍承担请求编排。
- 权限判断仍集中在页面。
- 状态流转提交逻辑仍由页面协调。
- 附件、日志、详情刷新仍在页面。
- 如果继续拆页面级请求或权限判断，容易触及状态流转语义和刷新时机。

## 7. 收口判断

结论：建议工单列表页面阶段性收口。

判断依据：

- 主页面已从约 1571 行降至约 968 行。
- 当前剩余内容主要是页面状态、请求协调、权限判断和刷新编排。
- 大块表格、筛选、表单、详情和状态流转展示 JSX 已拆出。
- 继续拆该页面的收益开始下降，风险会向请求逻辑、权限逻辑和状态流转语义靠近。

因此：

- 工单列表页面建议阶段性收口。
- 不建议继续拆该页面的请求和状态流转核心逻辑。
- 下一阶段可切换到后端纯查询 service 拆分，或切换到其它低风险前端页面。

## 8. 后续建议

- 工单列表页面暂时阶段性收口。
- 后续优先转入后端纯查询 service 拆分设计，例如 `WorkOrderQueryService` 或 `UnitsQueryService`。
- 如后续继续拆工单列表页面，仅建议拆附件 / 日志展示外壳或顶部操作区等纯展示层。
- 浏览器交互回归后续补充，重点覆盖列表查询、新增 / 编辑、详情 tab、日志补充和状态流转入口。

## 9. 结论

工单列表页面已经完成第一阶段低风险展示层拆分，当前达到阶段性可维护状态。建议停止继续拆该页面的核心请求和状态流转逻辑，转入后端纯查询 service 拆分或其它低风险页面治理。
