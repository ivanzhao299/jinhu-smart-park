# 实施计划：HR 全域双演练与停用源切换

每个 Slice 开始前 fresh fetch、三端/工作树和远端迁移号检查；结束后独立 Trellis check。任一代码/source/mapping 合同变化会使依赖旧三元组的演练证据作废。

## Slice 1 — 基线与全域合同冻结

- [x] 扫描全部远端迁移/种子、六域脚本、package 入口和 T4 evidence，记录代码/source/mapping 三元组。
- [x] 固化 parent manifest schema、child adapter、状态机、resource registry、global ledger/canonical normalization、reason catalog 和脱敏合同。
- [x] 建立六域 contract matrix：env、输入/输出/hash、依赖、写入/回滚开关、target regex、Compose label 和 side-effect allowlist。
- [x] 负向证明旧领域证据不能冒充 full rehearsal；T4 `not_started` 会阻断。
- [x] 交付并测试 `C/S/M` 三元组字段、逐 source object 守恒式、hard-gate reason catalog；未决业务输入仅产生 `NO_GO` reason，不阻断 Slice 1～3。

## Slice 2 — Runner 与隔离生命周期

- [x] 建立唯一 DB/Compose/volume/port/staging/API/Web/file 生命周期和 signal-safe cleanup journal。
- [x] 为 T1/T2/T3/T4 增加统一 pnpm entry，通过 adapter 收紧不一致门禁，不改变转换语义。
- [x] 实现顺序 T0→T5、反序 T5→T0、child failure stop 和实际 residual verifier。
- [x] 验证 wrong host/database/project、重复 run、partial batch、signal、child failure 和 cleanup escape 均 fail closed；0700/0600 生效。

## Slice 3 — Parent manifest、Global ledger、Canonical hash

- [x] 实现 manifest builder/verifier、append/supersede 和 hash-addressed evidence index。
- [x] 实现 PostgreSQL numeric ledger、cross-domain orphan checks、side-effect allowlist 和 canonical hashes。
- [x] 覆盖 tamper、NULL/0、随机 UUID/time 排除、approvedIgnored、跨租户/map、金额差一分和 allowlist 外变化负向测试。

## Slice 4 — T4 真实历史与工资双轨

- [x] 固定源两次 extract hash 相同；全量审计46,092行，生产候选固定2024～2026的8,342行，2010～2023的37,750行登记为deferred cold archive。
- [x] 三年候选完成真实 load→verify→rollback→reload，守恒8,342=8,320+22、190,374明细、266关账及金额分层。
- [x] 仅用批准公式运行双轨，输出逐项差异、review 流程和 detached HR/payroll/finance attestation schema。
- [x] 未批准/不可解析公式 fail closed；正式 payroll/payslip/payment/tax/message 零写且无发薪入口。
- [x] 在公式范围/容差/签署人未确定时，schema、fixture、负向测试和 dry-run 可完成，但真实双轨执行必须输出 `T4_*_MISSING` 并停止；不得用默认容差或自动签署继续。

## Slice 5 — Rehearsal A/B

