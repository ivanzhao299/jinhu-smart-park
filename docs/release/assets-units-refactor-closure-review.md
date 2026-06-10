# JinHu Smart Park 资产房源页面拆分收口复核

## 1. 复核目的

本文用于复核资产房源页面在阶段五-F多轮低风险拆分后的状态，判断该页面是否已经达到阶段性可维护状态，以及后续是继续拆该页面，还是切换到下一个低风险大页面。

本次复核只做只读检查和文档记录，不继续修改业务代码。

## 2. 拆分前状态

拆分前核心页面文件为：

- `apps/web/app/assets/units/UnitsPageClient.tsx`

拆分前该文件约 1811 行。

原页面集中承担以下职责：

- 房源列表、分页和表格行操作。
- 楼栋、楼层、字典等 lookup 加载。
- 房源筛选和查询参数拼装。
- 新增、编辑、删除。
- 导入模板下载、批量导入、导入结果展示和导出。
- 附件、照片、平面图上传与刷新。
- 房源详情抽屉和详情 tab。
- 关联工单、安全隐患、应急事件、作业许可、物联设备和告警展示。
- 租赁状态流转、状态日志加载和分页。
- 页面级权限判断和字段级权限判断。

原主要问题是单文件体量较大，展示层、页面状态、请求编排、权限判断和多个业务面板混在一起，后续维护和局部改动的认知成本较高。

## 3. 已完成拆分

### 第一批：表格、筛选和表单

已拆出：

- `components/UnitsTable.tsx`
- `components/UnitsToolbar.tsx`
- `components/UnitFormDialog.tsx`
- `components/UnitPageFields.tsx`
- `types.ts`
- `lib/unit-page-utils.ts`

覆盖范围：

- 主表格与分页。
- 筛选工具栏。
- 新增 / 编辑表单抽屉。
- 通用字段、字典徽标、状态徽标。
- 页面局部类型。
- 纯展示和格式化工具函数。

### 第二批：详情抽屉和关联面板

已拆出：

- `components/UnitDetailDrawer.tsx`
- `components/UnitDetailSummary.tsx`
- `components/UnitRelatedWorkordersPanel.tsx`
- `components/UnitSecurityPanel.tsx`
- `components/UnitIotPanel.tsx`
- `components/UnitAttachmentsPanel.tsx`

覆盖范围：

- 详情抽屉外壳和 tab 编排。
- 基础信息展示。
- 关联工单面板。
- 安全隐患、应急事件、作业许可面板。
- 物联设备和设备告警面板。
- 附件展示区域。

### 第三批：状态流转和状态日志

已拆出：

- `components/UnitStatusActions.tsx`
- `components/UnitStatusDrawer.tsx`
- `components/UnitStatusLogsPanel.tsx`

覆盖范围：

- 表格和详情抽屉中的状态操作按钮展示。
- 状态流转抽屉展示。
- 状态日志表格和分页展示。

### 第四批：导入和导出

已拆出：

- `components/UnitImportExportActions.tsx`
- `components/UnitImportDrawer.tsx`
- `components/UnitImportResultPanel.tsx`

覆盖范围：

- 下载模板、批量导入、导出操作区。
- 导入抽屉。
- 导入结果展示面板。

## 4. 当前页面状态

当前 `apps/web/app/assets/units/UnitsPageClient.tsx` 为 937 行。

当前主页面主要保留以下职责：

- 页面权限入口和主布局编排。
- 页面级 message 状态。
- 房源列表、lookup、状态日志等 API 请求编排。
- 新增、编辑、删除、导入、导出、状态流转等写操作请求。
- 导入、附件、详情、状态流转等页面级状态管理。
- 字段级权限和操作权限布尔值计算。
- 详情关联数据懒加载触发逻辑。
- 附件上传后的刷新逻辑。
- 导入成功后的刷新逻辑。

当前组件结构已经把主要展示层拆出，主页面仍有一定体量，但主要是页面级 orchestrator：维护状态、调用 API、处理权限、向展示组件传递回调。

当前仍存在轻度职责混杂，主要集中在请求编排、权限布尔值和页面状态之间。但继续拆分这些部分容易触及请求语义、权限逻辑或跨页面 hook 设计，风险高于展示层拆分。

## 5. 行为保持与验证

前四批拆分均遵守以下边界：

- 页面 URL 不变。
- API 请求路径不变。
- API 请求体语义不变。
- 权限逻辑不变。
- 后端代码不变。
- 数据库 migration / seed 不变。
- CI workflow 不变。
- `package.json` 不变。
- 不新增依赖。

前四批累计验证口径包括：

- `pnpm --filter @jinhu/web typecheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`

构建过程中出现过既有 Next.js ESLint plugin warning，但未阻断构建，命令退出码为 0。

## 6. 剩余风险

当前剩余风险：

- 尚未做浏览器交互回归。
- 主页面仍承担请求编排和页面级状态管理。
- 附件上传刷新逻辑仍在页面中。
- 导入成功后的刷新逻辑仍在页面中。
- 权限判断布尔值仍集中在页面中。
- 详情关联数据懒加载 effect 仍集中在页面中的 controller 部分。
- 顶部 header 的新增按钮和页面标题仍在主页面中。

这些风险当前可接受，因为它们主要属于页面编排和请求状态管理，不再是大块展示 JSX 混杂。

## 7. 收口判断

结论：资产房源页面建议阶段性收口。

理由：

- 主页面已从约 1811 行降至 937 行。
- 大块展示 JSX 已基本拆出。
- 当前剩余代码主要是页面级请求编排、状态管理和权限判断。
- 继续拆分会更容易触及 API 请求封装、权限逻辑、懒加载 hook 或刷新语义。
- 当前拆分已经显著降低单文件展示层复杂度，达到阶段性可维护状态。

不建议当前继续深拆资产房源页面。

建议切换到下一个低风险大页面，优先候选为：

- `apps/web/app/workorders/list/page.tsx`

工单列表页面也是 P1 级大页面，适合先拆表格、筛选、创建表单和展示层操作按钮，但应避免触碰工单状态流转后端语义。

## 8. 后续建议

资产房源页面后续如继续拆，仅建议考虑：

- 顶部 header 和新增 / 导入 / 导出组合外壳。
- 附件上传刷新外壳。
- 详情关联数据懒加载 controller 的轻量整理。

不建议短期拆：

- API 请求函数。
- 权限判断核心逻辑。
- 状态流转提交后的刷新逻辑。
- 导入导出请求逻辑。
- 跨页面复用 hook。

建议下一阶段进入工单列表页面结构拆分，并补充资产房源页面浏览器交互回归。

## 9. 结论

资产房源页面经过四批低风险拆分后，已经达到阶段性可维护状态。

本阶段建议：

- 资产房源页面阶段性收口。
- 暂不继续拆该页面。
- 下一批切换到工单列表页面。
- 后续只在有明确回归保障时再整理资产房源页面的请求编排或 hook 边界。
