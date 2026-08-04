# PR192 房产业务产品化整改技术设计

## 1. 架构原则

- 页面和权限隔离先于大规模内部重构。
- owning aggregate 是业务状态唯一权威。
- projection 可重建，不得成为第二状态源。
- financial write、approval terminal、audit 和 outbox 使用一个 PostgreSQL transaction。
- migration forward-only，失败立即停止后续流程。
- expand、shadow、enforce、contract 分阶段发布。
- 每条高风险路径都必须能 fail closed。

### 1.1 Track B B-0 权威候选与 Gate 边界

B-0 当前登记以下三份 `research/` 文档为共同权威候选：

- `b0-product-access-freeze.md`
- `b0-identity-control-freeze.md`
- `b0-runtime-contract-freeze.md`

最终独立 Gate 必须同时复审三份候选的跨文档一致性，并在
`open_P0_P1=[]` 后生成可追溯的 `B-contract SHA`、`B-schema-expand SHA` 和 runtime
effect manifest SHA。候选文本本身不等于正式合同；下游领域计划不得复述 route、
状态机、schema 或 effect 作为第二权威，只能消费最终 SHA。

B-0 合同 P0 关闭与 B0.5-S0 代码 stop-ship 是两个 Gate：前者证明合同无开放 P0/P1，
后者证明实际正式入口在 controller/service/transaction 前对 normal、superuser、
wildcard 和旧客户端均 fail closed。B0.5 首切片只做该阻断，不创建 approval request，
不接 runtime，也不顺带实现 identity/control 或 module core。

## 2. 六层权限 Manifest

权威契约位于 `packages/shared/src/property-business/**`，至少包含：

```ts
interface PropertyAccessManifestEntry {
  featureId: string;
  module: {
    required: "asset" | "homestay" | "housing_rental";
    dependencies?: string[];
  };
  surface: {
    menuCode: string;
    pageCode: string;
    route: string;
    detailRoutes?: string[];
    legacyAliases?: string[];
  };
  actions: Array<{
    actionId: string;
    method: string;
    path: string;
    permission: string;
    idempotency: "required" | "not-required";
    approvalPolicy?: string;
  }>;
  data: {
    dimensions: Array<"tenant" | "park" | "building" | "unit" | "owner" | "assignee">;
    enforcement: "repository" | "service" | "both";
  };
  fields: Array<{
    field: string;
    classification: "public" | "internal" | "personal" | "sensitive" | "financial";
    readPermission?: string;
    projection: "full" | "masked" | "omitted" | "readonly";
  }>;
  files: Array<{
    bizTypes: string[];
    readPermission: string;
    uploadPermission?: string;
    deletePermission?: string;
    referenceScope: string;
  }>;
}
```

机器规则：

- canonical route 到 page permission 一对一。
- mutation API 到 action permission 一对一。
- protected file biz type 全覆盖。
- tenant 内 permission code 唯一。
- permission definition tenant-wide，role grant park-scoped。
- wildcard 只绕过 permission code，不绕过 module。
- manifest 映射 capability，不硬编码 Role。

### 2.1 Track A 服务端 Stop-ship

`PROPERTY_WORKBENCH_V2` 同时控制新工作台 UI 和 Track A API 安全边界：

- off 或未设置：保持 PR #192 legacy API 行为，不以 Track A 未完成的 approval
  合同改变旧客户端响应。
- true：9 个 `TRACK_A_HIGH_RISK_ACTION_IDS`/variant 在进入领域 service 和
  transaction 前由服务端统一返回 409 `approval-required`；Web 隐藏按钮只能作为
  UX，不能作为安全控制。
- 两个 ledger endpoint 必须在服务端读取已验证 DTO 的 `entry_type`：
  homestay 的 `refund|waiver`、housing 的 `refund|waiver` 命中高风险分支；housing
  押金退款不得因内部转换为 `deposit_refund` 绕过。
