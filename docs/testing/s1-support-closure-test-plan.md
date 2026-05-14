# S1 Support Closure Test Plan

范围：S1-06 附件中心、S1-07 操作审计与登录日志、S1-08 后台 Layout / 动态菜单 / 按钮权限、S1-09 自测与修补。

## 附件中心

- 未登录访问 `/api/v1/attachments` 返回 401。
- 无 `system:attachment:list` 权限访问附件列表返回 403。
- 创建附件必须携带 `X-Idempotency-Key`，缺失时返回 400。
- 创建附件后 `sys_attachment` 写入 `tenant_id`、`park_id`、公共审计字段。
- 附件列表默认过滤 `tenant_id`、`park_id`、`is_deleted = false`。
- 删除附件只更新 `is_deleted = true`，不物理删除。
- 删除附件后附件列表不再返回该记录。
- 创建和删除附件均写入 `sys_op_log`。

## 审计日志

- 登录成功写入 `sys_login_log`，`success = true`。
- 登录失败写入 `sys_login_log`，`success = false`。
- `/api/v1/audit/login-logs` 必须校验 `system:audit:login-log:list`。
- `/api/v1/audit/op-logs` 必须校验 `system:audit:op-log:list`。
- 审计列表默认过滤 `tenant_id`、`park_id`、`is_deleted = false`。
- 审计日志不提供物理删除接口。

## 后台 Layout 与权限

- `/system/*` 页面展示统一后台侧栏。
- 菜单根据当前用户权限动态过滤。
- 无新增权限时，新增按钮不展示。
- 前端隐藏按钮后，后端接口仍独立校验权限。
- 登录成功后浏览器保存 token 与当前用户权限。

## 回归检查

- S1 第一批页面仍可访问：组织、用户、角色、权限、字典。
- 所有写操作继续通过 `apiRequest`，并检查 `res.ok`。
- 所有 number 输入框必须带 `onFocus={event => event.target.select()}`。
- 不得出现 SQLite。
- 不得使用 `any` 绕过核心业务类型。

