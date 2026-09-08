# Design: PropertyListShell 首批迁移

## Boundary

`PropertyListShell` 放在 `apps/web/features/property-shared/ds/`，是 Web 应用内的房产业务组合组件，不下沉 `packages/ui`。底层继续复用 `@jinhu/ui` 的 `PageHeader`、`FilterPanel`、`PaginationBar`，以及现有 property shared surfaces/records。

业务页仍拥有查询参数、API 请求、权限、drawer 与 mutation；壳层只接收 React slots 和分页状态，不读取 API、不推断权限、不执行写操作。

## Component Contract

- `header`: title/eyebrow/description/context/actions。
- `filters`: collapsible filter content、apply/reset handlers、applied chips；折叠不清除草稿。
- `list`: summary/actions、empty/loading/error content、responsive records。
- `bulkActions`: optional；只有调用方已根据权限和 selection 计算后才渲染。
- `pagination`: page/totalPages/total/onPage，统一边界和按钮。

组件输出稳定的 `ds-*` 结构与语义标记，页面专属 layout 仅保留必要例外。

## Record Data Flow

每页定义一个 `PropertyFieldDescriptor<T>[]` 作为字段单一来源：

`API item -> descriptor formatter -> desktop DataTable cells + mobile dl fields`

actions 通过同一 renderer 接收 `desktop|mobile` presentation；移动端可只保留优先动作或紧凑组合，但权限判断沿用页面原逻辑。

## Filter And URL Compatibility

页面保留 draft filter 与 applied filter 两层状态。应用时重置 page=1 并同步 URL；重置恢复默认值并清理该页拥有的 query keys。初次加载从 URL 读取已支持的字段。壳层仅渲染控件/chips，不拥有业务字段解析。

为控制首批风险，如果某页原先没有 URL 状态，则新增纯前端 replaceState 同步，不改变服务端 API 参数格式；浏览器 back/forward 兼容由定向契约与 UAT 核验。

## Compatibility And Risk Controls

- 不更改 API endpoints、DTO、金额计算、删除/作废/核销规则。
- 不新增 migration、seed、env 或 deployment script。
- 先完成共享壳层与契约，再逐页迁移；每页迁移后运行定向测试，出现回归可按页面回退。
- 目标页现有 drawer/modal DOM 保持在同一 client component 生命周期内，避免状态丢失。
- 浏览器验证使用隔离 runner、独立 profile/evidence；凭据只从既有安全输入获得，不写入日志或仓库。

## Trade-offs

- 本期选择 app-level composition，而非扩大通用 UI 包 API，减少非房产业务受影响面。
- 本期提供 bulk/saved-view 扩展位而不新增危险业务动作；完整效率能力留待后续明确权限与后端契约。
- M-04 使用静态/契约测试守住结构，真实 mounted 用户交互深度由紧随其后的 M-05 专项补齐。
