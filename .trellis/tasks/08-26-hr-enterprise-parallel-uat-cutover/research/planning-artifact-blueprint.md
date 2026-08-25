# Research: HR 全域双演练与增量切换规划蓝图

- Query: 为 `08-26-hr-enterprise-parallel-uat-cutover` 提供可直接落入 `prd.md`、`design.md`、`implement.md` 和 implement/check context manifests 的完整规划；保持真实终局、八个可验证 slice、隔离演练与一次性生产授权边界。
- Scope: internal
- Date: 2026-08-26

## Findings

## 1. 规划状态和激活结论

目标任务存在且 `task.json.status=planning`，但 `prd.md` 仍为 `TBD`，`design.md`、`implement.md` 不存在，`implement.jsonl` 与 `check.jsonl` 只有示例。因此当前任务**不可激活**；必须先由具备任务目录写权限的 brainstorm/implement 主代理将本蓝图落入三份规划文件，配置真实 context entries，运行 `task.py validate`，完成人工规划复核后才能 `task.py start`。

当前领域能力不能拼接成两轮全域演练。一个有效 rehearsal 必须在一个新的独立目标数据库内，使用相同 source backup/catalog/hash、相同 mapping contract 和相同代码 SHA，连续执行 T0→T1→T2→T3→T4→T5；任何阶段失败、领域回滚、代码/映射/源快照改变都会使该轮作废。Rehearsal A 与 B 必须是独立 database、volume、Compose project、端口、文件 root 和 run id，最终业务 canonical target hash、global ledger、quarantine reason ledger 必须一致。

## 2. 建议 `prd.md`

### Goal

将已有玉舟 T0～T5 领域迁移器提升为可审计、可重复、失败即停的企业级全域迁移与切换能力：在同一冻结源事实和同一候选代码 SHA 下完成两个独立目标库的完整连续演练、最终冻结/增量证明、T4 工资双轨对账、三角色 API/浏览器 UAT、备份恢复与反序 rollback、零残留清理及 Go/No-Go 证据编译。任务默认只允许隔离环境演练；生产历史导入保持 `HOLD`，只有针对固定 run/target/source/manifest/SHA/window 的单独一次性授权才能执行。

### Users and decision owners

- migration operator：运行受控编排，不持有业务签署权。
- HR owner：员工、组织、异动、合同、档案、人才和三角色流程签署。
- payroll owner：工资公式、项目和逐项差异分类签署。
- finance owner：工资金额总账和会计口径签署。
- department manager / employee：分别完成团队范围和本人范围 UAT。
- data owner：source freeze、backup/catalog/ledger 和数据例外签署。
- security owner：敏感 staging、最小权限、审计和清理签署。
- release owner：三端 SHA、窗口、生产 run 和 Go/No-Go 决策。

### Functional requirements

