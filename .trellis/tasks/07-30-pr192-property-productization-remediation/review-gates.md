# PR192 房产业务产品化整改复审门禁

## 1. 复审范围

本父任务在创建前完成多轮只读审查，覆盖：

- 产品与功能设计。
- RBAC 和职责分离。
- UI、交互、移动端和无障碍。
- 开发与架构。
- QA、运营和真实用户代表。
- 独立反方/红队集成。

## 2. 专项 Gate

| Gate | 最终结果 | 主要闭合内容 |
|---|---|---|
| 产品/设计/RBAC | PASS | canonical IA、六层 manifest、bundle/role、asset 依赖、财务边界、maker-checker |
| UI/交互 | PASS | 无重复 terminal CRUD、逐页状态、deep-link、picker、任务队列、弱网、WCAG/DS |
| QA/运营/用户 | PASS | traceability、fixture、清理、性能、岗位指标、人工签署、证据 schema |
| 开发/架构 | PASS | Track 拆分、extract-first、response contract、façade、ownership、四槽调度、migration |
| Approval/Identity 架构复审 | PASS | execution lease、outbox/inbox、Party snapshot/锁序、backfill/reconcile/compatibility |

## 3. 红队记录

### 3.1 首轮红队：FAIL

发现七项 P0/P1：

1. DB commit 后 publisher/broker 失败可能错误触发 approval 领域重执行。
2. approval `status` 与 `execution_status` 构成未定义双状态源。
3. 任务队列被称为纯读 projection，却保存独立 claim/assignee。
4. V3–V5 能力未映射到唯一 Track/Gate/flag。
5. shared、migration、property-operations、approval ownership 重叠。
6. identity submission 缺不可变 identity snapshot 合同。
7. 自动化 E2E 与真实岗位 UAT/签署主体混淆。

闭合：

- 冻结 decision/execution 两字段合法组合、CHECK/CAS 和权威读取。
- DB transaction 成功后 approval 永久 executed；outbox/inbox 分离重试域。
- owning aggregate assignment 与专属 assignment aggregate 分离。
- 完全替换 Track、ownership 和四槽计划。
- 增加 immutable identity snapshot。
- 拆分 Codex 自动任务与 external human Gate。

### 3.2 V6 红队复审：FAIL

剩余两项 P1：

1. Track A 的完整 D18 数据集依赖尚未部署的 B schema。
2. Human UAT 被排在 C 之前，与 `codex_complete` 可独立完成冲突。

闭合：

- 数据集拆为 versioned `property-remediation-a-base-v1` 与 `property-remediation-b-extension-v1`，每个 Gate 只验证已部署 schema，并定义 combined checksum。
- B 拆为 technical Gate 与 Production Readiness Gate。
- C 只依赖 B technical SHA。
- Human UAT 改为可并行、可长期 awaiting 的外部泳道，不占常驻 subagent 槽。

### 3.3 V7 红队复审：PASS

独立红队最终仅返回：

```text
PASS
```

该结论只覆盖当时的规划版本。

### 3.4 A-C1 独立实现复审：重新打开 Stop-ship

独立复审在 shared contract 落地后发现：

1. Track A 只在 manifest 中声明 `blocked-until-track-b`，尚无 server-side
   `PROPERTY_WORKBENCH_V2=true` 409 boundary；按钮隐藏不足以 fail closed。
2. housing tenant list/create 的 Party `mobile`/`email` 与 manifest masked projection
   漂移。
3. homestay booking detail、credential issue/return 的 `credentialReference` 与
   manifest masked projection 漂移。

复审期间另发现 canonical metadata 缺失/不匹配时 safety policy 可能 fail open；
实现已改为依赖 canonical metadata 且缺失时拒绝，并补充负向合同测试。

2026-07-30 复审结果：**PASS / CLOSED**，`open_P0_P1=[]`。验证证据：

- focused tests：44/44 PASS。
- API lint、typecheck、build：PASS。
- Shared build：PASS。
- Web typecheck：PASS。
- diff check：PASS。

contract/server-safety baseline 已于 2026-07-30 冻结，精确 SHA：
`e709459a034807b3575db604a76bc69bf1c5ff5b`
（`feat(property): freeze Track A access safety baseline`）。A-1 仍为进行中，因为
在该 A-C1 checkpoint，A-C2 schema、API projection 与后置 Web 接入尚未按 Gate
完成；后续增量结论见 3.6。

