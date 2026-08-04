# PR192 B-0.5 Property Foundation Core Design

> 状态：`active / B-0 and B0.5-S0 PASS`。

## 1. Design Authority

本设计只消费父任务最终 Gate 后的三个不可拆分输入：

| Authority | 本任务消费内容 |
|---|---|
| `research/b0-identity-control-freeze.md` | Identity/Party、control、module dependency、锁序与 migration block |
| `research/b0-runtime-contract-freeze.md` | approval/task/event/outbox/notification 边界及跨运行时一致性 |
| `research/b0-product-access-freeze.md` | canonical surface、action/permission、字段、deep-link 与岗位验收 |

三份文件的最终 SHA 合称 `B-contract SHA`，是设计和实现的唯一权威。本文不定义第二套
table/column/FK/state/error/permission；示意文字与 freeze 冲突时必须停止并回父 Gate，
不能由本子任务解释性覆盖。

本阶段固定命名为 **`B-0.5 property foundation core`**。后续 `B-1` 专指 approval
runtime，不得把本阶段产物沿用旧 core 名称。

## 2. Ownership

| Owner | 独占责任 |
|---|---|
| property-foundation-api-owner | Property foundation/identity runtime owned paths |
| api-integration-owner | 最终 Nest wiring |
| contract-test-owner | API/DB/permission/concurrency tests，不修改实现 |
| UI-input owner | 只整理 handoff 文档，不修改 `apps/web/**` |

Shared contract 与仅覆盖 `000185–000190` 的 `B-schema-expand SHA` 由父 B-0 owner
在本子任务外产出；本任务 owner 只消费，不创建或修改 schema、migration 或 shared
exact contract。后续 effect owning migrations 只在 B-2c adapter 前由父级 owner
处理，不属于本设计输入或输出。

Homestay/housing adapter、approval runtime、Web、reconcile 各由父计划后续 owner 实施。
共享路径以 SHA handoff 串行，任何 owner 不跨路径顺手修复。

## 3. Gate 与依赖流

```text
B-0 final Gate
  → identity/runtime/product-access freeze SHAs
  → B0.5-S0 fail-closed implementation + independent Gate
  → remaining property foundation core
  → B-property-foundation-runtime SHA
  → B-identity-ui-input SHA
  → B-1 approval runtime / B-2 domain adapters / B-3 Web / B-4 reconcile
```

`B0.5-S0` 是唯一首切片：修复现有 mode transition/force release 直执，使同一正式 URL
按 freeze 返回 `approval-required` 且零 mutation。其 Gate 未 PASS 前不得实施后续
B-0.5 切片。

## 4. Identity Aggregate Consumption

Identity 聚合完全实现 identity freeze 的 exact 合同：

- 状态仅为 `draft | pending_verification | verified | rejected | withdrawn |
  superseded`。
- Draft 编辑与 submit 冻结 immutable snapshot；draft 不可 withdraw。
- Pending 且无 append-only decision 才可 withdraw。
- Verify/reject append decision fact，并在同一 transaction CAS submission、维护
  Party pointer、audit/outbox。
- Submit 冻结 verification queue/eligibility policy；claim/reassign/revoke 使用
  assignment version CAS 与 append-only audit，只有 current assigned verifier 可决定，
  list/count 共用同一 eligibility predicate。
- Rejected/withdrawn 重提由 create draft 的 `supersedesSubmissionId` 完成；无 retry
  endpoint。
- 新业务 actor 必填；legacy nullable/anomaly、UUIDv5、snapshot/file digest、pointer、
  verification queue authority/FK、decision-assignment composite binding、composite
  scope FK 和 constraints 直接消费 freeze/schema handoff。

本设计不复制或产出 schema。父 owner 提供的 migration/entity SHA 必须能追溯到同一个
identity freeze SHA；出现第二套旧状态别名或 Party 嵌套路由即 Gate 失败。

## 5. Canonical Commands 与 API

Profile create/update 继续使用 Party canonical command；Identity 只使用：

