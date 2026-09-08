# Design: PMA L-03 B 端工作台与全局导航

## Route authority

- `lib/routes.ts` 提供 typed patterns、matcher/buildHref、terminal 分类与 breadcrumb fallback。
- `lib/menu.ts` 继续拥有 canonical menus、后端 menu tree merge 与授权 metadata；registry 不取代 permission authority。
- 动态 label 通过小型 client store/context 按 pathname 发布，layout breadcrumb 消费；页面卸载清除，拒绝/未知时不显示敏感值。

## Command palette

- 从 `getUserDashboardMenus(user)` flatten 已授权叶节点；不使用 authorization fallback 生成可见命令。
- 搜索仅匹配 route label/path，切换 user scope fingerprint 时重建并清空 query/active state。
- 跳转仍经过 DashboardLayout route denial；palette filtering 只负责最小暴露面。

## List preferences

- localStorage payload `{version, filtersOpen, pageSize, viewMode, visibleFields}`。
- key 包含稳定 user、tenant、park、list id；定义变化时按 allow-list sanitize。
- SSR 首帧用默认值，mount 后 hydration；坏/旧 payload fail closed 到默认。
- 移动 cards 不因 desktop visible-fields preference 消失。

## Compatibility

- 保留 menu aliases、catch-all placeholder 与后端菜单优先级。
- 先迁移集中式 terminal/breadcrumb 和四个 PropertyListShell 页面，不批量替换全仓 href。
