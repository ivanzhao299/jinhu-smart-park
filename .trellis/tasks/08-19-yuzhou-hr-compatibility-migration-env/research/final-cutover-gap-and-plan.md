# Research: 玉舟 HR 全域并行验收与最终切换缺口及执行计划

- Query: 基于生产基线 `9b62b41004ed5a6dfb998cdeddde94d21f60a5e6`，审计玉舟 T0～T5/T4 现有迁移能力，判断“两次完整全量演练、增量冻结、全域总账、工资双轨、三角色 UAT、备份恢复、Go/No-Go、生产导入授权”是否已具备可执行证据，并设计后续 `hr-enterprise-parallel-uat-cutover` 子任务。
- Scope: internal
- Date: 2026-08-26

## Findings

### 1. 结论先行

当前代码已经形成六组可复用的领域工具：T0 组织/岗位/员工、T1 异动、T2 合同、T3 历史考勤/社保、T4 历史工资、T5 招聘/档案/培训/奖惩历史。各片段大多具备只读源、稳定抽取、隔离目标、run id、文件 hash、事务装载、领域守恒和 record-map 精确回滚等基础控制。

但是，**尚不存在且尚未有证据证明**以下最终切换能力：

1. 在同一个冻结源快照、同一个全域 rehearsal run、同一个独立目标数据库中，按依赖顺序连续完成 T0→T1→T2→T3→T4→T5，且中途没有把已装载领域回滚掉。
2. 在两个相互独立的新目标数据库中，完整重复上述全域流程，并证明两个 run 的源 manifest、领域计数、金额、关系、目标 canonical hash 和隔离账完全一致。
3. 从第一次全量演练基线到最终冻结时刻的增量捕获、漂移分类、重放和“无遗漏/无重复”证明。
4. 跨领域总账（员工、异动、合同、考勤、保险、工资、档案/文件等）的统一守恒及跨域引用完整性。
5. 使用完整迁移数据运行工资新旧双轨计算并形成业务可签署的差异账，而不是只用局部 fixture 验证 DSL/模拟服务。
6. 在同一隔离环境中由 HR、部门负责人、员工完成 API 与真实浏览器业务 UAT，并证明字段权限、组织树、本人范围和负向路径。
7. 针对 HR 最终导入的“备份→导入→验收失败→恢复→校验”完整演练，以及生产切换操作手册、Go/No-Go 证据包和人员签署。
8. 一个受控的生产导入入口。现有 loaders 正确地只接受 `jinhu_hr_migration_lab_*`，因此它们目前**不能也不应**直接对生产数据库执行。

所以当前状态应定义为：**领域迁移能力基本成形，最终全域切换尚未通过；生产历史导入保持 HOLD。** 过去分别执行的 `load → rollback → reload` 是领域级回滚证明，不能拼接或改称“两次完整全域同批次演练”。

### 2. 已发现文件

| 文件 | 作用与当前结论 |
|---|---|
| `docs/yuzhou-hr-compatibility-development-plan.md` | 定义 T0～T5 路线和 T5 的两次全量、增量窗口、三角色 UAT；这是最终验收需求来源。 |
| `docs/yuzhou-hr-migration-runbook.md` | 记录只读 SQL Server、隔离 PG、T0/T5 命令和生产 T5 `HOLD`；没有全域编排或正式切换命令。 |
| `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/{prd,design,implement}.md` | 父任务定义单向 ETL、控制表、隔离门禁；implement 明确把两次全量和切换留给后续。 |
| `scripts/extract-yuzhou-t0.sh` / `load-yuzhou-t0.sh` / `rollback-yuzhou-t0.sh` | T0 员工基线工具；已有 2,949=2,938 loaded+11 quarantined 证据。 |
| `scripts/extract-yuzhou-t1-employment-events.sh` / `load-*` / `rollback-*` | T1 异动工具；已有 6,887=6,851 loaded+36 quarantined，员工当前态不变。 |
| `scripts/extract-yuzhou-t2-contracts.sh` / `load-*` / `rollback-*` | T2 合同工具；loader 固定 802 主合同、357 变更和 staging hashes，依赖 T0 员工。 |
| `scripts/extract-yuzhou-t3-attendance-insurance.sh` / `load-*` / `rollback-*` | T3 历史考勤/社保工具；已有 35,008 保险总账、金额逐险种核对逻辑，依赖 T0 员工。 |
| `scripts/extract-yuzhou-t4-payroll-history.sh` / `load-*` / `rollback-*` | T4 历史工资工具；绑定 source evidence 与业务 hash，目标只允许隔离库；仓库缺少正式的完整真实 load 证据。 |
| `scripts/extract-yuzhou-t5-legacy-history.sh` / `load-*` / `rollback-*` | T5 招聘/档案/培训/奖惩历史工具；已有 9,140=8,730 loaded+410 quarantined 和在线状态零副作用证据。 |
| `.trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json` | 固定备份、catalog 与工资 profile；`pendingExtractionEvidence.status` 仍为 `not_started`，不能证明 T4 已完整抽取装载。 |
| `.trellis/tasks/08-25-hr-t5-employee-lifecycle-operations/research/phase5-migration-rehearsal.md` | T5 单域真实演练和独立复验；明确生产导入保持 HOLD。 |
| `scripts/production-backup-restore-gate19.sh` | 可复用的 PostgreSQL custom-format dump、临时恢复库、文件归档和清理框架；当前检查的是平台通用计数，不包含 HR 全域 hash/导入回滚语义。 |
| `docs/release/production-rollback-sop.md` | 通用应用回滚原则；数据库 migration/restore 仍是人工确认，模板字段未绑定 HR cutover run。 |
| `.github/workflows/deploy-production.yml` | 应用代码发布具备 runner rollback snapshot、health/readiness 和清理；不能代替历史数据导入授权与数据恢复演练。 |

