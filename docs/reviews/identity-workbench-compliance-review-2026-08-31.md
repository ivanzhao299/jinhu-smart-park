# 共享房产控制面·身份核验工作台设计/实现/使用说明与大陆运营合规核查

> 核查日期：2026-08-31
>
> 审计基线：`97328ce51a00c135132bcdbdb1a35691a5ed3e57`（当时 `origin/main`）
>
> 核查性质：静态代码、设计合同、测试和公开法源的工程审计；未访问生产、未抽取真实身份数据、未修改产品代码。
> 重要声明：法规部分仅是基于公开法律框架的工程对照，不构成法律意见。业务上线、属地旅馆业许可、公安接口、留存期限及个人信息处理规则必须由法务、数据合规负责人和属地公安主管部门复核。

## 1. 结论摘要

### 1.1 总体结论

当前实现对原设计的技术闭环完成度较高：顶层身份工作台、六状态、草稿→提交→人工领取/分派→决定、maker-checker、冻结快照和文件摘要、事务幂等、审计、敏感字段加密/脱敏、受保护下载、民宿实名入住原子消费链均有实现证据。

但它尚不能据此认定满足中国大陆住宿业生产运营要求。主要上线阻断项是：

1. 证件类型仅支持居民身份证与笼统 passport，不能结构化覆盖港澳台居民、外国人等有效证件，也没有证件有效期、身份证校验码或疑似伪造处置。
2. 没有公安治安住宿登记系统上报出口；本地核验成功不等于完成法定住宿登记/报送。
3. 没有未成年人住宿“五必须”所需数据与流程。
4. 同意状态缺少告知版本、用途、时间、渠道、单独同意等证据；没有身份数据留存、到期删除/停止处理、主体权利受理闭环。
5. 加密服务在专用密钥缺失时会继续回退到 IoT/JWT 密钥乃至固定开发 secret，生产未 fail closed。

因此结论是：**原设计的人工核验控制面基本闭环；大陆住宿业生产合规闭环不成立，必须在上线门禁中 fail closed。**

### 1.2 使用说明状态

仓库没有一份面向运营人员的“身份核验工作台”完整使用说明。生产文档只列入口，架构文档仍停留在共享 Party API，UAT 文档明确为待 UAT；没有覆盖建档、建草稿、证件/证据、提交、领取/分派、通过/拒绝、撤回、审计、异常恢复和权限前置条件的操作手册。

### 1.3 问题统计

| 等级 | 数量 | 含义 |
|---|---:|---|
| P0 | 6 | 大陆生产上线合规/数据安全阻断或高影响风险 |
| P1 | 6 | 功能、统一控制面或隐私最小化缺陷 |
| P2 | 3 | 体验、可运维性或文档缺口 |
| 合计 | 15 | 本报告不开实施 Issue，等待用户批准后再拆解 |

## 2. 范围、方法与证据边界

### 2.1 核查范围

- 设计：`.trellis/tasks/archive/2026-08/07-30-pr192-b-identity-control-plane/{prd,design,implement}.md`。用户初始指向 `2026-07`，当前仓库实际归档目录为 `2026-08`。
- 设计权威：`.trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-identity-control-freeze.md`，因为归档 PRD/design 明确声明该 freeze 为唯一合同输入（归档 `design.md:5-17`）。
- Web：Party 工作台/详情、identity submissions 列表/详情、共享 control-plane 与文件组件。
- API/DB：property-identity、property-operations Party、文件授权、`000185_property_b_identity_schema_expand.sql`。
- 权限：shared Track-B routes/permissions/bundles/endpoint manifest，以及统一 `access-manifest`。
- 消费方：民宿 check-in 原子链、住房 lease/occupancy 链。
- 文档：architecture、deployment、product、UAT、既有 review。
- 法规：全国人大、国务院/司法部、公安机关和地方政府官方公开材料。

### 2.2 判定口径

- **已实现**：当前代码/数据库合同和直接测试能证明判据。
- **部分实现**：主路径存在，但覆盖、配置门禁、测试或消费方不完整。
- **未实现**：在明确检索范围内没有找到对应字段、接口、任务或文档。
- **实现超出设计**：当前产品存在，但原 B-0.5 设计明确不负责或未要求。
- **工程推断**：根据静态数据流得出的结论，明确与事实证据分开。

没有生产配置与运行数据，因此本报告不能证明生产实际密钥、对象存储 ACL、公安接口备案或属地许可状态。

