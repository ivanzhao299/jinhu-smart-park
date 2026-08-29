# LEA-004 技术设计

## Shared projection primitive

在 `property-operations` 增加可导出的事务服务，接收调用方 `EntityManager`、scope、unit/source/action/target，负责 tenant/park scoped 行锁、强状态校验、其他有效占用判断、`UnitEntity` 与 `UnitStatusLogEntity(sourceType=system)` 同事务保存，并返回结构化 disposition。

## Touchpoints

- `HousingLeaseCommandService.activateInTransaction`：occupancy/lease 生效完成后调用 occupy(30)。
- `HousingLeaseApprovalExecutorService`：checkout occupancy release 与 lease terminated 的同一 manager 内调用 release(10)，disposition 纳入 effect audit。
- `HomestayStayCommandService.checkIn`：booking 保存后调用 occupy(30)，disposition 纳入 action snapshot。
- `HomestayStayCommandService.checkOut`：booking/turnover 保存后调用 release(10)，disposition 纳入 action snapshot。

## Audit and tests

- 房态事实：`biz_unit` + `biz_unit_status_log` 同事务；业务关联：住房 effect audit / 民宿 action snapshot。
- primitive tests 覆盖 10→30、30→10、幂等、强状态冲突/保留、其他 occupancy 保持 30、scope/not-found。
- wiring/PG tests 覆盖四个触点、审计 disposition、成功双写与冲突回滚。
