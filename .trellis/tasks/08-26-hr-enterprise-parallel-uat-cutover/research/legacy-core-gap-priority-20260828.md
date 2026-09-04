# 玉舟 HR V10 核心域缺口优先级（2026-08-28）

## 结论与边界

本审计仅覆盖 reviewed inventory 中的 12 张核心表（260 个字段）：`person/family/knowhow/ticket/person_user/person_user_item`、`readjust/readjustitem/jobstatecode`、`compact/compact_c/compacttypecode`。现有 mapping contract、verifier 与 `000267` 已能证明字段被分类并可进入不可变 raw archive；这不等于字段已进入新系统实体、API 和页面。生产历史导入继续 HOLD，本清单不授权 loader、提交或部署。

当前可确认的强项：工号跨软删除历史唯一且禁止修改；在线任职事件可生成 JZ/DZ/LZ/FZ；异动已有前后组织/岗位/状态快照；合同存在续签变更链和三协议字段；敏感员工档案有 full/masked projection 与审计。主要缺口是“raw 可追溯”尚未转换为“业务可使用”。

优先级：P0 阻断旧员工资料或核心流程可用性；P1 有 raw 兜底但影响完整复现/审计；P2 可在上线后治理。每项只有在目标符号与自动化测试真实存在后才可从 `gap` 改为 `mapped/tested`。

## P0：导入及核心业务上线前必须闭环

| ID | legacy table.field | 新系统绑定（entity / API / page / permission / test） | 当前缺口原因 | 可实施验收 |
|---|---|---|---|---|
| P0-01 | `person.idcard,sex,birthday,race,nativeplace,political,marital,health,addr,tel,handtel,email,edu,secedu,speciality,degree,graduatescholl,graduatedate,language,jobtitle,jobgrade` | `HrEmployeeProfileEntity` / `GET,PUT /hr/employees/:id/profile` / `/hr/employees` 档案抽屉 / `HR_EMPLOYEE_PROFILE_READ,MANAGE` / profile service+PG tests | `000270` 和页面字段已存在，但 T0 只装载核心身份；其余 `person` 字段目前仅进入 `employee_profile_raw`，迁移后页面仍为空。 | 新增显式字段转换与枚举字典；身份证加密/掩码/指纹；未知值隔离且不猜测；fixture 导入后逐字段 API full/masked 与审计测试通过。 |
| P0-02 | `family.id,person,member,rela,birthday,jobunit,jobname,political,tel` | `hr_employee_family` / `GET,POST /hr/employees/:employeeId/records` / 员工档案“家庭成员” / family read/manage permissions / lifecycle record tests | T5 仅写 `hr_legacy_t5_record(employee_profile_raw)`，未物化到在线结构表；旧家庭成员在页面不可见。目标模型还需明确单位、职务、政治面貌字段去向。 | 建立 legacy id 幂等键；关系/日期校验；缺失目标字段先扩展模型或签署 raw-only disposition；重复导入零新增。 |
| P0-03 | `knowhow.id,person,knowhow,grade,memo` | `hr_employee_skill` / records API / 员工档案“技能” / skill read/manage permissions / lifecycle tests | 仅 raw archive；`grade` 无受审阅词典，不能安全映射熟练度。 | 固化 grade 对照表与 unknown quarantine；memo 无损保留；页面/API 与源计数、内容散列核对。 |
| P0-04 | `ticket.id,person,ticket,ticketno,tickettype,getdate,validdate,ticketfilename,memo,org` | `hr_employee_credential` + protected attachment / records API / 员工档案“证照” / credential/document read/manage permissions / projection+attachment tests | 仅 raw archive；证件号敏感策略和 `ticketfilename` 实体文件定位尚未闭环，只有名称/路径不能视为附件迁移。 | 证件号加密/掩码/指纹；发证机构、备注、有效期有明确列；文件缺失进入清单，存在文件经 MIME/hash/授权下载验证。 |
| P0-05 | `person.jobstate` + `jobstatecode.code,name` | `HrEmployeeEntity.employmentStatus/employeeType/status` / employee list/detail / `/hr/employees` / employee read/manage / T0 transform+PG tests | T0 CASE 不能证明覆盖完整旧字典；默认分支会丢失业务语义。当前“jobstate 已映射”只证明有规则证据，不证明每个实际代码有签署决定。 | 从真实字典生成穷举 decision table；每个代码唯一映射或 quarantine；禁止 silent default；各代码 fixture 测试并由 HR 签署。 |
| P0-06 | `readjust.readjusttype,state` + `readjustitem.code,name` | `hr_employment_event.event_type/status/legacy_*` / `GET /hr/employees/:id/events`、statistics / 员工异动页 / `HR_EMPLOYMENT_EVENT_READ,HR_EMPLOYMENT_TRANSITION` / T1+service tests | loader 使用 `hire/transfer/departure/resume/legacy_unknown`，在线流程使用 `start_probation/confirm_employment/transfer/suspend/depart/resume`；同义事件无法稳定筛选统计，readjustitem 未成为受控词典。 | 建立 canonical event vocabulary 与 legacy label；未知类型不可混入正常统计；JZ/DZ/LZ/FZ、前后快照、筛选统计逐类型测试。 |
| P0-07 | `compact.compacttime,totalcompacttime,continuetimes,continueyears,jddate` + `compact_c.*` | `HrContractEntity.contractTermMonths,signatureDate`、`HrContractChangeEntity` / contracts detail+changes APIs / `/hr/contracts` / contract read/team/self/manage / T2+service tests | loader 已有续签记录，但未把上述期限、累计续签、签订日完整装入现有结构字段；续签次数不能只靠展示时猜测。 | 明确源字段单位与优先级；续签链按 legacy id/sequence 可重放；累计期限可由链重算并与源值对账。 |
| P0-08 | `compact.compactfile,compacttext` | protected file/evidence entity / contract detail+download API / 合同详情 / contract read scopes + document permission / auth+hash tests | 当前只保存 file/text presence，无法查阅原合同正文；raw presence 不构成证据迁移。 | 文件逐件存在性、hash、MIME、大小清单；正文受控存储；self/team/read 权限不得越权；缺件明确 residual，不伪造成功。 |
| P0-09 | `compact.enddate,state,person` | contract reminder work item/outbox / reminder query+ack API / 合同到期工作台 / 独立 reminder run/read/ack 权限 / scheduler idempotency tests | 当前仅有 expiry filter 和前端 60 日计数，没有定时生成、接收人、已读/处理、重试语义，不能称为“提醒流程”。 | 30/60/90 日策略可配置；同合同同窗口唯一；终止/续签后撤销旧提醒；定时任务重复运行零重复，具备审计。 |