```text
POST /property/identity-submissions
GET  /property/identity-submissions
GET  /property/identity-submissions/:submissionId
PUT  /property/identity-submissions/:submissionId
POST /property/identity-submissions/:submissionId/submit
POST /property/identity-submissions/:submissionId/claim
POST /property/identity-submissions/:submissionId/reassign
POST /property/identity-submissions/:submissionId/decisions
POST /property/identity-submissions/:submissionId/withdraw
GET  /property/identity-submissions/:submissionId/audit
```

Claim/reassign actions 固定为 `party.identity.claim`、`party.identity.reassign`；revoke
是 reassign 的 `assignedVerifierId=null` 分支。Product-access 最终 SHA 必须与这些
method/path/action 逐字一致，否则本阶段停止，不保留 alias。

Party response 只带授权后的 `identitySummary` 与 canonical deep link。不得新增
Party-scoped identity mutation 或 identity retry endpoint。Legacy Party
create/update/verification 只能 adapter 到上述 command。

所有 HTTP wire shape 只引用 identity freeze §4.1，包括 exact mutation DTO、list/audit
query、稳定排序、统一 projection、masked evidence、Party `identitySummary`、
`X-Idempotency-Key=clientKey` 与 receipt replay/conflict。10 条 route 全部要求 active
`asset` module + identity page + product freeze exact action permission + scope；
`surfaceId` 只用于定位。数据库写入只调用 schema addendum §1.1 冻结的
assignment/decision SECURITY DEFINER 双 CAS functions，并消费 immediate/deferred
trigger 与 ACL Gate，API service 不直写三张权威表。

Control API、action ID、camelCase data/query/error detail 与
`request_id/server_time:number` envelope 逐字消费 freeze。模式切换和 force release
沿用现有 URL；B0.5-S0 返回 fail-closed，B-1 handoff 后仍由相同 URL 创建 approval。
`.request` action ID 与 runtime `effect_kind` 分离，不得互相替代。
`effectKind/effect_kind` 逐字消费 runtime/product shared
`^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$` pattern 与 allowlist，不接受 hyphen/underscore
或 child-local regex。

## 6. Transaction、锁与文件

所有 transaction 适配同一全局锁序：

```text
approval request/execution
→ property advisory
→ domain source/owning aggregate
→ Party
→ assignment/current submission
→ snapshot
→ protected file
→ effect/audit/outbox
```

- Identity-only command 从 Party 开始，不能先锁 file 再回锁 submission/Party。
- Check-in verifier port 接受调用方 transaction，在 booking/source 后继续
  Party→submission→snapshot→file；不得返回跨 transaction boolean。
- Property operation/occupancy 先取得同一 advisory lock，再锁 source/owning rows。
- Generic file delete 先解析并锁 owning reference；无法安全保持顺序时 fail closed。
- 同类 rows 去重并按 freeze 的稳定 UUID/domain 顺序锁定。

局部模块不得声明自己的相反锁序；发现旧路径 file-first 或 assignment-first 时，由
owner 改为 freeze 顺序或稳定拒绝，不在 transaction 中反向补锁。

## 7. 权限、Projection 与 Deep Link

Service 授权使用 product-access/identity freeze 的 exact permission+scope，不以岗位、
bundle 或 wildcard 作为 stage eligibility 权威。重点 handoff：

- Identity audit 为 `party:sensitive_read + audit:read`。
- Identity/notification workspace 分别要求
  `asset:identity-submissions:page`、`property:notifications:page`。
- Approval incident 与 event-delivery incident 使用各自 page/minimal operator bundle；
  event read 同时要求 active `asset` module、event page、
  `property_event:read_incident` 和
  assigned incident scope，不能借 approval retry/read 权限进入。
- Minimal grants 逐字消费：
  `property-bundle:property-approval-incident-operator` =
  approval page + `property_approval:read` + `property_approval:read_incident` +
  `property_approval:retry` + `audit:read`；
  `property-bundle:property-event-delivery-operator` =
  event page + `property_event:read_incident` + `property_event:replay` + `audit:read`。
- Approval incident read 的 runtime predicate 固定为 active `asset` module + approval
  incident page + `property_approval:read_incident` + assigned incident scope；retry
  另加 `property_approval:retry`，不得用 generic approval read 替代专用 incident read。
