# Design

## Boundary

在 Web 菜单层引入一个以完整 `UserContext` 为输入的 API 菜单来源解析器，先区分字段“存在”与“不存在”，再 normalize。组件不再用 `user?.menus ?? user?.menu_tree` 自行丢失来源语义。

## Contract

- `menus` 字段存在（包括 `[]`）时优先使用它。
- `menus` 不存在而 `menu_tree` 存在（包括 `[]`）时使用后者。
- 两个字段均不存在时标记为 legacy compatibility，允许静态 canonical tree。
- 权威来源 normalize/prune 后为空时，display tree 保持 `[]`；不能因节点全部是 legacy/placeholder 而恢复静态展示树。
- authorization tree 可保留静态 canonical 元数据以识别并拒绝直达 URL，但不得被展示消费者使用。
- `menu_tree`/`menus` 的统一 normalized 来源优先级属于 PAM-005，不在本分支提前修改。

## Compatibility

旧 API 未返回任一字段时维持静态兼容。当前 API 的明确空数组保持权威。无 API/数据库协议变更。

## Rollback

纯 Web 可逆变更；回滚对应 squash commit 即可。若兼容测试失败，不扩大到 API 层。