### 3. 需求逐项审计

| 验收项 | 当前证据 | 判定 | 关闭缺口所需强证据 |
|---|---|---|---|
| 两次完整全量演练 | T0/T1/T3/T5 各自有领域级 load/rollback/reload；T5 使用自己的独立数据库。 | **未完成** | Rehearsal A、B 各自从 `template0` 新建独立数据库；同一 source snapshot/version；每次连续 T0→T5；每次全域完成后才验收/整库回滚或销毁；A/B global hash 与 ledger 完全相同。 |
| 增量冻结窗口 | 当前恢复库为只读历史快照；各 extract 是全量抽取，没有统一 watermark/delta manifest。 | **未完成** | 业务确认冻结时点；最终备份/只读锁证明；每源表冻结前后 ledger；若不允许真正停写则实现可证明的 delta key/watermark 或 snapshot diff；增量重放后与最终全量 canonical hash 相同。 |
| 跨 T0～T5/T4 总账 | 每个 loader 有局部 `migration_check`，没有统一 parent manifest 或跨域 FK/数量/金额矩阵。 | **未完成** | 全域 source、loaded、quarantined、ignored(必须为显式批准类别) 四列；所有域 `source=loaded+quarantined+approved_ignored`；员工映射、合同/异动/保险/工资/文件 owner 交叉关系；零孤儿；全域错误 reason 总账。 |
| 工资双轨对账 | T4 profile 为 46,092；DSL/reconciliation 的服务与 PG fixture 已验证，但 `source-evidence-manifest` 仍标记 extraction 未开始，未见完整真实 load 及全员模拟签署证据。 | **未完成** | 两次 T4 真实抽取 hash 相同；46,092 行及纵向 items 精确守恒；旧净额/新净额逐员工逐项目差异；容差、原因、人工复核、财务/HR 签署；只算不发；在线 payroll/payslip/通知 hash 零变化。 |
| 三角色 API UAT | production protected-account gate 和各模块测试不能证明迁移数据的三角色业务任务。 | **部分能力，未验收** | 同一 UAT 数据集下 HR/负责人/员工的正向和负向 API 矩阵；状态码、精确字段 allowlist、data scope、required audit；无工资金额权限的负责人不得获得金额。 |
| 三角色 browser UAT | 已有部分 HR 生产页面视觉验收；没有带迁移数据的完整三角色桌面/390px 任务证据。 | **未完成** | 三角色各自实际登录；核心列表→详情→历史追溯→流程/待办；桌面+390px；截图/录屏索引、无横向溢出、无敏感残留、403/空/失败态；业务人员签署。 |
| 备份恢复/rollback | Gate19 能做生产库 dump 到临时库并检查平台计数；各领域 rollback 能按 map 删除；通用 SOP 不含 HR 数据级恢复签署。 | **部分能力，未闭环** | 在非生产副本执行 pre-cutover backup hash/TOC→全域导入→故障注入→restore 到新验证库→HR global hash/平台 hash/文件 hash 一致→cleanup residual=0；生产 restore 只在明确灾备授权下执行。 |
| Go/No-Go | 有平台通用 gate20/24；无 HR cutover 决策矩阵和业务签名。 | **未完成** | 自动 gate 结果、P0/P1=0、工资差异批准、UAT 签署、备份恢复、值班/监控、source lock、三端 SHA、rollback 负责人；任一 hard gate 失败自动 No-Go。 |
| 实际生产导入 | T5 明确 HOLD；所有 loaders 拒绝非 `jinhu_hr_migration_lab_*`。 | **未授权且无安全入口** | 单独生产导入任务和一次性 workflow；明确 target、run id、source hash、manifest hash、审批人、窗口、备份；双人复核；默认 dry-run；正式执行需要单独的人类 release-owner/data-owner 授权，普通部署永不触发。 |

