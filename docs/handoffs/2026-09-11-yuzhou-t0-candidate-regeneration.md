# 玉舟 T0 候选再生成（切片 B 阶段一）— 交接

- 日期：2026-09-11
- worktree：`/Users/mac/Documents/jinhu-smart-park-worktrees/hr-t0-candidate-regeneration-v1`（分支 `codex/hr-t0-candidate-regeneration-v1`，HEAD `77d2b940` = origin/main 含切片 A）
- 状态：候选再生成完成并验证，productionImport=HOLD，DB 往返验证（阶段二）未开始

## 1. 目标

用切片 A 合入后的代码（77d2b940）重新物化 T0 决策候选：
- 岗位父子/组织引用处置生效（映射 3 + 父保留 4 + 组织保留 2）
- 目标模型新增 `legacy_parent_reference`/`legacy_department_reference` 落位
- 7 岗位 + 27 员工解除隔离

## 2. 输入链（8 项，全部只读私有）

| 输入 | 路径 | 说明 |
|---|---|---|
| staging | `hr-source-restore-receipt-v1/.../staging-prodcurrent20260907165957t0` | T0 源套件（0700），manifest SHA `19841812…` |
| triple（新） | `candidate-t0-20260911-sliceB-3ZkQd9/triple.json` | codeSha=`77d2b940…`（新代码 HEAD），sourceSnapshotHash/mappingContractHash 不变 |
| phase-t0（新） | 同目录 `phase-t0.json` | 用 `materialize-production-t0-phase-artifact.mjs` 重生成（3105 条，triple 77d2b940） |
| target-inventory（重绑定） | 同目录 `target-inventory.json` | 宿主快照 19 条（sys_org 16 + hr_contract_type 3）不变，仅 triple.codeSha 563af3a1→77d2b940 |
| target-scope | `production-current-20260903f/target-scope.json` | `{tenantId:10000001, parkId:20000001}` |
| job-state | `production-current-20260903e/job-state-decision-a45b9447….json` | v2 MACHINE_CANDIDATE，2949 条，走 revalidation 路径（sourceSnapshotHash 绑定） |
| source-manifest | `production-source-manifest-rebound-20260907/source-manifest-prodcurrent20260907t1rebound.json` | canonical hash `9fd98a8f…` 与 inventory 绑定一致 |
| output | `candidate-t0-20260911-sliceB-3ZkQd9/decision-candidates.json` | 新候选 |

**关键发现**：materialize CLI 强制 triple.codeSha === 当前代码 HEAD，且 phase/inventory/job-state 均按 triple 或 sourceSnapshotHash 绑定校验。因此先基于 origin/main（77d2b940）建新 worktree，再重生成 phase 与重绑定 inventory。

## 3. 再生成结果

- status: REVIEW_HOLD，productionImport: HOLD，recordCount 3105（138 组织 + 18 岗位 + 2949 员工）
- countByDisposition: insert **3094** / quarantine **11**（旧候选：insert 3060 / quarantine 45；**隔离减少 34 = 7 岗位 + 27 员工，精确吻合**）
- artifactSha256: `29e86e1b…`
- 岗位关系审计：positionMissingParentRows=7、positionMissingOrgRows=2、parentNameMappedRows=3、parentReferenceRetainedRows=4、orgReferenceRetainedRows=2、positionCycleOrDependentRows=0、employeesWithAffectedPosition=27、employeeUnresolvedPositionRows=0

## 4. 7 岗位处置验证（决策候选内）

| 岗位 | 名称 | legacy_parent_reference | legacy_department_reference | parent_position 依赖 |
|---|---|---|---|---|
| 000 | 董事长 | 董事会（保留） | 000001（保留） | 无（挂根） |
| 000000 | 会计 | 主管会计（保留） | null | 无（挂根） |
| 000002 | 总经理 | 董事会（保留） | 000023（保留） | 无（挂根） |
| 000005 | 设计师 | 设计经理（保留） | null | 无（挂根） |
| 000006 | 总裁 | 董事长（原文保留） | null | → 000（映射） |
| 000007 | 总监 | 总裁（原文保留） | null | → 000006（映射） |
| 000014 | 总裁助理 | 总裁（原文保留） | null | → 000006（映射） |

含 legacy 引用字段岗位 10 条（7 条有值 + 3 条映射保留原文）。

## 5. 剩余隔离（11 条，与岗位关系无关）

全部为 `EMPLOYEE_DATE_ORDER_INVALID`（员工入职/离职日期顺序非法）——独立业务问题，属于切片 D（正式 A/B）的复核范围，不阻塞岗位处置。

## 6. 下一动作（切片 B 阶段二）

- DB 字段往返验证：jsonb→列→jsonb（`legacy_parent_reference`/`legacy_department_reference` 等新增字段），目标 lab（`jinhu_hr_migration_lab_core_canonical_t0h` 或新建）执行
- 岗位 `reports_to_position_id` / `hierarchy_level` / `sort_order` 白名单与 canonical 比较（映射岗位的 parent_position 依赖 → reports_to_position_id 落库语义）
- 候选再生成后三端 SHA 更新（候选 / 远端合并 / 运行时），T1/T2/T3 候选冻结协调
- 本 worktree 产物建议在阶段二验证后连同合同测试一并提交 PR

## 7. 纪律确认

- 全程零数据库写入、零生产接触；inventory 仅做 triple 重绑定（宿主数据未变，codeSha 为真实代码 SHA 前进）
- 所有输入保持私有权限（0700/0600）未改