1. 一个 parent run manifest 引用六个不可混淆的 child batch，统一绑定代码 SHA、source backup/catalog/hash、mapping/version、migration/seed history、所有 staging hashes、目标身份、全域 ledger、canonical hashes、UAT、恢复和 cleanup 证据。
2. 两个独立目标库分别从 `template0` 创建，执行 migrations、production seed，再连续 T0→T1→T2→T3→T4→T5；不得利用历史领域片段或中途 rollback 拼装。
3. 全域总账证明每域 `source = loaded + quarantined + approved_ignored`，并证明员工依赖、合同链、异动、考勤、保险、工资、档案/文件跨域零孤儿；金额由 PostgreSQL `numeric` 权威计算。
4. canonical target hash 只使用稳定 source identity、规范化业务值和关系 source identity，排除 UUID、sequence、run id、created_at 等随机值；A/B 必须相同。
5. 第二轮后演练冻结窗口：新最终 source snapshot 与基线做稳定 identity + row hash diff；输出 zero delta 或受控 insert/update/delete delta。无稳定键或无法证明 delete 的表必须停写后重新全量，禁止猜测增量。
6. T4 完成真实 46,092 历史工资行和纵向项目精确守恒，并用批准公式/输入版本运行双轨对账；输出逐员工/期间/项目旧值、新值、差额、容差、原因、复核和签署引用；只算不发，正式 payroll/payslip/银行/税务/通知零写。
7. 同一隔离 UAT 环境完成 HR、部门负责人、员工三角色 API 正/负向矩阵和真实浏览器 desktop/390px 任务；验证 tenant/park/self/managed-org-tree、原子动作、字段投影、required audit、直接 URL/UUID 猜测和敏感详情切换。
8. 完成备份 `pg_dump -Fc`、TOC/hash、导入、故障注入、restore-to-new-db、平台+HR canonical hash、RTO/RPO 和 cleanup residual=0；领域回滚必须按 T5→T4→T3→T2→T1→T0 受控反序执行。
9. Go/No-Go compiler 只读取 hash 固定的机器证据，输出 `GO_CANDIDATE` 或带 reason codes 的 `NO_GO`；机器结论不能代签 HR/薪酬/财务/数据/安全/发布负责人。
10. 普通 deploy、schema migration、production seed 和 lab rehearsal 永不触发生产历史导入。生产入口必须是独立 workflow/wrapper、默认 dry-run、受保护主干、最小临时写权限、二次目标显示和一次性 run 授权；失败后的生产 restore 是另一项明确灾备授权。

### Safety and non-goals

- source SQL Server 必须 `READ_ONLY=1`，ETL 非 `sa`，仅 `db_datareader + VIEW DEFINITION`，无 update/execute。
- target host 只能 loopback，数据库名必须匹配 `jinhu_hr_migration_lab_full_*`；API/Web/file root 都是本轮隔离资源，不能访问 production URL/volume。
- staging root 为 `0700`，文件为 `0600`；凭据独立 `0600` 且不进入 manifest。日志不能包含姓名、工号、证件、银行卡、手机号、工资明细、旧密码、连接串或 token。
- 在线业务表采用 allowlist 外零变化门禁；用户/角色、员工当前态、正式工资/工资条、绩效、消息/outbox、审批待办和在线文件引用必须前后 hash 不变。
- 不迁移旧密码，不复刻旧物理结构，不执行发薪/银行/税务/社保申报，不在本任务授权生产 import 或生产 restore，不由自动化代签业务结论。

### Acceptance criteria

- [ ] Rehearsal A/B 分别有唯一资源和 parent manifest；两轮都从空库连续 T0→T5，C/S/M 相同，所有 child 成功，A/B global ledger/canonical hash/quarantine ledger 相同。
- [ ] 任一 hash tamper、source drift、wrong DB/project/host、partial prior run、在线副作用、领域失败或非零 residual 都失败即停并输出明确 reason；不继续后续 load/seed/UAT/import。
- [ ] 全域 ledger 覆盖 T0 138/18/2,949、T1 6,887、T2 802/357/4、T3 144/4,383/12/144/35,008、T4 35 tables/46,092 rows/711 items/244 formulas/1,431 closes/647 members/9 tax rates、T5 9,140 及当前固定 quarantine；若 source snapshot 变化，预期值必须来自已签 hash manifest，不能静默硬编码。
- [ ] 第二轮增量冻结输出 zero 或 controlled delta，并在新库应用 delta 后与最终 source 全量重建 canonical hash 完全相同；不稳定表走冻结后全量。
- [ ] T4 双轨所有金额用 database numeric，未解释差异为零或逐项风险接受；HR/payroll/finance 签署引用齐全；正式工资及外部支付域零写。
- [ ] 三角色 API 与 desktop/390 browser UAT 覆盖正向、跨树/跨人、敏感字段、audit failure、403/not-found、空态、错误/重试和详情切换；P0/P1=0，技术证据与真人签署分离。
- [ ] 备份/恢复、故障注入、反序 rollback、RTO/RPO 和 residual verifier 全部通过；清理检查的是实际 database/container/volume/role/directory/account/file 为零，不只看命令退出码。
- [ ] local candidate SHA = origin merged SHA = intended runtime/workflow SHA；fresh/upgrade/replay/seed×2、契约/负向/PostgreSQL/API/Web/build/desktop/390 门禁通过。
- [ ] Go/No-Go evidence bundle hash 固定；任一 hard gate/签署缺失输出 `NO_GO`。在单独生产授权前始终输出 `productionImport=HOLD`。

