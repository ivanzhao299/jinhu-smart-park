# P0-4 合同链与提醒独立架构/测试审计（候选 `392a83dd`）

## 结论

**当前 NO-GO，P0-4 不可标记完成。** 现有实现具备在线合同 draft→active/cancelled、续签/终止变更草稿、详情 required-audit、self/team/park 投影、T2 三表装载和反序删除基础；但旧系统证据明确存在劳动合同维护/查询/导入、员工转正、试用期提醒、合同到期提醒。当前所谓“到期提醒”只是 `expiry_from/expiry_to` 查询加 Web `dateAfter(60)` 计数，不具备提醒实例、收件人、唯一性、确认/处理、撤销、重试和审计，reviewed mapping 将 `contract-expiry-reminder` 标为 mapped 属于过度声明，应在真正流程落地前恢复 gap。

本审计只读核对候选代码与受审阅证据，不授权生产 loader 或历史导入。

## 权威证据与禁止猜测

- 客户端 live traversal 已证实独立入口：劳动合同维护、劳动合同查询、员工转正处理、劳动合同导入、试用期到期提醒、合同到期提醒；但“续签提醒日界、提醒接收人、旧状态全集、累计期限单位/优先级”仍为 `LEGACY_SEMANTICS_UNCONFIRMED`。
- Group Web 只稳定证明 `remindcompact.aspx` 合同到期查询路径；不能用该查询页反推旧客户端提醒设置或收件人规则。
- reviewed core mapping 的 12 表/260 字段证明分类和 raw archive 可追溯，不等于业务字段已结构化或规则已 tested。
- 禁止猜测 `compacttime/totalcompacttime/continueyears` 的单位、`continuetimes` 是否含首签、`jddate` 与签订/鉴证/生效日的关系、`compact_c` 排序优先级、`state` 未知值含义、附件路径可访问性，以及旧提醒提前天数。必须由真实字典/样本和 HR/法务签署决定；未知值进入 quarantine。

## 必须实现的数据合同

### 合同及续签链

1. `hr_contract` 必须显式承载并由 T2 loader 装载：`contractTermMonths`、`signatureDate`、必要时经签署决定后的 `effectiveDate`、源 `compact` 稳定 identity、源行 hash、旧状态/类型 decision 引用。当前 loader 仍未装载期限和签订日。
2. `hr_contract_change` 必须保留 `compact_c` 稳定 legacy id、sequence、source row hash、previous/new dates、signedAt，并建立唯一 source identity；只用计算出的 `sequenceNo` 不足以证明重放稳定。
3. 累计续签次数、累计期限不得作为随意可写缓存。应由有序 change chain 权威重算，并与 `continuetimes/continueyears/totalcompacttime` 对账；不一致进入 reconciliation/quarantine，不静默采用任一侧。
4. 状态机至少明确：合同 `draft→active|cancelled`，active 经 effective renewal 保持 active、经 termination 进入 terminated；change `draft→effective|cancelled`。历史 imported 合同/变更默认 immutable；若业务要求续签历史合同，必须走显式“衍生在线合同”流程，不能原地改历史证据。
5. 并发约束：同合同最多一个 draft change；续签新起始日严格晚于当前终止日；同员工 active/draft 冲突策略必须考虑 `needs_review/quarantine` 不得计作有效合同。

### 正文与文件证据

1. `compacttext` 必须进入受控正文/证据实体，而非 presence boolean；`compactfile` 必须产生逐件 manifest：source locator、存在/缺失、SHA-256、MIME、字节数、迁移状态、protected file id。
2. 文件不存在必须形成 residual/missing-file 清单，不得生成空文件或把 `legacy-presence-only` 宣称为已迁移。
3. 下载必须复用受保护文件服务，绑定 tenant/park/biz_type/biz_id；列表、详情、下载分别校验合同 read scope 和文件权限，并写 required audit。日志和响应不得泄露绝对路径、raw source snapshot、薪资或个人数据。
4. rollback 必须先删除 reminder/outbox/ack、文件业务关联与 change，再删 contract/type；共享物理文件只解除关联，是否删 blob 由引用计数决定。

## 真正的提醒工作流合同

建议独立实体，而非扩展前端计数：

- `hr_contract_reminder_rule`：tenant/park、kind(`contract_expiry|probation_expiry`)、leadDays、enabled、recipientStrategy、version；规则修改有审计。
- `hr_contract_reminder`：contractId、employeeId、ruleId/ruleVersion、windowDate、dueDate、status(`pending|read|acknowledged|resolved|cancelled`)、recipientUserId、dedupeKey、generatedAt、readAt、ackAt、resolvedAt、cancelReason、source end-date/version。
- outbox/投递记录与提醒业务实例分离；投递失败可重试，不得新建业务实例。

不可放宽的规则：