- Event list/detail/replay 与 approval incident read/retry 对 `asset` module assignment
  missing、disabled、expired 分别返回 403；page/action/assigned scope 任一缺失也返回
  403，generic permission 不可替代。
- Operator bundle 不隐含 sensitive read/download；assigned verifier 默认只取 masked
  evidence metadata，按需 protected download 再验 assignment+scope+file permission
  并审计。
- Supervisor 以 `property_task:supervise` 调用 release/unblock，不存在 supervise action。
- Approval incident retry 与 task rebuild 使用各自独立 permission。
- Detail/list 与 error detail 使用 camelCase，动作集合名为 `allowedActions`，错误字段
  为 `errorCode/latestVersion/recoveryAction`；只有 `request_id/server_time` 为
  snake_case，且 `server_time` 是 number。
- `identitySummary.deepLink` 指向顶层 identity submission detail；Party tab 只保留
  profile/summary/deep-link。
- Notification deep link 由 type→canonical surface allowlist 生成，读取、点击和目标
  API 分别重验 current access，失权 fail closed。

Web 不自行推导 allowed actions，不在获得明文后前端脱敏，也不拼接 deep link。

## 8. Module 与 Control Foundation

- Effective module dependency 固定为 `homestay -> asset`、
  `housing_rental -> asset`，不自动启用 asset。
- assign/enable/disable、runtime ModuleGuard、enabled module projection 和 Web
  handoff 使用同一 effective predicate 与 module advisory lock。
- Control query 同时返回 projection 和 live blockers；blocker deep link 按 server
  allowlist/permission 裁剪。
- Generic occupancy 不能声明领域 owning source；领域占用只由 owning aggregate
  command 改变。
- `property.mode-transition.request` 与
  `property.occupancy.force-release.request` 在 approval execution 完成前不改变领域
  authority。

## 9. Outbox 与 Runtime Boundary

Foundation 只写父 runtime freeze 定义的 audit/outbox boundary，不实现 B-1/B-2a
runtime。Canonical event identity 使用 outbox `event_id`；inbox/DLQ/notification
`source_event_id` 按 freeze 的 tenant+park composite reference 消费，禁止映射出第二个
`id/eventId` 权威。

Notification 在本阶段仅形成顶层 list/detail projection/deep-link handoff，不创建
投递 runtime。

## 10. Machine Gates 与 Handoff

### B0.5-S0 Gate

- 两个正式高风险 URL 返回 exact action/error contract。
- normal、super、wildcard 均为零 mode/occupancy/audit/outbox 业务 mutation。
- 现有低风险路径无回归。

### B-0.5 Core Gate

- 四输入 freeze/addendum SHA 可追溯且无本地合同分叉。
- Top-level Identity API/UI input、六状态、decision/snapshot/CAS/actor/file 约束通过。
- Assigned verifier claim/reassign/revoke/audit、same-predicate list/count 与 decide race
  通过。
- 全局锁序、并发冲突与 generic file delete 行为通过。
- Module dependency、live blocker、generic occupancy ownership 通过。
- Exact bundle/page permission、masked/download、deep-link/allowedActions 与 error wire
  正负矩阵通过。
- 只消费 `000185–000190` schema handoff，owned diff 中无 schema/migration。
- 没有 Web、domain adapter、approval/task/notification runtime 或 reconcile 越界。

通过后输出 `B-property-foundation-runtime SHA` 与 `B-identity-ui-input SHA`，均记录
三个 freeze SHA、owned paths、验证证据和 open P0/P1。前者供 B-1/B-2 消费，后者供
B-3 消费；任何下游 owner 都不能借 handoff 修改 frozen contract。

B-2c handoff metadata 只引用父 migration DAG：post-B1
`property-foundation-api-owner` 在自身 Gate 前向 schema owner 取得 `000191` 的
`B-property-homestay-effect-schema SHA`，完成后只输出
`B-property-foundation-adapter SHA`；housing owner 另取 `000192` SHA。该引用不构成
B-0.5 prerequisite、owned output 或 PASS 证据。