## 3. 建议 `design.md`

### Architecture and run topology

父状态机：`planned → provisioned → extracting → loading → verifying → uat_ready → rollback_ready → cleaned`；失败/信号只写 append-only failure journal 并进入受控恢复清理，不能伪造或跳过成功状态。父 run id 形如 `yzfull-<utc>-<git8>-rA|rB`，child ids 为 `<parent>-t0`…`<parent>-t5`。父 run 不伪装成 `migration_batch`，manifest 只引用六个 child batch。

每轮资源拓扑必须唯一：Compose project、PostgreSQL database/volume/container/port、API/Web port、file root、staging/evidence root、UAT accounts。source snapshot 可以共享只读事实，但抽取输出必须分别验证相同 hashes。资源 registry 在创建前写计划、创建后写 observed identity，cleanup 后逐项查询 residual。

### Manifest and evidence integrity

- parent manifest 包含 formatVersion、C/S/M、backup/catalog/LSN/read-only proof、migration/seed aggregate hashes、source table contracts、staging relative paths/bytes/hash/mode、target identities、child batches、ledger、side-effect hashes、canonical hashes、UAT/restore/cleanup indexes 和 hard gates。
- manifest 状态事实 append-only；签署作为 hash-addressed detached attestations。修正通过 superseding manifest 指向旧 hash，不原地改历史。
- evidence root 仅存脱敏 JSON/JSONL/hash/command metadata；原始 staging 与凭据不入 Git。所有命令输出经敏感模式扫描，发现明文立即失败并隔离证据。

### Dependency and failure model

领域顺序固定 T0→T1→T2→T3→T4→T5。orchestrator 只调用已有领域入口，不复制转换 SQL；在调用前统一适配环境变量、run id、target identity、source/staging manifest 和授权开关。每一 child 完成后验证其 `migration_batch`、maps、checks 和 side effects，再进入下一 child。

当前脚本边界不一致：T0/T5 rollback 要求 `ALLOW_YUZHOU_ROLLBACK=yes`，T1/T2/T3/T4 不一致；部分脚本固定 Compose project `jinhu_hr_migration_lab`，而最终设计要求每轮唯一 project；package.json 仅暴露 T0、T4 extract 和 T5。Slice 0/1 必须通过 wrapper/contract test 统一，而不是放宽数据库正则或删除现有 fail-closed 门禁。

### Global ledger and canonical hash

全域 verifier 在数据库内建立只读 SQL 视图/查询，按 domain/source object 输出 extracted/loaded/quarantined/approvedIgnored、record maps、金额和文件汇总，并以 cross-domain source identity 检查员工映射、合同主从、异动员工、保险/工资/档案 owner。`approvedIgnored` 只能引用受签 reason code catalog，不允许自由文本掩盖差额。

canonical row 结构：`domain | source_table | source_identity_sha256 | normalized_business_json | related_source_identity_sha256[]`，稳定排序后逐域 hash，再生成 global hash。金额保持 decimal string，NULL 与 0 分离；不包含 UUID、时间戳、sequence 或 run id。

### Source freeze and delta

