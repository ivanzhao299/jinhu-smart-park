# 玉舟 T1/T2/T3 候选重建（切片 C）— 交接

- 日期：2026-09-11
- worktree：`/Users/mac/Documents/jinhu-smart-park-worktrees/hr-t1t2t3-candidate-rebuild-v1`（分支 `codex/hr-t1t2t3-candidate-rebuild-v1`，HEAD `f817f1f5` = origin/main 含切片 A/B）
- 状态：T0（沿用切片 B 候选重物化）、T1/T2/T3 phase 与候选重建全部完成并验证，productionImport=HOLD，未提交、未交付

## 1. 目标

用切片 A/B 合入后的代码（f817f1f5）重建 T1/T2/T3 决策候选：
- T0 候选沿用切片 B 结果在切片 C 套件内重物化（3094 insert / 11 quarantine，与切片 B 完全一致）
- T1/T2/T3 的 phase 与候选用 canonical manifest（rebound）重物化
- 隔离差异逐阶段定位传导根因，区分「脚本回归」与「既有业务问题传导」

## 2. 输入链（canonical，全部只读私有）

| 阶段 | staging（canonical） | stageManifestSha256 | type/state decision 输入 |
|---|---|---|---|
| T0 | `staging-prodcurrent20260907165957t0` | `19841812…` | scope=`production-current-20260903f/target-scope.json`；job-state=`production-current-20260903e/job-state-decision-a45b9447….json`（v2，revalidation） |
| T1 | `staging-prodcurrent20260907t1reextract` | `d6662339…` | type=`core-current-20260908/…src0908k/dictionary-inputs/employment_event_type.json`（SHA `3d3cf0ed…`）；state=`production-current-f3e0c3b8-preparation-v1/non-t0-dictionaries.json`（四字典包，SHA `716eb612…`） |
| T2 | `staging-prodcurrent20260907165957t2` | `a187c74c…` | 四字典包（同上）+ routine 存储过程源（`f1cc43ab…`，副本入套件 0600） |
| T3 | `staging-prodcurrent20260907165957t3` | `d9dad1a9…` | —（T3 无字典决策，直接投影） |

- source-manifest（canonical）：`production-source-manifest-rebound-20260907/source-manifest-prodcurrent20260907t1rebound.json`（manifestSha256=`9fd98a8f…`、sourceSnapshotSha256=`3ed50b9a…`、mappingContractSha256=`78fed3f5…`）
- triple（新）：`candidate-t0t3-20260911-sliceC/triple.json`（codeSha=`f817f1f5…`）
- inventory：`candidate-t0t3-20260911-sliceC/target-inventory.json`（宿主 19 条，重绑定 codeSha=f817f1f5）

**关键发现**：
1. T1 的 canonical staging 是 `t1reextract`（其余 `t1`/`t1fix` 目录 manifest 哈希不匹配，勿用）。
2. T1 的 state-decision 必须是**四字典包**（`non-t0-dictionaries.json`），不是单字典 `employment_event_state.json`（后者触发 `SOURCE_REVALIDATION_FAILED`）。
3. T2/T3 的 canonical 输入是 **rebound manifest + prodcurrent t2/t3 staging**（旧 `511d1341` 时代的 manifest 绑定旧契约 `2a3de022…`，与当前 triple 的 `78fed3f5…` 不匹配，勿用）。
4. materialize 的安全契约要求输入/输出文件 0600、目录 0700、路径 realpath 一致；routine 源文件原权限 0666 需复制 0600 副本入套件（字节 SHA 不变）。

## 3. 重建结果（f817f1f5）

| 阶段 | recordCount | insert | quarantine | 旧候选对照（8050da54 时代） |
|---|---|---|---|---|
| T0 | 3105 | 3094 | 11 | 3060/45（与切片 B 一致） |
| T1 | 6887 | 6851 | 36 | 6883/4 |
| T2 | 1163 | 1150 | 13 | 1155/8 |
| T3 | 249673 | 248125 | 1548 | 248860/813 |

artifactSha256：T0=`80d9336e…`、T1=`b21996bd…`、T2=`0483a5be…`、T3=`ac6e76ef…`（t3-candidates.json）。