### 4. 可直接复用与必须补建的能力

#### 4.1 可直接编排（保留原 fail-closed 合同）

1. `check-hr-migration-runtime.sh`：运行环境预检。
2. `restore-yuzhou-sqlserver-backup.sh`：只读恢复和 catalog 门禁。
3. 六组 `extract-yuzhou-*`：分别作为领域 extractor，但由总控 runner 注入统一 source snapshot id 和不同 child run id。
4. 六组 `load-yuzhou-*`：只在独立 rehearsal DB 内按 T0→T1→T2→T3→T4→T5 顺序调用。
5. 六组 `rollback-yuzhou-*`：在故障注入和清理阶段反序 T5→T4→T3→T2→T1→T0 调用；不得并行回滚。
6. `migration_batch`、`migration_batch_item`、`migration_error`、`migration_check`、`migration_rollback_point`、`legacy_record_map`：作为领域证据账；不可把多个 child batch 冒充一个全域批次。
7. `production-backup-restore-gate19.sh`：复用 custom-format backup、TOC 检验、临时 restore database 和 cleanup trap 的框架。
8. 现有 HR protected-account/API test、Release Smoke、health/ready、Docker cleanup、浏览器工具：作为最终外层发布门禁，但要增加迁移数据专用 UAT 任务。

#### 4.2 当前缺失，必须新增

1. **全域 orchestrator**：建议 `scripts/yuzhou-hr-full-rehearsal.sh`。负责环境隔离、阶段状态机、child run ids、失败即停、证据归档、反序清理，不复制领域 SQL。
2. **全域 manifest schema 与 builder/verifier**：建议 `scripts/yuzhou-hr-full-manifest.mjs`。绑定代码 SHA、source backup/catalog hashes、所有 staging 文件 hash/大小/mode、mapping 版本、目标 migration/seed history、child batches、全域 ledger、目标 canonical hashes。
3. **跨域 ledger/checker**：建议 `scripts/sql/verify-yuzhou-hr-full-ledger.sql`。用 PostgreSQL numeric 做金额汇总，输出脱敏 JSON；不在 JS 中做权威金额计算。
4. **独立数据库生命周期 harness**：每次 rehearsal 使用唯一 Compose project、volume、Postgres DB、API/Web ports 和 staging root；signal/失败/成功均留下可验证 cleanup journal。
5. **增量/冻结 runner**：建议先实现 snapshot-diff 模式。对最终 source snapshot 重新全量抽取，与 rehearsal baseline 按稳定 identity+row hash 生成 insert/update/delete drift manifest；无法稳定识别的表必须要求业务停写并重新全量，不猜测 delta。最终 source 必须只读或由业务 owner 签署停写。
6. **全域目标 canonical hash**：按领域选定业务列，稳定排序、排除 UUID/timestamp/run id 等非业务随机字段；同时保留 raw row counts。A/B 比较使用 canonical hash，不错误比较随机主键。
7. **迁移数据 UAT fixture/account provisioner**：只在独立 UAT 环境创建三角色账号和权限；不得在 loader 中创建登录账号或迁移旧密码。
8. **三角色 API/browser UAT runner 与 evidence schema**：任务卡、预期字段、负向权限、截图/录屏索引、签署状态。
9. **HR backup/restore verifier**：扩展 Gate19 的验证维度，但不得修改 Gate19 已有生产行为；可用 wrapper 在临时恢复库运行全域 canonical hash。
10. **Go/No-Go compiler**：读取机器证据而非人工抄写计数，输出 `GO_CANDIDATE` 或 `NO_GO`；机器只能推荐，业务/数据/发布负责人不能由 Codex 代签。
11. **单独生产导入 workflow**：与普通 deploy workflow 完全分离、默认不存在写权限；审批后临时授予最小权限，执行前重新核对三端 SHA、source/manifest/backup hashes，执行后立即撤权。
12. **package.json 统一命令**：目前只暴露 T0、T4 extract、T5 的部分命令；T1/T2/T3 和 T4 load/rollback 文件存在但没有完整 pnpm 入口，容易形成手工命令漂移。

