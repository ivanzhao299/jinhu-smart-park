# HOU-UAT-02：住房审批岗任务读取权限

## Goal

修复 Issue #403：`PROPERTY_OPERATIONS_APPROVER` 能进入住房任务页但调用 `GET /housing/tasks` 因缺 `housing:task:read` 返回 403。

## Requirements

- housing approver bundle 增加且仅增加 `housing:task:read`。
- 更新 shared bundle/template 版本和签名，未来模板实例化获得该权限。
- forward-only migration fail-closed 校验 predecessor 与每个命中租户唯一 active API permission。
- 既有角色只命中受保护模板源，或具有精确 `Copied from role PROPERTY_OPERATIONS_APPROVER` 来源且仍持有住房页和审批决定权限的实例。
- 不按用户名、模糊角色名或默认租户硬编码扩权；不授予住房写权限。

## Acceptance criteria

- [ ] shared/seed/migration 的 canonical hash 一致。
- [ ] fresh、predecessor、multi-tenant、drift、replay PG fixtures 通过。
- [ ] shared build、RBAC tests、lint/typecheck/build、release smoke 通过。
- [ ] PR 和 main CI/Deploy 双绿，统一住房真实 Chrome 复测通过。