否定性检索在审计基线执行，范围为 `apps/api/src/modules/{property-identity,property-operations,homestay,housing,files,audit}`、`apps/web/app/assets`、`apps/web/components/property`、`packages/shared/src/property-business`、`database/migrations` 和 `docs`（排除 HR）。核心检索词包括 `公安|police|治安|third.?party|第三方|CTID|retention|保留期|privacy_notice|隐私|minor|未成年|birth_date|date_of_birth|identity.*expire|证件有效期|export|导出|注销|delete|删除`。因此本文“未找到”均表示**在该列明范围与检索词下未找到**，不是对仓库外系统或生产配置的绝对断言。

## 3. 设计要求清单与实现闭环矩阵

| ID | 设计要求与出处 | 可检验判据 | 当前实现证据 | 状态 |
|---|---|---|---|---|
| IDY-01 | Identity 使用顶层 list/detail 工作台和 10 条 canonical API；Party 仅 profile/summary/deep-link。归档 `prd.md:58-73`、`design.md:77-108` | 无 Party-scoped canonical editor/retry；菜单与路由指向 `/assets/identity-submissions/**` | `packages/shared/src/property-business/track-b-routes.ts:13-20,65-74`；`apps/web/lib/menu.ts:103-140`；`apps/api/src/modules/property-identity/property-identity.controller.ts:35-212` | 已实现；但旧 `/parties/:id/verification` 路由仍保留，并经 `LegacyPartyIdentityAdapter` 适配 canonical command，见 IDY-13 |
| IDY-02 | exact 六状态：draft/pending_verification/verified/rejected/withdrawn/superseded。归档 `prd.md:75-89`；freeze `:388-411` | DB、shared、API、Web 同一枚举，无旧 alias | `database/migrations/000185_property_b_identity_schema_expand.sql:851-854,920-931`；`packages/shared/src/property-business/track-b-contracts.ts:23-31` | 已实现 |
| IDY-03 | 合法转换、draft 不可撤回、pending 无 decision 才可撤回；rejected/withdrawn/verified 通过 supersede 新草稿，不设 retry。freeze `:399-411,622-642` | 所有动作受状态、版本和 decision 约束 | `database/migrations/000185_property_b_identity_schema_expand.sql:1163-1322,2152-2249,2333-2419`；`apps/api/src/modules/property-identity/legacy-party-identity.adapter.ts:23-134` | 已实现 |
| IDY-04 | Create 只建空草稿；Update 写 `documentType/identityNumber/pendingFileIds`，证件类型只冻结为 `id_card/passport`，文件 0..20。freeze `:978-1038` | 字段成对出现、证件校验、文件 UUID 去重/上限/完整 replacement | `apps/api/src/modules/property-identity/dto/identity-submission.dto.ts:40-89`；`apps/api/src/modules/property-operations/party-identity.policy.ts:1-19`；Web `PropertyControlPlaneClient.tsx:590-620,680-695,753-793` | 已实现；大陆证件覆盖不足是设计外 P0 |
| IDY-05 | Submit 在同一事务冻结不可变 snapshot、file version/SHA-256、queue/policy；snapshot/decision/audit 不可改删。freeze `:533-579,808-894` | 文件归属、ready、digest 与版本重验；不可变约束/trigger | `database/migrations/000185_property_b_identity_schema_expand.sql:1393-1530,1779-1958,2815-2850`；`apps/api/src/modules/property-identity/property-identity.service.ts:273-439` | 已实现 |
| IDY-06 | 人工队列 submit→claim/reassign/revoke→assigned verifier decide；list/count 同一 eligibility。归档 `design.md:55-72`；freeze `:587-620` | 只有当前分配核验人决定；拒绝/重分派/撤销有原因与审计 | `property-identity.service.ts:441-530,1042-1053`；migration `:2042-2111,2333-2419` | 已实现；未发现自动/第三方核验 provider |
| IDY-07 | maker-checker 与 actor separation；wildcard 不绕过。freeze `:31-45,581-585` | maker 不能自审，权限叠加也不能绕过 | migration `:2359-2364`；file access `apps/api/src/modules/files/file-business-access.service.ts:660-704` | 已实现 |
| IDY-08 | 7 条 mutation 要求 header `X-Idempotency-Key` 与 body `clientKey` 相等；receipt、mutation、audit/outbox 同事务；同 key 同请求重放、不同请求冲突。freeze `:1040-1052` | header/body 前置校验、唯一 receipt、hash conflict、completed replay | controller `property-identity.controller.ts:91-195`；service `property-identity.service.ts:816-887,940-957` | 已实现 |
| IDY-09 | 全局锁序为 source→Party→submission→snapshot→file→audit/outbox；verifier 复用调用方事务，不返回 boolean。归档 `design.md:118-141`；freeze `:1198-1228` | 民宿 transaction manager 传入；并发文件漂移整笔回滚 | `property-identity.service.ts:713-812`；`homestay-stay-command.service.ts:168-223`；`homestay-identity-checkin-atomic.pg.spec.ts:217-283` | 已实现，且有真实 PostgreSQL 原子测试 |
| IDY-10 | active asset + identity page + exact action + tenant/park/data scope；Party 五权互不蕴含。freeze `:47-121,952-959` | controller、Web、service visibility、文件二次授权一致 | `property-identity.controller.ts:35-212`；`property-identity.service.ts:150-225,1042-1053`；`track-b-endpoint-permissions.ts:95-125` | 已实现；统一六层 access-manifest 缺口见 P1-04 |
| IDY-11 | 默认只返回 masked metadata；full identity/cipher/hash/storage key/download URL 永不由 identity route 返回；protected download 重验并审计。freeze `:1123-1128` | 投影权限裁剪、blob 独立下载、审计 | `property-identity.service.ts:975-1039`；`IdentityEvidenceList.tsx:13-79`；`files.controller.ts:107-123`；`files.service.ts:283-320,348-389` | Identity surface 已实现；Party 详情仍可优先展示 full identity，见 P1-06 |
| IDY-12 | append-only decision/assignment audit/outbox，审计需 sensitive+audit。归档 `prd.md:130-141`；freeze `:644-806,1130-1155` | 决定事实唯一、audit actor/reason/evidence、无 raw secret | migration `:2815-2850,2911-2918`；`property-identity.service.ts:558-617,910-935` | 已实现；留存/删除策略不在原设计且未实现 |
| IDY-13 | legacy Party API 只能适配 canonical command，Party 返回 summary/deep-link。归档 `design.md:98-100`；freeze `:1157-1194` | legacy 不直写保护列；summary 来自 canonical runtime | `parties.service.ts:260-337,433-444`；`parties.service.spec.ts:392-449` | 已实现；Party UI deep-link 文案仍称“目录” |
| IDY-14 | check-in verifier 必须消费 current verified Party、consent granted、冻结 identity/file evidence，并与入住同事务。freeze `:1198-1228` | 全体 guest 均通过；失败不写入住/action log | `homestay-stay-command.service.ts:180-194,209-223`；`property-identity.service.ts:713-812`；PG spec `:217-283` | 已实现 |
| IDY-15 | housing/homestay adapter 属后续 B-2，B-0.5 本身明确不包含。归档 `prd.md:38-45`、`design.md:31-37` | 当前消费方按后续业务需求核查，不把 B-0.5 的不实现误判为偏差 | 民宿已完成；住房 `housing-transaction-support.service.ts:43-55` 仅检查 person Party，未调用 verifier | 民宿实现超出 B-0.5 原范围且已闭环；住房未形成身份门槛 |
| IDY-16 | Web 不推导 allowed actions、不先取明文再脱敏、不拼 deep-link；需 desktop/mobile 输入。归档 `design.md:167-180`、`implement.md:137-160` | 动作来自服务端、敏感投影由服务端裁剪、390px/移动卡片 | `PropertyControlPlaneClient.tsx:273-385`；`PropertyControlPlane.module.css:159-176` | 部分实现：动作与响应式已实现；Party 详情 full identity 展示违背最小化方向 |