### 3.5 A-C2 只读复审：发现顺序冲突并修正计划

2026-07-30 只读复审确认：计划中的 17 个 canonical Web routes 尚未落地，当前会命中
catch-all placeholder；因此 Web menu、landing 或 redirect 不能标记完成。复审将权威
顺序修正为：

1. A-C2 schema migration/exact tests（property permission exact set=65，不是 69；
   `000183_*` 仅为候选编号，创建前重扫并即时 reservation）。
2. API-only `/users/me` property projection（active enabled modules、granular page
   permission、current tenant+park relation；custom/legacy/wildcard 不自动扩权），
   Web 继续不可见。
3. shared Web foundation 与 A-base。
4. homestay/housing domain owners 实现真实 routes/guards 并分别输出 route SHA。
5. 收到两份 route SHA 后才实现 Web menu、legacy landing、housing tenant alias 与
   unknown property deep-link fail-closed；domain owners 保持 app routes/guards
   ownership，menu owner 不创建 placeholder 或领域 route。
6. route evidence 与独立 Gate。

本次结论是“计划顺序已修正”，不是 A-C2 实现通过。A-1 必须保持
`in_progress`，直到 schema、API projection、下游 Web 接入及相应 Gate 按阶段完成。

### 3.6 A-C2 DB Runtime Fixture 与 API Projection Gate：CLOSED / PASS

2026-07-30 在独立临时 PostgreSQL 容器与独立 volume 中完成 A-C2 增量技术复验：

- 以 `000176`–`000182` 为声明的隔离基线；
- `000183_property_business_granular_rbac.sql` 连续直跑两次通过；
- property permission exact set=65，二次运行后 definition、grant 与 timestamp 稳定；
- 多园区、module disabled、relation expired/missing/status-disabled 全部按当前
  tenant+park 和 active module 默认拒绝；
- custom role、legacy operations、wildcard 均不自动扩展 granular page permission；
- cross-scope permission assignment 与 role tenant 一致性通过，跨 tenant 错配拒绝；
- cleanup residual counters=`0|0|0|0`，临时容器和 volume 已删除。

增量独立 review 发现 container fallback 选择范围不够精确，已自修并 exact rerun：
fallback 绑定 exact run-id 与双 label、只接受 running container；容器使用
`docker run --rm`、official PostgreSQL image、显式 `POSTGRES_DB` 和匿名 volume；
任何数据库 URL override 均拒绝。复跑后 `open_P0_P1=[]`。

空库执行 `000175` 时按其生产数据补丁语义 fail-fast 并回滚；它不提供 A-C2 fixture
所需 schema，所以本次隔离基线跳过 `000175`。该处理不是把全量空库 migration chain
标为通过，而是明确限定本 Gate 只验证 `000176`–`000182` 基线上的 A-C2 切片。

结论：A-C2 migration + API-only `/users/me` projection slice 为
**CLOSED / TECHNICAL PASS**，`open_P0_P1=[]`。
A-1 仍为 `in_progress`，因为 shared Web foundation、两个 workbench、最终 Web
menu/landing/alias/deep-link 与 route evidence 尚未完成。

### 3.7 Shared Web 浏览器验收顺序复审：计划修正

只读复审发现：foundation 在 canonical domain route 之前要求真实 browser evidence，
会迫使实现者创建无业务归属的 preview/生产 route，与 route ownership 和六步顺序
冲突。决策为“延后到首个 domain route SHA”：

- foundation handoff 只要求纯函数/组件静态与单测、lint/typecheck/build；
- 不创建 preview route 或临时生产 route；
- 首个输出 canonical route SHA 的 homestay/housing owner 在真实 route 上执行
  desktop/mobile/keyboard/focus/zoom/ARIA；
- shared owner 负责组件缺陷修复和 final UI Gate 签收，QA owner 负责证据追溯；
- 证据未补齐前 foundation 可标 `handoff ready`，不得标 `final UI gate passed`。

该调整不改变既定六步顺序，A-1 继续保持 `in_progress`。

执行进展（2026-07-30）：integration-ready SHA 已冻结为
`d2a015f9ba931b2024e6360570697c77b74ea3fb`
（`feat(property): add shared workbench foundation`）。三路 S2 final review PASS，
`open_P0_P1=[]`；14 specs、boundary 5/5、ESLint、workspace typecheck、shared/Web
build 全绿。该结果不改变上述结论：final UI Gate 仍
`awaiting_first_canonical_route`，shared child 不得标 complete。