### 2026-09-05 实现状态校正：T5 非文件员工资料

本节补充本审计完成后的代码与契约状态，不改变上表的历史现场遍历边界，也不将隔离测试当作生产导入授权。

P0-01 至 P0-04 的目标结构化投影现已在代码中实现：`hr_employee_profile`、`hr_employee_family`、`hr_employee_skill` 与 `hr_employee_credential` 均以旧系统源身份/行散列为幂等键，保留受控原始归档作为对账依据。非文件 T5 写入器要求精确目标表白名单、现有 T0 员工映射和事务内审计记录；家庭/证照敏感值使用加密、掩码和指纹列，技能未知等级与未映射员工进入受控隔离，绝不猜测或静默降级。旧照片、合同/证照二进制仍不属于此投影，继续保持独立证据迁移边界。

已验证的契约包括：

- profile、family、skill、credential 四域无原始对象保留的阶段适配；
- 精确源绑定与目标表集合校验，漂移或歧义员工映射在写入前失败；
- 记录映射、审计写入、重复保护，以及仅删除本次记录的回滚；
- 隔离记录、已写目标行的反序回滚与 `residualCount=0`；
- T5 → T3 → T4 → T4 rollback → T3 rollback → T5 rollback 的连续 runner 顺序。

因此，这四项的当前分类为 **代码实现及隔离契约已完成，当前精确 C/S/M 候选仍待串行 A/B rehearsal 和三角色运行验证**。它们不得在这两个运行证据完成前标记为生产兼容或解除 `productionImport=HOLD`。

### 2026-09-05 实现状态校正：合同到期提醒

P0-09 的到期提醒流程现已实现为独立的合同提醒域，而非合同列表中的静态到期筛选。当前实现包括版本化窗口策略、按合同/窗口/规则版本/接收人计算的唯一去重键、HR/直属负责人/员工三类明确接收人、可取消 outbox、读取/确认/办结/撤销的受控状态机，以及读写所需的原子权限和敏感读取审计。合同终止或续签会取消未完成提醒，重复运行不会重复创建同一窗口的待办。

已验证合同提醒的策略、去重、状态转换、范围投影、越权隐藏、审计和 25 项 P0 三角色运行矩阵契约。当前分类为 **代码及运行矩阵契约已完成，尚待当前精确 C/S/M 隔离 A/B 运行证据**；这不解除生产导入 `HOLD`，也不证明旧合同正文或附件二进制已经迁移。

## P1：核心上线后、业务验收前补齐