基线 snapshot S0 和最终 snapshot S1 均需 backup+catalog+table ledger hash。对每张表声明 identity contract、row normalization、insert/update/delete 可证明性。稳定表产生 diff manifest；工资宽表或无可靠键表在业务冻结后重新全量抽取。delta apply 只能在 rehearsal clone 中验证，完成后与 S1 新库全量加载 hash 等价。任何 source unlock/rewrite 使最终候选失效。

### T4 dual track

历史迁移和新轨计算是两个签署对象。旧历史写 immutable legacy/history tables；新轨模拟只写 reconciliation tables。只运行 `approved_for_simulation` 公式，解析失败不视为 0。逐 employee/period/item 记录 versions、old/new/delta/tolerance/reason/reviewer，数据库计算总额；保护表 before/after hash 包含正式 run、payslip、payment/bank/tax/message/outbox。

### Three-role UAT

UAT account provisioner 只在隔离库建立新凭据，绝不迁移旧密码。API runner 使用任务卡驱动 exact allowlist projection/status/audit assertions。browser runner 在 desktop/390 执行列表→详情→历史→流程/待办，并验证直接 URL、跨树、跨员工、session 过期、错误恢复、无横向溢出和敏感内容清除。截图/录屏只引用受控路径，不把敏感原值放入仓库。

### Backup, rollback, cleanup and Go/No-Go

备份恢复复用 Gate19 的 custom dump/TOC/hash/restore-to-new-db 模式，但增加 HR global canonical hash 和文件证据。领域 rollback 反序执行并逐域核验 active maps/target rows；整库 restore 永不覆盖事故库。application rollback 需单独验证旧 image 与当前 schema 的兼容，否则直接 No-Go。

Go/No-Go compiler 对 evidence schema/hash、A/B、delta、T4、UAT、restore、cleanup、三端 SHA 和签署引用执行 fail-closed 规则。它只产生候选结论。production wrapper 与普通 deploy 完全分离：pinned main SHA、target/backup/manifest 二次显示、默认 dry-run、一次性审批 token、临时最小权限和完成即撤权；生产 restore 不放入自动 trap。

## 4. 建议 `implement.md`：八个可验证 slice

每个 slice 都必须先 fresh fetch/保护 WIP，结束时独立 check；失败立即停止。若 C/S/M 或业务 canonical contract 改变，所有依赖旧值的 rehearsal evidence 作废。

### Slice 1 — 基线与全域合同冻结

- 扫描所有远端 migration/seed 编号、六域 extract/load/rollback、package scripts、成功历史和 T4 evidence。
- 固化 parent manifest JSON schema、child adapter contract、run state machine、resource registry、ledger/canonical normalization、reason catalog 和脱敏策略。
- 为六域建立 contract matrix：required env、input/output/hash、dependencies、mutation/rollback flags、target regex、Compose label、side-effect tables。
- 验收：schema fixtures 正负例；旧证据不能被识别为 full rehearsal；T4 `not_started` 明确阻止继续。

### Slice 2 — 全域 runner 与隔离生命周期

- 建立唯一 DB/Compose/volume/ports/staging/API/Web/file root 生命周期和 signal-safe cleanup journal。
- 补齐 T1/T2/T3/T4 pnpm entry，使用 adapters 统一门禁；不改变领域业务转换语义或放宽 lab-only target。
- 顺序 T0→T5、反序 T5→T0，child 失败即停；实现 actual residual verifier。
- 验收：wrong host/database/project、重复 run、partial prior batch、signal、child failure、cleanup escape 全部 fail closed；staging 0700/files 0600。

### Slice 3 — Parent manifest、global ledger、canonical hash

- 实现 manifest builder/verifier、append/supersede、hash-addressed evidence index。
- 实现 PostgreSQL numeric global ledger、cross-domain orphan checks、online-side-effect allowlist 和 canonical target hashes。
- 验收：tamper、NULL/0、random UUID/time exclusion、approvedIgnored reason、cross-tenant/map、金额差一分、allowlist 外变化均被检出。

