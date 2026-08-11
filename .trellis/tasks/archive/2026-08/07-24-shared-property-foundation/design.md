# 共享房产底座技术设计

## 1. 边界

本子任务只实现所有经营业态共同依赖的房源身份、经营模式、统一占用和个人业务相对方基础，不实现民宿订单或住房租约。

## 2. 推荐模块

- `property-operations`：经营房源配置、模式切换和可经营状态。
- `property-occupancies`：统一占用账本和冲突检查。
- `parties`：个人/组织业务相对方及敏感信息策略。

模块名称可在实施研究后按现有命名约定调整，但职责不能混入 `assets.service.ts` 或 `units.service.ts` 超大服务。

## 3. 数据设计

### 经营配置

每个 `biz_unit` 对应一份经营配置：

- `tenant_id`, `park_id`, `unit_id`
- `operating_mode`
- `operating_status`
- `effective_time`
- `suspend_reason`
- 审计、软删除和版本字段

### 模式切换日志

- 前模式、后模式
- 切换原因
- 前置检查快照
- 操作者和时间

### 统一占用

- 房源、来源域、来源类型、来源 ID
- `start_at/date`, `end_at/date`
- 状态、锁定过期时间
- 幂等键、版本和审计

PostgreSQL 优先评估 exclusion constraint 或等价的事务锁 + 重叠查询方案。无论选哪种方案，都必须把并发冲突翻译为稳定的业务冲突响应。

### 个人业务相对方

- 基本身份
- 联系方式
- 证件类型、加密证件号、脱敏投影
- 数据来源和同意/核验状态
- 不同业务角色通过关系表表达，不复制个人档案

## 4. 服务契约

- `checkAvailability(unitId, period, excludeSource?)`
- `holdOccupancy(source, period, expiresAt)`
- `activateOccupancy(source)`
- `releaseOccupancy(source, reason)`
- `transitionOperatingMode(unitId, targetMode, reason)`

所有写操作必须带幂等键或业务唯一约束。

## 5. 兼容方案

- 现有商业合同仍关联 `biz_unit`。
- 首次上线可通过读取适配器把有效商业合同视为长租占用。
- 经 UAT 验证后再决定是否物化回填历史占用。
- `asset_unit` 与 `biz_unit` 的映射先做显式字段/关系和质量报告，不直接删表或合表。

## 6. 权限

- 经营配置读取/修改
- 模式切换
- 占用读取/运营锁房/强制释放
- 个人档案读取/敏感字段读取/导出

强制释放占用属于高风险动作，需要额外权限、原因和审计。

## 7. 验证

- 同房源交叉时间段冲突测试。
- 边界日期 `[start, end)` 测试。
- 并发创建占用测试。
- 模式切换阻断矩阵。
- 商业合同兼容读取测试。
- 租户/项目隔离和敏感字段测试。