### 5. 两次完整全量演练的强制定义

每一次演练必须满足以下不可拆分合同；任何一次中断或任一域回滚都使该次演练作废，修复后必须从新数据库重新开始：

```text
source snapshot S + code SHA C + mapping version M
  -> new staging root R/{run}/ (0700; files 0600)
  -> extract T0,T1,T2,T3,T4,T5
  -> verify all source/staging hashes
  -> new PG database D from template0
  -> migrations + production seed replay
  -> load T0 -> T1 -> T2 -> T3 -> T4 -> T5
  -> cross-domain ledger + canonical target hashes
  -> API three-role matrix + browser three-role UAT
  -> rollback drill or whole-database discard
  -> prove target/container/volume/temp/staging residual=0
```

- Rehearsal A 和 B 必须是不同 `run_id`、不同数据库、不同 volume/Compose project，但使用相同 `S/C/M`。
- A/B 允许 UUID、created_at 不同；业务 canonical hash、source hashes、counts/sums/quarantine reasons 必须相同。
- 不得将“T0 load→rollback”“T3 load→rollback”“T5 load→rollback”等历史分段结果拼接为 A 或 B。
- 如果修复代码、mapping、公式批准、source snapshot 或 migrations，已完成的 A/B 均失效，必须在新版本上重跑两次。
- 两轮完成后，环境必须都清理到 residual=0；证据包、脱敏 manifest 和 hashes 保留，敏感 staging 按授权销毁并记录销毁清单。

### 6. Run ID、manifest 和状态机

建议父 run id：`yzfull-YYYYMMDDTHHMMSSZ-<git8>-r1`；领域 child ids 为 `<parent>-t0` 至 `<parent>-t5`。父 run 不复用 `migration_batch.run_id` 冒充领域 batch，而是在新的脱敏 evidence manifest 中引用六个 child batch ids。

父状态机：

```text
planned -> source_locked -> extracted -> target_ready -> loading
        -> verified -> uat_passed -> rollback_verified -> cleaned
任意阶段 -> failed -> cleanup_pending -> cleaned_failed
```

manifest 至少包含：

- `formatVersion`、parent/child run ids、started/finished、operator/tool version；
- local candidate SHA、origin/main SHA、migration history aggregate hash、production seed aggregate hash；
- source database、read-only proof、backup SHA-256、catalog hash、collation、backup LSN/checkpoint 信息（可获得时）；
- 每个 source table 的 row count、identity contract version、business hash；
- 每个 staging 文件的相对路径、bytes、SHA-256、mode，禁止绝对路径和敏感样本；
- target database/Compose project/volume/ports，必须全部为本次唯一值；
- 每域 extracted/loaded/quarantined/approvedIgnored、record map、金额/文件汇总；
- 跨域 FK/orphan checks、online-side-effect before/after hashes、target canonical hashes；
- API/browser UAT evidence index、backup/restore evidence、cleanup journal；
- hard gate 列表、Go/No-Go 机器结论和外部签署引用。

manifest 本身生成 SHA-256；完成状态后只追加签署/引用，不原地改历史事实。若需要修正，生成 superseding manifest 并指向旧 hash。

### 7. 源锁、敏感 staging、目标隔离与零在线副作用

#### 源锁/只读

- 演练读取固定恢复库并验证 `READ_ONLY=1`、ETL 非 `sa`、仅 `db_datareader + VIEW DEFINITION`、`UPDATE=0/EXECUTE=0`。
- 最终冻结不能仅依赖 2026-08-20 的旧备份；必须由旧系统业务 owner 明确停止写入，生成最终备份并登记 hash，恢复后再次只读抽取。
- 若旧系统不能停写，必须先定义每个表的可靠增量 identity/watermark；没有稳定键的工资宽表不得伪造增量序号，必须在冻结窗口最终全量重抽。
- source hash、catalog hash 或关键 row ledger 漂移必须使旧演练基线失效，不允许静默沿用硬编码 hash。

#### 敏感 staging

- staging root `0700`，文件 `0600`；凭据文件独立 `0600`，不复制进 staging/manifest。
- 身份证、银行卡、手机号、姓名、工号、工资明细、旧密码和完整连接串不得写普通日志或提交证据。
- manifest 只存不可逆 identity/content hash、计数、金额聚合、reason code；需要人工抽样时使用独立受控材料，不进入 Git。
- 完成/失败/中断都执行明确路径的清理，禁止 glob 到 workspace、Downloads 或 Docker 全局资源。

