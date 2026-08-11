# 移动共享契约与 Bootstrap API

## Goal

为原生 Android 客户端建立稳定、版本化的移动能力契约，并提供经过现有 RBAC、模块和园区范围投影的 `GET /mobile/v1/bootstrap`，作为员工端/业主端门户路由的唯一事实源。

## Requirements

- 在 `@jinhu/shared` 定义 mobile bootstrap、portal、capability 和 client policy 类型与常量。
- 新增 NestJS MobileModule，不新增数据库表或迁移。
- bootstrap 复用 `UsersService.getCurrentUserContext`，不得复制用户、权限、园区或模块查询逻辑。
- 服务端依据现有 permissions、enabled_modules 和身份角色计算 capability；客户端菜单不作为授权依据。
- 首期支持 employee、owner 两个门户，以及巡检、工单、隐患、业主服务和通知能力。
- 超级管理员只绕过 permission code，不绕过模块可用性；无移动 capability 时返回空 portals。
- 响应包含 contract_version、user、current_park、accessible_parks、portals、capabilities、home 和 client_policy。
- 本子任务不实现 Android UI、设备注册、推送、离线同步或新的业务聚合查询。

## Acceptance Criteria

- [ ] 已认证用户可调用 `/mobile/v1/bootstrap`，未认证请求被拒绝。
- [ ] 工程/巡检员工获得 employee 门户和对应 capability。
- [ ] 工单创建/读取的业主或租户身份获得 owner 门户和服务能力，但不获得内部工单处理能力。
- [ ] 双身份账号返回两个门户且 capability 去重、稳定排序。
- [ ] 模块关闭后，即使用户含权限或为超级管理员，对应 capability 仍不返回。
- [ ] 共享契约构建、API 单测、typecheck、lint 和 build 通过。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
