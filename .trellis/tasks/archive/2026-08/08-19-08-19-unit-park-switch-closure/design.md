# 修复房源新增归属园区选择闭环 Design

## Root Cause

房源创建接口的归属园区来自 `@CurrentScope()`，`CreateUnitDto` 不接受 `parkId`。当前房源页新增表单没有园区选择，也没有调用 `switchParkContext`，楼栋/楼层候选仅由当前 token 园区下的 `/buildings`、`/floors` 返回，因此用户无法在新增房源时选择其他可访问园区。

## Approach

- 复用楼层管理的前端上下文切换模型：
  - 从 `useAuthUser()` / `getStoredUser()` 读取 `accessible_parks`。
  - 使用 `switchParkContext(targetParkId)` 切换到目标园区。
  - 使用 `useAuthSessionActions().publishUser(...)` 发布新用户上下文。
  - 用请求代次和同步锁防止切换期间旧请求覆盖新数据。
- 房源页新增 `listParkId`、`form.parkId`、园区切换状态和表单错误消息。
- 新增表单只在创建模式显示“所属园区”；编辑保持当前房源归属，不扩展跨园区迁移。
- 切换园区后清空列表筛选、楼栋/楼层候选、当前列表数据，再加载目标园区候选和列表。
- 提交时仅在新增模式下确保 `form.parkId` 对应当前上下文，然后提交原有 `POST /park-units` body。
- 扩展 `first-release-context-switch.mjs`，在目标园区创建楼栋/楼层后继续创建房源并校验隔离可见性，最后按房源 -> 楼层 -> 楼栋顺序清理。

## Non-Goals

- 不修改后端 `CreateUnitDto` 以接收 `parkId`。
- 不实现编辑房源跨园区迁移。
- 不改变批量导入、附件、状态流转的当前园区作用域契约。