#### 独立目标与零在线副作用

- rehearsal DB 名必须匹配 `jinhu_hr_migration_lab_full_*`，host 必须 loopback，Compose project、volume 和 ports 必须本次唯一。
- API/Web UAT 连接 rehearsal DB 和独立文件 root，禁止指向生产 URL/数据库/volume。
- 在 load 前后对在线敏感表形成 hash：员工当前态、用户/角色、正式工资批次/工资条、绩效结果、消息/outbox、审批待办、在线文件引用；预期全部不变。历史表和 migration control 表是允许变化集合。
- 领域 loader 的零副作用检查合并为一份全域 allowlist；出现任何 allowlist 外表变化立即整轮失败。

### 8. 全域守恒和目标 hash 设计

全域 checker 至少计算：

1. T0：组织 138、岗位 18、员工 2,949 = loaded + quarantined；组织父级和岗位引用零孤儿。
2. T1：异动 6,887 = loaded + quarantined；每事件指向已映射员工；不改变员工当前态。
3. T2：主合同 802、变更 357、合同类型 4；主从链完整；未知员工/主合同进入明确隔离。
4. T3：月历 144、真实日期 4,383、政策 12/政策项 144、保险 35,008；六险种 total/employer/employee/supplement 使用 PostgreSQL numeric 精确守恒。
5. T4：35 账套表、46,092 历史工资、711 项目、244 公式、1,431 关账、647 成员、9 税率；按 table/scheme/period/employee/item 五层守恒；0 与 NULL 分离；所有动态列有映射或隔离原因。
6. T5：来源 9,140 = 8,730 loaded + 410 quarantined（只对固定 snapshot 生效）；照片/文档 bytes/hash/readability 守恒；empty/absent 源事实不合成业务数据。
7. 跨域：每个 employee-dependent record 都有 T0 mapping 或 quarantine；合同/异动/保险/工资/档案 employee identity 集合差集有明确账；所有 active maps 指向真实且在 tenant/park 内的目标行。

目标 canonical hash 使用 `domain + stable source identity + normalized business values + relation source identity` 排序聚合。不得包含随机 UUID、数据库 sequence、created_at、run id 或 remark 中的 run id，否则两个正确 rehearsal 也无法比较。

### 9. 工资双轨对账关闭标准

T4 的“历史迁移完成”和“新轨工资可切换”必须分开签署：

1. 两次真实抽取的 `businessContentSha256` 一致，且与冻结 source manifest 绑定。
2. 完整加载 46,092 源工资行；员工无法映射、公式不可解析、重复身份等进入显式 quarantine/review，总账零遗漏。
3. 旧工资历史只读、不可变；模拟结果只写 reconciliation tables。
4. 对批准为 `approved_for_simulation` 的公式版本执行全量或业务批准范围的双轨；未批准公式不能执行，也不能当 0。
5. 每员工/期间/项目输出旧值、新值、精确差额、容差、公式/输入版本、原因和复核状态；金额由 decimal/numeric 计算。
6. HR/薪酬 owner 对差异分类；财务 owner 对总额和会计口径签署；未解释差异必须为 0，或有逐项书面风险接受。
7. 证明正式 `hr_payroll_run`、`hr_payslip`、付款/银行/税务/通知/消息均零写；“只算不发”不可通过配置临时打开。

### 10. 三角色 API 与浏览器 UAT

#### API 矩阵

- HR：园区内员工/异动/合同/考勤社保/历史工资/档案历史的允许投影；敏感 GET required audit 成功后才返回。
- 部门负责人：仅组织子树；默认不返回工资金额、身份证、银行卡、私密附件；跨树和直接 ID 猜测均 403/非泄露 not-found。
- 员工：仅本人档案允许字段、本人历史工资条、本人可见流程/培训/奖惩；不能枚举同事。
- 每角色覆盖分页、筛选只缩小范围、详情切换清除旧数据、无权限不发请求、token/权限变化后的 fail closed。

#### 浏览器任务卡

- 桌面和 390px 各执行一次核心任务；高频员工/负责人任务用移动卡片，HR 批量敏感管理不暴露在手机端。
- 记录 route、角色、数据 fixture/hash、步骤、预期、实际、截图/录屏引用、审计 id、缺陷等级。
- 正向任务之外必须有跨组织、跨员工、直接 URL、过期 session、403、服务失败、空状态和敏感详情切换场景。
- 机器浏览器证据与真人岗位签署分开；Codex 可以执行并记录技术 UAT，但不能代替 HR/薪酬/财务/数据 owner 签署。

