# 资产空间链到运营空间链的受控转换设计

## 现状复用与缺口

`PropertyOperationsService.configure` 已可将现有 `biz_unit` 关联到 `asset_unit`，并检查当前范围与一对一唯一性。但它不能从物理资产创建运营房号，也没有楼栋/楼层映射、映射专项审计和跨入口共享的锁。

## 数据设计

新增前向迁移，不修改已成功迁移：

- `biz_building.asset_building_id uuid NULL`，对活动行建立范围内唯一索引，并由触发器校验来源范围。
- `biz_floor.asset_floor_id uuid NULL`，对活动行建立范围内唯一索引，并由触发器保证来源范围与父楼栋映射一致。
- 保留 `biz_unit.asset_unit_id`，补充房号与楼层/楼栋映射一致性的数据库级防线。
- 新增 `biz_asset_space_mapping_audit`，只追加记录 `entity_type`、`asset_id`、`business_id`、`action`、`reason`、`idempotency_key`、`operator_id`、时间与映射快照。
- 审计表禁止 UPDATE/DELETE，同范围+动作+幂等键唯一。

资产表历史范围字段与运营表范围字段类型不同，不能建立范围复合外键；迁移采用源对象外键、活动唯一索引和数据库触发器共同约束，不自动猜测或回填存量映射。

## API 边界

优先扩展资产模块，因为源对象是物理资产：

- `POST /assets/buildings/:id/operating-building`
- `POST /assets/floors/:id/operating-floor`
- `POST /assets/units/:id/operating-unit`
- `GET /assets/operating-space-candidates`

每个端点使用幂等拦截器、资产对象创建权限和审计日志。楼栋/楼层端点支持：

- 关联已有同范围业务空间；或
- 从物理资产生成新业务空间。

房号端点在父映射完整后从 `asset_unit` 创建 `biz_unit`。对外 DTO 允许补充仅存在于运营层的字段：`usageType`、`rentalStatus`、`fittingStatus`、`useArea`、`refPrice`、`availableDate`、`remark`；房号编码、名称、楼栋、楼层和基础面积来自资产快照。

## 锁与幂等

1. 根据 `tenantId:parkId:asset-space:<entityType>:<assetId>` 获取事务级咨询锁。
2. `FOR UPDATE` 重读资产及父级映射。
3. 查找已有活动映射：若与幂等请求兼容则返回，否则冲突。
4. 创建/关联业务对象，写入不可变审计。
5. 唯一约束冲突时仅对已知约束重读胜者；其他数据库错误原样抛出。

## 兼容

- 已有 `biz_unit.asset_unit_id` 不回填新父映射，基线盘点将其标记为待处理。
- `PropertyOperationsService.configure` 的显式解绑能力在过渡期保留；绑定操作改为调用共享映射服务，不保留第二套一对一校验。
- 应用回滚后旧版会忽略新列，已生成的 `biz_*` 对象仍可使用；不删除审计记录。