- [x] 建立玉舟页面、字段、规则兼容基线：帮助文档识别 46 个主题，交叉绑定 13 类菜单、162 表、194 存储过程、16 函数、2 触发器；明确当前只有 L2/L3 证据，旧客户端 L4 遍历为 0，禁止以数据可迁移冒充全功能兼容。
- [ ] 生成机器可读的 legacy field/rule ledger，将旧页面→字段→动作→状态→报表逐项绑定当前 route/API/entity/RBAC/test；无证据项计 0，mapped/archived/rejected 均需明确理由。
  - [x] 第一阶段：固化 13 类菜单种子台账、六维 100 分合同、证据等级、原子 locator 扩展结构和 fail-closed 自动评分；字段/过程逐原子展开仍未完成。
  - [ ] 第二阶段：从只读旧源结构生成逐表/字段/过程候选，人工审阅后绑定目标与测试；不得把 Downloads 源文件、字段值或 PII 写入仓库。
    - [x] 完成离线只读候选生成器、schema、独立 verifier 和正负向 contract：显式传入 legacy root 与输出路径，真实资料稳定生成 162 表/2,364 字段、194 procedure/16 function/2 trigger（212 rules）及 46 页面主题；两次生成 byte-for-byte/hash 一致，输出只含结构名、类型、nullable/default、脱敏说明、artifact SHA 和稳定 ID/hash。
    - [x] 权限 915 条仅固化 redacted importer contract 与 `pending_review` 门禁，不生成占位授权、不自动批准；候选输出不覆盖正式 reviewed ledger，生产历史 import 继续 `HOLD`。
    - [x] 第三阶段第一批：为员工档案、异动、合同 3 个核心域建立 reviewed mapping contract/verifier；固定原子 inventory hash 并展开 person 及档案关联表、readjust/readjustitem/jobstatecode、compact/compact_c/compacttypecode 的 12 表/260 字段，只有仓库内 route/API/entity/permission/test 文件与符号真实存在才标 mapped/tested，未绑定字段和工号不复用、jobstate、JZ/DZ/LZ/FZ 编号语义、合同续签链/提醒等规则以稳定 gap reason 保留。
    - [x] 第三阶段第二批：逐项绑定玉舟集团 Web 版 15 个入口；初始 12 个具备新 route/API/permission/test 的源码闭环，随后补齐受原子权限和 required audit 保护的人事异动统计、受敏感档案权限与图片策略保护的人员照片，以及验证旧密码、限流、递增会话版本并原子撤销全部 refresh session 的本人密码修改，当前为 15 mapped / 0 gaps。该证据不替代三角色运行时矩阵，兼容分仍为 0，生产历史 import 继续 `HOLD`。
    - [ ] 第三阶段现场补证：对仍可运行的玉舟 V10 客户端执行只读全菜单遍历，逐页记录菜单层级、查询条件、列表列、空白新增/编辑字段、状态动作、编号、校验、审批、打印/导出和角色可见性；禁止保存、审核、结账、发薪或导出个人数据，截图/证据必须脱敏且不得记录连接地址或凭据。当前 v1 仅为 L3 进度证据，兼容分贡献固定为 0，不得以 `candidate` 或人工布尔值冒充 L4。
      - [x] 覆盖评分已拆分目标系统 `targetTechnicalUat` 与旧集团 Web `legacyRuntimeUat`：Smart Park A/B 只能提升目标实现维度；旧端缺少固定 surface/role/page/route/observedAt/artifact hash 的三角色实遍历证据时保持 partial/missing，旧歧义输入和源码/数据库替代证据均 fail closed。
      - [x] 建立不可互换的 `client:*` 与 `group-web:*` 原子清单骨架：正式拆分 68 个 desktop-client 权威入口与 15 个 Group Web 快捷入口交叉引用；客户端继续守恒 162 表/2,364 字段/212 规则/915 权限，Group Web 继续守恒 231 菜单/186 源码路径。快捷入口不进入客户端 observed/pending/评分分母，全部保持独立稳定 locator、`PENDING/HOLD`，禁止跨 surface 复用或自动晋级。
      - [ ] 首轮覆盖员工档案、人事异动、劳动合同、考勤、工资、培训、奖惩、招聘、绩效、自助和系统字典；页面证据逐项绑定 atomic inventory stable ID 与 reviewed mapping，修正帮助文档或数据库结构无法证明的交互语义。
      - [ ] 对员工已习惯的流程区分 `preserve`、`modernize`、`archive`、`reject` 四类决策；保留业务语义与编号/状态链，不复制旧 UI、弱权限或不合规做法，每项决策要求新 route/API/entity/atomic permission/test evidence。
      - [ ] 现场遍历完成前，旧客户端 L4 兼容分保持 0，生产历史 import 继续 `HOLD`；任何包含 PII、工资明细或真实凭据的证据不得进入仓库。
    - [ ] 由人工审阅候选 inventory 后，将逐表/字段/规则/页面绑定目标 route/API/entity/RBAC/test，再以受控 hash evidence 合并进入正式 reviewed ledger；未审阅候选不得提高兼容评分。
- [ ] 在 Rehearsal A 前完成高优先级兼容缺口门禁：档案扩展域、异动快照、合同续签链、培训/奖惩/招聘历史查询、自助投影；工资继续最近三年热窗口，复杂公式/银行报盘保留为后置硬门禁。
  - [ ] P0-1 旧字典治理：禁止未知 `jobstatecode` 默认归为离职，禁止未签署异动/合同字典静默映射；版本化、append-only、批准 hash 绑定，未知值 fail-closed/quarantine。
  - [ ] P0-2 三角色 scope/RBAC：让 `HR_ACCESS_MATRIX` 成为运行时合同，补齐经理 team-masked 与员工 self-masked 档案权限；经理跨树、员工跨人必须拒绝。
  - [ ] P0-3 员工完整档案物化：`person` 扩展字段及 `family/knowhow/ticket` 家庭、技能、证照从 raw archive 进入受权限保护的结构化业务模型。
  - [ ] P0-4 合同链与提醒：期限、累计续签、签订日、正文/文件证据及到期提醒工作流完整结构化，不能以 60 日前端计数代替流程。
  - [ ] P0-5 审批与敏感读取：区分 park/team 审批，required-audit 失败前工资、合同薪资、保险金额和附件均为零数据/零 metadata/header/stream。