| ID | legacy table.field | 新系统绑定目标 | 未覆盖原因与实施要求 |
|---|---|---|---|
| P1-01 | `readjust.oldpay,pay,oldgradepay,gradepay,oldbaseepay,baseepay,oldjobpay,jobpay` | 敏感 append-only employment compensation delta entity / 受限 event detail API/page / payroll+event 双权限 / projection tests | 当前仅 raw；不得塞入普通异动快照暴露。需 HR、薪酬共同确认口径，金额 decimal 精度、前后值与审计不可变。 |
| P1-02 | `readjust.approve,operator,username,departmentflag,jobflag,payflag,otherflag,pausetodate,awaytype` | historical workflow/audit detail / event detail / HR audit permission / transform tests | 审批人可能是旧用户名且无法对应新账号；应保留 legacy actor label 与来源，不伪造新 user id。暂停截止日、离职类型需字典决定。 |
| P1-03 | `person_user.*` + `person_user_item.*` | employee custom-field definition/value entities / profile API/page / profile manage + field-level read permissions / schema/value tests | 旧自定义字段目前 raw-only；名称、数据类型、是否敏感与废弃状态未审阅。先生成数据字典，逐项决定结构化或合规归档。 |
| P1-04 | `compact.state` + `compacttypecode.code,name,sort` | contract status/type dictionary / contract APIs/page / contract permissions / exhaustive dictionary tests | 类型基本可展示，但真实状态全集、失效/终止/续签的优先级需用真实字典与样本闭环；禁止未知状态自动当 active。 |
| P1-05 | `compact.testpay,basepay,jyxzxy,bmxy,pxfwxy` | contract sensitive projection / detail page / contract read scope plus compensation-sensitive grant / projection tests | loader 有字段不等于所有列表/详情均安全可见。工资必须与普通合同阅读拆分；三协议须在创建、导入、详情一致显示。 |

## P2：可延期治理，但必须保留可追溯结论

| ID | legacy table.field | 目标/处置 | 原因 |
|---|---|---|---|
| P2-01 | `person.photo`、证照/合同旧二进制引用 | protected evidence migration + missing-file manifest | 当前 contract 明确 `BINARY_FILE_EVIDENCE_ONLY`；在取得真实文件根目录和 hash 前保持 gap。 |
| P2-02 | `person.password` | 永久不迁移；新认证重置流程 / auth tests | `LEGACY_CREDENTIAL_NOT_MIGRATED` 是正确安全处置，任何兼容方案都不得恢复旧密码或 hash。 |
| P2-03 | `person` 未被现代表单采用的历史/物理/备注字段 | 审计型 raw viewer/export / 专门 legacy archive permission / tenant-park isolation tests | 可保留 raw，不应为“100%”盲目扩展在线员工实体；需 HR 对每字段签署 retain/archive/delete。 |
| P2-04 | raw archive 全域 | 管理员检索、授权导出、保留期与删除审计 | `000267` 保证残余可入库，但业务人员尚无受控核查面；上线后补治理工具，不得开放通用 JSON 给普通 HR。 |

## 建议执行顺序与门禁

1. 先锁定 `jobstatecode/readjustitem/compacttypecode` 真实字典快照和 HR 签署 decision table，完成 P0-05/06；未知值保持 quarantine。
2. 在隔离数据库实现 profile/family/skill/credential 的结构化物化（P0-01~04），保持 raw archive 同时存在用于对账，不从 raw 反向覆盖在线修改。
3. 完成合同期限、续签链、正文附件和真正提醒工作流（P0-07~09），再做三角色（HR/经理/员工）API 与浏览器矩阵。
4. 每批执行 source count → staged count → structured count → quarantine count 守恒、字段散列、重复导入零增量、反序回滚 residual=0。失败不得进入下一批。
5. P1 字段须由 HR/薪酬/法务按职责签署；P2 必须形成字段级 disposition。只有 target entity/API/page/permission/testRef 均真实存在且通过时，mapping verifier 才允许 `mapped/tested`。

## 基线证据（当前分支）

- `scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json`
- `scripts/hr-cutover/verify-legacy-core-domain-mapping.mjs`
- `scripts/extract-yuzhou-t0.sh`、`scripts/load-yuzhou-t0.sh`
- `scripts/extract-yuzhou-t1-employment.sh`、`scripts/load-yuzhou-t1-employment.sh`
- `scripts/extract-yuzhou-t2-contracts.sh`、`scripts/load-yuzhou-t2-contracts.sh`
- `scripts/load-yuzhou-t5-legacy-history.sh`
- `database/migrations/000252_hr_lifecycle_employee_records.sql`
- `database/migrations/000266_hr_employee_identity_event_number.sql`
- `database/migrations/000267_hr_legacy_core_residue_domains.sql`
- `database/migrations/000270_hr_employee_basic_profile_parity.sql`
- `apps/api/src/modules/hr/hr.controller.ts`、`hr-lifecycle.controller.ts`、`hr.service.ts`、`hr-lifecycle.service.ts`
- `apps/web/app/hr/employees/HrEmployeesClient.tsx`、`apps/web/app/hr/contracts/HrContractsClient.tsx`

本报告是代码与受审阅 inventory 的静态差距审计，不替代玉舟客户端逐页遍历、真实数据库 rehearsal A/B、三角色 UAT 或三方真人签署。
