# Slice 4 T4 三年热数据工程证据（2026-08-26）

## 固定源与范围

- SQL Server 恢复库保持只读；ETL 为非 `sa`、非 `sysadmin`，仅 `db_datareader + VIEW DEFINITION`。
- 固定 backup SHA-256：`3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e`。
- 最终候选字节上的 extractor 对同一源执行 `yzfull-t4-final2-a-20260826` 和 `yzfull-t4-final2-b-20260826`；逐文件哈希一致，业务哈希均为 `5849168cdb64fbae68bb9e4ae98ec2c90f1dcba216ae01a229878c7777535800`。
- 全量审计范围不裁剪：35表、46,092工资行、2010～2026、711项目、244公式、1,431关账、647成员、9税率。
- 玉舟已停用且无新增数据，不存在 S0→S1 delta 或停写窗口。生产候选窗口固定为2024-01-01～2026-12-31。

## 三年候选与冷归档守恒

- 热候选：`8,342 = 8,320 loaded + 22 employee_unmapped`；2024/2025/2026分别为784/6,690/868行。
- 热候选明细190,374条，窗口内关账266条。
- 热候选源净额与加载净额均为 `15,723,009.9100`。
- 冷归档：2010～2023共37,750行，源净额 `86,471,046.8900`，以 `payroll_snapshot_cold_archive/skipped` 记录为 `deferred_cold_archive`，不写热历史表。
- 全量源净额 `102,194,056.8000 = 15,723,009.9100 + 86,471,046.8900`。

## 最终隔离 PostgreSQL 闭环

- 交接基线：`HEAD=origin/main=d16f4bfd8b8668b8923f0a09dfc10f87c8db91ff`，本 Slice 的 forward-only 迁移为 `000264_hr_payroll_legacy_item_bulk_guard.sql`。final2 数据库闭环期间的基线为 `b72607c92165988ae661bae2c2728717a776689b`；后续快进只新增公寓前端/UAT 文件及 package 命令，未改动 T4 迁移、脚本、API 或证据字节，同步后 T4 合同已重放。
- 数据库：`jinhu_hr_migration_lab_t4slice4_hot3y_final2_20260826`，从 `template0` 创建。
- 官方 runner fresh 255文件成功，checksum replay 255文件跳过且匹配，production seed连续两次成功。
- T0：138组织、18岗位、2,938员工加载、11员工隔离。
- 三年首次 load：batch `t4slice4_hot3y_final2_load_20260826` 成功；数据库事实为8,320 snapshot、190,374 item、266 period；保护表 before/after hash 全部相同。
- controlled rollback：batch 为 `rolled_back/rollback`，active map、legacy batch、snapshot、item residual全部为0；T0员工仍为2,938，临时角色恢复 `NOLOGIN`。
- 最终 reload：batch `t4slice4_hot3y_final2_reload_20260826` 成功；数据库复核为8,342 source、8,320 loaded、22 quarantined、190,374 item，源/加载净额均为 `15,723,009.9100`；`T4_FULL_SOURCE_AND_CANDIDATE_ACCOUNTING` 的 `passed=true` 且 `expected_value=actual_value`。
- duplicate run 返回非零且数据库计数不变；两个并发相同 run identity 由唯一约束只允许一个提交，loser失败，fixture残留为0。

## 只算不发与 Go/No-Go

- PostgreSQL 双轨合同与真实服务测试5/5通过：只执行 `approved_for_simulation`，冻结员工、薪酬、保险、考勤、公式、engine和policy版本；结果表append-only；正式 payroll run/payslip 和考勤输入计数不变。
- 缺公式批准范围：`T4_FORMULA_SCOPE_UNSIGNED`。
- 缺业务容差：`T4_TOLERANCE_UNSIGNED`。
- 缺HR/payroll/finance三个不同真人签署：`T4_BUSINESS_ATTESTATION_MISSING`。
- readiness compiler 对三年热候选的8,342/8,320/22、190,374明细、266关账、固定净额与冷归档守恒执行 fail-closed 校验，并要求三方 detached attestation 的 `subjectManifestSha256` 绑定当前固定业务内容 hash；候选口径、源只读权限或签署对象漂移均不得进入模拟。
- 当前结论固定为 `NO_GO`、`productionImport=HOLD`。工程证据不代签，也不自动接受差异。

## 非生产边界

本证据只来自隔离SQL Server/PostgreSQL。未执行 commit、push、deploy、生产导入、发薪、支付、银行、报税、消息或outbox动作。