- superuser 和 wildcard 只影响 permission code，不影响此 stop-ship。
- safety policy 必须从 canonical manifest metadata 解析 action；调用方不得通过省略、
  拼错 action ID 或传入自声明的“非高风险”标志使 policy fail open。canonical
  metadata 缺失、重复或与 endpoint/discriminator 不一致时必须拒绝并由合同测试报错。
- 只有 Track B approval adapter SHA、maker-checker/atomic execution Gate 和
  compatibility test 全部通过后，才能把 409 替换为 approval request；在任何阶段
  都不能回退为高风险直执。

该规则由独立 infrastructure policy 提供单一判定，homestay/housing controller
负责在各自 DTO 判别后调用；不得在两个领域复制 feature-flag 解析或 409 语义。

该 Track A 基线是 B0.5-S0 的输入证据，不自动关闭 B0.5-S0。后者必须按最终
`B-contract SHA` 重新核对 exact 高风险入口并独立验证，且不得把 B-0 合同 Gate
通过当作代码行为已通过。

## 3. Module 和共享控制面

- `asset` 是 `homestay`、`housing_rental` 的商业前置依赖。
- 缺 asset 时启用民宿/住房返回 409。
- 有依赖模块时关闭 asset 返回 409。
- 不自动赠送或静默启用 asset。
- generic occupancy API 不能声明 homestay、housing、commercial leasing source。
- 普通业务动作通过 owning aggregate 调用共享占用服务。
- 强制释放和模式切换只从资产共享控制面发起，并进入 approval。

### 3.1 Track A 权威交付顺序

当前 17 个 canonical Web routes 尚未全部落地；提前写入 Web menu、landing 或
redirect 会把用户导向 catch-all placeholder，并形成“菜单看似完成、页面实际不存在”
的假通过。权威顺序固定为：

1. schema migration 与 exact tests：expected property permission set 恰好 65；
   migration 文件名 `000183_*` 在创建前仅为候选，schema owner 重扫全部文件和
   migration history 后实际创建
   `000183_property_business_granular_rbac.sql`，此后才成为 reservation。
2. API `/users/me` property menu projection 基础：只使用 active enabled modules、
   granular page permission、当前 tenant+park 的 role/relation；不读取
   custom/legacy/wildcard 作为自动扩权来源。此阶段 Web feature flag/菜单继续不暴露
   canonical routes。
3. shared Web foundation 与 A-base fixture；A-base handoff 后立即串行执行
   `A-2.5 workbench API/response contract closure`。合同代码可提前研究，但任何
   workbench Web 不得在 A-2.5 独立 Gate 前开始。
4. homestay/housing domain Web owners 建立真实 canonical app routes 和 route guards，
   分别输出 route SHA。
5. 两份 route SHA 交付后才进入 Web 接入批次：menu-projection-owner 修改
   `apps/web/lib/menu.ts` 并实现 legacy module landing、unknown property deep-link
   fail-closed；仅当 Party target 已 handoff 时，housing-web-owner 才在其独占 app
   route 内实现 tenant alias redirect 与 guard，否则提交 link/redirect=0 evidence。
   两者共同输出 Web 接入 handoff。
6. route evidence 与独立 Gate。

Domain Web owners 独占各自 app route/route guard（包括 housing tenant alias）；
menu owner 不创建 placeholder 页面或领域 route，且不得在 route SHA 前预注册可见菜单。

Shared foundation 的浏览器验收不改变上述六步顺序。Foundation 阶段没有真实 domain
route，只交付纯函数/组件静态与单测、lint/typecheck/build 通过的 integration-ready
SHA；不得创建 preview 或临时生产 route。首个输出 canonical route SHA 的 domain
owner 在该真实 route 上采集 desktop/mobile/keyboard/focus/zoom/ARIA 证据，shared
owner 修复组件问题并签收 final UI Gate，QA owner 归档 evidence。证据补齐前不得称
foundation final UI Gate 完成。

