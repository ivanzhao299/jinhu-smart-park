# Research: 可重复工资来源接入与7月正式流程承接

- Query: 不重做备份分析/切片/A-B，如何复用已准备来源，以真实同库回执承接93条7月正式试算，并持续导入后续月份及修订，保留现代可编辑业务？
- Scope: internal；静态设计审计，无数据库、运行时、测试、生产或Git操作。
- Date: 2026-10-20
- Workspace: `/Users/mac/.codex/worktrees/hr-team-approval-entry-20261018/jinhu-smart-park`；委派基线 `706a233e`，未以Git复验，发布由root独占。

## Findings

### 推荐方案与实际缺口

推荐**独立、强类型的工资月度来源扩展**：`/hr/imports/yuzhou/payroll/{preview,:id/commit,:id}` + 可重复离线文件生成器。复用既有增量入口的包规范化/哈希、加密暂存、操作ID恢复、权限/审计/幂等模式；工资采用独立操作与来源版本账本，不把任意工资结构塞入通用 `fields`，不复用其逐项部分成功语义。接入只保存来源事实，不批准政策、不写现代输入/规则有效状态、不计算或发薪。

- 通用 v1 仅十域：`packages/shared/src/hr-yuzhou-incremental.ts:17-19,38-76`；DTO顶层仅 version/sourceSystem/manifestId/extractedAt/items：`apps/api/src/modules/hr/dto/yuzhou-incremental-import.dto.ts:45-69`。没有工资/完整月范围/源名单证明契约。
- 通用服务 `hr-yuzhou-incremental-import.service.ts:78-132` 有加密暂存、包唯一性、操作行锁；`:104-120` 即使有conflict仍保存其它applied项并将操作标conflicted。工资目录、金额、名单必须整代原子提交，不能直接沿用。
- 通用账本 `database/migrations/000327_hr_yuzhou_incremental_import_ledger.sql:3-30` 支持稳定source key与逐项revision，但不提供工资源批次、全月册、同库资格；既有后续迁移扩展domain仍未纳入payroll。
- 专用T4仍是固定全档一次性入口：`scripts/hr-cutover/production-import-t4-followon-binding.mjs:4-28`、`production-import-t4-followon-writer.mjs:80-117`。不得把46,092/1,078,020改成93/2,295，不改T4封印及已应用319。

### 现有事实模型：可复用与不能假定的内容

- `database/migrations/000248_hr_payroll_legacy_history.sql:12-110`：book按scope/source/scheme唯一；item definition按book/原列名；item version、formula version独立编号；book-period按book/month唯一且关账值只能0/1。`:132-203`：legacy batch、snapshot、typed item与现代工资表隔离；金额numeric(20,4)，NULL/raw/decimal/text/date有严格组合约束。
- `000248:217-263` 禁止工资事实UPDATE及目录版本UPDATE/DELETE，published batch不可改；不能就地改snapshot，也不能用更新旧版本表示源修订。新月份可新增period；已有period关账变动要另存来源版本，不能更新原period。
- 最关键身份缺口：`scripts/transform-yuzhou-t4-payroll-history.mjs:178-207` 按 `sha256(table + 完整原行内容)` 分组，`sourceContentGroupSha256`随任何值变化；其payslip没有稳定原生PK声明。`:123-125,161` 的目录/关账身份是另一套明确键，不能把工资内容hash冒充稳定身份。
- `production-import-t4-followon-sql.mjs:20-29,36-38` 展示原列/公式/显式systemSummary到历史表的映射；只用有来源的summary填gross/deduction/tax/net，不能从现代算式或任意求和补总额。原导入员工按code匹配，未来入口应使用已验证的来源员工映射且核验scope/唯一性，不以姓名匹配。
- `000319_hr_payroll_reconciliation_source.sql:9,23-36,76-93,129-159`：冻结表operation_id直接FK到T4；builder要求staged、成功T4、current_database成功control、每个snapshot/item的唯一record_map ownership，再生成完整SHA。仅加新导入表不能自然通过它。
- 资格重复存在于 `hr-payroll-history.service.ts:521-546,609-646,878-913` 与 `hr-payroll-trial.service.ts:40-49,79-86`；`hr-payroll-frozen-source.ts:5-27` 重建SHA；`hr-payroll-formal-input.service.ts:203-211` 对所选batch census；trial `:50-64,130-150` 要完整books/名单。必须一起接入，不能只修freeze成功。

### 最小文件契约和一次完整月操作