## 4. 隔离差异分析（全部为既有业务问题传导，非脚本回归）

### T1：36 条（旧 4 条）— EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED

- 根因：`materialize-production-t1-decision-candidates.mjs` 第 176 行 employees Map 只收 disposition ∈ {insert, skip_exact}；T0 隔离员工的事件无法映射 → NOT_MAPPED。
- 证据：新 T0 隔离员工 11 条（全 `EMPLOYEE_DATE_ORDER_INVALID`）的事件总数 = **36**（staging t1reextract 统计，11 员工全部涉及），与新 T1 隔离集精确一致；新旧 T1 隔离集不相交。
- 结论：36 条 = 11 条隔离员工的 36 个事件，**合理传导**。

### T2：13 条（旧 8 条）— T2_CONTRACT_MISSING 8 + T2_PARENT_REQUIRES_REVIEW 5

- T2_CONTRACT_MISSING 8 新旧一致（既有数据问题）。
- 新增 T2_PARENT_REQUIRES_REVIEW 5：4 条 = 隔离员工的合同（000477/000536/000921/001673），1 条 = 依赖上述隔离合同的变更（compact_c）。change-classifications 新旧一致（renewal 349 / needs_review 8）。

### T3：1548 条（旧 813 条）

| reasonCode | 新 | 旧 | 说明 |
|---|---|---|---|
| T3_INT4_INVALID | 35 | 35 | 源数据整数无效，新旧一致（既有问题） |
| T3_ATTENDANCE_SYMBOL_UNRESOLVED | 1 | 1 | 新旧一致 |
| T3_PARENT_REQUIRES_REVIEW | 1512 | 777 | 见下 |

T3_PARENT_REQUIRES_REVIEW 1512 = **period 216（依赖 11 条 T0 隔离员工）× 6 items = 1296**，全部可精确归因于 T0 隔离员工传导（period 每员工平均 ~19.6 条、每 period 6 个 item；210048/35008=6）。

### 归因总结

新 T0 隔离员工 11 条（`EMPLOYEE_DATE_ORDER_INVALID`，员工 000477/000536/000921/000922/001388/001502/001558/001673/002993/003353/003354）是全部 T1（36）、T2（5）、T3（1512）新增隔离的单一根因。该 11 条属**既有业务问题**（EDC 交接已记录，列为切片 D 受控决议项），本次重建未修改任何脚本逻辑、未触碰源数据。

## 5. 输出套件

`hr-source-restore-receipt-v1/database/import-reports/yuzhou-hr/candidate-t0t3-20260911-sliceC/`（0700/0600）：

- `triple.json`、`phase-t0/t1/t2/t3.json`、`target-inventory.json`
- `decision-candidates-t0.json`（80d9336e）、`decision-candidates-t1.json`（b21996bd）、`decision-candidates-t2.json`（0483a5be）、`t3-candidates/`（t3-candidates.json=ac6e76ef、t3-phase.json=a8372f9d、t3-policy-lineage.json=a6f97ba0）
- 中间物证：`t2-change-classifications.json`（093c29e6）、`t2-classification-config.json`、`t2-candidate-config.json`、`t3-candidate-config.json`、`routine/`（存储过程源 0600 副本）

## 6. 切片 D 需复核项

1. 11 条 `EMPLOYEE_DATE_ORDER_INVALID`（T0 隔离）——宿主保留处置意见（EDC 交接已记录）。
2. 传导隔离：T1 36（事件）、T2 5（合同）、T3 1512（保险 period/item）——若切片 D 决议解除 11 条员工，上述传导隔离应随 T0 候选重物化自动消除。
3. `employeeEmptyPositionRows=171`（切片 B 遗留复核项，与本轮无关但同属切片 D 范围）。

## 7. 下一动作

- 本 worktree 提交 PR（含本交接文档 + 切片 C 套件说明）；PR 合入后进入切片 D（正式全域 A/B：11 条隔离员工 + 171 空岗位员工复核）。
- 生产导入保持 `productionImport=HOLD`，loader 不可达；生产授权属切片 E，届时再询问。
