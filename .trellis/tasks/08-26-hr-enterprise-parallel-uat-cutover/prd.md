# HR 全域双演练与停用源切换验收

## Goal

把既有玉舟 T0～T5/T4 领域迁移器提升为可审计、可重复、失败即停的企业级全域迁移能力。玉舟已停用且无新增数据，不设计 S0→S1 增量或停写窗口；固定只读备份 hash 即为唯一源事实。用两个完全独立目标环境连续执行 T0→T1→T2→T3→T4→T5，证明全域总账、工资双轨、三角色业务流、备份恢复、受控回滚和零残留清理。

本任务默认只允许隔离环境。生产历史导入始终为 `HOLD`；只有全部硬门禁通过后，用户针对固定 run id、生产目标、源备份 hash、manifest hash、代码 SHA 和窗口另行一次性授权，才可创建生产切换执行任务。

## Users and decision owners

- migration operator：执行受控编排，不代签业务结论。
- HR owner：签署员工、组织、异动、合同、档案和人才口径。
- payroll/finance owner：签署工资公式、项目、总额和差异风险。
- department manager/employee：完成团队及本人范围 UAT。
- data/security/release owner：分别签署源冻结、敏感数据、资源清理、三端一致和 Go/No-Go。

## Requirements

1. 每轮有唯一 parent manifest，统一绑定代码 SHA、source backup/catalog/hash、映射版本、迁移/种子历史、六个 child batch、staging hash、目标身份、global ledger、canonical target hash、UAT、恢复和清理证据。
2. Rehearsal A/B 必须分别从 `template0` 新建数据库和独立 Compose/project/volume/container/port/API/Web/file/staging/evidence/UAT-account/run id，使用完全相同且 hash 固定的代码 C、源快照 S、映射/规范化合同 M，顺序执行 migrations、production seed、T0→T1→T2→T3→T4→T5；六域全部验证和本轮 UAT 完成前不得 rollback，不得用历史分段证据或中途 rollback 拼装。
3. 全域证明每个 source object 的 `source = loaded + quarantined + approvedIgnored`，并验证员工依赖、合同链、异动、考勤、保险、工资、档案和文件跨域零孤儿。金额只用 PostgreSQL `numeric`。
4. canonical hash 只包含稳定 source identity、规范业务值和关系 source identity；排除 UUID、sequence、run id 和创建时间。A/B ledger、canonical hash 和 quarantine reason ledger 必须一致。
5. 固定备份仍全量审计 2010～2026 的 46,092 工资行；生产热候选只装载 2024-01-01～2026-12-31 的 8,342 行，2010～2023 的 37,750 行登记为 `deferred_cold_archive`，不阻断其他领域或全局功能演练。
6. T4 同时核对全量审计事实和三年候选 `8,342 = 8,320 loaded + 22 quarantined`、190,374 个候选明细，并保留711项目、244公式、266条候选关账、647账套成员和9税率；只算不发，正式 payroll/payslip/payment/bank/tax/message 零写。
7. A/B 各自在本轮独立隔离环境和相同迁移事实集上完成 HR、部门负责人、员工三角色自动化 API 正负向矩阵和真实浏览器 desktop/390px 技术任务；指定的最终签署环境再由真人完成同一任务卡并生成 detached attestation。覆盖 park/team/self/none、原子动作、字段投影、required audit、直接 URL/UUID 猜测、403/not-found、错误恢复和敏感详情清理；自动化通过不得代替真人签署。
8. 完成 `pg_dump -Fc`、TOC/hash、故障注入、restore-to-new-db、平台+HR canonical hash、RTO/RPO 事实记录、T5→T0 反序领域回滚和实际 residual=0。
9. Go/No-Go compiler 只读取 hash 固定的机器证据，缺任一硬门禁或真人签署必须输出带 reason code 的 `NO_GO`；机器结论不得代签业务结论。
10. 普通 deploy、schema migration、production seed 和 lab rehearsal 永不触发生产历史导入。生产 import 与生产 restore 必须是两个独立入口和两次独立的 run 级授权；各自默认 dry-run，分别固定 operation/run id、SHA、target、source backup、manifest、window、审批主体和授权到期时间，使用最小临时权限并完成即撤权。授权值属于秘密，不得进入 manifest、证据或日志，也不得跨 run/操作复用。

## Safety and non-goals

- SQL Server 源必须 `READ_ONLY=1`；ETL 不是 `sa/sysadmin`，只具备 `db_datareader + VIEW DEFINITION`。
- 目标只允许 loopback 和 `jinhu_hr_migration_lab_full_*`；不得访问生产 URL、数据库、volume 或文件根。
- staging/evidence/credential 目录 `0700`、其中所有文件及凭据 `0600`；凭据不进入 manifest 或证据索引，日志不得包含个人、工资、连接串、token 或认证秘密，任何权限漂移或敏感扫描命中都失败即停。
- 用户/角色、员工当前态、在线工资/工资条、绩效、消息/outbox、审批待办和正式文件引用必须满足零副作用 allowlist。
- 不迁移旧密码，不复刻旧物理结构，不发薪、不调用银行/税务/社保外部动作，不在本任务执行生产 import 或生产 restore。

## Acceptance Criteria

- [ ] A/B 各有唯一资源和 parent manifest；均从空库连续 T0→T5，固定 `codeSha/sourceSnapshotHash/mappingContractHash` 三元组逐字节一致；所有 child 成功且逐 source object 的守恒式、global ledger、canonical hash、quarantine reason ledger 相同，并各自通过三角色自动 API 和 desktop/390 browser 技术矩阵。
- [ ] hash tamper、source drift、wrong host/database/project、partial run、领域失败、在线副作用或非零 residual 均失败即停，不能继续 seed/load/UAT/import。
- [ ] ledger 覆盖 T0 138/18/2,949，T1 6,887，T2 802/357/4，T3 144/4,383/12/144/35,008，T4 35表/46,092/711/244/1,431/647/9，T5 9,140；若源变化，预期值只能来自签名 hash manifest。
- [ ] 停用源只接受固定 backup/catalog/business hash；不存在 delta、S1 或停写责任人硬门禁，任何源 hash 漂移仍使候选失效。
- [ ] T4 双轨金额全为 database numeric；未解释差异为零或有逐项风险接受与 HR/payroll/finance 签署；正式发薪域零写。
- [ ] 三角色 API 与 desktop/390 浏览器 UAT 覆盖正负向、范围、字段、审计、空态、错误/重试和切换清理，P0/P1=0；技术证据与真人签署分离。
- [ ] 备份恢复、故障注入、反序 rollback、RTO/RPO 事实和 residual verifier 全通过；检查实际 DB/container/Compose network/volume/role/directory/account/file/port/process/credential artifact，而非只看退出码，并输出逐资源 `planned/observed/removed/residualCount=0` 总账。
- [ ] fresh/upgrade/replay/seed×2、契约/负向/PG/API/Web/build、三端 SHA 和证据 bundle hash 全部通过。
- [ ] 任一硬门禁或签署缺失时为 `NO_GO`；在独立生产授权前始终为 `productionImport=HOLD`。

## Open business gates

以下事项不阻止工程实施，但对应的真实业务差异接受、真人 UAT、正式 RTO/RPO 判定和最终 `GO_CANDIDATE` 必须等待输入：T4 公式批准范围/容差/签署人、三角色真人 UAT 人员、正式 RTO/RPO 目标、生产值班与回退职责。玉舟停用事实已取消 delta、S1、停写责任人和停写窗口门禁。未确定业务输入时 compiler 必须给出稳定 reason code 并保持 `NO_GO/productionImport=HOLD`。