### 3.8 A-base S0 只读设计：P1 / implementation blocked

S0 将 A-base-v1 数量冻结为 exact contract，并发现 A-C2 受控临时 DB bootstrap
尚未提取为 A0 可独立调用的 harness。直接开始 profile implementation 会使环境准备
不可复验，定级 P1。

整改决策：

- 新增 `A-ephemeral-db-bootstrap` 与独占 `a-bootstrap-owner`；
- harness 只允许 exact ephemeral container，执行 `000001`–`000174`、
  `skip-record:000175`、`000176`–`000183`，复用 A-C2 全部容器安全约束；
- 独立 review PASS、`open_P0_P1=[]` 后才允许 A0 implementation；
- generated runs 只写 ignored `artifacts/property-remediation/runs/**`；
- support 使用显式最小权限，exception super actor 仅用于负向测试；
- sys_file 固定 2,000 个小型有效 PNG；
- candidate 性能阈值只能观测，不能形成批准 PASS。

最终复审（2026-07-30）：**PASS / CLOSED**，`open_P0_P1=[]`。

- Reviewer 提出的 4 项 P1 已全部修复。
- Owner 自验：7 pass / 0 fail / 1 Windows platform skip。
- Linux SIGTERM：1/1 PASS。
- same-run-id 双链：PASS。
- 独立 checker 完成关键 runtime 复验，最终 residual=0。

冻结 `A-ephemeral-db-bootstrap` handoff SHA：
`b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`。

RISK-A-004 已关闭；该 S0 Gate 当时将 A0 implementation 状态更新为
`unblocked_not_started`，后续状态以 3.10 A-base Final Gate 为准。父任务与 A-1
继续保持 `in_progress`。Shared foundation commit
`d2a015f9ba931b2024e6360570697c77b74ea3fb` 保持冻结，final UI Gate 仍等待首个
canonical route。

### 3.9 Multi-domain API/Response Contract 只读复审：P1 Stop-ship

页面前复审发现 response/GET/alias/high-risk 合同未闭合。新增串行
`A-2.5 workbench API/response contract closure`：A-base 可以继续，合同研究可以
先行，但任何 homestay/housing Web workbench 必须等待 A-base handoff 与 A-2.5 独立
Gate PASS。

必须闭合 shared 全量 response types、两域候选 endpoint、7 个 detail routes、
第 9 个 move-out financial high-risk variant、财务字段/附件 ID 最小投影和 GET
精确 read permission。禁止 N+1、route-local interface 和 bundle expansion。
Track B high-risk 继续 unavailable。

该段为当时 stop-ship 记录。Party canonical target 后续已正式交付，A-2.5 由 shared-contract、homestay-api、
housing-api、schema-migration、asset-party decision owners 与独立 checker 共同
签署。当前 stop-ship 开放，父任务保持 `in_progress`。

### 3.10 A-base-core Final Gate：PASS / handoff frozen

