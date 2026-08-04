# PR192 B-0.5 Property Foundation Core PRD

> 状态：`active / B-0 and B0.5-S0 PASS`。

## 1. 阶段与唯一输入

本子任务阶段名固定为 **`B-0.5 property foundation core`**。不得再沿用旧阶段名
指代本子任务；`B-1` 只保留给父计划后续 approval runtime。

实现唯一输入是父任务以下四份 freeze/addendum 在最终 B-0 Gate 通过后形成的 SHA：

- `research/b0-identity-control-freeze.md`
- `research/b0-runtime-contract-freeze.md`
- `research/b0-product-access-freeze.md`
- `research/b0-schema-physical-addendum.md`

四份 SHA 按冻结 grammar 合成为父任务 `B-contract SHA`。本文件只规划消费与验收，
不复制或派生第二套 schema、状态机、权限、错误、锁序或 API 合同。四输入不一致、
SHA 未登记或
`open_contract_P0_P1` 非空时，本子任务不得开始；实施中需要改变合同必须回父任务
重新复审并产生新 SHA。

## 2. 目标与范围

交付共享 Party/Identity 与 property control 的 foundation runtime，使住房、民宿和
资产控制面消费同一身份与房产底座，并为后续 B-1 approval runtime、B-2 领域接入和
B-3 Web 集成提供稳定 handoff。

本阶段包含：

- `B0.5-S0` 高风险直执 fail-closed 修复。
- Identity/Party canonical commands、projection、protected evidence 与 verifier port。
- Property operations/occupancies/control API foundation 与 `asset` module dependency。
- 已批准、仅覆盖 `000185–000190` 的 `B-schema-expand SHA` 与 shared contract 的
  消费、API/DB/权限/并发合同测试；本子任务不产 schema/migration。
- 后续 Web 所需 route、projection、`allowedActions` 和 deep-link input handoff。

本阶段不包含：

- Approval、task、event/notification runtime 的实现。
- 民宿 check-in、住房/民宿领域 adapter。
- Party/control Web 页面实现。
- backfill、shadow、final reconcile、生产 enforce。
- B-2c adapter 开始前才需要的 `000191/000192` effect owning migrations；它们不是
  B-0.5 prerequisite 或 deliverable。

## 3. 强制执行顺序

1. 取得四份最终 freeze/addendum SHA 与父任务 Gate 记录。
2. 只实施 `B0.5-S0`：现有模式切换与 `force=true` 释放在 approval runtime 接入前
   按 exact `approval-required` 合同返回，normal/super/wildcard 均为零业务 mutation。
3. `B0.5-S0` 通过独立 Gate 后，才允许实施其余 property foundation core。
4. foundation core 通过后形成 runtime/UI-input handoff；后续 B-1/B-2/B-3/B-4 各自
   按父计划消费。

`B0.5-S0` 未 PASS 时，身份控制面、module dependency 或其他 B-0.5 切片全部禁行。

## 4. Canonical 产品与 API 表面

Canonical 用户表面：

- `/assets/parties`
- `/assets/parties/[partyId]`
- `/assets/identity-submissions`
- `/assets/identity-submissions/[submissionId]`
- `/property/notifications`
- `/property/notifications/[notificationId]`

Identity mutation/query 只使用顶层 `/property/identity-submissions/**` canonical API。
Party API/Page 只提供授权后的 `identitySummary` projection 和 freeze 规定的 identity
deep link；Party tab 是 profile/summary/deep-link，不承载 identity editor、核验决定或
审计 mutation。Identity list/detail 是录入、assigned-verifier queue、核验与 audit
工作台；notification list/detail 是本人通知与 canonical source deep-link 工作台。

Identity exact 六状态只引用 identity freeze：

```text
draft
pending_verification
verified
rejected
withdrawn
superseded
```

Draft 可编辑但不可 withdraw；pending 且没有 decision fact 时才可 withdraw。
Rejected/withdrawn 重提使用 canonical create-draft + `supersedesSubmissionId`，不存在
identity retry endpoint。Snapshot、decision、actor、legacy、CAS、pointer 与复合 FK
均以 identity freeze 为唯一权威，本 PRD 不重述 schema。

Assigned verifier authority 同样只引用 identity freeze：submit 冻结 queue/policy，
claim/reassign/revoke 使用 submission+assignment version CAS 和 append-only audit；
只有当前 assigned verifier 可 decide。List items/count 使用同一 eligibility predicate。
Queue authority/FK、conditional queue/policy CHECK、decision composite trigger 与
legacy queue/anomaly 均只消费 `B-schema-expand SHA`，本 PRD 不复制。Canonical
claim/reassign/audit routes/actions 不在本 PRD 另起别名；product-access 最终 SHA
补充这些 action 时必须逐字一致。

Property surface 固定为父 freeze 中的：

- `/assets/property-operations/**`
- `/assets/property-occupancies/**`
- `/assets/property-mode-transitions`

高风险 action ID 固定为 `property.mode-transition.request` 与
`property.occupancy.force-release.request`。B-1 接入后仍沿用同一领域 URL 创建
approval request，不新增旁路 URL。Runtime `effect_kind` 是执行结果 identity，与
`.request` action ID 分离并直接引用 runtime/product 统一字面量与
`^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$` pattern；不得在 child 定义另一 regex。

## 5. 权限、深链与字段