### Slice 4 — T4 真实历史和工资双轨

- 在固定 source 上两次真实 extract hash 一致；完整 load→verify→rollback→reload，并核对 46,092/711/244/1,431/647/9 及分层金额。
- 对批准公式执行全量/批准范围双轨，生成差异 ledger、人工 review 流程和 detached HR/payroll/finance attestation schema。
- 验收：未批准/不可解析公式不得运行；未解释差异=0 或逐项风险接受；正式 payroll/payslip/payment/tax/message 零写；无发薪功能路径。

### Slice 5 — Rehearsal A 与 B

- A 从全新资源执行完整 source→extract→migrate/seed→T0…T5→ledger/hash→technical UAT→rollback/cleanup；任何修复后从头重跑。
- 固定 C/S/M 后 B 使用另一套全新资源重复；比较 source/staging hashes、global ledgers、canonical hashes、quarantine reasons 和 residual。
- 验收：两轮独立、连续、相同事实且 residual=0；非实施者独立审查 evidence。禁止将过去分段结果计入。

### Slice 6 — 最终冻结与 zero/controlled delta

- 演练业务冻结，获取 S1 backup/catalog/read-only proof；按表生成 identity/hash diff 和 zero/controlled delta。
- 在 A/B 后候选 clone 应用 delta；另建空库做 S1 final-full；比较两者 canonical/global hash。
- 验收：insert/update/delete 无遗漏/重复；无稳定键表只能冻结后全量；source unlock/漂移使候选失效。

### Slice 7 — 三角色 UAT、备份恢复与受控 rollback

- 隔离环境创建 HR/manager/employee 账号和迁移数据任务卡；执行 API + desktop/390 browser 正负向矩阵。
- 执行仿生产 backup→import→fault injection→restore-to-new-db→hash/RTO/RPO；执行 T5→T0 反序领域 rollback 和全资源 cleanup。
- 验收：字段/数据范围/audit/直链安全、P0/P1=0；平台+HR+文件 hash 恢复一致；actual residual=0；真人签署仍独立等待。

### Slice 8 — Go/No-Go 与生产入口（默认 HOLD）

- 编译 evidence bundle 和 hard-gate reason codes；实现/测试 production-specific wrapper/workflow 的 dry-run、pinned SHA、target/backup/manifest 显示、审批 token、最小权限、撤权和监控/值班 runbook。
- 验收：缺任一机器证据/签署均 `NO_GO`；隔离演练不能授权生产；普通 deploy 永不触发 loader；无单独一次性授权始终 `productionImport=HOLD`。
- 只有用户对明确 run id、production target、source backup hash、manifest hash、代码 SHA、窗口做新授权后，才另开 cutover 执行任务。生产 restore 仍需第二个灾备授权。

### Validation gates common to slices

- JSON schema/contract/negative tests，Shell/Node syntax，敏感日志扫描。
- template0 fresh、真实 predecessor upgrade、checksum replay、production seed twice。
- migration control/PostgreSQL integration、API/Web unit/contract、lint/typecheck/build。
- desktop 和 390px browser；三端 fresh fetch/SHA；所有临时资源 actual residual=0。
- 不允许把绿色 CI、health 或技术 UAT单独描述为业务签署或 production authorization。

## 5. `implement.jsonl` / `check.jsonl` 建议上下文

两个文件只放 spec/research，不放代码路径。建议 implement entries：

```jsonl
{"file":".trellis/spec/api/backend/hr-management.md","reason":"HR scope, sensitive projections, audit, payroll immutability and three-role contracts"}
{"file":".trellis/spec/api/backend/migration-prerequisites.md","reason":"Forward-only migration, prerequisite and replay fail-closed requirements"}
{"file":".trellis/spec/config/backend/database-initialization.md","reason":"Fresh, upgrade, replay, production seed and initialization order"}
{"file":".trellis/spec/guides/project-operations.md","reason":"Shared repository, three-end sync, release evidence and production safety"}
{"file":".trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/research/final-cutover-gap-and-plan.md","reason":"Authoritative full-cutover gap audit, evidence baseline and eight-slice target"}
{"file":".trellis/tasks/08-26-hr-enterprise-parallel-uat-cutover/research/planning-artifact-blueprint.md","reason":"Approved task requirements, architecture, slice plan and activation gates"}
```