1. 新契约 `yuzhou_payroll_source_v1`；保留 version/sourceSystem/manifestId/extractedAt，但新增明确 `month`、全部账套scope、来源实例标识、来源捕获/evidence hash、recipe/schema版本、`expectedHeadVersion/expectedHeadHash`、逐文件hash/count、目录与每账套记录/员工/value/NULL/异常计数、完整名单及目录集合hash。source捕获时间是信息，不是可靠修订顺序。
2. 一个包承载**一个月全部有记录账套的完整来源快照**及其所需item/formula定义；不是全历史重新切片。后续金额修订和新增员工用新月包与旧head做delta比较。首版不支持任意半月/单账套patch，防止“All books”只覆盖刚传入的局部数据。空账套也在受证明的范围清单中声明。
3. 包/DTO上限建议8MiB、50books、每book最多2000records、月总5000records、200000values，目录2048item versions/4096formulas；实际以更严格体积限制为准，超限整包拒绝，无静默切包。未来若需chunk，另建暂存+全包校验后一次commit，首版不冒充已经支持。93/2295不是2295个通用incremental items。
4. 离线生成器仅消费既有hash-bound prepared JSONL与manifest；按声明month做确定性投影，复用已保存来源，不读备份/不运行旧全档writer。输出私有0600包、count/hash清单、recipe hash与原文件hash引用；原文件只读。区分原sourceRowSha256（原manifest声明）与新规范化payload hash，不能重新计算并替换旧digest来“通过”。
5. 初次7月复用已核验三文件的93records/64employees/2295values、34=54、35=39、50items/9formulas；这些是root预检元数据，不是本研究重新验数。缺失的准确book-period/关账来源、稳定员工映射、目录覆盖与完整月范围证明须补最小既有来源引用或验证同库已有行，不可伪造0/1、空总额=0或全目录完成。
6. NULL、missing、empty、invalid、date/text与精确decimal保持区分，禁止JS Number金额转换；已知无效/歧义可加密暂存并显示计数/原因，但首版commit必须整代可表达、唯一映射，异常未解决不产生可用于试算的成功回执。拒绝后保留原文件与安全问题索引。

### 稳定身份、修订与当前名单

- 工资稳定键优先采用实际来源PK；若源表无PK，规范允许经过每次完整月唯一性证明的 `(sourceInstance, salaryTable/book, year-month, sourcePersonIdentity)` 自然键。内容hash仅为revision fingerprint。相同人同book/month多条或multiplicity>1必须报冲突；没有证据不能按行号/金额/姓名“去重”。此自然键是一项待验证的新适配契约，不是当前T4已经证明的主键。
- 源身份映射表保持稳定logical ID；每次事实修订追加immutable revision，绑定原文件、原row hash、新payload hash、前revision和新snapshot ID。同一身份的新内容创建修订；同一内容重复/noop不产生新事实代。源人员编号/月份/账套改动不能自动推断为同一人/同一记录，要求明确源更正链，否则按异常处理。
- 目录沿用book/definition identity，变化的item/formula追加版本（formula键含实际legacy ID，版本分配锁定）；新source generation显式绑定精确版本集合，不按最大version/展示名猜。新增原列必须有schema/映射证据；item类型/精度/公式condition/顺序变化保留原值，公式以manual_review进入，现代已审规则不被重写或自动“升级”。
- book名称/关账等旧append-only单行不能被新源覆盖：新来源版本保存原始元数据和关账证据，旧period只作book/month稳定关联。新period创建仍需真实close值；若三文件缺失，先补既有closes证据，不借此次扩展放宽旧约束。现代HR period关账与旧源close分别处理。
- 全月head由服务器唯一维护，包含scope/sourceInstance/month、generation、complete book-set/roster/catalog hashes及effective batch；每个更改产生完整不可变month-generation batch和其snapshot/items，便于现有batch-based census/试算复用。存储会重复未改行，但逻辑身份不重复；同内容整包noop避免重复代。这是以月度有限存储换取最小消费者改动的明确取舍。
- 新完整导出少了旧键：首版报 `SOURCE_ROSTER_REMOVAL_REQUIRES_PROOF`，不删旧行、不把新名单默认为完整。若业务需要源撤销，后续明确tombstone/correction证据并生成新代；旧版本始终可审计。新增账套与新人员必须进入完整月证明和计数，不能只由客户端count声明。
- 数据迟到可以修订旧月份的**来源**；即使现代period已关闭，也不得改正式工资/已确认输入，只报告source changed，后续业务走现有更正流程。仅timestamp较新不足以覆盖head；需要expectedHead和明确前代绑定。旧包重放返回原操作结果并标当前head已前进，不倒退head。

### 原子性、T4共存、真实回执