1. 唯一键至少覆盖 tenant+park+contract+kind+window/ruleVersion+recipient；scheduler 重跑、并发运行零重复。
2. 续签生效、终止、取消、合同日期改变后，在同一事务或可靠 outbox 中撤销旧 pending/read 实例；已 acknowledged/resolved 保留审计轨迹，新日期生成新 dedupeKey。
3. recipientStrategy 必须产品决定并可解释（HR 指定角色、员工本人、直属经理或组合）；禁止把创建人、当前登录人或全部 HR 当默认答案。离职/禁用账号的重路由规则也需签署。
4. read 只表示已读；acknowledged 表示人工确认；resolved 表示业务处理完成，三者不得混用。撤销不可物理删除。
5. scheduler run、read、ack/resolve/cancel 使用独立原子权限，例如 `HR_CONTRACT_REMINDER_RUN/READ/ACK/MANAGE`；普通合同 read 不自动获得批量提醒或运行权限。
6. 所有提醒查询受 tenant/park 和 recipient/HR 管理范围约束；跨树按 safe not-found/空列表，严禁通过数量泄漏。
7. reminder run、列表读取、详情、ack/resolve、撤销均 required-audit；审计失败时读取零返回、写入整体回滚。

## API、Web 与三角色负例

- API：规则管理、幂等 run、分页 inbox、详情、read、ack/resolve；合同详情返回 reminder summary 但不返回其他收件人数据。所有写路由要求 idempotency key 或数据库唯一性冲突翻译。
- Web：`/hr/contracts` 的 60 日卡片只能作为查询摘要；需独立提醒工作台，展示到期日、剩余天数、员工/合同、状态、负责人和可执行动作。390px 使用移动卡片，不强制宽表。
- HR：可按授权 park 查看/处理和管理规则；负例为无 RUN 权限不能触发生成、无文件权限不能下载正文。
- 经理：只看管理树内提醒和脱敏合同；负例为跨树 not-found/零计数、不能管理规则、不能看到薪资/源路径。
- 员工：只看本人被明确配置为收件人的提醒与 self 投影；负例为不能读他人实例、不能伪造 recipient、不能通过合同 id 枚举。
- 每一角色必须同时有 API 与浏览器证据；当前矩阵仅覆盖合同 create/read 和薪资脱敏，未覆盖 reminder run/read/ack/cancel，不能据此放行。

## ETL、守恒与回滚门禁

1. T2 transform 增加期限/累计值/签订日/legacy change id/正文文件 locator，但 raw 值原样保留；字典和单位无签署时 quarantine。
2. 守恒：每表 `source = structured + quarantined + approvedIgnored`；合同与 change source identity/hash 唯一；contract→employee/type、change→contract、file→contract、reminder→contract/recipient 零孤儿。
3. 重跑零增量；源 hash 改变 fail closed，不覆盖在线修改。
4. rollback 反序且按 run ownership 删除，最终 residual=0；不得删除既有在线 employee、共享 file 或其他批次 reminder。
5. 普通部署不得触发 T2 loader、文件迁移或 reminder backfill；历史导入继续 HOLD。

## 必须存在的自动化门禁

- unit/contract：状态转换、累计值重算、未知单位/状态 fail closed、projection、RBAC、required-audit、recipient 决策、dedupeKey。
- 真实 PostgreSQL：两个并发 scheduler 只生成一实例；重复 run 零新增；续签/终止事务撤销旧提醒；required-audit 失败回滚；跨 tenant/park/tree safe not-found；唯一索引和外键真实生效。
- 文件：存在文件 hash/MIME/大小一致，缺件 residual，非法路径/越权下载拒绝，审计失败零字节返回。
- ETL rehearsal A/B：全迁移+seed、T2 transform/load、source/structured/quarantine 守恒、hash、反序 rollback residual=0。
- 三角色 API/browser：HR、manager、employee 正反矩阵覆盖 reminder 和 evidence；390px 无横向溢出。

## `000277` 冲突与实现切片 NO-GO

候选仓库当前最高 migration 是 `000276_hr_legacy_employee_profile_materialization.sql`，因此实现者若使用 `000277`，提交前必须 fresh fetch/rebase 后重新扫描 `origin/main` 和所有候选分支。**migration number 不是领域所有权**；并行切片很可能同样占用 `000277`，重复编号必须阻断 PR/部署，不能依赖文件名排序侥幸执行。

建议合同链与提醒不要挤入单个 migration：数据列/legacy identity、文件证据、reminder rule/instance/outbox 各自有独立回滚和测试边界；但具体编号必须在合并前最后分配。若实现者已经基于 `000277` 编码，则在三端同步前保持候选，不得部署；发现远端同号后只重编号尚未合并/未应用的本切片文件，严禁修改已应用 migration。

额外 NO-GO：

- 只新增 reminder 表但没有续签/终止撤销路径；
- 只靠应用层查重没有数据库唯一键；
- 用消息表代替业务提醒状态；
- recipient 硬编码为全部 HR 或创建人；
- required audit 仅装饰器、失败仍返回数据；
- mapping contract 在 entity/API/page/permission/真实测试未齐全前继续标 `mapped/tested`；
- 只做源码正则测试，没有真实 PostgreSQL 并发/事务和浏览器三角色负例。

## 放行定义

只有字段与状态机、文件证据、提醒唯一性/撤销/收件人、RBAC、required-audit、三角色负例、真实 PG 并发门禁、ETL 守恒和 rollback residual=0 全部存在且通过，且 legacy 未确认语义保持 quarantine/签署门禁，P0-4 才可由 NO-GO 改为 GO。