### 3.2 A-2.5 Workbench API/Response Contract Closure

该 stop-ship 位于 A-base handoff 之后、domain routes 之前。输出必须冻结：

- `packages/shared` 中所有现有和新增 workbench response types，禁止 route-local
  interface。
- Homestay：tasks、stays、turnover detail、finance，以及 guest/work-order
  candidates 的采用/移除决定。
- Housing：tasks、handover list/detail、billing、finance、repair list/detail。
- `/homestay/stays/[stayId]` detail alias，使 Track A detail routes 从 6 增至 7；
  alias 只解析到 authorized booking detail，不产生第二套详情。
- 第 9 个高风险 variant
  `housing.handovers.complete-move-out-financial`；Track B 前保持 unavailable/409。
- 财务字段与附件 ID 的最小服务端投影；GET endpoint 使用精确 read permission，
  不以 manage/write 或宽 bundle 替代。

列表/详情必须由批量 query、join 或明确 projection endpoint 提供，禁止 N+1 拼装。
不得为了闭合合同扩 permission bundle。Party canonical target 已由 asset-party
owner 交付为 `/assets/parties` 与 `/assets/parties/[partyId]`，使用独立
`asset:party` 页面权限；housing alias 只指向该 target。

## 4. 单一响应契约和前端迁移

响应契约唯一真源：

```text
packages/shared/src/property-business/response-contracts.ts
```

- API serializer/controller 和 Web feature API 引用同一类型。
- 输入 DTO 继续由 API class-validator 负责。
- route-local 不得重复定义 response interface。
- OpenAPI/contract snapshot 验证实际字段。
- Track A 首先闭合两组已发现的 projection drift：
  - housing Party list/create serializer 对 `mobile`、`email` 输出 masked 值，测试
    同时覆盖列表元素和刚创建对象，避免 create response 绕过列表 projection。
  - homestay booking detail、issue credential、return credential 使用同一
    credential projection，`credentialReference` 永不以完整值出现在 HTTP 响应。
- projection 必须发生在 API/service response boundary；Web 不得接收完整值后再遮蔽。

前端 extract-first：

1. 补当前行为 characterization test。
2. 移出 response contract。
3. 抽 API client。
4. 抽 query/mutation hook。
5. 抽现有 UI block。
6. 同一提交删除旧 block。
7. 行为等价后建立新 route。
8. 最后将 legacy route 改为 redirect。

禁止新旧双实现和局部操作刷新三个以上无关上下文。

## 5. UX 状态合同

每页必须实现：

- initializing skeleton。
- empty-initial、empty-filtered、empty-scope。
- partial/full forbidden。
- 局部失败和重试。
- offline/stale。
- 409 conflict。
- submitting + 稳定 idempotency key。
- upload queued/uploading/scanning/succeeded/failed/removing。
- draft TTL/清除。
- success focus/aria-live。
- destructive confirmation。

Landing 使用固定 page priority；module、page permission、data scope 分别处理。URL 参数、搜索条件和数据数量不得改变授权落地选择。

远程实体选择器由服务端返回授权后的 `{id,label,secondaryLabel}`，前端不得拼接敏感字段。权限、tenant、park 或 scope 变化时清除缓存、选择和草稿。Create CTA 必须有独立 create permission。

完整详情使用 canonical route。`returnTo` 只接受同源 allowlist，并恢复 filter、page、sort 和 scroll anchor。

WCAG/Design System Gate 包含 axe、键盘、读屏、200%/400% zoom、320px reflow、360/390/768/desktop、forced-colors、reduced-motion、focus、44px 触摸目标和共享 surface 证据。

## 6. Approval 唯一持久化状态模型

Approval request 只保存：

```text
decision_status
execution_status
decision_version
execution_version
```

Decision：

```text
draft -> submitted -> pending_approval
      -> approved | rejected | withdrawn | expired
```

Execution：