### 3.1 状态机闭环

```text
draft --submit--> pending_verification --decide--> verified | rejected
  |                         |
  +--supersede--------------+--withdraw--> withdrawn
                            +--supersede

verified/rejected/withdrawn --create successor--> superseded + new draft
```

数据库约束和 CAS 函数是状态权威，而不是 Web 按钮。Web 只渲染服务端 `allowedActions`（`PropertyControlPlaneClient.tsx:363-385`）。这符合设计的 fail-closed 思路。

### 3.2 字段与证据边界

- 原设计明确只接受 `id_card | passport`，没有规定港澳台证件、签发国、姓名拼音、出生日期、性别、国籍、证件有效期、人像比对或照片必须性。
- `pendingFileIds` 可为 0..20，即设计和实现都允许没有证件照片/证据文件的草稿提交；数据库冻结存在的文件，但没有“至少一张正面/头像页”的规则。
- 上传 biz type 是 `party_identity_evidence`，但前端没有专用 policy key，当前回落通用文件策略，允许 JPG/PNG/WEBP/PDF/XLS/XLSX/MP4（`packages/shared/src/index.ts:130-170,185-193`）。
- 核验决定是人工事实，不等于证件真伪联网核验，也不等于公安住宿登记。

## 4. 权限与统一 access-manifest 核查