- preview严格验证类型、字节数、hash/计数、源实例范围、稳定身份、映射、完整名册与expectedHead，返回added/changed/unchanged/conflict元数据；保存加密原包与preview fingerprint。commit重新验证，不信任preview旧结论。
- 一个DB事务按scope/source/month取得统一advisory/head锁，目录按固定顺序锁，验证源head CAS及员工映射版本，然后写目录新版本、完整generation facts、revision/ownership、操作回执并CAS推进head；必需审计失败或任一冲突整代回滚。不同包同head只能一个成功；相同包并发返回同操作。数据库unique约束兜底，不能只靠进程锁。
- 新操作表承接preview/committed状态、encrypted payload、package/content hash、counts、actor、同库身份、前代与new batch；新ownership表以scope+operation+target table+target ID绑定每一事实和目录引用。业务成功回执仅由实际事务产生，客户端不得提交“succeeded”/数据库名/伪造control；源文件完整性与来源真实性/业务批准分别表述。
- DB identity由服务器取 `current_database()` 和database OID并绑定操作；回执FK与内容/ownership在当前连接库逐次核验。复制/恢复到不同目标不能自动当作本库导入证明，必须实际受控接入；这不是独立防DB管理员伪造的认证机制。
- T4旧batch/operation/control/record_map完全保留。首次接触已有T4月：验证原成功同库回执、所有book/roster/fact hash，建立**引用式baseline anchor**；不补造旧通用ledger，不重写T4 map，不重复插入已有目录。与基线等价的包noop；变化才生成新来源代。无T4的本地空库直接由新真实月包导入，使用新receipt类型。
- 当前选择规则：有该月typed head时，只以head对应完整generation作为新试算来源；无head继续原T4路径。旧T4/旧冻结/旧业务记录保留可审计，但已有更新head时不能默默把旧source作为“当前”试算。现有现代规则、草稿手工值、输入确认、formal runs/payslips不被自动改写；操作员明确刷新准备并自行保存新输入版本。
- 新包的export hash不得填进 `source_backup_hash`假称备份。新迁移为legacy batch增加明确origin discriminator及source evidence引用，允许typed分支backup hash缺省，旧T4分支保持原真实backup检查；已存T4字段/约束语义不变。

### 冻结及正式消费者兼容方案

新增前向迁移建立typed receipt/ownership/head/identity-revision并扩展冻结表为互斥来源分支：旧 `sourceKind=t4` 保留原operation FK及v1 payload检查；新 `sourceKind=payroll_source_v1` 用独立receipt FK、generation与formatVersion2检查。不能仅删除FK/放宽为任意字符串。旧行无改写、旧SHA不重算。

增加类型化资格读取器/数据库构建函数：旧分支继续调用原319函数；新分支校验committed本库receipt、scope/month/current head、完整set/hash/count、全部ownership、精确目录版本，然后构造同形snapshots/items并附新来源身份。冻结函数分别派发并保留原幂等unique+expected hash；原319迁移文件不修改。新冻结hash包含generation、目录/名单hash；head前进时旧source读取报stale。

`lockCurrentPayrollSource`、trial options/receipt/census、history setup/period discovery/cohort/frozen reader，以及readiness/coverage脚本共享相同资格规则；source locks新增head/receipt/ownership/definition集合，锁序统一。旧T4分支严格保持原检查。保存中的旧formal evidence继续按冻结版本读取，不用“当前head”重新解释既有工资。

`PayrollTrialSelection`的legacyBatchId/month/books可继续使用（`packages/shared/src/hr-payroll-trial.ts:7-20`）；options/evidence只添加sourceKind/generation/current/superseded元数据。完整batch generation使现有精确名单与ALL-books验证保持成立；导入可用与政策已审仍分开。

### 最小实施文件与验证顺序

