# EPDR Entity Boundary

Task 001 不创建 TypeORM 实体和迁移。

后续实体必须：

- 继承 `AuditableEntity`。
- 包含 `tenantId`、`parkId` 和 DataScope 预留字段。
- 为状态、项目、责任人、空间对象创建必要索引。
- 避免把项目、计划、日报、巡检、整改、验收混入单表。
