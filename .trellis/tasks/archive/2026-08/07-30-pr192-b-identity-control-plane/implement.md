# PR192 B-0.5 Property Foundation Core 实施计划

> 状态：`technical PASS / B-0.5 Core Gate closed / open_P0_P1=[]`。

## 1. 前置条件

实施前必须同时具备：

- Track A technical handoff SHA。
- 父任务 B-0 最终 Gate PASS 与 `B-contract SHA`。
- `b0-identity-control-freeze.md` 最终 SHA。
- `b0-runtime-contract-freeze.md` 最终 SHA。
- `b0-product-access-freeze.md` 最终 SHA。
- 父 owner 已产出且仅覆盖 `000185–000190` 的 `B-schema-expand SHA`。
- 四输入 SHA 对应 `open_contract_P0_P1=[]`，schema/shared owner reservation 已登记。

上述任一缺失或 SHA 内容不一致时停止。本子任务不得用自己的 PRD/design 补齐合同，
不得复制 schema 或接受旧状态别名、Party 嵌套 identity mutation、局部锁序
作为临时实现。

本阶段统一称 **`B-0.5 property foundation core`**；`B-1` 仅指父计划后续 approval
runtime。

所有实现 worker 在写代码前运行 `trellis-before-dev` 并读取目标层 spec。共享路径按
owner 串行 handoff；并行 worker 不回滚其他 owner 修改。

## 2. 执行批次

### S0：高风险直执 Fail-closed 首切片

唯一允许首先实施的切片：

1. 在现有 mode transition 与 occupancy `force=true` release URL 接入 freeze 规定的
   fail-closed boundary。
2. 使用 exact action IDs：
   `property.mode-transition.request`、
   `property.occupancy.force-release.request`。
3. 在 approval runtime 尚不可用时返回统一 `approval-required` envelope。
4. 对 normal/super/wildcard 分别证明 mode、occupancy、audit/outbox 均无业务 mutation。
5. 独立 checker 复审并登记 `B0.5-S0 PASS` SHA。

S0 未 PASS 前，以下 S1–S4 全部禁行。

### S1：Schema/Shared Contract Handoff Consumption

- 读取父 schema-migration-owner 已交付、覆盖 `000185–000190` 的 identity/control
  expand SHA，不在本子任务生成 migration。
- 读取父 shared-contract-owner 已交付的 Party/Identity/control/module/verifier port
  SHA，不在本子任务修改 shared exact contract。
- checker 只验证它们逐项追溯父四输入 freeze/addendum，不接受本子任务中的第二套
  schema。
- 重点拒绝：旧状态别名、draft withdraw、identity retry endpoint、Party 嵌套
  mutation、错误 permission/action alias、outbox 非 `event_id` 权威。
- 逐项消费 identity freeze §4.1 的 DTO、query、camelCase response、masked evidence、
  Party `identitySummary` 与 header/body/receipt idempotency 权威。
- 10 条 endpoint 全部验证 active `asset` module、identity page、product freeze exact
  action permission 与 scope；`surfaceId` 不得代替 permission。
- 消费 schema addendum §1.1 的 assignment/decision 双 CAS functions、immediate
  guards、三向 deferred consistency 与 direct-write ACL evidence。

任一不一致回父 owner 修复并重新 handoff，不在 API owner 路径打补丁绕过。

### S2：Identity/Party Foundation Runtime

property-foundation-api-owner 实施：

- Party profile canonical command 与授权 projection。
- 顶层 `/property/identity-submissions/**` query/command。
- Exact 六状态、editable draft、submit snapshot freeze、append-only decision、
  pending-without-decision withdraw、create+supersedes re-submit。
- Verification queue/policy freeze、claim/reassign/revoke 双 CAS/append-only audit、
  same-predicate list/count 与 assigned-verifier-only decide。
- 消费 queue authority/FK、submission queue/policy conditional CHECK、
  decision-assignmentVersion/queue/policy-hash composite trigger；不在 child 文档或代码
  另造 schema。
- CAS、actor separation、legacy boundary、protected file policy。
- Transaction-aware identity verifier port。
- Party `identitySummary` 到顶层 identity detail 的 deep-link projection；identity
  audit exact route。

禁止新增 Party identity/verification mutation 子路由和 retry endpoint。

### S3：Property Control/Module Foundation Runtime

property-foundation-api-owner 实施：