当前 Track-B 自身权限链是闭合的：

- page/action 常量：`packages/shared/src/property-business/permissions.ts:78-87,127,136-179`。
- operator bundle：page + party read + identity update + file read/upload/delete；verifier bundle：page + party read + identity verify + file read/download（`permission-bundles.ts:19-33`）。
- controller 与 endpoint manifest 一致（`property-identity.controller.spec.ts:9-50`；`track-b-endpoint-permissions.ts:95-125`）。
- service 以 tenant+park 和 actor visibility 限制 list/detail，不以角色名直接授权（`property-identity.service.ts:150-225,1042-1053`）。

但 `asset.identity-submissions` 不在统一 `PROPERTY_BUSINESS_SURFACES` / `PROPERTY_ACCESS_MANIFEST` 六层合同中。`routes.ts:17-171` 只有 homestay/housing surfaces，identity 在独立 `track-b-routes.ts`；`property-business-access-manifest.spec.ts:156-172,813-840` 明确只验证 17 个 homestay/housing surface/controller。这造成“两套权限合同”：运行时可用，但统一 manifest 无法检查 identity 的 page/action/data/field/file/idempotency 六层一致性。

## 5. 使用说明核查

### 5.1 仓库现有材料

| 文档 | 当前内容 | 与实现一致性 |
|---|---|---|
| `docs/architecture/shared-property-foundation.md:1-17,73-103` | 标记“开发中”，说明 Party、加密/脱敏和 Party API | 未列 identity-submissions API/工作台操作；声称写接口均有 interceptor，与 canonical identity 的 service receipt 实现方式不完全同表述 |
| `docs/deployment/production.md:239-249` | 列 `/assets/identity-submissions` 入口 | 入口正确，但没有权限/步骤/字段/异常说明 |
| `docs/uat/shared-property-foundation-evidence.md:1-5,58-65` | 开发验证通过，真实 UAT 待执行 | 与“不能宣称真实 UAT 通过”一致 |
| `docs/uat/full-product-acceptance-matrix.md:39,63-73` | 共享房产底座 `uat_pending/未启用` | 与当前代码已存在但生产验收未闭环并存，不应误读为无实现 |
| `docs/uat/homestay-full-flow-uat-20260825-212435.md:39-46,94-98` | 承认 Party/identity UI 存在，但该轮未沿 UI 建链 | 不能作为工作台人工 UAT 通过证据 |

### 5.2 缺失的使用说明

没有找到一份专门手册覆盖：

1. 菜单、模块与最小权限前置条件。
2. Party 建档与从 Party 详情进入 identity submission 的路径。
3. 创建草稿、身份版本/CAS、证件类型、号码规则、证据格式与大小。
4. 提交后领取/重新分派/解除分派、maker-checker、通过/拒绝原因。
5. 撤回、重提、superseded 的含义和恢复路径。
6. 审计时间线和按需受保护下载的额外权限。
7. 409 冲突、文件 stale、离线/403/404 的运营处置。
8. 大陆住宿登记与公安报送必须在本工作台之外完成的提示。

因此使用说明结论为：**入口文档存在，完整操作说明不存在；现有架构/UAT状态与当前实现存在时态漂移。**

## 6. 中国大陆运营场景评估

### 6.1 实名登记与证件覆盖