### 11. 备份恢复、rollback 与 residual=0

分三层验证：

1. **领域回滚**：反序调用 T5→T0 rollback，验证 active map=0、历史目标=0、seed/在线表 hash 不变。
2. **整库恢复演练**：对仿生产副本做 `pg_dump -Fc`，验证 TOC/bytes/SHA-256；执行全域导入并故障注入；恢复到新的验证库，比较平台与 HR canonical hashes。不得覆盖原 rehearsal DB 以免丢失事故证据。
3. **应用回滚**：验证旧 API/Web image 与已迁移 schema 的兼容边界；如果不兼容，则 No-Go，不能假定回滚应用即可回滚数据。

cleanup journal 必须逐项记录 database、container、Compose project、volume、temporary role、temporary directory、staging、UAT accounts/files。最终自动查询和文件检查必须全部为 0；“清理命令退出 0”不能代替 residual=0 证据。

### 12. Go/No-Go 硬门禁

只有全部满足才可产生 `GO_CANDIDATE`：

- local candidate SHA = origin merged SHA = intended workflow/runtime SHA；工作树干净，远端重新 fetch 后无新冲突。
- Rehearsal A/B 在同一 C/S/M 上完整通过，A/B canonical/global ledger 一致。
- 最终冻结/增量重放后 canonical hash 与最终全量一致，source 已只读锁定。
- T0～T5/T4 全域守恒、跨域零孤儿、工资未解释差异=0（或全部有被授权的风险接受）。
- 三角色 API/browser UAT 通过；所有 P0/P1=0；数据/HR/薪酬/财务/安全/发布负责人签署齐全。
- 备份可恢复、故障注入 rollback 通过、RTO/RPO 实测在批准阈值内、residual=0。
- 正式导入 workflow 输入、最小权限、值班、监控、暂停/回退负责人明确。

任一项缺失、证据 hash 漂移、source 再次写入、在线副作用非零、生产备份不可恢复、UAT 权限泄露、工资差异未批准，都必须输出 `NO_GO` 并停止，不能继续 seed/deploy/import。

### 13. 生产导入授权边界

普通代码部署、schema migration 和 production seed **绝不**触发历史 loader。正式生产导入是新的、单独的外部写操作，至少需要：

1. 用户/发布负责人针对明确 `production_import_run_id`、目标环境、source backup hash、full manifest hash、代码 SHA 和时间窗口给出一次性授权；历史的“批准执行”或普通部署授权不能自动沿用。
2. 数据 owner 与 HR owner 确认最终冻结，薪酬/财务 owner 确认工资差异，安全/发布 owner 确认备份和最小权限。
3. workflow 输入二次显示目标数据库身份和 backup hash，默认 dry-run；必须输入不可误触的确认词，且只能从受保护主干 SHA 运行。
4. 执行账号只在窗口内取得目标历史表和 migration control 所需最小写权限；不获得用户凭据、正式发薪、银行、税务或消息权限；完成/失败立即撤权。
5. 生产入口不能通过放宽现有 lab loader 的数据库名 regex 实现。建议新增 production-specific wrapper/stored procedure，以 pinned manifest、pre-import backup 和审批 token 为前置，并复用同一 transformation/load core。
6. 失败后先停止写和流量切换，保留证据；是否执行生产数据库 restore 属于第二个明确灾备授权，不由错误 trap 自动覆盖生产库。

## 建议新子任务：`hr-enterprise-parallel-uat-cutover`

### PRD 结构

1. **Goal**：将六个领域迁移器提升为可审计的全域 rehearsal、冻结增量、并行 UAT 和受控 cutover 能力；默认不执行生产导入。
2. **Confirmed baseline**：固定 `9b62b410...` 及实施开始时重新 fetch 后的新基线；列出 source backup/catalog hash、各域事实和 T4 未完成证据。
3. **Users/owners**：迁移 operator、HR、薪酬、财务、部门负责人、员工、数据 owner、安全、发布负责人。
4. **Functional requirements**：full orchestrator、manifest/ledger、A/B rehearsals、delta/freeze、payroll parallel、三角色 API/browser UAT、backup/restore、Go/No-Go compiler。
5. **Safety requirements**：只读 source、隔离 targets、敏感 staging、零在线副作用、最小权限、HOLD 默认。
6. **Non-goals**：不迁移旧密码；不启动银行/税务/正式发薪；不在该任务中未经授权写生产；不复刻旧物理结构。
7. **Acceptance criteria**：逐项使用本研究第 3、5、8～13 节的强证据；明确 A/B 不得拼接历史片段。
8. **External authorization gates**：真人岗位签署和实际生产导入/灾备恢复分别是独立 gate。