- Asset effective module dependency 与并发管理锁。
- Operations/occupancies/control query、live blockers、generic occupancy ownership。
- CamelCase filter/`sort`/`order`/response、`allowedActions` 与 blocker `deepLink`。
- S0 boundary 的 foundation 整合；B-1 handoff 前继续 fail closed。
- Audit/outbox 使用 runtime freeze 的 `event_id` identity，不实现 approval/task/event/
  notification worker。

### S4：Core Contract Tests 与独立 Gate

contract-test-owner 与 checker 覆盖：

- Identity API/HTTP/DB/permission/file/actor/decision/snapshot/CAS。
- 全局锁序与 create/submit/decide/withdraw/supersede/file delete 并发。
- Module dependency、control blocker、occupancy source 与 cross-domain race。
- normal/super/wildcard、最近越权、跨 tenant/park、module/scope 失效。
- camelCase business data/error detail、`errorCode/latestVersion/recoveryAction`、
  envelope `request_id/server_time:number`、allowedActions。
- actionId/effectKind 映射与 runtime/product shared lower-dot regex/allowlist，无
  child-local pattern。
- Identity/notification deep-link allowlist、失权与 source-ID 不泄露。
- Operator/verifier minimal bundle、identity/notification page permission、masked
  evidence/on-demand protected download。
- Assignment claim/reassign/revoke/decide races，items/count exact same predicate。
- legacy adapter 只进入 canonical command。

Checker 只报告，修复回原 owner；P0/P1 由非修复者复审。

## 3. 全局锁序实施要求

所有 owner 共用三个 freeze 的唯一顺序：

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

实现与测试必须检查：

- 跳过不存在层级可以，反向补锁不可以。
- Identity-only 从 Party 开始。
- Verifier port 复用调用方 transaction；后续 domain adapter 在 booking/source 后进入。
- Generic file delete 先 reference/owning aggregate，再 snapshot/file；不能改序则稳定拒绝。
- Task/approval 后续 owner 继续此顺序，handoff 不允许局部重定义。

## 4. Permission、Notification 与 Web Input

Permission、bundle/岗位 grant、stage eligibility 和 deep-link exact contract不在本计划
重定义，直接使用父 freeze SHA。

UI-input owner 只整理以下 handoff，不创建/修改 `apps/web/**`：

- Party profile/summary surface、顶层 Identity list/detail workbench 与 top-level API。
- 顶层 notification list/detail、`identitySummary.deepLink` 和 notification
  type→surface allowlist。
- `asset:identity-submissions:page`、`property:notifications:page` 与
  `property-bundle:*` product exact grants；operator/verifier minimal projection/
  protected-download policy。
- `property:approval-incidents:page` 与 `property:event-delivery-incidents:page` 独立
  surface/bundle；event list/detail/replay 的 active `asset`
  module+page+action+assigned-scope 负向矩阵。
- Approval incident operator bundle 含 `property_approval:read_incident`；retry 测试同时
  断言 active `asset` module+page+read_incident+assigned scope+retry permission。
- 两类 incident 测试分别覆盖 `asset` module assignment missing、disabled、expired
  均为 403，以及 page/action/scope 任一缺失为 403；generic permission 不可替代。
- camelCase projection/filter/sort/order/error detail、`allowedActions` 与 numeric
  `server_time` envelope contract。
- field/file masking、audit permission 组合、negative access matrix。
- desktop/mobile/keyboard/zoom/DS 验收输入。

Supervisor 仅以 `property_task:supervise` 调用 release/unblock；没有 supervise action。
Approval retry、task rebuild、notification mark-read 使用各自 exact permission。Stage
eligibility 由 permission+current relation+scope+actor exclusion 判定，不以 bundle/
岗位名称为权威。

## 5. 验证命令

按受影响范围至少运行：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api build
pnpm typecheck
pnpm test
```

数据库可用时运行 migration rerun、targeted PostgreSQL integration 与相关
auth/files/users-assets regression。S0 必须有真实 HTTP+DB 零 mutation 证据；不得用
源码正则替代行为验证。

本阶段不修改 Web，因此不把 Web build 伪报为本阶段实现验证；B-3 owner 消费
`B-identity-ui-input SHA` 后运行 Web/browser/accessibility Gate。

## 6. 产物与 Handoff

Core Gate 通过后输出：

- `B-property-foundation-runtime SHA`
- `B-identity-ui-input SHA`

每份 handoff 必须记录：

```text
stage = B-0.5 property foundation core
parent B-contract SHA
identity/runtime/product-access freeze SHAs
B0.5-S0 PASS SHA
from/to owner
owned paths
base SHA
handoff SHA
consumed schema/shared SHA
validation commands/results
known failures
open P0/P1
downstream B-2c DAG pointer =
  property-foundation-api-owner
  → 000191 B-property-homestay-effect-schema SHA
  → B-property-foundation-adapter SHA
  / 000192 housing SHA (reference only)