```text
not_started -> executing -> retry_wait -> executing
                         -> executed | execution_failed | infra_exhausted
infra_exhausted -> retry_wait -> executing
```

`not_required` 只用于 rejected、withdrawn、expired。

合法组合：

| decision | execution |
|---|---|
| draft/submitted/pending_approval | not_started |
| approved | not_started/executing/retry_wait/executed/execution_failed/infra_exhausted |
| rejected/withdrawn/expired | not_required |

数据库 CHECK 拒绝其他组合。Decision 和 execution 分别使用 expected status + version CAS。旧 `status` 只作为两个发布周期的只读 projection，新代码不得写或据此决策。
Withdraw 与 expire 只允许 `pending_approval` 且 decision count=0；`submitted` 不允许
withdraw/expire，首条 checker decision 出现后也不允许。

权威读取：

- approval inbox：`decision_status=pending_approval`。
- worker：`decision_status=approved` 且 execution 可领取/重试/reclaim。
- 业务完成：`execution_status=executed`。

## 7. Approval 执行与 Outbox

Claim：

- `FOR UPDATE SKIP LOCKED`。
- claim token、worker ID、lease 与 heartbeat 语义只引用 runtime freeze；本父设计不
  保存第二套数值。当前候选 runtime exact 值为 lease 30 秒、heartbeat 10 秒，最终以
  runtime contract SHA 为准。
- lease reclaim 后旧 token 的 heartbeat/完成写入失败。
- 稳定 execution idempotency key 在 approved 时生成，重试不变。

错误分类：

- 业务状态、余额、scope、snapshot 冲突：`execution_failed`，不可自动重试，重新审批。
- DB transient、deadlock、serialization、worker crash：commit 前进入 `retry_wait`，
  仅 worker 自动指数退避；预算耗尽进入 `infra_exhausted`。
- 人工 incident retry 只允许 `infra_exhausted`，必须具备独立权限、reason、incident
  reference 和 CAS；只允许先转 `retry_wait`，再由普通 executor 自动 claim 到
  `executing`。`retry_wait` 不暴露人工 retry。
- commit 结果不确定时先按 request/execution/domain unique key 只读 reconcile，禁止盲目重执。

同一个 PostgreSQL transaction 原子提交：

1. 领域业务效果。
2. approval `execution_status=executed`。
3. execution audit。
4. outbox event。

提交成功后 approval 永远保持 executed。Publisher、broker、consumer 故障只能改变 outbox/inbox 状态，绝不能回退 approval 或重新调用领域 command。

Outbox：

- 稳定 event ID。
- aggregate type/id/version/sequence。
- publisher lease、retry、DLQ、manual replay。
- manual replay 复用 event ID。
- 同 aggregate 按 sequence 发布，前序 DLQ 默认阻断后序。

Consumer inbox：

- `(consumer_name,event_id)` 唯一。
- inbox insert 与本地副作用同 transaction。
- 同 event ID checksum 不同为 P0。
- at-least-once delivery，数据库内 exactly-once effect。

必须在 claim、domain transaction、outbox publish、consumer transaction 的每个 commit point 注入 crash，验证财务效果一次。

Approval `actionId` 与执行 `effectKind` 分离：所有需审批 action ID 固定以 `.request`
结尾；effect kind 使用 lower dot-separated 独立 allowlist，禁止由 action ID 字符串
派生 handler。Effect receipt/manifest DDL、unique/FK/CHECK/cardinality/hash 不在父
设计复述，exact 引用 runtime freeze 最终 effect manifest SHA。

## 8. Task Assignment

任务展示是 projection，但 assignment 不是自由的 projection 字段。

已有 assignment 的 owning aggregate：

- turnover。
- work order。
- approval stage/request。
- identity submission。

领取必须调用 owning aggregate command，队列只投影 source。

派生任务使用 `biz_property_task_assignment`：

- 到店、离店。
- 签署登记。
- 入住/退租交割。
- 催收。
- 采购付款。

