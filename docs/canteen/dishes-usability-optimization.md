# 菜品维护易用性优化说明（M2 追加）

范围：只动 `apps/web` 与 `packages/ui`，未改 `apps/api`、未新增后端接口。
分支：`codex/canteen-module-20261002`。

## 1) 餐品 / 品类页签切换
- `/canteen/dishes` 顶部新增分段控件，在「餐品」「品类」两个视图间切换，
  去掉原先上下堆叠、品类在底部需滚动的布局。
- 筛选区与指标卡随页签呈现：餐品视图显示品类/状态/关键词筛选 + 餐品指标卡；
  品类视图只保留档口筛选，操作按钮相应变为「新建品类」。
- 新增 `@jinhu/ui` 原语 **Tabs**（`packages/ui/src/components/Tabs/`，ds-* CSS Modules，
  受控 `items/value/onChange`，支持角标 count），全局导出，页面未私写样式、无 inline style/硬编码色/Tailwind。

## 2) 新建/编辑餐品极简抽屉
- 默认仅 3 个必填：餐品名称、所属品类、价格(元)；单位默认「份」。
- 单位、每日库存、条码、需要预订收进「更多选项」折叠区（默认收起，新建收起、编辑展开）。
- 校验与提交字段保持不变。

## 3) 多选 + 批量上架/沽清
- 餐品列表首列复选框（用全局 `input[type=checkbox]` 设计系统样式，未用 accent-color）。
- 勾选后出现「已选 N 款 + 批量上架 / 批量沽清(下架)」操作条；每行保留单个「上架/下架」快捷按钮。
- 批量对所选 id **逐个调用现有** `PATCH /canteen/dishes/{id}/shelf`（各带幂等键），不新增后端接口；
  完成后汇总提示并刷新列表。

## 4) POS 餐品宫格长按/右键沽清
- 长按约 500ms（移动/离开即取消）或桌面右键餐品卡，弹出小菜单「沽清(下架)/恢复上架」。
- 沽清后卡片即时变售罄/灰态，与后端同步；正常点按仍加购，长按不加入账单。
- **权限门控**：仅当账号具备 `canteen:dish:shelf`（`CANTEEN_PERMISSIONS.DISH_SHELF`）时入口才出现，
  无权限则不响应长按/右键。POS 不挂 DashboardLayout，故权限判定用同步 `getAuthUser()` +
  `hasPermission(...)`（而非 React context hook）。

## 自检证据（docs/canteen/selfcheck/）
- 01-dishes-tabs.png：页签 + 复选框 + 指标卡
- 02-categories-tab.png：品类视图
- 03/04-dish-drawer*.png：极简新建表单 + 更多选项折叠
- 05/06-batch-*.png：多选、批量沽清 5/5、批量恢复
- 07-pos-shelf-menu.png：POS 右键沽清菜单（有权限可见）
- 08-pos-marked-soldout.png：沽清后卡片即时灰态；恢复上架后回正常

## 验收
- `pnpm typecheck` 全绿（shared/ui/web/api）。
- `pnpm --filter @jinhu/web build` 通过。