建议 check entries 与 implement 相同，并强调 checker 逐条证伪：A/B 独立连续性、C/S/M 同一性、canonical/global ledger、delta equivalence、T4 只算不发、三角色字段隔离、restore/rollback、residual=0、HOLD/authorization separation。若仓库存在专门安全、测试或 Web responsive spec，规划主代理在 `get_context.py --mode packages` 后只加入实际相关 spec；不得把脚本代码路径塞入 JSONL。

## 6. 激活前仍需的产品/外部决定

以下不阻止 Slice 1～3 的工程实现，但会阻止 Slice 4～8 的业务完成或 `GO_CANDIDATE`：

1. 旧系统业务 owner 能否在何时停写，以及最终 backup/只读锁的责任人和可接受窗口。
2. 每张无稳定 identity/watermark 表是否批准“冻结后全量重抽”；不得由工程侧猜增量。
3. T4 公式批准范围、金额容差、差异分类、风险接受格式及 HR/payroll/finance 签署人。
4. HR/manager/employee 三角色真人 UAT 账号/人员、任务卡范围和签署标准。
5. RTO/RPO 目标、故障注入类型、是否要求应用旧版本兼容验证。
6. 最终生产 cutover run 的窗口、目标、值班、监控、暂停/回退职责；这些决定不等于生产写授权。

即使上述决定齐全，正式生产 import 仍必须在 Rehearsal A/B、delta、T4、UAT、restore、cleanup 和三端一致全部通过后，由用户针对固定 run/SHA/source/manifest/target 单独授权。隔离演练批准、普通部署批准或历史“继续执行”不能继承为该授权。

## Files found

- `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/research/final-cutover-gap-and-plan.md`：最终切换缺口、强证据和八分片来源。
- `.trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/{prd,design,implement}.md`：单向 ETL、隔离门禁、T0 基线和后续切换边界。
- `docs/yuzhou-hr-compatibility-development-plan.md`：T0～T5 业务兼容、双轨、两次全量和三角色 UAT 要求。
- `docs/yuzhou-hr-migration-runbook.md`：只读源、lab target、0600/0700、T0/T5 hash/rollback 和生产 HOLD。
- `scripts/{extract,load,rollback}-yuzhou-t*.sh`：六域现有执行边界；授权开关、Compose label、run 和 rollback 合同存在差异。
- `package.json`：当前仅暴露 T0 全套、T4 extract 和 T5 全套入口，T1/T2/T3/T4 load/rollback 入口缺失。
- `.trellis/spec/api/backend/hr-management.md`：HR 原子权限、敏感审计、工资不可变和三角色范围合同。
- `.trellis/spec/api/backend/migration-prerequisites.md`：迁移前置、不可改历史和 fail-closed 契约。
- `.trellis/spec/config/backend/database-initialization.md`：fresh/upgrade/replay/seed 初始化门禁。
- `.trellis/spec/guides/project-operations.md`：共享仓库、三端一致和生产证据纪律。

## Code patterns

