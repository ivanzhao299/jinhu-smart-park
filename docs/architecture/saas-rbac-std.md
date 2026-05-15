# S1-RBAC-STD SaaS 权限开放化基线

本阶段将项目定位从单园区系统升级为产业园数字运营 SaaS 平台底座，不新增招商、合同、应收、工单、安全等业务功能。

## 范围

- 角色继续支持自定义角色、角色树、模板复制和权限叠加。
- 权限继续支持菜单、页面、按钮、API、数据、字段和自定义权限树。
- 租户、园区、用户可访问园区、数据权限、字段权限保持 SaaS 预留。
- 新增统一编码规则服务 `CodeRulesModule`。
- 新增模块注册、套餐和租户模块授权服务 `SaaSModulesModule`。

## 新增数据表

- `sys_code_rule`：统一编码规则。
- `sys_module_registry`：平台模块注册表。
- `sys_plan`：版本套餐表。
- `rel_tenant_module`：租户模块授权表。

所有表都保留 `tenant_id`、`park_id`、`create_by`、`create_time`、`update_by`、`update_time`、`is_deleted`、`version`、`remark`。

## 新增 API

- `GET /api/v1/code-rules`
- `POST /api/v1/code-rules`
- `GET /api/v1/code-rules/:id`
- `PATCH /api/v1/code-rules/:id`
- `DELETE /api/v1/code-rules/:id`
- `POST /api/v1/code-rules/:id/preview`
- `POST /api/v1/code-rules/:ruleCode/next`
- `GET /api/v1/platform-modules`
- `POST /api/v1/platform-modules`
- `PATCH /api/v1/platform-modules/:id`
- `GET /api/v1/plans`
- `POST /api/v1/plans`
- `PATCH /api/v1/plans/:id`
- `GET /api/v1/tenant-modules`
- `POST /api/v1/tenant-modules`

所有接口都依赖 JWT 和权限点，公开接口必须显式使用 `@Public()`。

## 新增前端路由

- `/system/code-rules`
- `/system/modules`

页面继续使用 Next.js App Router、Vanilla CSS、CSS Variables 和 lucide-react。

## Seed

生产 seed 会初始化：

- 系统内置权限点和权限树。
- 默认模板角色。
- 默认编码规则。
- 默认 SaaS 模块注册。
- 基础版套餐。
- 默认租户模块授权。

开发 seed 仍只通过 `pnpm db:seed:dev` 执行本地测试账号，不进入生产 seed。
