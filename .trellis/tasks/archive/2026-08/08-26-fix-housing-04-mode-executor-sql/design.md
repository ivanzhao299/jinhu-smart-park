# Technical Design

## Boundary

修复限定在 property operations approved transition effect SQL 与针对性真实 PostgreSQL 测试。审批 worker、决策策略、runtime control 默认和迁移历史不改。

## SQL contract

- 根因位于 transition-log `INSERT ... SELECT`：同一 `$1/$2` 同时作为 SELECT 输出与 approval-request WHERE 参数，PostgreSQL 将其推导为 `text` 与 `varchar` 并报 42P08。
- 仅在 SELECT 输出处把 tenant/park 参数锚定为 `varchar(64)`，与两个表的 owner columns 一致。
- snapshot 与批量 `unnest` 路径已在真实新库中通过，不做无证据改动。
- cast 只影响参数解析，不改变谓词、索引语义、返回 shape 或 owner scope。

## Test design

在最邻近的 property foundation PostgreSQL spec 中创建 tenant/park/unit/config 最小 fixture，调用真实 service execute path，断言 snapshot SQL 可执行、approved transition 更新 mode/version、审计语义保留、非 owner scope 不更新。

## Compatibility and rollback

无 schema migration、无 seed 变更。回滚为撤销 SQL cast 与新增测试；若真实 schema 暴露其他列类型漂移，停止并单独论证，不添加兼容性迁移。
