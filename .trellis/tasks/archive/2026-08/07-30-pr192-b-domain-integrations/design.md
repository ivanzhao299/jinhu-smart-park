# PR192 B 领域集成技术设计

## 0. 合同消费边界

本设计登记父任务 `research/b0-product-access-freeze.md`、
`research/b0-identity-control-freeze.md` 和
`research/b0-runtime-contract-freeze.md` 为 B-0 权威候选。它们只有在最终独立
Gate 后才通过 `B-contract SHA`、`B-schema-expand SHA` 和 runtime effect manifest
SHA 进入本任务。

本文件不再复述 route、状态、schema 或 effect manifest；实现者必须从最终 SHA
解析 exact contract。任何差异先回到 B-0 change control，禁止在领域 adapter 中
自行解释或创建兼容别名。

## 1. 精确 Ownership

| Owner | 独占路径 |
|---|---|
| module-dependency-owner | `apps/api/src/modules/saas-modules/**` 及本领域 tests |
| property-foundation-api-owner | post-B1 仅 `apps/api/src/modules/property-operations/**` 的 mode transition/force release approval adapter 与 tests |
| homestay-api-owner | `apps/api/src/modules/homestay/**` 及本领域 API/integration tests |
| housing-api-owner | `apps/api/src/modules/housing/**` 及本领域 API/integration tests |
| shared-property-web-owner | `apps/web/app/assets/identity-submissions/**`、`apps/web/app/property/notifications/**`、`apps/web/app/property/event-delivery-incidents/**`、`apps/web/app/property/approval-incidents/**` |
| homestay-b-web-owner | handoff 后的 `apps/web/app/homestay/**`、`apps/web/features/homestay/**` |
| housing-b-web-owner | handoff 后的 `apps/web/app/housing/**`、`apps/web/features/housing/**` |
| api-integration-owner | `apps/api/src/app.module.ts` |

Track A Web owner 必须先交付 SHA 并退出对应路径，B Web owner 才接管。所有 owner 知道
自己不是唯一 Agent，不得回退他人变更。

`module-dependency-owner` 仅在独立 B0.5 module-core milestone 持有 `saas-modules/**`。输出
`B-module-core SHA` 后必须记录验证结果、冻结 SHA、释放路径并退出；后续 B2c/B3
owner 不得重新取得或修改该路径。

明确禁止修改：

```text
packages/shared/**
database/migrations/**
database/seeds/**
apps/api/src/modules/property-approvals/**
apps/api/src/modules/property-tasks/**
apps/api/src/modules/property-operations/**
apps/web/features/property-shared/**
scripts/property-remediation/migration/**
```

其中候选 migration `000191_*`、`000192_*` 只能由父任务
schema-migration-owner 在 B2c 前重扫 history、正式 reservation、创建或修改；domain
API owner 不拥有任何 migration。
上述 property-operations 禁止路径仅对 post-B1
`property-foundation-api-owner` 的 mode/release adapter slice 例外；其他 owner 仍为
零修改，且该 owner 不改 identity/control core。

## 2. 阶段 DAG

```text
B-0 三份候选 → 最终独立 Gate
  → B-contract/B-schema/effect manifest SHA
  → B0.5-S0 high-risk fail-closed
  → B0.5 module dependency
  → B-module-core SHA
  → B2b B-extension-core
  → 000191/000192 effect-schema owner batch + two SHA
  → post-B1 property approval adapter slice
  → B-property-foundation-adapter SHA
  → B2c homestay/housing adapters
  → B3 domain Web + app wiring
  → B-final-reconcile
```

`B-module-core SHA` 是规范产物名。B0.5 module core 不读取或等待
`B-extension-core`，也不等待
后续 adapter/Web 完成。B2c/B3 必须消费已冻结的 module SHA 和 extension core。

B0.5-S0 是独立代码 Gate，首切片只在现有正式高风险入口实现 fail-closed，并覆盖
normal/superuser/wildcard/旧客户端负向用例；不得在该切片创建 approval request、
接入 runtime 或顺带实现 module/identity/control。B-0 合同 Gate 通过不能替代该代码
Gate。

## 3. Adapter 边界

领域仅依赖最终 SHA 冻结的 ports/contracts：

```text
IdentityVerificationPort
PropertyApprovalCommandPort
PropertyApprovalProjectionPort
PropertyTaskAssignmentPort
PropertyTaskProjectionPort
PropertyOperationsPort
```

领域 adapter 不读取 runtime 内部表，不复制状态机，不自行发布第二类 approval/task
event。Port 版本或语义不够时提交 change request。

## 4. Homestay 集成

Check-in transaction：

```text
lock booking
→ lock sorted Parties
→ identity port locks/revalidates current verified submissions/snapshots/files
→ validate booking/occupancy/state/scope
→ write check-in + guest evidence audit
```

同一 transaction 贯穿，不能先获取 boolean eligibility。Audit 保存 submission/snapshot/
identity/file digest。取消、终止和财务适配依据 manifest approvalPolicy：创建 request
后对象进入受控 pending 状态，runtime execution 再调用稳定 domain command。

Web 在原 canonical booking/task/finance surfaces 中加入审批/identity 状态和允许动作，
不创建新 route 或第二份 query/mutation。