### Design 结构

1. 全域 orchestrator 和 parent/child run 状态机。
2. Manifest JSON schema、hash/supersede 模型和 evidence directory topology。
3. Source snapshot/lock/delta 算法；无稳定键表的 fail-closed 策略。
4. 独立 Compose/DB/API/Web/file-storage 隔离拓扑和端口分配。
5. T0→T5 依赖 DAG、事务/失败语义、反序 rollback。
6. 跨域 ledger SQL、canonical hash 规范和 online-side-effect allowlist。
7. T4 双轨 calculation/review/approval data flow。
8. 三角色 account/fixture、API matrix、browser evidence schema。
9. Backup/restore、RTO/RPO、fault injection 和 application/schema compatibility。
10. Go/No-Go machine compiler、human signatures、production-specific import workflow。
11. Threat model：凭据泄露、目标误连、source drift、重复 run、partial load、身份推断、金额精度、cleanup escape。

### Implement 分片

#### Slice 0 — 基线和合同冻结

- fresh fetch；扫描所有远端 migrations/seeds/scripts；固定 candidate SHA。
- 校验六个领域 loader/extractor/rollback 的参数、输出、依赖和危险差异。
- 完成 manifest schema、ledger schema、run state machine 和 test fixtures。

#### Slice 1 — 全域 runner 与隔离生命周期

- 实现 unique Compose/DB/volume/port/staging 分配、signal journal、失败即停。
- 为 T1/T2/T3/T4 load/rollback 补齐 package scripts，但不改变领域 SQL 语义。
- 实现 T0→T5 顺序 load 和 T5→T0 rollback、residual verifier。

#### Slice 2 — Manifest、全域守恒和 hash

- 实现 source/staging/target/evidence manifest builder/verifier。
- 实现跨域 ledger SQL、canonical target hash、online-side-effect before/after hash。
- contract/negative tests：tamper、drift、wrong DB、wrong project、partial prior run、nonzero residual。

#### Slice 3 — T4 真实历史与双轨闭环

- 完成两次真实 T4 extract、完整 load/rollback/reload、46,092 和所有 item/sum 守恒。
- 以迁移全量数据运行双轨，完成人工复核、差异 ledger 和只算不发证明。
- 独立安全/金额审查；未完成前不得进入 full rehearsal A。

#### Slice 4 — Rehearsal A/B

- A：全新独立资源，完整 source→T0..T5→ledger→UAT technical→rollback/cleanup。
- 修复任何缺陷后从头重跑 A；冻结 C/S/M。
- B：第二套全新独立资源重复全流程；比较 A/B canonical hashes 和 ledgers。
- 两轮 evidence 由非实施者独立审查；不接受拼接或 partial。

#### Slice 5 — 冻结增量与最终候选

- 业务 owner 演练冻结；恢复新的最终 source backup；生成 delta/drift manifest。
- 增量应用后与 final-full-on-new-db 比较 canonical hashes。
- 演练 source unlock/abort，证明恢复旧系统运行不会丢失或重复写。

#### Slice 6 — 三角色 UAT 与恢复演练

- 本地隔离 API/browser 三角色桌面+390px 完整任务卡。
- 仿生产备份→导入→故障注入→restore-to-new-db→hash/RTO/RPO→residual=0。
- P0/P1 修复后从受影响最小强闭包重跑；涉及 C/S/M 变化则 A/B 全部重跑。

#### Slice 7 — Go/No-Go 和生产工作流（仍 HOLD）

- 机器编译 evidence bundle、hard gates、NO_GO reasons。
- 编写生产导入 workflow、权限撤销、监控/值班/回退 runbook；只做 dry-run/contract test。
- 真人签署和一次性生产授权之前保持 `productionImport=HOLD`。

#### Slice 8 — 获得单独授权后的 cutover（外部 gate）

- preflight 再 fetch/三端一致，最终 source lock、生产备份、manifest/hash 二次核对。
- 执行受控导入、全域 ledger、三角色生产 UAT、health/ready/受保护账号和监控。
- GO 才开启新系统 HR 写入；失败保持/恢复旧系统并按单独授权决定是否 DB restore。
- 撤销临时权限、清理、记录生产 run 和限制；不得自动标记业务签署。

