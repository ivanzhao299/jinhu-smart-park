# PAM-004 菜单权威修复

## Goal

修复 Issue #432：已认证用户的 API 菜单字段明确返回空数组时，Web 必须尊重该权威结果，不得用静态 `dashboardMenus` 重建被模块/依赖过滤掉的业务入口。

## Confirmed Facts

- API `/users/me` 同时返回 `menu_tree` 与 `menus`；模块或依赖不满足时允许返回 `[]`。
- 当前 Web 把 normalize 后为空与字段缺失合并为同一静态 fallback。
- 变更限于 Web 与同步文档；无数据库迁移，不改 API、生产配置或 HR 系列。

## Requirements

- 显式空数组是已认证用户的权威展示空菜单；静态 canonical 元数据仅供直达路由 fail-closed 授权判断。
- 旧 API 两个菜单字段均不存在时，才进入命名清晰、可测试的兼容分支。
- 静态菜单继续提供 canonical 授权元数据和旧 API 兼容，不成为显式空树的隐式授权来源。
- `menus` 与 `menu_tree` 的字段存在性和优先级必须显式处理。
- 同步修正仍宣称“空树回退静态菜单”的运维/测试文档。

## Acceptance Criteria

- [ ] 显式空树不会渲染任何静态业务菜单，super/`*` 也不能绕过。
- [ ] 两个菜单字段缺失时仍走显式旧 API 兼容分支。
- [ ] 依赖模块禁用时 housing/homestay 不会被 Web 重建；依赖满足且 API 返回授权节点时正常显示。
- [ ] 17 个 canonical surfaces 的静态授权元数据完整且测试冻结。
- [ ] Sidebar、面包屑和 catch-all 不从显式空树恢复展示入口；Dashboard 路由授权仍能用静态元数据拒绝直达 canonical URL。
- [ ] Web 聚焦单测、lint、typecheck、build 与 CI 通过。
- [ ] PR 关闭 Issue #432，经 `@codex review` 不超过 3 轮后 squash merge，main CI 与 Deploy 双绿。

## Out of Scope

- Track-B “只进任务台”产品语义不改代码。
- 授权变更“刷新后生效”不改代码。
- PAM-005 首跳统一在独立分支、PAM-004 合并后实施。