Assignment 只拥有领取、处理、阻塞；业务完成仍由 booking、lease、handover、receivable、purchase 决定。`task_key` 在 tenant/park 内活动唯一，claim 使用 source eligibility + assignment CAS。Projection 删除可重建，assignment aggregate 不随 projection 删除。

## 9. Party、Identity Snapshot 和 Check-in

Party 权限分离：

- 建档。
- 非身份档案维护。
- 身份维护。
- 实名核验。
- 敏感读取。

Canonical UI 为 `/assets/parties/[partyId]`。住房租客、民宿住客只链接此表面。

Identity submission 的唯一状态集为
`draft/pending_verification/verified/rejected/withdrawn/superseded`。每个 Party
最多一个 `draft/pending_verification` submission，数据库 partial unique 是最终并发权威。

不可变 `biz_party_identity_snapshot` 保存：

- Party/identity version。
- document type。
- normalized identity hash。
- hash algorithm/version。
- encrypted payload reference、key ID、format version。
- captured time/actor。
- protected file ID/version/SHA-256。

进入 pending verification 时在同一 transaction freeze snapshot。需要修改身份时 supersede 旧 submission，增加 identity version，并创建新 snapshot。密钥轮换可重加密，但不能改变业务 hash/version/file snapshot。

Verify 必须比较 submission snapshot、Party identity version/hash/algorithm 和 protected file versions。Verifier 不得等于 requested、recorded 或 submitted actor。

Check-in transaction 锁 booking、排序后的 Party、current verified submission 和 snapshot，并重新验证 pointer、version、hash、document type、files 和 consent。Audit 保存 submission/snapshot/identity/algorithm/file digest。

## 10. Identity 迁移与兼容

Legacy submission ID 使用固定 namespace UUIDv5。Backfill：

- verified + 完整 identity → verified snapshot/submission + current pointer。
- rejected + identity → rejected snapshot/submission。
- unverified + identity → pending verification。
- unverified + 无 identity → 不创建。
- verified/rejected 但 identity 不完整 → anomaly，禁止 enforce。

保留 legacy actor/source/confidence，不伪造未知 verifier。

迁移采用 expand → compatibility adapter → change capture → deterministic backfill → mutation replay → shadow reconcile → per-tenant final lock/reconcile → enforce。

硬差异阈值均为零：

- 双 active submission。
- cross-scope reference。
- verified 无有效 pointer/snapshot。
- identity hash/version 不一致。
- check-in eligibility 不一致。
- task active set 差异。
- migration audit 缺失。

旧 Party create/update/verification 接口保留两个发布周期，但调用 canonical command。旧宽权限不再授权身份修改或核验。Rollback 只关闭 UI/enforce，不删除 submission、snapshot、approval 或 audit。

## 11. 分阶段 Dataset

### 11.1 A-base

```text
property-remediation-a-base-v1
```

只依赖 Track A 和 PR #192 现有 schema，生成：

- 3 park、每 park 1 building、每 building 1 floor，共 3 building、3 floor。
- 100 unit，按 park 60/30/10。
- 精确 module/menu/page/API/data-scope users。
- 4,000 Party。
- 10,000 booking。
- 20,000 booking_night。
- 2,000 lease。
- 10,000 housing receivable。
- 2,000 charge_plan。
- 2,000 turnover。
- 1,000 handover。
- 1,000 purchase。
- 2,000 purchase_item。
- 1,000 work_order。
- 6,500 property_occupancy：100 unit × 每 unit 65 条，按 park 精确分为
  3,900/1,950/650。
- 2,000 sys_file，每条对应一个小型、有效的测试 PNG。
- 日期、金额及所有可按 park 分配的业务量保持 60/30/10 分布。

不生成 identity submission、approval、assignment 或 outbox。

A-base 分成三个有序交付：

