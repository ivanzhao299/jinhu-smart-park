# 切片 D 交接：正式全域 A/B（insert 候选全量落库回读验证）

- 日期：2026-09-11
- 分支：`codex/hr-sliceD-formal-ab-v1`（基于 origin/main `65bd29c0`，含切片 A/B/C 合入）
- 上游切片：A（#735=77d2b940）、B（#736=f817f1f5）、C（#737=65bd29c0，本切片执行前已合入）
- 状态：**切片 D 完成**；切片 E（生产授权）、F（受控导入）保持 HOLD，productionImport 全程 HOLD

## 1. 目标与范围

切片 D = 正式全域 A/B：将 T0/T1/T2/T3 **insert 候选**全量落库到隔离库，回读后做字段级与语义 canonical 双重比对，验证：

1. 全部 insert 候选可落库（含派生 FK 依赖、数据库触发器约束）；
2. 落库后逐字段内容与候选 targetFields 一致（数据无损往返）；
3. 语义 canonical（归一化表示下重算）一致；
4. 隔离候选（quarantine/skip 等）未被写入。

## 2. 隔离库

- 库名：`jinhu_hr_migration_lab_sliced_20260911a`（PG 库名自动转小写；lab 正则 `^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$` 满足）
- 容器：`jinhu-smart-park-postgres`（loopback:15432，compose project `jinhu_hr_migration_lab`）
- 来源：从模板 `jinhu_hr_migration_lab_real_t0t3_20260907a` `CREATE DATABASE ... TEMPLATE` 克隆
- 迁移：应用 `database/migrations/000314_hr_position_legacy_references.sql`，`hr_position` 增 `legacy_department_reference` / `legacy_parent_reference`（模板原有 `legacy_source_id` / `legacy_upto_code`）
- 初始状态：目标表全空；`sys_org` 有 14 条宿主组织（tenant/park=10000001/20000001，JH_* 编码），与候选 scope 相同但 org_code 不冲突（玉舟组织 `000xxx` 系列）

## 3. A/B 脚本与执行

- 脚本：`/tmp/verify-sliceD-full-ab.mjs`（一次性验证脚本，非交付；幂等可重跑，INSERT 用 `ON CONFLICT DO NOTHING`）
- 候选来源：`database/import-reports/yuzhou-hr/candidate-t0t3-20260911-sliceC/`（切片 C 输出套件，见切片 C 交接）
  - T0：`decision-candidates-t0.json`（insert 3094）
  - T1：`decision-candidates-t1.json`（insert 6851）
  - T2：`decision-candidates-t2.json`（insert 1150）
  - T3：`t3-candidates/t3-candidates.json`（insert 248125）
- 插入顺序（依赖拓扑，15 表）：`sys_org → hr_position → hr_employee → hr_contract_type → hr_contract → hr_contract_change → hr_employment_event → hr_attendance_import_batch → hr_attendance_symbol_rule → hr_attendance_calendar_source → hr_attendance_day → hr_insurance_policy → hr_insurance_policy_item → hr_employee_insurance_period → hr_employee_insurance_item`
- 跨阶段依赖：`sourceIdentitySha256 → expectedTargetId` 全量 Map；FK 列（`org_id` / `reports_to_position_id` / `primary_org_id` / `position_id` / `employee_id` / `contract_type_id` / `contract_id` / `import_batch_id` / `calendar_source_id` / `policy_id` / `period_id`）按候选 `dependencyRefs` 解析
- 同表 FK（`hr_position.parent_position → reports_to_position_id`）：插入前拓扑排序（父先于子），满足触发器 `hr_position_hierarchy_guard`（父须同 scope、`status='enabled'`、`is_deleted=false`；候选 18 岗位全部 enabled）

### 执行中修复（2 轮）

1. 第 1 轮：`hr_position` 触发器 `parent position must be active in the same scope` → 同表 FK 拓扑排序修复。
2. 第 2 轮：canonical 全量 mismatch → 根因系**表示层差异**（见 §4），非落库内容问题；改为字段级 + 语义 canonical 比对后通过。

## 4. 验证结果（最终）