```

下游顺序：

1. B-1 approval runtime 消费 S0/foundation action、lock、outbox handoff。
2. B-2c domain integrations 消费 verifier port/property foundation handoff；post-B1
   `property-foundation-api-owner` 在自身 Gate 前另取 `000191`
   `B-property-homestay-effect-schema SHA`，并只输出
   `B-property-foundation-adapter SHA`；housing owner 另取 `000192` SHA。B-0.5 不
   依赖或交付它们。
3. B-3 Web 同时消费 UI-input 与 domain handoff。
4. B-4 reconcile 消费 schema/runtime handoff，执行 backfill/shadow/final reconcile。

下游不得通过修改本子任务文档形成新合同；发现差异必须回父四输入 freeze/addendum
重新 Gate。

## 7. 完成标准

- [x] 四份最终 freeze/addendum SHA 与 `B-contract SHA` 已登记。
- [x] S0 首切片独立 PASS，后续切片启动顺序可审计。
- [x] 无旧状态别名、Party 嵌套 identity mutation、identity retry endpoint。
- [x] 六状态、decision/snapshot/CAS/composite scope 按 freeze 验证通过。
- [x] Assigned verifier authority、claim/reassign/revoke audit/CAS、same-predicate
      list/count 与 assigned-only decide 验证通过。
- [x] 所有路径遵循统一全局锁序，无 file-first/source 回锁。
- [x] Bundle/page permission、masked/download、notification/identity 顶层 workbench
      deep-link、camelCase error detail 与 numeric `server_time` exact 一致。
- [x] 10 条 Identity endpoint 的 module+page+action+scope、exact DTO/query/response、
      clientKey/header/receipt replay-conflict 均通过正负向测试。
- [x] `000185` 双 CAS、唯一 audit/decision 入口、三向 deferred consistency、
      direct-write ACL 与 race/rollback 测试通过。
- [x] 本子任务 owned diff 无 schema/migration/shared contract；只记录父
      `000185–000190 B-schema-expand SHA`。
- [x] 本阶段没有 approval/task/notification runtime、domain adapter、Web 或 reconcile
      越界实现。
- [x] 两个 handoff SHA open P0/P1 为零，可被父计划后续阶段消费。

## 8. 2026-07-31 Core Gate 结论

B-0.5 consumed-handoff 独立复审最终 `PASS`。本轮已逐字消费终局 B-contract、产品
访问冻结、共享合同、B-schema-expand 与 schema evidence，重建 S2/S3/files/
integration manifests，并重跑 API noEmit、限定单元/合同测试和正式 S0 真实 Nest
HTTP + PostgreSQL 16 门禁。S0 normal/super/wildcard/legacy 均为 exact 409、零业务
mutation，临时容器与匿名卷清理通过；schema 结论明确复用已逐字核验 raw SHA 的终局
不可变证据，不冒充本轮数据库重跑。

- `B-property-foundation-runtime SHA`：
  `19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a`
- `B-identity-ui-input SHA`：
  `5aa7e796cef386e4148d6d95964fc95684f55d8334dce6b7aac73c69793873a5`
- `open_P0_P1=[]`
- 永久 superseded：
  `922c1570cfc2356da3d85dc686e46eeeedf16bd0f8bd23dab4ad5cfba30fff43`、
  `e0b7a392b52aebcf8fe99808c5e235897750f0e336f9da1f81729837fc219249`、
  `5403706a5aa0f1ea5e4c7e46f45ade83a5505c86ee68613f137200447d37fd7f`、
  `63c64329eb8e50d1372fd52a91ff563bccf0d7b0532b68fa1dfbc54328d0eca0`
- 权威证据：
  [research/b05-core-gate-final-pass.json](research/b05-core-gate-final-pass.json)

B-1 approval runtime 只能消费新 runtime handoff；B-3 只能消费新 UI-input，不得借此
改写父 freeze。B-2c 仍按父 DAG 在 B-1 后另取 `000191`，本阶段不交付 domain adapter。
