# 资产单元转运营房号与映射审计

## Goal

在不删除现有 `asset_*` 和 `biz_*` 表族的前提下，建立物理资产空间链与统一运营空间链之间的可审计一对一映射，并提供幂等、并发安全的 `asset_unit → biz_unit` 受控转换能力。

## Requirements

- 先建立 `asset_building ↔ biz_building` 和 `asset_floor ↔ biz_floor` 映射，再允许房号转换；不允许只按名称或前端选项暗自推断位置。
- 为现有 `biz_building`、`biz_floor`、`biz_unit` 增加明确物理资产映射和映射审计证据，不修改已成功迁移。
- 每个活动物理楼栋、楼层、单元在同一租户/园区内最多映射一个活动业务对象。
- 转换服务必须在一个事务中锁定目标资产和范围，重验层级归属、软删除、映射唯一性和房号编码唯一性。
- 同一幂等键重放返回原结果；不同幂等键并发转换同一资产时只能有一个成功结果。
- 返回的运营房号使用现有 `biz_unit` 契约，默认字段转换规则明确、可测试，不用 JavaScript 浮点丢失面积精度。
- 复用现有资产和房号权限；拥有公寓权限不代表可创建运营房号。
- 保留现有物业运营页面对 `biz_unit.asset_unit_id` 的兼容，但新映射必须经过统一领域服务，避免新增绕过审计的写入路径。
- 增加 PostgreSQL 集成测试，覆盖并发、重放、跨园区、层级不一致、编码冲突和软删除对象。

## Acceptance Criteria

- [ ] 已映射楼栋/楼层下的物理单元可一次转换为关联的 `biz_unit`，后续可被公寓候选服务使用。
- [ ] 未映射或错误映射的父级空间会明确失败，不会将房号落到同名的错误楼栋/楼层。
- [ ] 数据库唯一约束和事务锁确保同一资产只有一个活动映射。
- [ ] 转换和手工映射均有审计记录，可追溯原对象、目标对象、动作、原因、操作人和时间。
- [ ] 相同幂等键重放不重复创建，并发不同键不会生成两个 `biz_unit` 或两条活动映射。
- [ ] 旧的已映射 `biz_unit` 保持可读可用，迁移不自动猜测并写入存量关系。
- [ ] API 单元测试、PostgreSQL 集成测试、lint、typecheck、build 和相关资产回归通过。

## Out Of Scope

- 不在本任务自动关联存量数据；存量批量关联由后续数据修复子任务处理。
- 不修改公寓页面或公寓候选 API。
- 不删除 `asset_*` 或 `biz_*` 表族。

## Dependency

依赖已完成的基线盘点工具作为后续环境验证入口；代码实施不依赖生产报告数值。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
