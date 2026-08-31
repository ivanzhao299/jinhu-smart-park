# 设计：玉舟异动历史迁移

## 数据流

`SQL Server readjust/readjustitem (read-only)` → `events.raw.json/type dictionary` → `transform/profile JSONL` → `PostgreSQL temp staging` → `hr_employment_event + legacy_record_map + migration_* evidence`。

## 目标模型

在现有 `hr_employment_event` 上前向扩展：

- `legacy_event_no`、`legacy_event_type`、`legacy_state`：原业务标识，均为可空，仅历史导入使用。
- `source_effective_at`：保留旧业务日期和时间精度。
- `migration_decision`：`accepted|quarantined|needs_review`。
- `is_historical_import`：区分在线状态机事件。
- `before_snapshot/after_snapshot`：仅保存组织、岗位、状态等非高敏业务快照；不保存工资金额和人员姓名。

以 `(tenant_id, park_id, legacy_event_no)` 的历史导入部分唯一索引阻止重复。在线事件不依赖旧单号。

## 转换规则

- 通过 T0 `legacy_record_map(source_table='dbo.person')` 找目标员工，不直接按可变姓名关联。
- 旧类型通过字典和实际分布形成版本化映射；明确类型转规范 `event_type`，未知值保持原代码并进入 `needs_review`，不得猜测。
- 新旧组织/岗位代码通过 T0 mapping 解析为 UUID，同时在快照保留代码；解析失败不更新当前员工，只记录错误/复核。
- 同日多事件按 `readjustdate, id` 排序；目标 `effective_date` 使用日期，完整旧时间保存于 `source_effective_at`。
- 旧工资字段只做存在性/变化标志统计，不进入 staging 输出或普通事件 JSON。

## 安全与事务

- 抽取 SQL 显式列，不选择姓名、工资、操作员或审批人原文。
- loader 在单事务内锁定 batch，验证 staging hash 和目标库门禁，再写事件、map、check、rollback point。
- 历史导入直接写历史事件表，不调用在线 `transitionEmployment`，因此不修改员工当前态、不发消息。
- 任何数量或映射总账失败将 batch 标记失败并终止；rollback 只凭当前 batch 活跃 map 定位行。

## 验证

冻结载入前后员工当前字段摘要 hash；核对源总数、成功数、隔离数、唯一单号、员工关联、组织/岗位映射和事件时间序列。装载后回滚、重载，并验证 T0 员工和 seed 组织数量不变。
