# Technical Design

bundle 从 v1/10 members 升为 v2/11 members。模板定义同步升 v2。迁移先冻结目标角色集合，再逐租户校验 `housing:task:read` 唯一 active API row，校验 bundle predecessor/hash/member exact set，最后补 bundle member、更新受保护模板 metadata，并为明确来源的既有实例补单一 role-permission link。

生产 seed 保留默认 scope 职责，只同步新 metadata；跨租户既有实例修复由 migration 承担。新实例由 Roles API 根据 shared template 实时解析。
