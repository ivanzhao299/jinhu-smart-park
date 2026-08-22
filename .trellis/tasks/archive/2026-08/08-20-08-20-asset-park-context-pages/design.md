# 技术方案

## 边界

- 只修改资产管理相关 Web 页面和必要的共享前端小组件/样式。
- 不修改 API 权限模型、数据库、生产种子、迁移。
- 不把 `parkId` 加到目标页面的写入 DTO 或查询合同里，避免形成与认证上下文并行的第二套授权路径。

## 园区上下文模型

目标页面读取当前用户的 `accessible_parks` 和 `park_id`，渲染一个页面内园区切换控件：

1. 初始选中当前认证上下文园区。
2. 选择不同园区时调用 `switchParkContext(targetParkId)`。
3. 切换成功后更新本地 selected park，并触发页面数据重新加载。
4. 切换失败时恢复旧选择并显示页面本地错误。
5. 请求使用 `getAccessToken()` 取得最新 token。

这与 PR #311 中楼层/房源新增前切换上下文的模式一致，只是这次触发点是页面查询视图。

## 复用组件

新增一个轻量共享组件放在资产页面附近，例如 `apps/web/app/assets/components/ParkContextSelector.tsx`：

- 入参：`value`、`disabled`、`message`、`onChange`。
- 内部读取 `getStoredUser()` 的可访问园区，仅展示 enabled 园区。
- 以现有 `.form-field select` / `.secondary-button` / `ds-*` 体系呈现，避免页面局部重复 select 样式。

若现有组件已经足够，优先扩展现有资产页面组件而不是新增大抽象。

## 目标页面接入

- `/assets/unit-status-board` 和 `/assets/statistics`：在过滤/头部区域加入园区选择；切换后重置本地查询页/明细选择并重新加载数据。
- `PropertyFoundationListClient` 承载 `property-operations`、`property-occupancies`、`property-mode-transitions` 三个列表页：在该共享客户端中接入同一个园区选择控件，三页天然复用。
- 详情页暂不新增切园区控件；列表页切换后进入详情应沿当前认证上下文。

## 样式

- 保留 PR #315 的 `select option` 可读性修复。
- 对右上角园区切换 select 的容器、文字、边框、悬停/聚焦态做更明确的深色文字与浅色背景组合。
- 兼顾移动头部，不引入横向溢出。

## 测试策略

- 增加源代码契约测试，断言 5 个目标页面/共享客户端都接入 `switchParkContext` 或共享 `ParkContextSelector`。
- 断言页面请求不把 `parkId` 作为绕过参数写入目标业务接口。
- 跑相关 Web 单测、typecheck、lint。
- Chrome DevTools MCP 本地 UAT：桌面和 390px 移动视口检查右上角样式、目标页面园区选择入口、切换后刷新。