## 5. Housing 集成

每个高风险 action 映射一个稳定 domain command、以 `.request` 结尾的 approval
action ID 和独立 lower dot-separated effect kind。执行前重新
验证状态、金额、scope、policy snapshot 和版本。住房金额保持 decimal string/scaled
integer，不经过 JS number；账务仍写 housing 子账。

Effect receipt/manifest 的 exact DDL 与约束只引用最终 runtime effect manifest SHA；
本领域设计不复制 schema，也不从 action ID 拼接 effect handler。

Lease、finance、purchase adapters 使用 execution idempotency key 和领域 unique key。
Runtime 重试只得到同一业务效果。Web 只填充 Track A detail/tab 的 read-only slot，
根据 decision/execution/assignment projection 显示申请、待批、执行、失败和结果。

## 6. Module 与 Wiring

Module dependency service 在同一 tenant/park 验证 active assignment 和依赖；API、
`/users/me`、菜单由既有跨层合同保持一致。此任务不改 menu projection。

Module dependency 在 B0.5 独立 build/test 并输出 `B-module-core SHA`。后续 app wiring
只能消费其公开 module/provider contract，不修改已释放的 `saas-modules/**`。

`app.module.ts` 只在所有模块独立 build/test 和 handoff 后由 integration owner 修改。
Wiring checker 验证没有 circular dependency、dual provider、旧 service 与新 port 并行
注入或未受 module guard 的公开 controller。

## 7. Rollback

- Domain integration 使用父任务 flags 分 tenant/park shadow/enforce。
- 关闭 enforce 后，新 request/identity/audit 保留；已 executed 不回退。
- 旧客户端遇到 approval-required 返回明确兼容响应，不静默直执。
- Web flag 关闭恢复 Track A read-only surface。
- app wiring 回退不执行 destructive migration。
- 财务/审批 RPO=0；任何 partial effect 为 P0。

## 8. Machine Gates

B0.5 Module Core Gate：

- 只消费 B contract/schema expand。
- Module on/off、dependency、superuser、multi-park 和 409 行为通过。
- 输出 `B-module-core SHA`，冻结并释放 `saas-modules/**`。
- 对 Track A、B runtime、B-extension 和领域 adapters 的依赖数为零。

B2c/B3 Domain Gate：

- Ownership/import boundary 静态检查。
- 精确消费 `B-module-core SHA` 与 `B-extension-core SHA`。
- 精确消费 `B-property-homestay-effect-schema SHA`（000191）与
  `B-housing-effect-schema SHA`（000192）；缺任一则 D2/B2c 不启动。
- 两领域开始前必须消费独立 `B-property-foundation-adapter SHA`；该 Gate 验证
  property mode/release request→approval→effect、最近越权与禁止路径例外边界。
- Homestay identity check-in concurrency、supersede race、TOCTOU。
- 每个 approval action 正向、maker/checker、状态冲突和最近越权。
- Runtime crash/reclaim/replay 下领域 financial effect 一次。
- Task claim/complete 调用 owning aggregate，list/count/rebuild 一致。
- Web canonical route、权限、状态、deep-link 和高风险 slot E2E。
- Identity submission、Party identity deep-link、notification、event-delivery incident
  与 approval incident canonical routes 全覆盖。
- Event replay 五维授权负向矩阵逐项缺失 active `asset` module、incident
  page、`property_event:read_incident`、assigned tenant+park incident scope 或
  `property_event:replay` 时均返回 403；`asset` module assignment missing、disabled、
  expired 分别返回 403，generic event/read 不可替代。
- 320/360/390/768/desktop、keyboard、screen reader、200%/400% zoom/reflow、
  forced-colors 机器证据完整。
- Old API/client compatibility、flag rollback/re-enable。
- API/Web/shared build、typecheck、targeted regression 和 app startup。

## 9. DEC-01～DEC-06 执行补充（2026-08-03）

- DEC-01：审批提交事务冻结 PostgreSQL `transaction_timestamp()`、booking/occupancy/
  sorted credential/sorted confirmed ledger contributor 快照；执行按相同锁序重验，取消、
  occupancy 释放、凭证作废和财务效果处于同一事务。
- DEC-02：退款/减免可用额由 direct FK 与不可变 legacy mapping 的并集计算；未关联历史
  数据直接隔离并阻断新审批，不推断来源。
- DEC-03：历史住房货币权威为 CNY，当前数据非 CNY 计数为零。
- DEC-04：提交前预创建 draft handover，冻结 ID/version、上海业务日、证据/表计/凭证/
  item 哈希、sorted ledger contributor/deposit balance 与 receivable `new|existing|none`
  模式；执行不得切换模式。
- DEC-05：采购转移冻结一个聚合目标应收；每个 item 单独 expected-version CAS 与审计，
  新目标仅冻结保留 ID/完整 insert 字段，执行时在 purchase/item CAS 后创建。
- DEC-06 A：已付款/已退款采购不可作废；退款保留 approved/refunded，并由实际审批决策人
  记录执行审计。

Raw PostgreSQL DML 结果统一通过 `typeormQueryRows` 解包，防止 TypeORM 返回
`[rows,rowCount]` 时把成功 CAS 误判为冲突。
