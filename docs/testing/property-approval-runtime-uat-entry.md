# Approval runtime 非生产 UAT 启用入口

`pnpm property:approval-runtime:enable-uat` 只用于 disposable/local/test/CI 隔离环境。它不属于 production deploy、migration 或 seed；production-safe 初始化继续保持 `approval.enforce` disabled。

执行前必须设置：

- `ALLOW_PROPERTY_APPROVAL_RUNTIME_ENABLE=yes`
- `PROPERTY_APPROVAL_RUNTIME_TARGET=disposable`（也接受 `local|test|ci`）
- `PROPERTY_APPROVAL_RUNTIME_COMPOSE_FILE`、`PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT`、`PROPERTY_APPROVAL_RUNTIME_POSTGRES_SERVICE`
- `POSTGRES_USER`、`POSTGRES_DB`
- `PROPERTY_APPROVAL_RUNTIME_TENANT_ID`、`PROPERTY_APPROVAL_RUNTIME_PARK_ID`
- `PROPERTY_APPROVAL_RUNTIME_ACTOR_ID`、`PROPERTY_APPROVAL_RUNTIME_ACTOR_NAME`
- `PROPERTY_APPROVAL_RUNTIME_APPROVAL_REFERENCE`、`PROPERTY_APPROVAL_RUNTIME_REQUEST_ID`
- `PROPERTY_APPROVAL_RUNTIME_EXPECTED_VERSION`（production-safe 当前基线通常为 `3`，必须按回读值显式确认）

示例仅应指向本轮手写隔离 compose。命令拒绝 production-like 环境、compose/project/database 标记；锁定唯一 signed disabled control，以 version CAS 启用，并在同一事务写入 `sys_op_log` 的 before/after。任何 scope/hash/version/state 漂移都会回滚。stdout 的 `[AUDIT]` 行和两组回读结果可保存为 UAT 证据，但不得连同密码、连接串、token 或 Cookie 入库。

验证：`pnpm test:e2e:property-approval-runtime-entry`。