- `docs/yuzhou-hr-compatibility-development-plan.md:91-112`：T4 双轨与 T5 两次全量、增量、UAT 的需求来源。
- `docs/yuzhou-hr-migration-runbook.md:51-78`：T0 隔离目标、hash、事务和显式 rollback。
- `docs/yuzhou-hr-migration-runbook.md:80-121`：T5 敏感 staging、在线 hash、精确回滚和生产 HOLD。
- `scripts/rollback-yuzhou-t0.sh:9-16` 与 `scripts/rollback-yuzhou-t5-legacy-history.sh:5-10`：双授权和固定 lab Compose 门禁。
- `scripts/rollback-yuzhou-t1-employment-events.sh:7-12`、`scripts/rollback-yuzhou-t2-contracts.sh:3-5`、`scripts/rollback-yuzhou-t3-attendance-insurance.sh:3-5`：回滚授权和校验强度不统一，需 adapter 统一而非削弱。
- `scripts/rollback-yuzhou-t4-payroll-history.sh:9-21`：最小临时角色、受控 procedure 和撤权模式。
- `package.json:73-81`：统一命令只覆盖 T0、T4 extract 和 T5。

## Related specs

- `.trellis/spec/api/backend/hr-management.md`
- `.trellis/spec/api/backend/migration-prerequisites.md`
- `.trellis/spec/config/backend/database-initialization.md`
- `.trellis/spec/guides/project-operations.md`
- Repository `AGENTS.md`

## External references

未使用外部资料。规划以仓库现有脚本、文档、Trellis 任务证据和当前代码基线为准；实际实施开始必须重新 fetch 并验证工具版本、source snapshot 与远端状态。

## Caveats / Not Found

1. 当前代理是 Trellis researcher，按角色约束只能写本任务 `research/`，因此没有直接改写 `prd.md`、创建 `design.md/implement.md` 或修改两个 JSONL；主代理必须按本蓝图落盘。
2. 未发现统一 full-domain orchestrator、parent manifest/global ledger、delta/freeze runner、三角色迁移数据 UAT runner、HR restore verifier、Go/No-Go compiler 或 production-specific import workflow。
3. 未发现两次完整连续全域演练证据；过去领域 load/rollback/reload 不可拼接。
4. T4 source evidence 仍显示真实 extraction 未完成，因此 Slice 4 是 Rehearsal A 的硬前置。
5. 真实最终 source 是否仍在写、冻结窗口、T4 业务容差、真人 UAT、RTO/RPO 与签署责任未在仓库中证明。
6. 正式生产导入和灾备 restore 分别属于新的外部写授权；本规划、lab 演练、代码发布和普通部署授权均不能替代。

## Planning review closure (2026-08-26)

激活审查进一步固化以下可执行合同：

1. A/B 不仅是两个数据库，而是 DB/Compose/volume/container/ports/file/staging/evidence/accounts/run 全部独立；二者逐字节复用同一 `codeSha/sourceSnapshotHash/mappingContractHash`，各自连续完成 T0→T5 和三角色 API + desktop/390 技术矩阵后才能反序回滚。
2. global ledger 对每个 source object 强制 `source = loaded + quarantined + approvedIgnored`；canonical hash 排除随机目标身份但保留稳定 source identity 与关系 identity；delta clone 必须与 S1 空库 full load 的 global/canonical hash 等价。
3. T4 的 schema/fixture/dry-run 工程可先实施；真实 46,092/711/244/1,431/647/9 守恒和双轨执行受公式范围、容差及真人签署 gate 约束，且始终只算不发、在线域 hash 零变化。
4. 未决停写、T4、真人 UAT、RTO/RPO和值班输入不阻断 Slice 1～3，也不阻断后续不依赖真实业务输入的工程工作；缺输入必须输出稳定 `NO_GO/HOLD` reason code。
5. production import 与 production restore 是不同 workflow、不同 operation/run id、不同一次性秘密授权和不同临时角色；任一授权不能继承、复用或触发另一操作，普通部署和 lab runner 均不可到达生产写入口。
6. residual verifier 必须枚举 DB/container/volume/role/directory/account/file/port/process/credential artifact 的 planned/observed/removed/residualCount，不能只信退出码。staging/evidence/credential 目录为 `0700`，文件为 `0600`，日志和 manifest 均禁止秘密与敏感原值。
