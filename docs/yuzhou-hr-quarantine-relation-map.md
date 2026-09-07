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

## T0 主数据关系复核（不计入上述 47 条）

最新只读 T0 抽取还发现一组独立的主数据关系缺口，不能和 T1--T3 的 47 条混算：

| 源关系 | 受影响源行 | 现代处理 |
| --- | ---: | --- |
| `dbo.job.department` → `dbo.departmentcode.department` | 2 个岗位 | 岗位保留为 `legacy_record_map` 的 `quarantined` 记录，错误码 `POSITION_ORG_UNRESOLVED` |
| `dbo.job.parentjob` → `dbo.job.job` | 7 个岗位 | 岗位保留为 `quarantined` 记录，错误码 `POSITION_PARENT_UNRESOLVED` |
| `dbo.person.job` → 可加载 `hr_position` | 27 名员工 | 员工仍按组织和状态加载，岗位外键留空，并记录 `EMPLOYEE_POSITION_UNRESOLVED` |

因此本轮 T0 隔离批次的守恒结果是：组织 138/138；岗位 18 条源记录中 11 条加载、7 条隔离；员工 2,949 条中 2,889 条加载、60 条因旧状态仅保留 `raw_only`。另有 11 条日期顺序复核。上述 T0 关系缺口不会被伪造为“已匹配”，也不改变 T1--T3 的 47 条异常统计。

## 依赖传播（当前隔离链的新增统计，不改写原始 47 条）

在真实当前源上按 T0 → T1 → T2 → T3 串行装载后，发现部分下游记录依赖那 60 名 `raw_only` 员工。这些不是源表的新异常，而是“现代目标要求可写员工状态”后产生的依赖隔离：

| 阶段 | 源关系 | 当前隔离数 | 处理 |
| --- | --- | ---: | --- |
| T1 | `dbo.readjust.person` → `hr_employee` | 148 | 事件保留为 `EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED`，不伪造员工外键 |
| T2 | `dbo.compact.person` → `hr_employee` | 25 | 合同保留为 `CONTRACT_EMPLOYEE_NOT_MAPPED`；其对应的 2 条变更随父合同缺失隔离 |
| T2 | `dbo.compact_c.compact` → `hr_contract` | 10 | 8 条基础父合同缺失，加上 2 条由员工未映射传导的父合同缺失 |
| T3 | `dbo.person_insure.person` → `hr_employee` | 959 | 保险期间和子项目保留 `INSURANCE_EMPLOYEE_NOT_MAPPED` |

当前隔离链已证明：T0 员工主数据不先解决，不能声称 T1/T2/T3 已“全量兼容”。这些依赖记录都保留源身份哈希、错误码和批次账本，可在员工状态字典补齐后定向重放，不需要重新抽取全部源库。

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
- 当前核验：源数据共有 5 个非空符号。`普通班次`、`晚上班` 已有规则；旧 DDL 注释明确 `N1` 为双休日、`N2` 为法定节假日，已加入确定性映射；`N` 仍没有稳定语义。原候选批次中的 3 条异常经过当前投影器重算后，预期只剩 1 条；受影响日明细仍只局部重放。
- 处理：保留 `N` 原符号和异常码；`N1/N2` 按受控 DDL 语义映射为 `weekend/statutory_holiday`，不重跑全部 T3。

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

最近一次以当前代码 SHA 重绑定 T0 候选和目标库存后重新生成 T3 候选：共 249,673 条，隔离 36 条（考勤符号 1 条、保险期间 5 条、保险子项目 30 条），状态为 `REVIEW_HOLD`。加上 T1 的 1 条和 T2 的 8 条，当前总剩余异常为 45 条。
