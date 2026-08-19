# 公寓纳入与可用性设计

## 统一候选投影

新增 `ApartmentUnitCandidateQueryDto`，默认 20 条、最大 100 条。查询以 `biz_unit` 为运营房号主表，联接楼栋/楼层、物理资产映射、`biz_apartment_room`、`biz_property_operation_config`、`biz_property_occupancy` 和 `energy_meter`，通过聚合/EXISTS 生成资格信号。

资格规则由 `ApartmentsService` 的共享 SQL 投影拥有：列表使用该投影分页；创建事务在 `lock_property_unit_scope` 和 `FOR UPDATE` 后按同样条件重验单个房号。前端不可作为权威资格判断。

机器原因码：`already_apartment_managed`、`unit_disabled`、`asset_parent_mapping_incomplete`、`operating_config_disabled`、`operating_mode_conflict`、`occupied_by_other_domain`。

无 `asset_unit_id` 的运营房号返回 `assetMappingStatus=unmapped_external`，本阶段保持可纳入兼容；有资产单元但父链不完整则不可纳入。

## 公寓保留占用状态机

- `enabled -> disabled`：锁定 room、unit、occupancy；若存在 `reserved|active|checkout_pending` stay 则冲突；否则将活动公寓 occupancy 置 `released` 并记录原因/时间。
- `disabled -> enabled`：重新运行纳入资格（忽略自身公寓配置），确认没有其他域占用后优先重新激活该来源既有 occupancy；只有来源从未建过 occupancy 时才新建，并更新 room 指针。
- 保持 `biz_apartment_room` 记录，不通过软删表示日常停用。

## 床位缩容

按床位编码倒序选择多余床位。只允许停用不存在任何历史 stay 的床位；有历史的床位保留，若无法达到目标容量则冲突。扩容仍按稳定两位编码补建。

## Web

改造现有创建面板，不重写公寓工作台。加载候选第一页，提供关键字、楼栋/楼层筛选和翻页；展示资产映射与不可用原因，仅可纳入项可提交。使用现有 Design System 和触控友好按钮。

## Rollback

所有状态变更复用现有列，不新增破坏性迁移；应用回滚后已释放 occupancy 仍是合法历史状态，可由新版重新恢复。