权限 exact-set、built-in bundle/岗位 grant、stage eligibility、字段/文件投影和错误
目录全部引用四输入 freeze/addendum。特别要求：

- wildcard/super 不绕过 module、scope、actor separation、snapshot 或 fail-closed。
- Identity/notification workbench page permissions 固定为
  `asset:identity-submissions:page`、`property:notifications:page`；bundle code 使用
  `property-bundle:*` namespace 并逐字消费 product-access exact grants。
- Approval incident 与 event-delivery incident 分别使用
  `property:approval-incidents:page`、`property:event-delivery-incidents:page` 及独立
  minimal operator bundle，列表/action/scope 不得互相替代。Event incident read
  必须同时通过 active `asset` module+page+`property_event:read_incident`+assigned
  scope，replay 另验 replay permission。Approval incident read 必须同时通过 active
  `asset` module+approval incident page+`property_approval:read_incident`+assigned
  scope；retry 另验 `property_approval:retry`。
- Event list/detail/replay 与 approval incident read/retry 遇到 `asset` module assignment
  missing、disabled、expired 时分别返回 403；page/action/scope 任一缺失同样 403，
  generic module/read/manage/audit 不可替代。
- Operator 不自动 sensitive-read/download；assigned verifier 默认只读 masked evidence
  metadata，按需 protected download 重新校验 assignment/scope/file permission 并审计。
- Supervisor 以 `property_task:supervise` 调用既有 release/unblock，不存在 supervise
  action；approval retry 与 task rebuild 使用各自独立权限。
- Business data/query 和 error detail 使用 freeze 规定的 camelCase，包括
  `allowedActions`、filter、`sort`、`order`、`errorCode`、`latestVersion`、
  `recoveryAction`；envelope 仅 `request_id/server_time` 使用 snake_case，且
  `server_time` 为 epoch-milliseconds number。
- Identity/notification deep link 只由服务端 allowlist 生成，并在点击与目标 API
  重新验证 current module/page/action/scope；失权不得泄露 source ID。
- Party identity audit 不新增权限，按 freeze 组合
  `party:sensitive_read + audit:read`。

## 6. Transaction 与领域边界

所有实现使用父 freeze 的唯一全局锁序：

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

不存在的层级可跳过，但不得反向补锁。Identity-only command 从 Party 开始；check-in
与领域 adapter 由后续 owner 在 source/booking 后进入同一顺序。Generic file delete
先锁 owning reference，再 snapshot/file；不能安全改序时返回 freeze 规定的稳定冲突。

## 7. 产物与 Handoff

通过 B-0.5 Core Gate 后输出：

- `B-property-foundation-runtime SHA`：foundation API/runtime、verifier port、module
  dependency、control fail-closed 与合同测试。
- `B-identity-ui-input SHA`：只含父 freeze 的 canonical routes、camelCase projection、
  `allowedActions`、permission、identity/notification deep-link 与 UX 验收输入，不含
  Web 实现。

Handoff 必须记录三个 freeze SHA、base/handoff SHA、owned paths、验证结果和
`open_P0_P1`。后续 B-1 approval runtime 只能消费该 handoff，不得改写本阶段合同。
B-2c handoff 只附父 DAG 指针：post-B1 `property-foundation-api-owner` 在自身 Gate
另行取得 `000191` 的 `B-property-homestay-effect-schema SHA`，并输出唯一
`B-property-foundation-adapter SHA`；housing owner 另取 `000192` SHA。B-0.5
不等待、不验证也不交付这些 SHA。

## 8. 验收标准

- [x] 四份最终 freeze/addendum SHA 已登记且是唯一合同输入。
- [ ] 阶段与报告统一使用 `B-0.5 property foundation core`。
- [ ] `B0.5-S0` 独立 PASS，normal/super/wildcard 高风险直执均零 mutation。
- [ ] Identity 只使用顶层 submission API 与 exact 六状态，无旧状态别名、嵌套
      mutation 或 retry endpoint。
- [ ] Append-only decision、immutable snapshot、CAS、actor separation 和 composite
      scope 约束按 freeze 的 API/DB tests 通过。
- [ ] Assigned verifier queue/policy、claim/reassign/revoke CAS/audit、same-predicate
      list/count 与 assigned-only decide 通过。
- [ ] 全局锁序、file reference/delete 和并发测试无局部反向锁。
- [ ] Asset dependency、live blocker、generic occupancy ownership 与 control API 通过。
- [ ] Bundle/page permission、masked metadata/on-demand protected download、camelCase
      error detail、numeric `server_time`、`allowedActions` 与 deep-link 负向测试通过。
- [ ] Identity freeze §4.1 exact DTO/query/response/Party summary 与
      `X-Idempotency-Key=clientKey` receipt contract 通过正负向测试。
- [ ] 10 条 Identity route 全部通过 active `asset` + identity page + exact action +
      scope；000185 双 CAS、唯一 audit/decision 入口和三向 deferred consistency 通过。
- [ ] 本子任务只消费覆盖 `000185–000190` 的 `B-schema-expand SHA`，未创建或修改
      schema/migration。
- [ ] 本阶段没有 Web、领域 adapter、runtime approval/task/notification 或 reconcile
      越界实现。
- [ ] Runtime 与 UI-input handoff 可由 B-1/B-2/B-3 消费，open P0/P1 为零。
