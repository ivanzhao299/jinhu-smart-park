# PR192 B 身份与共享控制面技术设计

## 1. Ownership

本任务协调两个互不重叠的实现 owner：

| Owner | 独占路径 |
|---|---|
| property-foundation-api-owner | `apps/api/src/modules/property-operations/**` |
| shared-property-web-owner | `apps/web/features/property-shared/**`、`apps/web/app/assets/parties/**` |

外部 owner：

- shared-contract-owner：`packages/shared/src/property-business/**`。
- schema-migration-owner：全部 B identity/property migrations 与 entities schema request。
- api-integration-owner：`apps/api/src/app.module.ts` 最终 wiring。
- homestay-api-owner：`apps/api/src/modules/homestay/**` check-in adapter。
- migration-reconcile-owner：backfill/shadow/reconcile/rollback scripts。
- approval-runtime-owner：模式切换/强制释放 approval runtime。

任何路径变更通过 SHA handoff，不得跨 owner 顺手修改。

资产控制面 Web routes 的需求和 contract 属于本任务的交付，但本任务不据此创建父表
之外的隐含 route owner。路由实现通过显式 handoff 进入父计划 B3，并由父最终
ownership 表中的 `shared-property-web-owner` 执行；handoff 精确列出
`/assets/property-operations/**`、`/assets/property-occupancies/**` 和
`/assets/property-mode-transitions/**` 的页面合同、输入 SHA 和验收项。父 ownership
治理未确认该 B3 路径接管前，不得写这些 route 文件。

## 2. 阶段与权威 SHA

```text
B1 schema/shared contract consumption
  → foundation/identity API runtime core
  → B-property-foundation-runtime SHA ──→ B2b core fixture
  → B-identity-ui-input SHA

B-property-foundation-runtime SHA
  → B2c domain integrations/check-in
  → B2c handoff + B-identity-ui-input SHA
  → B3 Party/identity/control Web
  → B4 shadow/final reconcile/rollback
  → B-identity-control-technical SHA
```

`B-property-foundation-runtime SHA` 是独立 B1 milestone，不等待 check-in、domain
adapters、Web、backfill、shadow 或 rollback。它只证明 foundation/identity API、
schema consumption runtime、锁/CAS/snapshot/file policy 和 verifier port 已通过
core Gate。

`B-identity-ui-input SHA` 只含 route/UX/permission/response 输入合同，不包含任何
Web 实现。`B-identity-control-technical SHA` 是不同产物，只能在 B2c、B3、B4 全部
通过后生成。

## 3. Identity 数据模型

建议聚合关系：

```text
Party
 ├─ current_identity_version
 ├─ current_verified_submission_id
 └─ IdentitySubmission
      ├─ requested/pending/verified/rejected/superseded
      ├─ identity_version
      ├─ snapshot_id
      ├─ requested/recorded/submitted/verified actor
      └─ optimistic version
           └─ immutable IdentitySnapshot
                ├─ normalized hash + algorithm/version
                ├─ encrypted payload ref + key/format
                └─ protected file snapshots
```

数据库约束：

- tenant/park/Party 关联一致。
- 每 Party 最多一个 active requested/pending submission。
- current pointer 必须指向同 Party、同 identity version 的 verified submission。
- snapshot 一经 submission 引用后业务字段不可 update/delete。
- normalized identity canonicalization 在 hash、加密、比较和唯一键前只执行一次。

## 4. Command 与锁序

Canonical commands：

- create Party profile。
- update non-identity profile。
- update/supersede identity。
- submit identity verification。
- decide verification。
- project sensitive/masked detail。

统一锁序：

```text
Party
→ current submission
→ identity snapshot
→ protected files（按 UUID 排序）
→ dependent booking Parties（check-in 时按 Party UUID 排序）
```

Create/supersede/verify 同时使用 pessimistic lock、partial unique 和 expected version
CAS。已知唯一约束冲突翻译为 409 并重载 winner；其他 persistence error 原样抛出。

Check-in 由 homestay owner 在同一 transaction 锁 booking 后进入统一 Party 锁序，
调用 identity verifier port；不得先在本模块返回“已核验”布尔值再由另一 transaction
写入住。Adapter 返回并审计 immutable evidence reference。

## 5. API 与 Projection