1. 新增 `packages/shared/src/hr-yuzhou-payroll-source.ts`，导出于 `packages/shared/src/index.ts`；新增API `dto/yuzhou-payroll-source.dto.ts`、`hr-yuzhou-payroll-source.controller.ts`、`hr-yuzhou-payroll-source.service.ts`（可拆纯验证器）；注册 `apps/api/src/modules/hr/hr.module.ts`。不改通用十域协议语义。
2. 新增下一个**实际空闲编号**的 `database/migrations/NNNNNN_hr_yuzhou_payroll_source_ingress.sql`：上述typed ledger/head/lineage、batch provenance及冻结互斥分支/构建派发函数，scope FKs、CAS、append-only guards和索引；完整fresh+upgrade演练，保留319/316旧文件。编号须root实施时复核，不能依据本研究预占。
3. 改 `hr-payroll-frozen-source.ts`、`hr-payroll-history.service.ts`、`hr-payroll-trial.service.ts` 统一资格；改 `hr-payroll-formal-input.service.ts`仅在需要增加head锁/metadata时；必要shared history/trial响应类型同步。正式计算/审批引擎无需修改。
4. 新增 `scripts/hr-cutover/build-yuzhou-payroll-source-package.mjs` 与可重复preview/commit/status命令；扩展 `describe-yuzhou-import-interface.mjs` 及生成的 `docs/hr/yuzhou-import-interface.v1.json`显示独立工资扩展，不假称十域builder已支持。更新 `scripts/diagnose-hr-payroll-{readiness,source-coverage}.mjs`，明确全历史事实计数与当前代计数，禁止把superseded行重复当现行名单。
5. 权限复用：预览/提交同时要求当前scope、HR_PAYROLL_MANAGE、HR_PAYROLL_RECONCILIATION_REVIEW和park-level历史金额读；status至少同scope相应读能力。沿用module guard、captureBody=false、既有真实幂等拦截器（只保存元数据响应）、PartySensitiveDataService加密暂存。无需新通用认证/授权项目；具体grant不由导入器自动授予。
6. 自动验收：规范化/原digest篡改、同包重试/换manifest相同内容noop、跨包并发CAS、相同键新内容、旧包迟到、缺book/缺row/缺定义、重复person/multiplicity、NULL/缺值/精度/unknown列、目录版本漂移、跨scope、无金额权限、审计失败全回滚、本库receipt/ownership伪造、旧T4共存和旧freeze拒绝漂移。真实Postgres锁等待试验需覆盖import与freeze/trial双向并发。
7. 集成回归：已有 `hr-yuzhou-incremental-import.pg.spec.ts`（旧十域不变）、`hr-payroll-reconciliation-source.pg.spec.ts`、`hr-payroll-preparation-cohort.pg.spec.ts`、`hr-payroll-trial.pg.spec.ts`、`hr-payroll-formal-http.pg.spec.ts`；新增真实HTTP工资入口测试，全部原迁移fresh/upgrade、shared build及API/Web typecheck/lint。实际命令以当前package scripts与owned runner配置为准，不在本研究执行。
8. 最终私有验收包：已有93来源→新真实typed月包导入→正常来源预览/冻结34/35→正常作者规则草稿→独立合成reviewer→两份完整输入（54/39）及独立确认→一次ALL-books transient trial。所有规则/回执标“诊断候选，未获业务确认”，保留NULL0、质量/缺勤扣补、U487未批政策清单；使用现有calculatePrepared。校验64人/93record/2295value与50item/9formula关联、所有差异/不同比较状态及hash，不能用算术内核调用代替API。
9. 公开只留count/hash/政策状态，私人原包/完整响应留0700/0600。分别记录persisted formal-run计数、trial请求/成功调用计数和失败原因；trial按设计不建run。实际页面desktop/390验证由root执行，涉及新source metadata只做现有页面必要兼容。

### 取舍、相关规范与外部参考

整月不可变generation比“逐行更新现有T4”多用空间，换取现有batch-based freeze/census/trial最大复用、明确current head及不可变历史；首版遇到缺行/源撤销、超限、无稳定键证明时失败，不交付含猜测的局部完成。未来真正小patch或大月分块必须保留同一最终完整代契约，非本包前置基础设施。

已读相关规范：`.trellis/workflow.md`；`.trellis/spec/api/backend/{index,hr-management,yuzhou-reusable-staging-entry,hr-payroll-reconciliation-source,hr-payroll-formal-rules,hr-payroll-formula-review-workflow,hr-payroll-formal-trial-comparison,hr-payroll-source-period-discovery}.md`；`.trellis/spec/shared/backend/index.md`；任务prd/design/implement/implement.jsonl与两份既有研究。外部参考：无，本结论只依当前仓库契约；未引入第三方依赖/API假设。

## Caveats / Not Found

- 当前没有找到能重复工资增量、生成真实scoped receipt且保留现代编辑的现成入口。此前formal-flow-gap中“不是新增导入”的结论依赖隔离库已有合格来源；新研究明确该前提未成立时需此来源扩展。
- 现有三文件hash验证不证明额外closes/period metadata、员工映射、天然键唯一性、全月全账套清单、源撤销或后续系统导出接口；这些须从精确现有来源/同库映射获得证明。没有要求重跑备份或全档A/B。特别是缺close值时不能承诺三文件足以独立建空库全部依赖。
- 固定source schema只证明被核验的salary01..35与scheme1..35。后续出现新scheme/列类型/公式语义必须显式报告适配缺口，不能静默丢列或扩原校验范围。
- 此设计未实现、未测试、未查运行库，所有生产/本地真实导入仍未执行；只写本研究文件。原来源预检由root提供，本研究未打开私人行/金额/凭据。记忆仅辅助沿用隔离工资与单writer边界，当前能力判断均以本次源码为据。
