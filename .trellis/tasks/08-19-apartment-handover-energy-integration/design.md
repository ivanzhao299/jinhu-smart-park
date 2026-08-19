# 公寓交接与能源计量设计

## Identity and data flow

`stay -> apartment_room -> biz_unit -> energy_meter(room_id)` 是唯一关联链。交接记录只保存现场快照，正式计量进入 `energy_reading`。读数增加来源三元组 `source_domain=apartment`、`source_type=move_in_handover|move_out_handover`、`source_id=handover.id`，并以表计加来源建立唯一索引。

## Atomic handover

交接事务依次锁 stay、unit scope、启用的 WATER/ELECTRIC meter；验证 DTO 对全部表计一一覆盖；插入/更新 handover；以 PostgreSQL numeric 计算用量并插入 CONFIRMED 读数；更新 meter 当前值；最后推进 stay/application 状态。倒挂或范围不符在状态变化前失败。

无表计房号返回空列表并允许交接。兼容字段仅在该类型恰好一个表计时解析为显式 meter reading；多表时拒绝模糊映射。

## Web

打开交接面板时读取 stay 表计。每表一项展示编码、名称、当前值和单位，并提交 `{meter_id, reading_value}`。加载失败不允许提交；空表计显示兼容提示。

## Rollback

迁移只新增可空来源列和部分唯一索引。应用回滚不会影响既有能源读数；新来源字段可被旧代码忽略。