- [ ] A 使用全新资源完成 source→extract→migrate/seed→T0…T5→ledger/hash→三角色 API + desktop/390 browser 技术矩阵→反序 rollback/cleanup；六域与 UAT 完成前不得 rollback，修复后必须从头重跑。
  - [x] 新增最终 A/B pair contract、只读 preflight 与 fail-closed 总控：冻结 T2/T4/T5 口径，强制 A/B 相同 C/S/M 和完全不同资源，固定 provision→T0…T5→技术 UAT→25 项 P0→备份恢复故障→pair compare→T5…T0 rollback→cleanup 顺序；失败只做 registry-scoped recovery。当前 P0 仍为 `HOLD`，总控会以 `FINAL_PAIR_P0_HOLD` 停止，不能生成最终 PASS。
  - [x] P0 最终门禁矩阵已版本化并绑定 mapping-contract hash：按稳定顺序覆盖 park/team 审批及自审/跨树拒绝、档案 full/team/self 与 gap、合同 salary/document/reminder、保险金额、工资明细原子权限，以及附件审计/存储失败零敏感 header/零 byte；独立 loopback 执行器只生成 hash/布尔证据。该完成项只表示执行契约就绪，最终 A/B 仍须以全新隔离资源实际执行全部 25 项并产出观察证据。
  - [x] 已实现并冻结真实技术执行器：46 个 API 正负向检查与 28 个旧功能×角色检查在 desktop/390 两视口形成 56 个浏览器单元；使用隔离账号、真实 loopback HTTP、真实 headless Chrome、受控 0600 截图、敏感 DOM/存储清理与 C/S/M hash 绑定。当前只证明执行器契约和 Chrome 集成，尚未替代 A 的真实六域连续演练。
  - [x] 预演 A18 在 `f228fb98` 上从空库连续完成 T0→T5，并通过 59 个 API、22 个反向授权、46 个旧任务语义、28 个浏览器与 56 个 desktop/390 视口检查；随后按 T5→T0 反序回滚并实际 cleanup `residualCount=0`。因目标 PostgreSQL backup/restore/fault runner 尚未实现且后续 P0 修复会改变 C，此轮不计入最终 A/B，最终证据必须在新 SHA 上从头重跑。
- [ ] 固定逐字节相同的 `codeSha/sourceSnapshotHash/mappingContractHash` 后，B 使用另一套全新 DB/Compose/volume/container/ports/file/staging/evidence/accounts/run 重复同一连续序列。
- [ ] 比较 source/staging hashes、逐对象守恒式、global ledgers、canonical hashes、quarantine reasons 和 versioned UAT task-card 结果；独立 checker 审查且两轮逐资源 residual=0。

## Slice 6 — 固定源复核（无 Delta）

- [ ] 复核唯一停用源 backup/catalog/read-only proof 与既有固定 hash 一致，不创建 S1 或 delta。
- [ ] A/B 均以相同固定源和三年热窗口重建，比对 global/canonical hash 与 cold archive ledger。
- [ ] source unlock/hash drift 使候选失效；不再等待停写责任人或窗口。

## Slice 7 — 三角色 UAT、备份恢复与受控回滚

- [ ] 在指定最终签署环境创建 HR/manager/employee 账号，重放 Slice 5 同一 versioned 迁移数据任务卡并由真人执行 API + desktop/390 正负向矩阵；自动技术结果与真人 detached attestation 分离。
- [ ] 完成 backup→fault injection→restore-to-new-db→平台/HR/file hash 与 RTO/RPO 事实。
- [ ] 执行 T5→T0 反序 rollback 和全资源 cleanup；P0/P1=0，DB/container/Compose network/volume/role/directory/account/file/port/process/credential artifact 全部实际 `residualCount=0`，真人签署另行记录。

## Slice 8 — Go/No-Go 与生产入口（默认 HOLD）

- [ ] 编译 evidence bundle 和 reason codes；缺机器证据/签署即 `NO_GO`。
- [ ] 实现 production import 与 production restore 两个相互独立的 wrapper/workflow：各自 dry-run、pinned SHA、operation/run id、target/source backup/manifest/window/expiry 显示、不可复用的一次性 secret token、独立最小角色、撤权和监控 runbook；秘密不得进入日志/manifest/evidence。
- [ ] 证明普通 deploy 永不触发 loader，lab 演练不授权生产；无新一次性授权时 `productionImport=HOLD`。
- [ ] 真正生产导入另开执行任务；生产 restore 需要第二个明确灾备授权。
- [ ] 负向证明 import 授权不能执行 restore、restore 授权不能执行 import、旧 run/过期 token/不同 SHA 或 manifest 全部 `NO_GO`，普通 deploy 与 lab runner 均无法到达两个生产写入口。

## Common validation gates

- JSON schema/contract/negative tests、Shell/Node syntax、敏感日志扫描。
- template0 fresh、真实 predecessor upgrade、checksum replay、production seed 两次。
- migration-control/PG/API/Web unit/contract、lint/typecheck/build、desktop/390。
- 每轮提交/部署前 fetch 和三 SHA；所有临时资源实际 residual=0。
- 规划输入依赖测试：未决 T4/UAT/RTO-RPO/on-call 输入生成稳定 reason code；delta/stop-write 不再是输入或硬门禁。

## Risk and rollback points

- 不修改已成功迁移，不放宽 lab target 正则，不复用生产 volume/账号。
- 不以旧领域片段替代 A/B，不以 CI/health 替代业务 UAT/签署。
- 所有 destructive cleanup 只接受 resource registry 中解析完成的显式目标。
- 正式生产 import 和 restore 不属于本任务授权。