1. `A-ephemeral-db-bootstrap`：由独立 `a-bootstrap-owner` 将可复验的
   `000001`–`000174` + `skip-record:000175` + `000176`–`000183` bootstrap 提取为
   只允许 exact ephemeral container 的 harness。复用 A-C2 的 exact run-id、双
   label、running、`--rm`、official PostgreSQL、显式 `POSTGRES_DB`、匿名 volume、
   URL override rejection 和 cleanup 约束；独立 review PASS 后 A-base implementation
   才能开始。
   冻结 handoff SHA：
   `b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`。
2. `A-shared-web-foundation`：在 A contract SHA 冻结后、领域工作台开始前，由
   `shared-property-web-owner` 建立 picker、task presentation、detail shell、dialog、
   page state 和 DS adapter，输出 integration-ready `A-shared-web-foundation SHA`。
   Handoff 以静态/单测和 lint/typecheck/build 为准，不建 preview route；final UI
   Gate 在首个 domain route SHA 上关闭。它不依赖 Track B identity/approval/task
   schema。
   当前 integration-ready SHA 为
   `d2a015f9ba931b2024e6360570697c77b74ea3fb`；final UI 状态仍为
   `awaiting_first_canonical_route`。
3. `A-base-core`：只在 A contract SHA、Track A schema migration SHA 与
   `A-ephemeral-db-bootstrap SHA` 均冻结后生成，
   输出 profile/version/data checksum、fixture SHA、生产保护和 cleanup 证据；这是
   homestay、housing 工作台页面开始实现前的稳定输入。
   当前 source commit 为 `32ccc02852c3201c6f68e3b6b89e4398cb102a17`，final run
   `abase20260730final32ccc01`，fixture handoff
   `3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
   profile checksum `68da…107b`；独立 final review PASS、`open_P0_P1=[]`。
   该 milestone 已 provisioned/frozen，但不等于 Track A technical pass。
4. A workbench 消费 contract SHA、schema SHA、`A-base-core fixture SHA` 和
   `A-shared-web-foundation SHA`，并必须先通过 A-2.5；不把 menu/landing handoff
   作为页面前置。A-2.5 当前已 unblocked 且为下一步，domain Web 仍 blocked。仅
   homestay、housing 两个页面 owner 输出各自 route SHA；随后
   menu-projection-owner 消费这些 route SHA，实现 canonical menu、landing 和
   redirect。
5. `A-route-evidence`：页面 route SHA、canonical menu、landing/redirect 全部
   handoff 后运行；
   复用同一 `A-base-core` checksum，只补 route/page/API/data/file、viewport、WCAG 和
   cleanup evidence，不允许静默改写 core fixture。若确需改变 core，重新发布
   `A-base-core` SHA 并使全部页面消费者重新基线。

### 11.2 B-extension

```text
property-remediation-b-extension-v1
```

要求准确 A-base checksum 和 B schema SHA，增加：

- identity snapshot/submission。
- approval request/decision/execution。
- assignment。
- outbox/inbox/DLQ。
- maker-checker/crash/reclaim/乱序场景。

组合 checksum 包含两个 profile/version/data/manifest checksum 和 B schema SHA。B-extension 对既有 base columns 的预期改动必须进入独立 before/after mutation manifest。

B-extension 严格位于 runtime core 之后、domain integration 之前：

1. 先冻结 B contract SHA 和 B schema expand SHA。
2. property foundation 和 module core 先完成各自 handoff；B1 随后只交付
   `B-approval-runtime SHA`，B2a 再单独消费它并交付
   `B-property-task-runtime SHA`。两者是独立 milestone，不合并成一个 runtime
   contract SHA。
3. `B-extension-core` 消费上述三个 runtime handoff SHA、module-core SHA、准确的
   `A-base-core` checksum 和 B schema SHA，生成 extension fixture SHA 与 combined
   checksum。任何 runtime handoff 缺失时 fail closed，且 fixture 必须在 homestay/
   housing domain integration 和 D3 跨域自动化前完成。
4. 唯一 schema-migration-owner 在 B2c 前独立交付
   `B-property-homestay-effect-schema SHA`（000191）与
   `B-housing-effect-schema SHA`（000192）；缺任一则 D2/B2c 不启动，两份 SHA 不得
   冒充 000185–000190 core `B-schema-expand SHA`，domain API 不写 migration。
5. post-B1 `property-foundation-api-owner` 独立消费 `B-approval-runtime SHA` 与
   `B-property-homestay-effect-schema SHA`（000191），且只拥有 property mode/release
   approval adapter；独立 Gate 通过后输出 `B-property-foundation-adapter SHA` 并释放
   路径。homestay/housing domain owner 必须同时消费该 SHA 与两份 effect-schema
   SHA，缺任一不得启动；其余 owner 对 `property-operations/**` 修改数为零。
6. `integration-reconcile-final`：只在 B domain integration handoff SHA 后运行，
   对真实 adapters、Web wiring、backfill/shadow/replay/rollback 结果执行最终
   zero-difference reconcile，并发布 final evidence SHA。该阶段不得反向改写
   `B-extension-core`；发现 fixture 缺陷时回到 core owner 重新发布并重跑 D3。

每个 Gate 只校验当时已部署的 schema。

## 12. 发布轨道和双泳道

技术 DAG：

```text
Track A Technical -> Track B Technical -> Track C Technical
                              \
                               -> External Human UAT

Track A + B + C Technical + Human UAT/Signoff
                              -> Production Readiness
```

Track A 可独立完成页面/权限技术整改，但高风险生产动作保持关闭。

Track B technical 包含自动化 enforce、crash、reconcile、compatibility 和 rollback，不包含真人签署。

Track C 只依赖 B technical handoff SHA，不等待真人 UAT。

人工 UAT 是可并行、可长期 awaiting 的外部泳道，只阻止 production ready 和高风险生产 enforce。

## 13. 完成状态

Codex：

```text
planned -> implementing
-> track_a_technical_passed
-> track_b_technical_passed
-> track_c_technical_passed
-> codex_complete
```

Human：

```text
not_scheduled -> environment_ready -> awaiting_participants
-> in_human_uat -> awaiting_signoffs
-> human_gate_passed | human_gate_rejected
```

Production：

```text
not_evaluated -> technical_ready -> awaiting_human_gate
-> awaiting_rollout_approval
-> production_ready | rejected
```

Codex 只负责自动化、环境、记录、统计和缺陷回派，不冒充岗位代表或人工签署人。

## 14. 回滚

- schema expand-only，修复使用 forward migration。
- legacy routes 保留两个发布周期。
- Track A 可关闭 `PROPERTY_WORKBENCH_V2`；off/unset 必须同时恢复 legacy Web 入口和
  legacy API 行为。true 时仍必须保持 9-action/variant server-side 409，不能只关闭
  按钮。
- Track B 可关闭 UI/enforce/publisher，但 executed approval 永不回退。
- 关闭 enforce 不恢复旧宽权限、同人核验或高风险直执。
- Track C 按事务闭包回退代码。
- 财务/审批 RPO=0，非财务 Web/API 目标 RTO≤30 分钟。

## 14. 2026-07-31 交付设计状态

最终交付链为：

- `3766509`：A-2.5 shared workbench contracts。
- `44d6769`：Homestay A-2.5 APIs。
- `8a0bd17`：Housing A-2.5 APIs。
- `5a557e5`：A-2.5 RBAC permissions。
- `d33fad9`：workbench integration contracts 与 Party canonical target。
- `bc2ed7f`：Homestay workbenches。
- `992a6a4`：Housing workbenches。

上述设计经过独立多轮 Gate 与数据库证据复核，`open_P0_P1=[]`。真实
desktop/390、keyboard、zoom/reflow 按用户决定暂不执行并转入外部 UAT；该证据
不阻塞 Track B，但在生产就绪签署前仍需完成。