## Code patterns

- `docs/yuzhou-hr-compatibility-development-plan.md:91-123`：T4/T5 明确要求双轨、至少两次全量、增量窗口和三角色 UAT。
- `docs/yuzhou-hr-migration-runbook.md:51-78`：T0 使用独立目标、固定 staging hash、事务装载和显式 rollback 开关。
- `docs/yuzhou-hr-migration-runbook.md:80-121`：T5 对敏感 staging、在线表 hash、生产 `HOLD` 和 record-map rollback 的边界。
- `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/design.md:80-99`：单向 ETL、全量→冻结增量→对账→UAT→批准→切换的设计顺序。
- `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/implement.md:81-90`：父任务将两次全量、增量、UAT 和切换明确列为后续分片。
- `scripts/load-yuzhou-t2-contracts.sh:3-8`：mutation flag、run id、隔离数据库名、文件 hash 和 Compose project 门禁。
- `scripts/load-yuzhou-t2-contracts.sh:20-21`：领域局部守恒、员工不变和 rollback point，不是全域守恒。
- `scripts/load-yuzhou-t3-attendance-insurance.sh:30-36`：PostgreSQL numeric 金额汇总、35,008 总账、员工不变和失败即停。
- `scripts/load-yuzhou-t4-payroll-history.sh:4-10`：T4 强制隔离目标、pinned business/source/catalog/file hashes。
- `scripts/rollback-yuzhou-t4-payroll-history.sh:9-21`：T4 以临时最小角色调用受控 rollback procedure 并撤权，可复用于反序清理。
- `.trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json:89-96`：正式证据仍声明 extraction `not_started`，因此不能宣称完整 T4 真实装载已完成。
- `.trellis/tasks/08-25-hr-t5-employee-lifecycle-operations/research/phase5-migration-rehearsal.md:12-29`：T5 是单域 load/rollback/reload 证据，且生产保持 HOLD。
- `scripts/production-backup-restore-gate19.sh:173-205`：已有 custom dump、TOC 和临时恢复库计数核验模式。
- `docs/release/production-rollback-sop.md:48-66`：数据库回滚仍需人工确认且没有自动 down migration。

## Related specs

- `.trellis/spec/api/backend/hr-management.md`：HR 原子权限、敏感字段、历史/工资不可变和业务范围合同。
- `.trellis/spec/api/backend/migration-prerequisites.md`：迁移 prerequisite、fail-closed 和历史完整性规则。
- `.trellis/spec/config/backend/database-initialization.md`：fresh/upgrade/replay、seed/bootstrap 分离和初始化顺序。
- `.trellis/spec/guides/project-operations.md`：共享仓库、三端一致、部署和证据纪律。
- Repository `AGENTS.md`：forward-only migration、生产 seed、Release Smoke、Docker cleanup、桌面/移动浏览器验证。

## External references

本研究未使用外部资料。PostgreSQL 备份恢复、SQL Server 只读源和当前工具版本均以仓库脚本及 `9b62b410` 基线中的已验证行为为准；实施时若升级 PostgreSQL/SQL Server/Docker 版本，需要重新验证而不能沿用本结论。

## Caveats / Not Found

1. 当前打开的主工作树 `HEAD=d99f3e28`，落后 `origin/main` 68 个提交；本研究没有修改或同步 Git，而是按父任务指定的 `9b62b410` 对象只读审计。正式实施必须在权威干净 worktree 重新 fetch 并复核这些结论。
2. 没有找到一个统一的 full-domain rehearsal runner、parent run manifest、global ledger、incremental/freeze runner 或 HR-specific cutover workflow。
3. 没有找到两次完整全域演练的证据；仅找到各领域不同时间、不同数据库、不同 run 的片段证据。
4. T4 `source-evidence-manifest.json` 明确记录 extraction evidence `not_started`；虽然 loader/rollback 代码已存在、DSL fixture 通过，但不能据此推断真实 46,092 行已完整装载或双轨业务签署完成。
5. `package.json` 没有为所有现有 T1/T2/T3/T4 load/rollback 文件提供统一命令，当前存在人工命令漂移风险。
6. 旧系统实际生产是否仍在写、能否提供最终备份/增量日志、可接受冻结窗口及 RTO/RPO 未在仓库中得到证明，必须由外部业务/运维 owner 确认。
7. 真人 HR/薪酬/财务/部门负责人/员工签署不能由自动化或 Codex 代替；正式生产导入和灾备 restore 也分别需要新的明确授权。
