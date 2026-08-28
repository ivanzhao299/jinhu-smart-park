# PSW-003 Technical Design

## State Classification

- 仅当当前园区投影显式存在且 `role_summary.has_business_role === false` 时认定 access-only。
- 摘要缺失表示诊断不可见，不得推断无角色；普通 permission/module denial 仍交给现有 403 链。
- API/JWT 不变：`system:user:me` 保证用户仍能刷新上下文和切换园区。

## Recovery State

- 新增 Web 纯函数模块管理 tab-scoped recovery source，保存最小字段：用户、租户、来源园区 ID/名称；不保存 token、权限或角色。
- 全局园区切换发布 authoritative `nextUser` 时：若目标 access-only，记录切换前园区；若目标已有业务角色或返回来源园区，清除恢复记录。
- 刷新后从 `sessionStorage` 恢复；用户/租户不匹配、来源园区已不可访问/停用、来源等于当前园区时 fail closed 并清除。
- 登出/清会话同步清除 recovery source。

## Layout Projection

- `DashboardLayout` 在认证用户 ready 后优先识别 access-only，渲染完整 dashboard shell 内的专用状态；保留 `AppHeader/UserMenu` 或 `MobileTerminalHeader`。
- 专用状态替换业务 children，不渲染未授权页面；此分支不执行 `/403` redirect。
- 恢复按钮复用 `switchParkContext`，发布 authoritative user 后走 `resolvePostLoginPath`；失败就地展示，不伪造成功。
- 配置指引为文字说明“请联系园区管理员；管理员可在系统管理 → 用户管理中配置目标园区角色”，不向当前用户开放无权链接。

## D5 Audit

- 新增参数化只读 shell diagnostic，要求 `TENANT_ID`，可选 `PARK_ID`，通过既有 compose PostgreSQL 连接执行单个 SELECT。
- 仅列 enabled access link 对应的有效用户/园区，使用与运行时一致的有效角色 `NOT EXISTS` 条件；tenant-scope 角色和受保护 tenant-super 均视为已配置。
- 输出 tenant/park/user UUID、园区代码/名称、最小用户名及 `access_only`，不输出手机号、邮箱、权限、token 或候选角色。
- 脚本无 DML/DDL，失败即停；本任务只交付和测试，不连接生产。

## Compatibility And Rollback

- 不改 API、数据库 schema、路由 URL 或现有 switch-context token rotation。
- 回滚仅需删除专用投影/recovery helper 和 D5 脚本；通用 403 行为自然恢复。
