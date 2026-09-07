# 玉舟 HR 47 条异常记录关系与现代模型映射

本文件只描述表、字段类别、依赖关系和处理规则，不包含姓名、账号、工资明细、照片或附件内容。计数来自当前受控只读源候选回执，并与 `quarantine-relation-analysis.json` 交叉核对。

## 总计

| 阶段 | 源表 | 现代目标表 | 异常数 | 原因 |
| --- | --- | --- | ---: | --- |
| T1 | `dbo.readjust` | `hr_employment_event` | 1 | `EMPLOYMENT_EVENT_STATE_UNRESOLVED` |
| T2 | `dbo.compact_c` | `hr_contract_change` | 8 | `T2_CONTRACT_MISSING` |
| T3 | `dbo.timekeeptable` | `hr_attendance_symbol_rule` | 3 | `T3_ATTENDANCE_SYMBOL_UNRESOLVED` |
| T3 | `dbo.person_insure` | `hr_employee_insurance_period` | 5 | `T3_INT4_INVALID` |
| T3 | `dbo.person_insure` | `hr_employee_insurance_item` | 30 | `T3_INT4_INVALID` |
| **合计** | **4 张源表** | **5 个直接目标表** | **47** | **4 类原因** |

`dbo.person_insure` 的 35 条同时属于同一条父子链：`hr_employee -> hr_employee_insurance_period -> hr_employee_insurance_item`，所以源表数是 4，异常记录行数仍是 47，不应重复累计。

## 逐表关系

### 1. 人事异动：`dbo.readjust` → `hr_employment_event`

- 源关系：`person` 逻辑引用 `dbo.person.person`；异动类型和项目还依赖 `dbo.readjustitem`，离岗类值依赖 `dbo.awaytypecode`。
- 字段映射：`person` → `employee_id`；`readjustdate` → `effective_date`；`readjusttype/readjustitem` → `event_type/legacy_event_type`；旧部门、岗位、薪酬前后值 → `before_snapshot/after_snapshot`；`cause` → `reason`；`state/approve` → `legacy_state/migration_decision`。
- 现代约束：`hr_employment_event.employee_id` 必须先命中 T0 的 `hr_employee`；不能把未解释的旧 `state` 直接翻译成新的生效状态。
- 当前核验：6,886 条源记录的旧状态进入“可接受”映射，1 条记录属于非生效状态，当前策略将其隔离而不是当作已生效事件。
- 处理：保留旧状态和审批值为兼容证据；该 1 条只有在业务确认其历史语义后才能决定是保留为非生效历史，还是补充新的迁移决策，不伪造业务状态。

### 2. 合同变更：`dbo.compact_c` → `hr_contract_change`

- 源关系：旧 DDL 未声明外键，但 `compact_c.compact` 与 `dbo.compact.compact`、`compact_c.person` 与 `dbo.person.person`、日期序列共同构成逻辑关系。
- 字段映射：`compact/person` → 合同与员工 lineage；`startdate/enddate` → `new_start_date/new_end_date`；`cjddate` → `signed_at`；`compacttime` → `sequence_no` 或仅保留在 `source_snapshot`，须以合同链证据决定。
- 现代约束：`hr_contract_change.contract_id` 必须先命中同一园区范围内的 `hr_contract`，不能写孤立变更记录。
- 当前核验：受控抽取中 `dbo.compact` 有 802 条父合同、`dbo.compact_c` 有 357 条变更；其中 349 条能命中父合同，8 条涉及 5 个唯一合同号无法命中父合同。
- 处理：先补齐或绑定父合同；缺父合同的 8 条保持隔离，不猜测创建父合同。若后续源侧补回父合同，只重算这 8 条及其映射，不重跑整个 T2。

### 3. 考勤日历：`dbo.timekeeptable` → 三层目标链

- 源关系：`tablename` 逻辑依赖 `dbo.timekeeptablecode`；`year/month` 是期间；`date1..date31` 是按列展开的每日符号。
- 目标链：`hr_attendance_import_batch` → `hr_attendance_calendar_source` → `hr_attendance_day`；符号字典单独落 `hr_attendance_symbol_rule`。
- 字段映射：`year/month` → 日历期间；`date1..date31` → 每个自然日一条 `hr_attendance_day`；旧符号 → `legacy_symbol`，确认后再填 `normalized_kind`。
- 现代约束：未知符号不能默认为出勤、休息或缺勤；`calendar_source_id` 必须先命中父日历。
- 当前核验：源数据共有 5 个非空符号，其中 2 个已有目标规则，3 个没有稳定字典映射；这 3 个符号在日明细中合计出现 1,370 次。
- 处理：3 条符号规则异常保留原符号和异常码，待字典确认后只重放规则投影及受影响日明细，不重跑全部 T3。

### 4. 五险一金：`dbo.person_insure` → 父期间 + 子项目

- 源关系：`person` 逻辑引用 `dbo.person.person`；一条源期间拆为一个 `hr_employee_insurance_period` 和多个 `hr_employee_insurance_item`。
- 字段映射：`person/recyear/recmonth` → 员工、期间；各险种 `base/*_e/*_p/*_pc` → 项目的基数、总额、单位额、个人额、补充额；旧旗标和负基数证据保留到 `source_snapshot/legacy_base_negative`。
- 现代约束：`period.employee_id` 必须先命中 `hr_employee`；每个子项目的 `period_id` 必须命中同一期间父记录；年月、整数和金额不能把非法值强转为 0。
- 当前核验：35 条不是 35 个独立金额错误，而是 5 条父期间记录的 `year/month` 同时为空；每条父记录正好拆出 6 个保险子项目，因此形成 5 条父期间异常 + 30 条子项目异常。
- 处理：先修复或确认这 5 条期间的年月语义，再整体重放父期间和 30 条子项目；合法金额字段不能掩盖非法期间键，也不能把缺失年月强转为当前月份或 0。

## 导入顺序与解除条件

1. T0 先建立 `sys_org`、`hr_position`、`hr_employee`。
2. T1 写入 `hr_employment_event`，依赖员工和异动字典。
3. T2 先写 `hr_contract_type`、`hr_contract`，再写 `hr_contract_change`。
4. T3 先写批次/字典/父期间，再写日明细和保险子项目。
5. 47 条不能通过“忽略异常”解除；每条必须得到字典确认、父记录补齐或字段修复，并重新生成来源哈希、映射记录和比例校验。

本轮隔离验证已将异动类型/状态、合同类型/状态四个机器核验字典版本写入隔离目标控制表，四个版本均为 `approved`、`machine_attested`，共 12 个字典项；未写入任何 HR 业务历史记录，生产导入仍为 `HOLD`。

当前生产导入仍为 `HOLD`；本文件是关系映射和异常处置依据，不是生产授权。
