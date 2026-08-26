# Approval runtime 非生产 UAT 启用入口

`pnpm property:approval-runtime:enable-uat` 只用于 disposable/local/test/CI 隔离环境。它不属于 production deploy、migration 或 seed；production-safe 初始化继续保持 `approval.enforce` disabled。

执行前必须设置：

- `ALLOW_PROPERTY_APPROVAL_RUNTIME_ENABLE=yes`
- `PROPERTY_APPROVAL_RUNTIME_TARGET=disposable`（也接受 `local|test|ci`）
- `PROPERTY_APPROVAL_RUNTIME_RUN_ID=YYYYMMDD-HHMMSS`；compose file/project/database 必须严格派生为 `/tmp/jinhu-housing-uat-<RUN_ID>/compose.yml`、`jinhu-housing-uat-<RUN_ID>`、`jinhu_housing_uat_<RUN_ID下划线>`
- `PROPERTY_APPROVAL_RUNTIME_COMPOSE_FILE`、`PROPERTY_APPROVAL_RUNTIME_COMPOSE_PROJECT`、`PROPERTY_APPROVAL_RUNTIME_POSTGRES_SERVICE`
- `POSTGRES_USER`、`POSTGRES_DB`
- `PROPERTY_APPROVAL_RUNTIME_TENANT_ID`、`PROPERTY_APPROVAL_RUNTIME_PARK_ID`
- `PROPERTY_APPROVAL_RUNTIME_ACTOR_ID`、`PROPERTY_APPROVAL_RUNTIME_ACTOR_NAME`
- `PROPERTY_APPROVAL_RUNTIME_APPROVAL_REFERENCE`、`PROPERTY_APPROVAL_RUNTIME_REQUEST_ID`
- `PROPERTY_APPROVAL_RUNTIME_EXPECTED_VERSION`（无默认值，必须按回读值显式确认）

示例仅应指向本轮手写隔离 compose。命令拒绝 production-like 环境、compose/project/database 标记，并在执行 SQL 前核对 compose 实际选中的唯一容器：其 Docker compose project/service/config-file labels 与容器内 `POSTGRES_DB` 必须和本轮 RUN_ID 严格一致。随后锁定唯一 signed disabled control，以 version CAS 启用，并在同一事务写入 `sys_op_log` 的 before/after。任何容器身份、scope/hash/version/state 漂移都会拒绝或回滚。stdout 的 `[AUDIT]` 行和两组回读结果可保存为 UAT 证据，但不得连同密码、连接串、token 或 Cookie 入库。

验证：`pnpm test:e2e:property-approval-runtime-entry`。
