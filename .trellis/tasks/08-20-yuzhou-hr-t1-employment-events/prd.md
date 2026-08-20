# 玉舟 HR T1 异动历史迁移

## Goal

将玉舟 `readjust/readjustitem` 的 6,887 条入转调离历史迁入 Jinhu，形成可查询、可审计、可核对、可精确回滚的员工历史链，同时不得通过重放历史覆盖 T0 已确认的员工当前状态。

## Requirements

- 使用 SQL Server 独立只读 ETL 账号，按稳定主键顺序抽取；固定源快照 hash、行级身份 hash 和内容 hash。
- Profile 单号、类型、员工关联、日期、组织/岗位关联、审批状态、重复和未知值；报告不得包含姓名、工号原文、工资值或审批人员原文。
- 扩展 `hr_employment_event` 以容纳旧单号、旧类型、旧状态、裁决状态、历史导入标记和前后快照；敏感工资快照不得进入普通事件投影。
- 历史事件按员工、有效日期、旧主键确定稳定序列；未知类型或无员工映射记录进入脱敏错误队列。
- 每条目标事件建立 `legacy_record_map`；所有数量、员工关联、唯一性和时间序列检查写入 `migration_check`。
- loader 只能写入显式隔离数据库，要求 mutation flag、run id、loopback 容器和固定 staging checksum。
- rollback 只能删除当前 run 且有活跃映射证明的事件，不能删除 T0 员工或其他批次数据。
- 历史导入不触发 Workflow Inbox、不执行现行审批、不改变员工当前状态。

## Non-goals

- 不在本切片实现新的在线异动申请页面或生产通知。
- 不迁移历史工资金额到普通 HR 事件表。
- 不把旧 `approve/state` 未知值静默映射为“已批准”。

## Acceptance Criteria

- [x] 两次真实只读抽取的规范 staging 文件 hash 一致，抽取总账为 6,887。
- [x] 前向迁移在完整 000001..最新链和生产安全 seed 后通过，重放安全。
- [x] 目标事件拥有明确的历史导入、旧单号/类型/状态和裁决字段，唯一约束能阻止同源重复。
- [x] 所有可映射事件载入；不可映射事件进入脱敏 `migration_error`，两者之和等于 6,887。
- [x] 装载不改变 T0 员工状态、组织、岗位、入职和离职日期。
- [x] 精确回滚只删除该 run 创建的事件并停用其 map；重载成功、同 run 重放被拒绝。
- [x] contract、真实 PostgreSQL 集成、日志脱敏、失败清理、lint、typecheck、build 全部通过。

## Confirmed Source Facts

- `readjust`: 6,887 行，主键 `id int`；包含 `no`、`readjusttype`、`readjustdate`、`person`、新旧部门/岗位/工资字段、`state`、`approve` 等。
- `readjustitem`: 8 行类型字典。
- T0 员工映射基线为 2,938 条已装载员工 + 11 条日期异常隔离，总账 2,949。
