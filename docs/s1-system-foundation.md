# S1 系统基础增强设计

范围：组织、用户、角色、权限、字典、附件、审计。

## 开发原则

- 后端权限独立生效，前端只做按钮隐藏和体验优化。
- 所有列表接口默认使用上下文中的 `tenant_id`、`park_id`，禁止前端传入伪造范围。
- 所有业务表保留公共字段：`id`、`tenant_id`、`park_id`、`create_by`、`create_time`、`update_by`、`update_time`、`is_deleted`、`version`、`remark`。
- 所有删除为软删除。
- 所有写操作必须携带 `X-Idempotency-Key` 并记录操作日志。
- 所有状态字段前端使用状态徽章展示。
- 所有列表页必须包含筛选区、表格区、分页区、新增按钮、编辑入口、详情入口。

## 数据模型

### 组织

表：`sys_org`

业务字段：

- `parent_id`
- `org_code`
- `org_name`
- `org_type`
- `leader_user_id`
- `sort_order`
- `status`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + org_code`

### 岗位

表：`sys_post`

业务字段：

- `post_code`
- `post_name`
- `sort_order`
- `status`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + post_code`

### 用户组织关系

表：`rel_user_org`

业务字段：

- `user_id`
- `org_id`
- `post_id`
- `is_primary`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + user_id`

### 字典类型

表：`sys_dict_type`

业务字段：

- `dict_code`
- `dict_name`
- `status`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + dict_code`

### 字典项

表：`sys_dict_item`

业务字段：

- `dict_type_id`
- `item_label`
- `item_value`
- `sort_order`
- `status`
- `tag_type`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + dict_type_id`

### 附件

表：`sys_attachment`

业务字段：

- `biz_type`
- `biz_id`
- `file_name`
- `file_ext`
- `mime_type`
- `file_size`
- `storage_provider`
- `storage_key`
- `sha256`
- `status`

索引：

- `tenant_id + park_id + is_deleted`
- `tenant_id + park_id + biz_type + biz_id`

## API 规划

### 组织

- `GET /api/v1/orgs`
- `POST /api/v1/orgs`
- `GET /api/v1/orgs/:id`
- `PATCH /api/v1/orgs/:id`
- `DELETE /api/v1/orgs/:id`

权限点：

- `system:org:list`
- `system:org:create`
- `system:org:detail`
- `system:org:update`
- `system:org:delete`

### 用户

- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `POST /api/v1/users/:id/reset-password`
- `POST /api/v1/users/:id/roles`

权限点：

- `system:user:list`
- `system:user:create`
- `system:user:detail`
- `system:user:update`
- `system:user:delete`
- `system:user:reset-password`
- `system:user:assign-roles`
- `system:user:me`

### 角色

- `GET /api/v1/roles`
- `POST /api/v1/roles`
- `GET /api/v1/roles/:id`
- `PATCH /api/v1/roles/:id`
- `DELETE /api/v1/roles/:id`
- `POST /api/v1/roles/:id/permissions`

权限点：

- `system:role:list`
- `system:role:create`
- `system:role:detail`
- `system:role:update`
- `system:role:delete`
- `system:role:assign-permissions`

### 权限

- `GET /api/v1/permissions`
- `GET /api/v1/permissions/tree`

权限点：

- `system:permission:list`
- `system:permission:tree`

### 字典

- `GET /api/v1/dict-types`
- `POST /api/v1/dict-types`
- `PATCH /api/v1/dict-types/:id`
- `DELETE /api/v1/dict-types/:id`
- `GET /api/v1/dict-items`
- `POST /api/v1/dict-items`
- `PATCH /api/v1/dict-items/:id`
- `DELETE /api/v1/dict-items/:id`

权限点：

- `system:dict-type:list`
- `system:dict-type:create`
- `system:dict-type:update`
- `system:dict-type:delete`
- `system:dict-item:list`
- `system:dict-item:create`
- `system:dict-item:update`
- `system:dict-item:delete`

### 附件

- `GET /api/v1/attachments`
- `POST /api/v1/attachments`
- `GET /api/v1/attachments/:id`
- `DELETE /api/v1/attachments/:id`

权限点：

- `system:attachment:list`
- `system:attachment:create`
- `system:attachment:detail`
- `system:attachment:delete`

### 审计

- `GET /api/v1/audit/login-logs`
- `GET /api/v1/audit/op-logs`

权限点：

- `system:audit:login-log:list`
- `system:audit:op-log:list`

## 前端页面

S1 页面统一放在系统管理分组：

- `/system/orgs`
- `/system/users`
- `/system/roles`
- `/system/permissions`
- `/system/dicts`
- `/system/attachments`
- `/system/audit`

每个列表页必须包含：

- 筛选区
- 表格区
- 分页区
- 新增按钮
- 编辑入口
- 详情入口
- 状态徽章

新增和编辑优先使用 Drawer；详情可使用 Drawer 或独立详情页。

## 测试重点

- 未登录访问受保护接口返回 401。
- 无权限访问接口返回 403。
- 未携带 `X-Idempotency-Key` 的写操作返回 400。
- 列表查询不能通过 query 参数覆盖 `tenant_id`、`park_id`。
- 删除后 `is_deleted = true`，列表不再返回。
- 写操作成功和失败均记录操作日志。