2026-07-30 最终运行基于 source commit
`32ccc02852c3201c6f68e3b6b89e4398cb102a17`，run ID
`abase20260730final32ccc01`。Canonical fixture handoff SHA 为
`3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
profile checksum 为 `68da…107b`。

Owner gate 为 21 pass / 0 fail / 6 runtime skip，且有真实双 run 覆盖；两次 run
各生成 journals 10,010 events / 2,002 resources，均完成清理，final residual=0。
Independent final review PASS，`open_P0_P1=[]`。

因此状态冻结为 `A-base-core provisioned / handoff frozen`，A-2.5 从
`blocked_by_a_base` 变为 `unblocked / next`。该 PASS 不等于 Track A technical
pass；homestay/housing Web 仍由 A-2.5 stop-ship 阻塞，A-route-evidence 尚未完成，
A-gates 与父任务继续 `in_progress`。

### 3.11 A-2.5 与双域工作台最终机器 Gate：PASS

交付 SHA 为 `3766509`、`44d6769`、`8a0bd17`、`5a557e5`、`d33fad9`、
`bc2ed7f`、`992a6a4`。Shared、Homestay、Housing、RBAC、17 canonical pages、
7 detail routes 和 Party canonical target 全部完成，`open_P0_P1=[]`。

最终 API full unit 91/91；此前 92 包含后来撤销的临时 assets-unit-picker spec，
不得作为最终口径。Web default `tsc`/lint/build 154、独立多轮 Gate 与 DB evidence
均 PASS。

真实 desktop/390 visual、keyboard、zoom/reflow 未执行；按用户决定，该项转入
外部 UAT，不再作为 Track A 技术关闭条件。不得据机器 PASS 宣称人工 UAT 或生产
就绪已通过。

P2 mixed-scope 文案用例保留为报告规范：同一批次含 shared、SQL 和 Web 时，必须按
scope/owner/evidence 拆分描述，不能把某 scope 的 P2 文案或 fixture 差异升级成另一
scope 的 P1；该 P2 不改变 `open_P0_P1=[]`。

### 3.12 Track B B-0 合同 Gate：PASS / shared-schema implementation in progress

以下三份 `research/` freeze 已登记为 B-0 共同冻结权威：

1. `b0-product-access-freeze.md`
2. `b0-identity-control-freeze.md`
3. `b0-runtime-contract-freeze.md`

2026-07-31 在此前关闭 page exact-set 与 000189/000190 物理 schema 漂移后，实现
复审发现两个已冻结控制面 API 未进入 product action/route exact contract：
`property.mode-transition.list` 与 `property.occupancy.availability.check`。该问题按
P1 限定重开并完成修订，随后由独立产品/RBAC与架构 reviewer 复核通过；当前结论为
**PASS**，`open_P0_P1=[]`，允许继续 shared/schema implementation，不允许提前进入
B0.5 业务代码。

本轮限定复审必须确认：

- mode-transition list 的 method/path、page + action permission、tenant+park+unit
  scope 逐字一致；
- availability POST 是零 mutation 的只读查询，使用 occupancy page + read permission
  与 tenant+park+unit/source candidate scope，不要求幂等，不创建任何业务事实；
- 两条 API 的 module/page/action/scope、superuser/wildcard、跨 scope 和零副作用
  负向测试完整，且没有新增 permission code。

此前已关闭范围保留为本轮复审输入：

- 新增 page permission exact-set 恰好为
  `asset:identity-submissions:page`、`asset:property-operations:page`、
  `asset:property-occupancies:page`、`asset:property-mode-transitions:page`、
  `property:notifications:page`、`property:event-delivery-incidents:page`、
  `property:approval-incidents:page` 七项；
- `asset:party` 是既有权限，不计入新增集合，也不能替代任一新增 page permission；
- canonical surface、bundle、module/page/scope 授权边界及逐页负向测试逐字一致。

原三输入 manifest 与限定重开前的四输入 digest 均已 superseded；限定复审通过后按
四输入非循环 grammar 重新生成 manifest。
此前已完成且不受本次 P1 影响的交叉验证结论保留为复审输入：

- 三份候选的 action、permission、canonical surface、状态、错误和 compatibility 无冲突。
- runtime exact schema/effect manifest 是数据库约束、事务和 effect 行为的权威引用。
- 产品/领域计划只消费最终 SHA，不保留旧 route/status/schema 的并列副本。
- 原记录为 `open_P0_P1=[]`；本次 7-page P1 重新打开后，该记录仅作历史输入，必须
  由 limited re-review 重新确认。

Migration reservation 只读预检（2026-07-31）：

- 工作树最高编号为 `000184`。
- 本地隔离 PostgreSQL 16 的 `sys_schema_migration_history` 与
  `schema_migrations` 最高均为 `000182`，状态仅有 `succeeded`。
- 两张历史表 filename/checksum/status 差异为 0，`000185`–`000192` 占用数为 0。
- 因迁移文件尚未创建，以上仅证明编号窗口可用；正式 reservation 必须由唯一
  schema-migration-owner 创建文件并再次执行相同预检，不能把本次查询当作
  `B-schema-expand SHA`。

最终签署矩阵：

| 签署视角 | 必审内容 | 当前状态 |
|---|---|---|
| 产品 | canonical surfaces、九岗位旅程、`.request` action、两条控制面查询与恢复动作 | PASS（控制面 action/route exact contract 独立复核通过） |
| RBAC/安全 | page/action/data/field/file、`property-bundle:*` 最小授权、两条控制面查询 module/page/action/scope 与零副作用负向、incident 最近越权 | PASS（49-row endpoint authority 与负向矩阵冻结） |
| 运营 | assigned verifier queue、通知投递、event-delivery replay、approval retry、task admin rebuild 与 SLA | PASS（产品/岗位旅程复审） |
| QA | exact route/DTO/error、CAS/并发/负向、traceability 与清理；两条控制面查询逐维缺失、super/wildcard、跨 scope 和零 mutation；event replay 五维负向 | PASS（新增 exact route 与零 mutation 断言已冻结） |
| UI/交互/无障碍 | identity/notification/event-delivery-incident/approval-incident routes、320/360/390/768、键盘/读屏/zoom/reflow/forced-colors | PASS（合同与机器验收标准冻结；真实浏览器/UAT 仍外置） |
| DB/schema | exact schema、B-0 provisional window、合同 PASS 后 000185–000190 reservation、B2c 前 000191/000192 reservation、rerun、FK/CHECK/index/seed 与 effect manifest | PASS（限定终局 DB/schema 第三至四轮） |
| 架构 | action/effect 分离、事务/锁序、runtime manifest 权威性、000189/000190 physical addendum、post-B1 property approval adapter 独立 Gate | PASS（限定终局架构第六轮） |

七项必须分别留下 reviewer、时间、输入 hash、结论和 open findings；任何一项不得由
修复者自签，也不得以其他视角的 PASS 代签。

旧三输入 digest 与限定重开前的四输入 digest 均已 superseded。独立复审已重新确认
`open_P0_P1=[]`，并按四输入非循环 grammar 重算 exact file hash 与
`B-contract SHA`；schema owner 只能消费最新 manifest。

2026-07-31 B-0 shared/schema 最终门禁：**PASS / CLOSED**，`open_P0_P1=[]`。

- B-contract SHA：
  `5704ab723ebd4bcc69b4e4fcf6039992ac6752b195b97beba31be5260b55d87d`
- 49-row endpoint authority SHA：
  `3cff469fa092cdf6d254c86f275be194734a5eb4a1abe9591abaf4c1748f5adf`
- B-schema-expand SHA：
  `db1a9a93c6a5933d3a59fe14e7e62e8469b90af1d726f2663bf140809eedfb9a`
- catalog SHA：
  `e172de5cfa6ad61dfd610134c43a2618918858d4f7af4efd24bd758af046eec7`
- PostgreSQL 16 evidence：
  [持久化 final8 evidence](research/b0-schema-gate-final8.json)；
  原始执行记录 `/tmp/pr192-b0-schema-gate-final8.json`，
  run `bschema20260731b0final8`
- Runtime effect manifest 尚未冻结独立 byte grammar；其权威来源是
  `b0-runtime-contract-freeze.md` raw SHA
  `a2e0c3d81bd8443cbe654f48776b73361a94b6b22d2abcb8931f53ddff62f5be`。
  本 Gate 明确不虚构独立 runtime-effect digest。

动态 Gate 覆盖 clean apply、故障注入后的事务回滚/停止/重试、双历史表、同 schema
直接重跑、enabled-control 漂移拒绝、1101 个 marker、180 个定义行、ACL、
10 个 Identity function、3 个 immediate trigger、4 个 deferred constraint trigger、
六个 command function 受控执行、direct DML 拒绝、verified/rejected/withdrawn
successor、四向一致性回滚和双会话 CAS race，以及容器和匿名卷清理。静态独立复审、
shared build/noEmit/9 项测试、API schema spec、API typecheck、定向 lint 与 diff-check
均通过。

B-0 合同 Gate 对 migration 只要求登记 provisional 编号窗口和无冲突扫描证据，不要求
提前创建 migration 文件。`000185`–`000190` 只有在合同 PASS 后、由
schema-migration-owner 开始 schema implementation 时才成为 formal reservation；
`000191`/`000192` 仍是 provisional，必须在 B2c 开始前由同一 owner 重扫 history、
正式 reservation，并分别交付 `B-property-homestay-effect-schema SHA` 与
`B-housing-effect-schema SHA`。缺任一时 D2/B2c 不得启动；两份 SHA 不得冒充
000185–000190 `B-schema-expand SHA`。Domain API owner 不得用“B-0 已评审”作为提前
占号或写 migration 的依据。

两份 effect-schema SHA 交付后，post-B1 `property-foundation-api-owner` 必须独立消费
`B-approval-runtime SHA` 与 `B-property-homestay-effect-schema SHA`（000191），只在
`property-operations/**` 实现 mode transition/force release approval adapter。该
slice 的独立 Gate 必须验证 request→approval→effect、最近越权、super/wildcard
fail-closed、rollback 和禁止路径例外边界；通过后输出
`B-property-foundation-adapter SHA` 并释放路径。两领域 owner 在该 SHA 与两份
effect-schema SHA 全部存在前不得启动，其他 owner 对 `property-operations/**`
修改数必须为零。

B-0 合同 P0 关闭只证明合同冻结，不证明实际高风险路径已阻断。B0.5-S0 是独立代码
stop-ship Gate：首切片只做 controller/service/transaction 前 fail-closed，必须覆盖
normal、superuser、wildcard、旧客户端与 metadata 负向；不得创建 approval request
或顺带实现 runtime、identity/control、module core。它只有独立代码证据通过后才可
输出 `B-high-risk-stopship SHA`。

### 3.13 B0.5-S0 高风险直执门禁：PASS / CLOSED

2026-07-31 最终结论：**PASS**，`open_P0_P1=[]`。

- `B-high-risk-stopship SHA`：
  `d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8`
- 三组定向 spec 共 10/10，通过 API noEmit typecheck、定向 ESLint 和 diff-check。
- 真实 HTTP + PostgreSQL 16 evidence：
  `/tmp/pr192-b05-s0-http-db-b05s0-1785467231-1449385.json`
- cleanup evidence：
  `/tmp/pr192-b05-s0-cleanup-b05s0-1785467231-1449385.json`

独立 Gate 覆盖 normal/superuser/wildcard 的 mode transition 与 force release、
旧客户端字符串 `force=true`、exact 409 envelope、六表零 mutation、Audit/
Idempotency/领域 Service 零调用、`force=false` 低风险可达以及 metadata 合法 pair
跨路由互换负向。临时数据库容器和匿名卷均已清理。该 Gate 只放行 B-0.5 S1–S4，
不代表 identity/module core、B-1 approval runtime 或生产能力已完成。

### 3.14 B-0.5 S1 handoff：UNBLOCKED / awaiting independent re-Gate

2026-07-31 更新：B-0 限定重开项已全部关闭，S1 已解除阻塞但**尚未重新 Gate，
不得标记 PASS**。S0 PASS 与
`B-high-risk-stopship SHA=d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8`
保持有效；S2/S3 在 S1 独立重新 Gate 通过前仍禁行。

历史开放项（均已由 B-0 final8 关闭，等待 S1 消费复验）：

- P0：`000185` 缺 assignment 双 CAS database function、assignment/latest-audit
  deferred consistency、decision assigned-verifier binding 与 terminal consistency。
- P1：Identity create/update/list/detail、filter/sort、masked evidence 与 Party
  `identitySummary` 尚未形成 exact wire contract/shared type。
- P1：10 条 identity endpoint 的 page permission 与 surface 权威冲突，需限定复审
  明确 exact requiredPermissions。
- P1：49-row manifest 已包含 availability，但 shared API route 常量缺项。

Files runtime 接线、legacy Party adapter 与 module/control runtime 仍属于后续 S2/S3，
不作为重开 B-0 的理由；`000190` 也不提前增加 `property_foundation` control。上述
P0/P1 已由合同、shared、schema 原 owner 修复并重签
`B-contract=5704ab…`、`endpoint=3cff469…`、`B-schema=db1a9a93…`；下一步必须重新
执行 S1 handoff Gate。

## 4. 方案落盘结论

本目录下的：

- `prd.md`
- `design.md`
- `implement.md`
- `review-gates.md`

构成唯一权威合并方案。会话中的 V2–V7 是评审演进记录，不作为实施时并列规范；如有冲突，以本目录文档为准。

## 5. 后续 Gate 规则

- 任一实施子任务开始前读取对应 Trellis spec。
- 每个 worker 必须有唯一文件 owner。
- 每个实现由不同 checker 审查。
- 任一 P0/P1 未关闭不得 handoff 或进入下一 Gate。
- 自动化 technical PASS 不代替真人 UAT。
- 只有 Production Readiness Gate PASS 才能开启高风险生产 enforce。