全国性的《旅馆业治安管理办法》第六条要求接待旅客住宿必须登记、查验身份证件并如实登记；境外旅客住宿还需按规定报送公安机关。[司法部国家行政法规库](https://xzfg.moj.gov.cn/front/law/detail?LawID=793)

地方执行口径还会规定治安系统实时/限时报送和有效证件目录。例如上海 2025 年规则要求查验有效证件、登记后 2 小时内上传治安系统，并给出涵盖内地、港澳台和外国人的证件目录；湖南规则要求登记证件种类/号码、房号和入住时间并实时传送公安机关。[上海市人民政府](https://www.shanghai.gov.cn/gwk/search/content/GKXX-20250429111830516--5518)、[湖南省人民政府](https://www.hunan.gov.cn/hnszf/xxgk/zfgz/202401/t20240104_32618222.html)

当前实现：

- 优点：民宿 check-in 强制所有 roster Party 具有 verified identity 和 granted consent。
- 缺口：只有 `id_card/passport`；没有港澳居民来往内地通行证、台湾居民来往大陆通行证、外国人永久居留身份证等结构化类型；没有境外人员国籍/出生日期；没有有效期；身份证仅正则、不验校验码；没有无有效证件公安核查单流程。
- 结论：**不满足通用大陆住宿登记数据模型。需产品和法务按实际经营省市、客源范围确认最小证件目录；需属地公安确认报送字段。**

### 6.2 敏感个人信息与数据安全

《个人信息保护法》将特定身份信息及不满十四周岁未成年人信息列为敏感个人信息，要求特定目的、充分必要、严格保护和额外告知；以同意为第十三条合法性基础处理敏感个人信息时须取得单独同意，若基于履行法定义务等其他基础则应由法务确认适用条件。该法还要求保存期限为目的所需最短时间、提供删除等权利机制、采取加密/去标识化等措施。[中国人大网](https://www.npc.gov.cn/WZWSREL25wYy9jMi9jMzA4MzQvMjAyMTA4L3QyMDIxMDgyMF8zMTMwODguaHRtbD9yZWY9aW1i)

本报告把居民身份证照片按网信办 2026 年政策法规问答引用的相关国家标准示例视为常见敏感个人信息；证件号码及其他证件影像仍应结合“特定身份”、处理场景和风险由法务逐项分类，不能把 PIPL 条文理解为对所有证件材料的无差别自动归类。只有提取/使用面部特征进行身份识别时，才按人脸识别/生物识别处理。[中央网信办政策法规问答](https://www.cac.gov.cn/2026-01/09/c_1769688003183197.htm)、[人脸识别技术应用安全管理办法](https://www.cac.gov.cn/2025-03/21/c_1744174262156096.htm)

自 2025-01-01 施行的《网络数据安全管理条例》进一步要求公开、易访问的个人信息处理规则，说明敏感信息必要性、保存期限、权利路径，并要求访问控制、安全认证、加密等措施。[司法部国家行政法规库](https://xzfg.moj.gov.cn/front/law/detail?LawID=1734&Query=)、[中国政府网](https://app.www.gov.cn/govdata/gov/202409/30/520076/article.html)

逐项工程对照：

| 项目 | 当前实现 | 缺口与建议 |
|---|---|---|
| 加密存储 | 证件号 AES-256-GCM，HMAC-SHA256 hash；实体 encrypted/hash `select:false`（`party-sensitive-data.service.ts:11-55`；`party.entity.ts:28-47`） | 专用密钥缺失时不 fail closed；固定 key id 且未见轮换执行器。生产必须强制专用 KMS/密钥、版本化 key id、轮换与密文迁移演练。需安全负责人确认 |
| 脱敏展示 | identity projection/outbox 只保存 masked；列表 masked；下载单独授权 | Party 详情在 sensitive permission 下使用 `identityNumber ?? identityNumberMasked`（`PartyDetailClient.tsx:137-143`），会展示全号。建议默认始终 masked，将 reveal 变成独立高风险动作并记录理由/审计。需产品/法务确认岗位必要性 |
| 访问控制 | module+page+action+tenant/park+visibility；文件按 assignment/scope 二次授权并审计 | identity 未纳入统一六层 manifest；应统一静态/运行时合同并补负向矩阵 |
| 留存期限 | snapshot/decision/audit/file relation 被设计为不可变并 RESTRICT 删除 | 没有业务留存期限、legal hold、到期停止处理/匿名化/删除策略；“永久保留审计”不能替代法定最短必要原则。需法务按治安留存、争议时效、财税/审计义务制定分层策略 |
| 删除/注销 | 仅未被引用的草稿附件可软删；submission withdraw 只是状态 | 没有数据主体删除/限制处理/注销受理、法定保留例外、匿名化或级联编排。需产品/法务确认权利请求 SOP 和不可删记录的停止处理方式 |
| 告知/同意 | `consent_status=pending/granted/withdrawn`；check-in 要求 granted | 无告知文本版本、处理目的、单独同意、同意时间/来源/操作者、撤回后的后续处置。应建立不可抵赖 consent fact，并区分法定义务处理与基于同意处理。需法务确认合法性基础 |
| 日志泄露 | identity outbox 只有 masked；identity AuditLog 的 create/update 禁止 capture body | 通用 audit `before/after` 为 JSON，写失败 best-effort（`audit.service.ts:10-33,112-147`）；需全链扫描 DTO/exception/access log，建立证件号/密文禁止入日志规则和 DLP 测试 |
| 文件权限 | protected biz type、scope/assignment、下载审计、snapshot 引用后拒绝通用删除 | 未从静态代码证明 S3/object storage 的服务端加密、bucket policy、签名 URL TTL、备份删除；需结合部署配置和供应商合同单独验收 |

### 6.3 公安治安系统对接

在 §2.2 列明的仓库范围和检索词下，未找到公安/旅馆业治安管理信息系统 provider、outbox consumer、上报 receipt、失败重试、补报、对账或属地适配。现有 `party.identity.*` outbox 是内部领域事件（`apps/api/src/modules/property-identity/property-identity.service.ts:926-935`），不是公安报送出口。

建议把“身份核验”和“住宿登记报送”建成两个明确状态机：

- 本地 identity verified 仅表示企业内部核验完成。
- check-in 必须产生住宿登记事实（旅客、证件、房号、入住时间、境外字段）。
- 属地 adapter 负责报送、receipt、重试/补报、人工 incident、审计与最小字段映射。
- 未接通属地公安接口时，生产 check-in 应按运营决策 fail closed 或切换到经批准的线下登记 SOP，不能静默仅留本地记录。

此项**需产品、法务、运营和属地公安共同确认**，不能只由研发选择接口。

### 6.4 核验方式与第三方改造面

当前是人工核验：submit 冻结队列与 policy，核验员 claim/reassign 后 decide；没有 CTID、运营商三要素、人脸比对或公安证件核验 provider。

接第三方的主要改造面：

1. provider-agnostic verification attempt/result 表，保存 provider、request/response 摘要、置信度、时间、版本、人工复核结论；严禁把原始响应直接塞通用日志。
2. 将自动结果作为 evidence/decision input，不绕过 canonical submission、maker-checker、幂等 receipt 和 audit/outbox。
3. webhook 签名、防重放、超时/未知结果、供应商降级、人工接管和可解释拒绝。
4. 人脸方案还需单独评估必要性、替代路径、单独同意、影响评估、活体攻击和模板删除。
5. 委托处理/共同处理、数据出境、分包商、保留期限和安全事件条款。

是否接第三方、选择何种核验强度属于**产品/法务决策**；公安住宿报送不能被商业三要素/人脸服务替代。

### 6.5 未成年人、有效期与虚假证件

公安部公开发布、各地公安机关转发落实的“旅馆接待未成年人入住五必须”工作要求，包括查验登记、询问并记录监护人联系方式、询问同住关系、加强巡查/访客管理、可疑情况报告并联系监护人。它是公安部行业监管工作要求，不是一部独立法律条文。[广西壮族自治区公安厅转载公安部要求](https://gat.gxzf.gov.cn/jwzx/gayw/t10521285.shtml) 2025 年公安机关仍持续按该要求检查。[公安部微信公众号信息转载页](https://m.12371.gov.cn/content/2025-02/09/content_483962.html)

当前 Party 无出生日期/年龄，booking guest relation 无监护人联系方式、同住关系、询问记录或可疑情况 report；系统无法识别未成年人，更无法执行“五必须”。证件也没有有效期/签发机关/国籍，无法拦截过期证件；身份证只做 18 位格式正则，无法识别明显校验码错误。

建议新增独立未成年人住宿保护流程和证件有效性模型，风险事件需进入受控 incident/公安报告 SOP。具体年龄判断、监护关系证据、保存期限和异常升级**需产品/法务/属地公安确认**。

### 6.6 留存、导出与运营审计

当前有不可变 identity audit 和文件下载审计，但没有 party/identity 导出接口、导出审批、导出水印/脱敏、目的和接收人记录；也没有按法定/业务目的分层留存。

运营自查建议提供受控报表/导出任务：默认脱敏、按 tenant/park/时间/状态筛选、审批或双人复核、大数据量异步、下载短链、次数/接收者/用途/文件 hash 全留痕、自动到期销毁。是否允许完整证件号导出应默认否，并由法务和安全负责人批准例外。

## 7. 分级问题与建议

### P0 — 大陆生产阻断/合规高风险（6）

| 编号 | 问题与证据 | 建议改动面 / 迁移 | 验证方式 | 决策点 |
|---|---|---|---|---|
| P0-01 | 专用加密密钥缺失时回退 IoT/JWT/fixed dev secret。`party-sensitive-data.service.ts:57-64` | Config schema 启动 fail closed；KMS/版本 key id；双读迁移与轮换审计。需要密文/metadata 迁移 | 缺 key 启动失败；轮换前后解密、hash identity、不泄密日志、灾备恢复测试 | 安全负责人选 KMS、轮换周期和历史密文策略 |
| P0-02 | 证件模型只有 id_card/passport，无港澳台细分、境外字段、有效期；身份证仅正则。`party-identity.policy.ts:1-19`；DTO `:71-89` | 扩展 shared/DTO/Web/snapshot/报送映射；数据库需要向前迁移；按证件类型校验和有效期 | 每类证件正负样例、过期/污损/可疑路径、属地报送 contract/UAT | 产品/法务确认经营地与客源证件目录 |
| P0-03 | 在 §2.2 列明范围/检索词下未找到公安住宿登记/报送出口 | 新住宿登记聚合、属地 adapter、receipt/retry/reconcile/incident；可能新增表和 secret | sandbox/联调环境报送、重复/超时/补报/对账、未接通 fail-closed | 属地公安接口、线下降级 SOP、上线地区 |
| P0-04 | 无未成年人识别、监护人/关系/询问/可疑报告字段。Party/guest 当前只存 person 关系 | 新 minor protection 数据与流程；需要 schema 迁移、权限和敏感留存策略 | 未成年人单独/与成人入住矩阵、监护联系、可疑报告、审计 | 法务/公安确认“五必须”本地细则与保留期 |
| P0-05 | `consent_status` 只有枚举，无告知版本、单独同意、时间/渠道/目的。migration `000176...sql:277-291`；entity `:24-53` | 建 consent fact/notice version/legal basis；迁移现有状态为“来源未知待补证”，不可伪造历史 | 告知版本、同意/撤回、法定义务与同意分流、check-in fail-closed | 法务确定每个目的合法性基础与是否需书面/单独同意 |
| P0-06 | 无身份数据留存、到期停止处理、删除/匿名化/主体权利入口；不可变记录和 RESTRICT 仅保证审计 | 分层 retention/legal hold/right-request 编排；需要 retention 字段、job、匿名化/停止处理迁移 | 到期、撤回、删除请求、法定保留例外、备份过期、不可删转停止处理 | 法务确认各数据类别/地区期限与权利 SOP |

### P1 — 功能/控制面/隐私缺陷（6）

| 编号 | 问题与证据 | 建议改动面 / 迁移 | 验证方式 | 决策点 |
|---|---|---|---|---|
| P1-01 | 核验仅人工队列，无第三方 provider/attempt/result | provider port + attempt/result + webhook/降级；通常需要新表 | provider contract、幂等、防重放、超时、人工接管 | 是否接 CTID/三要素/人脸，供应商与强度 |
| P1-02 | 住房租约/occupant 只检查 person Party，不检查 verified/consent。`housing-transaction-support.service.ts:43-55` | 在明确的住房“入住/交付”而非任意建租约节点消费 verifier；可能无需改 identity schema | 未核验/撤回/证据 stale/多 occupant 原子矩阵 | 产品/法务确认长租实名门槛及发生时点 |
| P1-03 | `party_identity_evidence` 回落 general 上传策略，允许表格、视频等。`packages/shared/src/index.ts:130-170,185-193` | 新专用 shared policy，前后端同源 MIME/size/page count；无 DB 迁移，存量需扫描 | 伪 MIME、超限、恶意 PDF、图片/文档允许集、存量报告 | 证据格式、大小、是否允许视频/多页 PDF |
| P1-04 | identity surface 不在统一六层 access-manifest；仅独立 Track-B manifest | 将 surface/action/data/field/file/idempotency 纳入 canonical validator；无业务迁移 | manifest-controller-Web-file 全链 exact/negative test | 是否统一 manifest 为所有 property surface 唯一权威 |
| P1-05 | 无受控 identity 导出与导出审计 | 异步脱敏导出、审批、短链、用途/接收人/hash 审计；可能新 job/audit 表 | 越权、完整号默认拒绝、大量导出、过期销毁 | 是否需要导出；完整号例外与审批级别 |
| P1-06 | Party 详情在 sensitive permission 下优先显示完整证件号。`PartyDetailClient.tsx:137-143`，而 identity workbench 只显示 masked | 默认 mask；单独 reveal permission/action/理由/审计或彻底取消明文 UI；无数据迁移 | 截屏/肩窥最小化、reveal 审计、无权响应不含明文 | 哪些岗位确需明文、何种场景、是否双人审批 |

### P2 — 体验/文档/运维缺口（3）

| 编号 | 问题与证据 | 建议改动面 / 迁移 | 验证方式 | 决策点 |
|---|---|---|---|---|
| P2-01 | 无完整身份工作台使用说明；现有 docs 仅入口/架构/UAT pending | 新 operator/verifier/auditor 手册与故障恢复 SOP；无迁移 | 按手册完成端到端桌面/390px 人工 UAT | 手册 owner、发布渠道与版本责任 |
| P2-02 | API 支持 queue/assignment/date/sort/order，Web 仅 status/partyId/page；多处直接显示英文枚举。shared `track-b-contracts.ts:333-344`；Web `PropertyControlPlaneClient.tsx:81-105,899-926` | 补运营筛选、中文状态/证件字典、保存查询；无迁移 | 大队列检索、移动端、时区/空时间/稳定排序 | 首发必需筛选与中文术语 |
| P2-03 | identity 列表错误态只有普通文本/顶部刷新；Party 详情入口仍称“身份核验目录” | 统一 forbidden/offline/stale/conflict/retry 状态和“工作台”术语；无迁移 | 401/403/404/409/离线、键盘/读屏、390px | 错误恢复文案与 SLA owner |

## 8. 用户决策清单

1. 上线范围：共享 Party 是否仅用于内部住房，还是承担旅馆/民宿法定住宿登记；首发省市有哪些。
2. 公安对接：属地系统/厂商、联调责任、未接通时 fail-closed 还是经批准的线下 SOP。
3. 证件目录：内地、港澳台、外国人、军警等首发覆盖；无有效证件如何走公安核查。
4. 第三方核验：是否接、接哪类服务；人工与自动结果谁是最终 authority；人脸是否必要。
5. 未成年人：数据项、监护核验、同住关系、巡查/访客/可疑报告流程和保存期限。
6. 同意与合法性基础：实名登记法定义务、运营服务、风控/人脸分别采用何种依据和告知/同意形式。
7. 留存：submission、snapshot、证件照片、住宿登记、公安 receipt、下载/导出审计分别保留多久；legal hold 和到期动作。
8. 明文范围：是否彻底禁止 UI/导出明文证件号；若允许，岗位、目的、审批、reveal 审计是什么。
9. 第三方与存储：KMS、对象存储地域/加密/备份删除、供应商委托处理和数据出境边界。
10. 住房身份门槛：长租是否必须实名核验，在哪个节点阻断，是否包含所有 occupant。
11. 导出：是否需要运营自查导出、默认字段、审批和水印策略。
12. 统一权限合同：是否把 identity 正式并入 property access-manifest 六层唯一权威。

## 9. 建议的后续验证门禁（仅建议，未实施）

- 设计/法务 Gate：证件目录、住宿登记、未成年人、合法性基础、留存矩阵签署。
- 安全 Gate：专用 KMS fail-closed、轮换、日志 DLP、对象存储/备份删除、明文 reveal。
- API/DB Gate：证件/同意/retention/公安 receipt migration 与真实 PostgreSQL 状态/并发测试。
- 集成 Gate：属地公安 sandbox、第三方 provider webhook、防重放/补报/对账。
- 业务 Gate：民宿全 guest、未成年人、境外旅客、无有效证件、过期/可疑证件、撤回同意。
- Web/UAT Gate：operator/verifier/auditor 三岗位，桌面与 390px，完整错误恢复和使用手册盲测。
- 发布 Gate：未完成 P0 前保持相关生产能力禁用或 fail closed；不得以“内部 verified”替代公安住宿登记成功。

## 10. 最终判断

- **设计要求闭环**：核心身份控制面基本闭环；16 项中 14 项已实现、1 项部分实现、1 项属于后续范围且呈现“民宿已闭环/住房未设门槛”的分化。没有发现完全缺失的原设计核心状态机或事务主链。
- **使用说明**：专门手册缺失；现有文档只有入口、架构和待 UAT 证据，不能支撑运营人员独立使用。
- **大陆场景**：当前可作为内部人工身份核验底座，但不能独立承担大陆住宿业生产合规。公安报送、证件/有效期、未成年人、同意证据、留存/删除、密钥门禁是上线前 P0。
- **问题统计**：P0 6、P1 6、P2 3，共 15 项。
- **实施状态**：本报告只核查和提出建议；未修改产品代码、未创建实施 Issue、未操作生产。