| 验证项 | 结果 |
| --- | --- |
| insert 落库 | 15 表 259220 条全部成功（幂等，`ON CONFLICT DO NOTHING`） |
| 字段级 A/B（读回 vs 候选 targetFields） | **259220 PASS / 0 FAIL** |
| 语义 canonical（归一化重算，候选 vs 读回） | **259220 / 259220 一致** |
| 隔离校验（各表行数 = insert 数） | **通过（隔离候选未写入）** |

分表明细（字段级检查）：

| 表 | 条数 |
| --- | --- |
| sys_org | 138 |
| hr_position | 18 |
| hr_employee | 2938 |
| hr_contract_type | 4 |
| hr_contract | 798 |
| hr_contract_change | 348 |
| hr_employment_event | 6851 |
| hr_attendance_import_batch | 1 |
| hr_attendance_symbol_rule | 4 |
| hr_attendance_calendar_source | 144 |
| hr_attendance_day | 4383 |
| hr_insurance_policy | 12 |
| hr_insurance_policy_item | 72 |
| hr_employee_insurance_period | 34787 |
| hr_employee_insurance_item | 208722 |
| **合计** | **259220** |

## 5. 关键发现（canonical 契约与落库表示差异）

这些是切片 D 暴露的**表示层契约事项**，均已在 A/B 中通过归一化语义比对覆盖，但生产导入的 canonical 审计需按此统一口径：

1. **timestamp 表示不可往返**：候选 `timestampFields` 为 `YYYY-MM-DDTHH:mm:ss.ffffff+08:00`（本地偏移 + 微秒）；目标列落库为 `timestamp`（无时区），读回 `YYYY-MM-DDTHH:mm:ss`（无偏移）。同一瞬时值在候选与读回字符串不同 → **原始字符串 canonical（`expectedTargetCanonicalSha256`）无法在落库后重算匹配**。A/B 采用归一化口径：timestamp 统一提取秒精度 `YYYY-MM-DDTHH:mm:ss`（去偏移）后重算。
2. **decimal 精度读回**：DB numeric 列经 `row_to_json` 读回为 JSON number（如 `0.00` → `0`）会丢失精度/字符串形态；A/B 的 SELECT 对 `decimalStringFields` 列使用 `col::text` 精确读回（如 `"0.00"`），与候选一致。
3. **jsonb 键序**：DB 保留插入时键序；canonical 稳定 JSON 对对象键排序递归，内容等价不受键序影响。
4. **T0 新记录无 `expectedTargetCanonicalSha256`**：T0 物化逻辑（`materialize-production-t0-decision-candidates.mjs` 的 `candidate()`）对 inventory 未命中的新记录（如 `sys_org` 000086 等）只设 `expectedTargetId`，`expectedTargetCanonicalSha256` 保持 `null`（无宿主 target 可比，属设计语义）。T1/T2/T3 候选均带 canonical。**T0 的 A/B 以字段级 + 语义 canonical 覆盖**。
5. **`hr_position_hierarchy_guard` 约束**：父岗位须先于子插入、同 scope、`status='enabled'`；生产导入器需按依赖拓扑（或等效顺序）执行。

## 6. 遗留受控决议项（切片 E 前决议，不影响切片 D 验收）

- **11 条 T0 隔离员工**（`EMPLOYEE_DATE_ORDER_INVALID`，入职晚于离职，含 2 条 positionCode null）：源数据矛盾，隔离正确；处置意见待宿主确认（切片 E 前）。
- **171 空岗位员工**（hr_employee 2949 中 position_id null）：岗位关系待宿主确认后处置（切片 E 前）。

## 7. 生产导入保持 HOLD

- `productionImport` 开关全程 HOLD；loader 保持不可达。
- 本切片仅隔离库验证，未触碰生产/共享库；隔离库 `jinhu_hr_migration_lab_sliced_20260911a` 保留为验证证据（可随时删除重建）。

## 8. 下一步

1. 切片 E：生产授权（需用户确认：导入范围、受控决议项处置、canonical 审计口径、灰度批次）——**HOLD 等待授权**。
2. 切片 F：受控导入（授权后执行，含批次回滚预案）。

## 9. 变更文件

本切片为纯数据验证，无仓库代码改动；本交接文档 `docs/handoffs/2026-09-11-yuzhou-sliceD-formal-ab.md` 为唯一新增。