兼容接口保留，但路由到 canonical commands。新专用接口：

```text
PUT  /property/parties/:id/identity
POST /property/parties/:id/verification
```

retryable write 使用 IdempotencyInterceptor 语义而非 guard-only。Controller 声明
`@RequireModule("asset")` 和 shared permission constants；service 在 repository/
transaction 内执行 scope 与 field/file policy。

Party projection 按 permission 返回 full/masked/omitted 字段。Picker endpoint 只返回
服务端生成的 `{id,label,secondaryLabel,disabledReason}`。403/404 不泄露 scope 外 Party
存在性。

## 6. Protected Identity Files

- MIME/大小来自 shared upload policy。
- 上传、metadata、download、delete 分别交叉 domain permission 与 generic file
  permission。
- Submission freeze transaction 锁所有 file rows，验证 tenant/park/uploader/biz type/
  active/version/SHA-256 后写 snapshot reference。
- 被 snapshot 引用的文件不能 generic delete；detach/supersede 只能通过 domain command。
- 上传中、pending removal 或持久化删除未完成时禁止提交。
- 无 download 权限只显示 metadata，不请求 blob。

## 7. 共享房产控制面

Property foundation 保持现有 occupancy owning rules。控制面 query 同时展示共享
projection 和 live blockers；模式切换 transaction 必须按 shared occupancy spec 的
全局锁顺序验证 owning aggregates。Generic occupancy create/activate 不向业务角色
开放。

模式切换/force release command 只产生 approval request；在 approval handoff 前
返回 approval-required/fail-closed，绝不直写最终模式或释放占用。

## 8. 迁移与兼容 Adapter

Schema owner 先 expand；foundation owner 实现双读兼容 adapter 与 canonical write；
reconcile owner 负责 deterministic UUIDv5 backfill、change capture、mutation replay
和 tenant shadow report。

Enforce 前差异必须为零：

- 双 active submission。
- cross-scope reference。
- verified 无 pointer/snapshot。
- hash/version/file 不一致。
- check-in eligibility 不一致。
- migration audit 缺失。

Final tenant lock/reconcile 成功后才切 enforce。Rollback 关闭 enforce/UI，不删除新
数据；兼容 API 继续调用 canonical command。任何 migration 失败立即停止后续
backfill、seed、deploy 和 verify。

## 9. Canonical UI

在 B1，本任务只把 Party detail 的授权 tabs/sections、snapshot/actor/status
projection 和 read/write capability 写入 `B-identity-ui-input SHA`，不创建 React
route/component。Identity editor 与 verifier 永不在同一默认岗位同时可写。

父计划 B3 必须同时取得 `B-identity-ui-input SHA` 和 B2c domain handoff，之后才由
`shared-property-web-owner` 使用 `ds-page/panel/table/mobile-record` 实施全部
Party/identity/control Web。Party 和 occupancy 详情可深链，returnTo allowlist 恢复
列表上下文。页面必须实现父任务完整状态矩阵、移动断点、键盘、读屏、zoom/reflow、
forced-colors、reduced-motion 和 44px 触控。

## 10. Machine Gates

B1 Core Gate：

- API/runtime core、schema consumption、snapshot/lock/CAS/file policy。
- Identity verifier port 与 control API approval-required boundary。
- 无 `apps/web/**`、homestay/housing domain adapter、backfill/shadow 实现。
- 输出 `B-property-foundation-runtime SHA` 和 `B-identity-ui-input SHA`。

Full Technical Gate：

- Schema：partial unique、FK/CHECK、不可变 snapshot、tenant/park scope。
- Permission：四权 exact-set、同人核验拒绝、字段/文件 projection。
- Concurrency：并发 create/supersede/submit/verify/check-in 与 file bind/delete。
- Compatibility：old API/client、backfill rerun、change replay、rollback/re-enable。
- Shadow：全部硬差异阈值为零。
- Occupancy：模式阻断、cross-domain race、generic source 禁止、force-release fail closed。
- UI：唯一 canonical Party、状态矩阵、deep-link、mobile、WCAG/DS。
- Ownership：每个跨层文件只有一个 owner/handoff SHA，无 open P0/P1。
- 输入包含 B2c domain handoff、B3 Web evidence 和 B4 reconcile/rollback evidence，
  输出 `B-identity-control-technical SHA`。
