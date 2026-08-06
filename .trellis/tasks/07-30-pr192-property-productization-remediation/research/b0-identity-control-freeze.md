# B-0 身份与共享控制面可执行冻结合同

> 状态：`frozen after identity handoff limited re-review / independent PASS`
>
> 本文是 B-0 身份与共享控制面冻结权威输入。7-page exact-set P1 已经独立限定复审
> 关闭，exact file SHA 由新的 `b0-contract-freeze-manifest.md` 登记；
> 它不是 `B-schema-expand SHA`，也不代表 B0.5-S0 或后续业务实现已经通过。
>
> 当前代码风险登记为 `B0.5-S0`：`PropertyOperationsService.transitionMode()` 和
> `PropertyOccupanciesService.release(force=true)` 仍可直接产生高风险业务结果。
> B-0 合同 P0 在 fail-closed exact 合同与 normal/super/wildcard 零 mutation 测试请求
> 获得批准后视为关闭，不与尚未实施的代码风险循环互锁。B-0 PASS 后只允许先实施
> `B0.5-S0`；该切片未独立 PASS 前，其他 B-0.5 切片全部禁行，相关生产入口和高风险
> enforce 必须保持禁用。

## 1. 冻结范围与不变量

本候选冻结以下边界：

1. Party 五权、asset 页面权限、字段和文件权限。
2. Identity submission/snapshot 的 exact schema、状态机、CAS 和 pointer。
3. 旧 Party API 的兼容适配。
4. transaction-aware identity verifier port。
5. check-in/identity/file 以及 property unit/occupancy 的全局锁序。
6. 模式切换、强制释放的 approval-required 边界。
7. asset 对 homestay/housing_rental 的 effective module dependency。
8. 共享控制面 API、response 和 machine error。
9. UUIDv5、shadow、anomaly 和 rollback。
10. `000185+` provisional window、候选职责与唯一 migration owner。

全局不变量：

- owning aggregate 是业务状态唯一权威；projection 可删除并重建。
- permission wildcard 只绕过 permission code，不绕过 module、scope、字段、文件、
  actor separation 或 approval-required。
- identity、approval、audit、outbox 和领域业务效果的原子边界不得被 controller
  或跨 transaction boolean pre-read 拆开。
- policy stage eligibility 以冻结的 permission、当前 tenant+park relation、data scope
  和 actor exclusion predicate 为权威；bundle/岗位名称只用于配置与展示，不能直接
  通过运行时资格判断。
- outbox 事件唯一主键/跨表引用名固定为 `event_id`；inbox、DLQ、notification 的
  `source_event_id` 通过 tenant+park+event_id 复合关联，不得再建 `id/eventId` 第二
  事件身份。
- migration 仅 forward-only；expand、backfill、validate、enforce 分阶段执行。
- 所有 scope 外对象返回不泄露存在性的 403/404，不返回跨 tenant/park 差异信息。

## 2. Party 五权与页面权限 exact-set

### 2.1 API 权限

以下五项互不蕴含：

| Permission | 能力 | 明确禁止 |
|---|---|---|
| `party:create` | 创建不含身份的 Party profile | 单独写证件、提交核验或决定核验 |
| `party:update` | 修改姓名、联系方式、同意状态、来源和备注 | 写/清除身份、提交或决定核验 |
| `party:identity_update` | 写入、修改、清除身份并 supersede 旧版本 | 决定核验 |
| `party:identity_verify` | 对 `pending_verification` submission 作决定 | 修改身份；核验本人参与的 submission |
| `party:sensitive_read` | 读取授权后的敏感 projection | 修改、提交或决定核验 |

继续保留但不隐含上述能力：

- `party:read`
- `party_role:manage`
- `property_operation:read`
- `property_operation:update`
- `property_operation:transition_mode`
- `property_occupancy:read`
- `property_occupancy:release`
- `property_occupancy:force_release`
- `property_approval:read`
- `property_approval:read_incident`
- `property_approval:retry`
- `property_event:read_incident`
- `property_event:replay`
- `property_task:read`
- `property_task:claim`
- `property_task:process`
- `property_task:release`
- `property_task:supervise`
- `property_task:rebuild`
- `property_notification:read`
- `property_notification:mark_read`

旧宽权限不得桥接新增能力。`party:update`、legacy `*:operations`、permission prefix
和现有 bundle 均不能自动授予 `party:identity_update` 或
`party:identity_verify`。

### 2.2 页面权限

| Page permission | Route | 可见性 |
|---|---|---|
| `asset:party` | `/assets/parties`、`/assets/parties/[partyId]` | Party profile 与 identity summary/deep-link |
| `asset:identity-submissions:page` | `/assets/identity-submissions/**` | Identity 核验队列、详情、决定与审计工作台 |
| `asset:property-operations:page` | `/assets/property-operations/**` | asset 控制面菜单/页面 |
| `asset:property-occupancies:page` | `/assets/property-occupancies/**` | asset 占用只读页面 |
| `asset:property-mode-transitions:page` | `/assets/property-mode-transitions` | asset 模式变更审计页面 |
| `property:notifications:page` | `/property/notifications/**` | 本人通知列表、详情与 canonical source deep-link |
| `property:approval-incidents:page` | `/property/approval-incidents/**` | 仅 approval execution `infra_exhausted` 处置 |
| `property:event-delivery-incidents:page` | `/property/event-delivery-incidents/**` | 仅 event delivery/DLQ 读取与 replay |

所有新 page permission 使用 lower-kebab 段，不使用下划线版本；shared constants、
migration definition、production seed parent map、menu 和 Web guard 必须逐字一致。
Track B 新增 page permission exact-set 恰好为表中的
`asset:identity-submissions:page`、`asset:property-operations:page`、
`asset:property-occupancies:page`、`asset:property-mode-transitions:page`、
`property:notifications:page`、`property:approval-incidents:page`、
`property:event-delivery-incidents:page` 七项。`asset:party` 是 Track A 既有权限，
不计入新增集合；它不能替代七项中的任何一项。
Party identity audit 不新增 `party:identity-audit-read`：读取身份审计必须同时具备
`party:sensitive_read` 与现有 `audit:read`，且继续受 tenant+park+Party relation 限制。
任务 supervisor 动作必须显式要求 `property_task:supervise`，不得由
`property_task:release` 或宽 `manage` 推导；supervisor 使用该权限调用既有
release/unblock command，不新增 `/supervise` action。人工 projection rebuild 使用
独立 `property_task:rebuild`，approval incident retry 使用独立
`property_approval:retry`。通知本人标记已读使用独立
`property_notification:mark_read`，不得复用 read permission 作为 mutation permission。

页面权限只允许进入 surface；每个区块继续按 API permission 独立请求。没有
`party:sensitive_read` 时，服务端返回 masked/omitted projection，Web 不得先取得明文
再自行脱敏。

Approval incident 与 event-delivery incident 是两个独立 surface、projection、action
和 bundle，不能合并列表或互相深链成操作入口。Event incident list/detail 每次请求
必须同时通过 active `asset` module、`property:event-delivery-incidents:page`、
`property_event:read_incident` 和 assigned tenant+park incident scope；replay 另验
`property_event:replay`。Approval incident 使用自己的 page +
`property_approval:read_incident`，不得借 generic approval read 或 event permission
读取 incident projection。Approval incident read 必须同时满足 active `asset`
module、`property:approval-incidents:page`、`property_approval:read_incident` 与
assigned tenant+park incident scope；retry 在此基础上另验
`property_approval:retry`。

对上述 event list/detail/replay 和 approval incident read/retry，`asset` module
assignment missing、disabled、expired 三种情况分别返回 403；page、action permission
或 assigned scope 任一其他维度缺失也返回 403。Generic module/read/manage/audit 权限
均不能替代任何 exact 维度。

### 2.3 Built-in role 与 bundle

Bundle code 统一使用现有 `property-bundle:*` namespace；冒号后的名称逐字复用
`research/b0-product-access-freeze.md` 的 Built-in bundle code，不再创建
`party-profile`、`property-control-read/manage` 等本地别名。与本文件直接相关的
exact-set：

| Bundle code | Exact direct grants |
|---|---|
| `property-bundle:property-party-profile-clerk` | `asset:party`, `party:read`, `party:create`, `party:update` |
| `property-bundle:property-identity-operator` | `asset:party`, `asset:identity-submissions:page`, `party:read`, `party:identity_update`, `file:read`, `file:upload`, `file:delete` |
| `property-bundle:property-identity-verifier` | `asset:party`, `asset:identity-submissions:page`, `party:read`, `party:identity_verify`, `file:read`, `file:download` |
| `property-bundle:property-approval-incident-operator` | `property:approval-incidents:page`, `property_approval:read`, `property_approval:read_incident`, `property_approval:retry`, `audit:read` |
| `property-bundle:property-event-delivery-operator` | `property:event-delivery-incidents:page`, `property_event:read_incident`, `property_event:replay`, `audit:read` |

资产管理员、task/finance/approver/supervisor、auditor 和 incident operator 的 bundle
名称及 exact grants 不在此重抄，以 product-access freeze 最终 SHA 的完整矩阵为唯一
来源。Migration/seed 展开 code 时保留 `property-bundle:` namespace；不得截短后另建
第二个 bundle。

- Operator 不自动获得 `party:sensitive_read`、`file:download`、identity verify 或
  audit read；编辑 API 仅返回完成录入所需的本人 draft 字段。
- Verifier 不自动获得 `party:sensitive_read` 或 identity update。工作台默认只返回
  masked identity/evidence metadata；只有当前 assigned verifier 对 protected evidence
  发起按需 download 时，才同时校验 `file:download`、submission assignment、scope 和
  evidence reference，并写 access audit。
- 不从角色名、permission prefix、相似 bundle 或 wildcard grant 推导权限。即使一个
  actor 被显式授予 operator+verifier 权限，service 仍执行 maker-checker 与 assignment
  separation。
- `000189` 只创建 permission/page/bundle definition；role→bundle/permission grant
  仅能由岗位代表签署的 production-safe seed/bootstrap 写入。

### 2.4 通知与岗位验收引用

通知 recipient/read/delivery 的 schema、scope、幂等和保留期以
`research/b0-runtime-contract-freeze.md` 为运行时 owner；产品 route、字段可见性、
岗位职责与九类岗位 E2E 以 `research/b0-product-access-freeze.md` 为验收 owner。
三份合同出现冲突时不得择一实现，必须回到 B-0 联合复审；本文件冻结的 permission
exact-set、lower-kebab action/error、identity route 和全局锁序不得被别名覆盖。

B-0 至少要形成以下交叉证据：

- notification recipient 在事件 transaction 冻结 exact
  `tenant_id+park_id+recipient_user_id+relation_version`，查询、mark-read 和 deep link
  都重新执行 current module/page/action/scope 检查；relation 后续失效保留 durable
  audit，但 fail closed 列表与 deep link。
- `property_notification:mark_read` 只允许 exact recipient，重复请求保持同一
  `read_at/read_by`，不得由 supervisor、wildcard 或 `property_notification:read`
  代操作。
- 九类岗位逐条提供
  route→visible action→permission/scope→API→DB authority→audit/outbox→notification
  trace，并包含最近越权、跨 park、模块失效和 deep link 失权反例。
- Party 身份录入员与实名核验员必须由两个 actor 旅程覆盖；资产管理员、前台/运营、
  任务处理人、任务 supervisor、审批人和审计员分别验证其 exact action，不以角色名
  或 bundle 名作为 service 授权依据。

Web deep-link exact contract：

- Identity canonical UI 是顶层 `/assets/identity-submissions` list/work queue 与
  `/assets/identity-submissions/{submissionId}` detail。Party tab 只展示 profile、
  `identitySummary` 和 deep-link，不承载 editor/verifier/audit mutation。
- Party `identitySummary.deepLink` 固定指向
  `/assets/identity-submissions/{submissionId}`；只有 active `asset` module、
  `asset:identity-submissions:page`、对应 action permission、Party/submission scope
  全部通过时返回。目标页面只加载顶层 `/property/identity-submissions/**` API。
- Notification `deepLink` 只能由 notification type→canonical surface allowlist 生成；
  notification canonical UI 是 `/property/notifications` list 与
  `/property/notifications/{notificationId}` detail。Identity notification 使用上述
  identity detail，property blocker 使用对应 operation/occupancy detail。列表读取权
  不代表 link 可进入，点击时 Web guard 与目标 API 都重验 current
  module/page/action/scope；失权返回安全 not-found 并留 durable recipient/audit，不
  fallback 到宽列表或泄露 source ID。

## 3. Identity exact schema

以下为 schema request；最终 SQL 名称不得在 owner 间另起第二套。

### 3.1 `biz_party` expand

新增：

```text
identity_version bigint NOT NULL DEFAULT 0
current_identity_submission_id uuid NULL
current_verified_submission_id uuid NULL
```

并新增：

```text
UNIQUE (tenant_id, park_id, id)
CHECK (identity_version >= 0)
```

Pointer 语义：

- `current_identity_submission_id` 指向该 Party 当前 authoritative submission，可为
  draft、pending_verification、verified、rejected 或 withdrawn；同 identity version
  驳回/撤回后创建新 draft 时指向最新 `submission_attempt`。
- `current_verified_submission_id` 仅在当前 identity version 已 verified 时非空；
  身份修改/清除时必须在同一 transaction 置空。
- 两个 pointer 都必须通过 scope+Party+identity_version 一致性触发器或 deferred
  constraint 验证，不能只靠 service pre-read。
- legacy `verification_status` 在兼容期只读投影自 current submission；canonical
  command 不把它作为决策权威。

### 3.2 `biz_party_identity_verification_queue`

Queue row 是 submission routing、list/count 和 verifier eligibility 的数据库权威；角色
名、bundle、通知或 task projection 均不能替代：

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
queue_code varchar(64) NOT NULL
display_name varchar(128) NOT NULL
status varchar(16) NOT NULL              # active | inactive
eligibility_policy_version bigint NOT NULL
eligibility_policy_snapshot jsonb NOT NULL
eligibility_policy_hash varchar(64) NOT NULL
legacy_backfill boolean NOT NULL DEFAULT false
legacy_anomaly boolean NOT NULL DEFAULT false
version integer NOT NULL DEFAULT 1
create_time timestamptz NOT NULL
update_time timestamptz NOT NULL
```

```text
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, queue_code)
CHECK (status IN ('active', 'inactive'))
CHECK (eligibility_policy_version > 0 AND version > 0)
CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$')
CHECK (
  (legacy_backfill = false AND legacy_anomaly = false)
  OR
  (legacy_backfill = true AND queue_code LIKE 'legacy-%')
)
```

Queue policy snapshot exact inputs为 `party:identity_verify`、active `asset` module、
`asset:identity-submissions:page`、current tenant+park relation、Party/submission scope、
actor exclusions、queue-supervisor predicate 和 policy version；不得包含可直接授权的
bundle/岗位名。更新 queue policy 以 version CAS 原子替换 snapshot/hash，旧 submission
仍保留提交时冻结的 policy，不回写。

Submit 只能选择同 scope active queue，并把该行 policy version/snapshot/hash 冻结到
submission。Claim/reassign/decide 同时验证 frozen eligibility 与 queue current
module/relation/scope/actor exclusion；queue inactive 时禁止新 claim/reassign，已分派
决定按冻结的 incident policy fail closed 或由 supervisor revoke，不得静默放行。

Legacy backfill 必须创建 deterministic `legacy-*` queue，且 queue/submission 都显式
`legacy_backfill=true`。无法重建 eligibility 时写
`legacy_anomaly=true/legacy_actor_anomaly=true` 与 non-enforce policy snapshot；anomaly
清零前 tenant 不得 enforce，不能用默认 verifier bundle 伪造历史资格。

### 3.3 `biz_party_identity_snapshot`

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
party_id uuid NOT NULL
identity_version bigint NOT NULL
snapshot_revision integer NOT NULL
document_type varchar(32) NOT NULL
normalized_identity_hash varchar(128) NOT NULL
hash_algorithm varchar(32) NOT NULL
hash_version integer NOT NULL
encrypted_payload text NOT NULL
encryption_key_id varchar(128) NOT NULL
payload_format_version integer NOT NULL
captured_by uuid NULL
captured_at timestamptz NOT NULL
source varchar(32) NOT NULL
confidence varchar(32) NULL
legacy_backfill boolean NOT NULL DEFAULT false
legacy_actor_anomaly boolean NOT NULL DEFAULT false
create_time timestamptz NOT NULL
```

约束：

```text
UNIQUE (tenant_id, park_id, party_id, identity_version, snapshot_revision)
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, party_id, identity_version, id)
FK (tenant_id, park_id, party_id) -> biz_party
CHECK (identity_version > 0)
CHECK (snapshot_revision > 0)
CHECK (hash_version > 0)
CHECK (payload_format_version > 0)
CHECK (
  (legacy_backfill = false AND captured_by IS NOT NULL AND legacy_actor_anomaly = false)
  OR
  (legacy_backfill = true AND source LIKE 'legacy_%')
)
CHECK (captured_by IS NOT NULL OR legacy_actor_anomaly = true)
CHECK (legacy_actor_anomaly = false OR (legacy_backfill = true AND confidence IS NOT NULL))
```

Snapshot 的 document/hash/version/source/captured/file references 不允许 UPDATE 或
DELETE。密钥轮换只允许修改
`encrypted_payload/encryption_key_id/payload_format_version`，并写独立 re-encryption
audit；不得改变业务 hash、identity version 或 file evidence。

### 3.4 `biz_party_identity_submission`

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
party_id uuid NOT NULL
identity_version bigint NOT NULL
submission_attempt integer NOT NULL
snapshot_id uuid NULL
supersedes_submission_id uuid NULL
verification_queue_id uuid NULL
assigned_verifier_id uuid NULL
assignment_version integer NOT NULL DEFAULT 0
eligibility_policy_snapshot jsonb NULL
eligibility_policy_hash varchar(64) NULL
draft_hash_algorithm varchar(32) NULL
draft_hash_version integer NULL
draft_encryption_key_id varchar(128) NULL
draft_payload_format_version integer NULL
status varchar(32) NOT NULL
drafted_by uuid NULL
recorded_by uuid NULL
submitted_by uuid NULL
decided_by uuid NULL
withdrawn_by uuid NULL
superseded_by uuid NULL
drafted_at timestamptz NOT NULL
submitted_at timestamptz NULL
decided_at timestamptz NULL
withdrawn_at timestamptz NULL
superseded_at timestamptz NULL
decision_reason varchar(500) NULL
source varchar(32) NOT NULL
confidence varchar(32) NULL
legacy_backfill boolean NOT NULL DEFAULT false
legacy_actor_anomaly boolean NOT NULL DEFAULT false
version integer NOT NULL DEFAULT 1
create_time timestamptz NOT NULL
update_time timestamptz NOT NULL
```

状态 exact-set：

```text
draft
pending_verification
verified
rejected
withdrawn
superseded
```

唯一合法转换：

```text
draft -> pending_verification
draft -> superseded
pending_verification -> verified
pending_verification -> rejected
pending_verification -> withdrawn   # 仅尚无 decision row 时
pending_verification -> superseded
verified -> superseded            # 仅身份被修改/清除时
rejected -> superseded            # 创建同 identity version 的下一 draft
withdrawn -> superseded           # 创建同 identity version 的下一 draft
```

约束：

```text
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, party_id, id)
UNIQUE (tenant_id, park_id, party_id, identity_version, id)
UNIQUE (tenant_id, park_id, party_id, identity_version, id, snapshot_id)
UNIQUE (
  tenant_id, park_id, party_id, identity_version, id, snapshot_id,
  verification_queue_id, assignment_version, eligibility_policy_hash
)
UNIQUE (tenant_id, park_id, party_id, identity_version, submission_attempt)
FK (tenant_id, park_id, party_id) -> biz_party
FK (tenant_id, park_id, verification_queue_id)
  -> biz_party_identity_verification_queue(tenant_id, park_id, id)
FK (tenant_id, park_id, party_id, identity_version, snapshot_id)
  -> biz_party_identity_snapshot(tenant_id, park_id, party_id, identity_version, id)
FK (tenant_id, park_id, party_id, supersedes_submission_id)
  -> biz_party_identity_submission(tenant_id, park_id, party_id, id)
partial UNIQUE (tenant_id, park_id, party_id)
  WHERE status IN ('draft', 'pending_verification')
CHECK (status IN ('draft', 'superseded') OR snapshot_id IS NOT NULL)
CHECK (supersedes_submission_id IS NULL OR supersedes_submission_id <> id)
CHECK (assignment_version >= 0)
CHECK (
  (
    status IN ('draft', 'superseded')
    AND (
      (
        verification_queue_id IS NULL
        AND eligibility_policy_snapshot IS NULL
        AND eligibility_policy_hash IS NULL
      )
      OR (
        verification_queue_id IS NOT NULL
        AND eligibility_policy_snapshot IS NOT NULL
        AND eligibility_policy_hash ~ '^[0-9a-f]{64}$'
      )
    )
  )
  OR (
    status IN ('pending_verification', 'verified', 'rejected', 'withdrawn')
    AND verification_queue_id IS NOT NULL
    AND eligibility_policy_snapshot IS NOT NULL
    AND eligibility_policy_hash ~ '^[0-9a-f]{64}$'
  )
)
CHECK (assigned_verifier_id IS NULL OR status = 'pending_verification')
CHECK (
  (
    draft_hash_algorithm IS NULL
    AND draft_hash_version IS NULL
    AND draft_encryption_key_id IS NULL
    AND draft_payload_format_version IS NULL
  )
  OR (
    draft_hash_algorithm = 'hmac-sha256'
    AND draft_hash_version = 1
    AND length(trim(draft_encryption_key_id)) > 0
    AND draft_payload_format_version = 1
  )
)
CHECK (
  verification_queue_id IS NOT NULL
  OR (assignment_version = 0 AND assigned_verifier_id IS NULL)
)
CHECK (legacy_backfill = true OR drafted_by IS NOT NULL)
CHECK (legacy_backfill = true OR recorded_by IS NOT NULL)
CHECK (
  legacy_backfill = true
  OR status NOT IN ('pending_verification', 'verified', 'rejected')
  OR submitted_by IS NOT NULL
)
CHECK (legacy_backfill = true OR status NOT IN ('verified', 'rejected') OR decided_by IS NOT NULL)
CHECK (legacy_backfill = true OR status <> 'withdrawn' OR withdrawn_by IS NOT NULL)
CHECK (legacy_backfill = true OR status <> 'superseded' OR superseded_by IS NOT NULL)
CHECK (legacy_backfill = true OR legacy_actor_anomaly = false)
CHECK (legacy_backfill = false OR source LIKE 'legacy_%')
CHECK (legacy_actor_anomaly = false OR confidence IS NOT NULL)
CHECK (
  legacy_backfill = false
  OR legacy_actor_anomaly = true
  OR (
    drafted_by IS NOT NULL
    AND recorded_by IS NOT NULL
    AND (status NOT IN ('pending_verification', 'verified', 'rejected') OR submitted_by IS NOT NULL)
    AND (status NOT IN ('verified', 'rejected') OR decided_by IS NOT NULL)
    AND (status <> 'withdrawn' OR withdrawn_by IS NOT NULL)
    AND (status <> 'superseded' OR superseded_by IS NOT NULL)
  )
)
CHECK actor/time/reason 与状态匹配
```

Actor 合同：

- 新业务写入一律 `legacy_backfill=false`，drafted/recorded/submitted/decided/withdrawn/
  superseded actor 在其对应动作发生时语义上均为 NOT NULL，并由上述 CHECK 与服务层
  双重强制；列的物理 nullable 只为受控 legacy 例外，API 不接受客户端声明 legacy。
- 只有 migration-reconcile owner 的受控 legacy backfill 可写
  `legacy_backfill=true`。未知历史 actor 必须同时写明确 `legacy_*` source、
  confidence 和 `legacy_actor_anomaly=true`；该 tenant 在 anomaly 清零前禁止 enforce。
- Deferred trigger 强制 legacy submission 只能引用同 scope
  `legacy_backfill=true` queue；queue `legacy_anomaly=true` 时 submission 必须同时
  `legacy_actor_anomaly=true`。新业务 command 不能设置任何 legacy flag，也不能引用
  legacy queue。
- Backfill 不得用系统管理员、migration executor 或虚构用户补成业务 actor。

命令 data 使用 `expectedStatus + expectedVersion` CAS。零行更新返回
`property-version-conflict`，不能无条件 save 覆盖 winner。

身份写入/修改：

1. 锁 Party。
2. supersede 当前 draft/pending/verified/rejected/withdrawn submission。
3. `identity_version + 1`。
4. canonicalize 一次后生成 hash/encrypted/masked。
5. 创建 `snapshot_id=NULL` 的 editable draft submission，`submission_attempt=1`。
6. 更新 `current_identity_submission_id`，清空 verified pointer。

Draft 只允许 identity operator 以 expected identity/submission version 编辑；draft
阶段不得声称已有 immutable snapshot。提交核验以 CAS 把 draft 转为
pending_verification，在同一 transaction：

1. 重验 Party identity version/hash 和全部 file evidence。
2. 按 file UUID 锁定并读取 version/SHA-256。
3. 创建 immutable snapshot 与 snapshot-file rows。
4. 把 `snapshot_id/submitted_by/submitted_at` 写入 submission。
5. 最后完成 `draft -> pending_verification` CAS。

Identity crypto profile 的唯一 authority 固定为 shared
`PARTY_IDENTITY_CRYPTO_PROFILE_V1`：

```ts
{
  hashAlgorithm: "hmac-sha256";
  hashVersion: 1;
  payloadCipher: "aes-256-gcm";
  payloadFormatVersion: 1; // encrypted payload prefix enc:v1
}
```

`encryptionKeyId` 不得从 cipher 解析、从 key material 计算或在 controller/database
硬编码；它必须来自受信的 versioned key provider 配置
`PARTY_DATA_ENCRYPTION_KEY_ID`，trim 后 1..128 字符，且与实际用于
`aes-256-gcm` 加密的 key version 同次读取。Update service 对 canonical identity
只调用一次受信 crypto provider，得到 encrypted payload、normalized HMAC hash 与
上述四项 metadata；随后把 metadata 作为内部 command 参数写入 submission 的四个
`draft_*` 列。HTTP DTO 不接受这些 metadata。Submit function 不重新生成、解析 cipher
或接收 metadata，而是只消费并验证 locked draft 的四列，并逐字映射到 snapshot：

Update 清空 identity material 时 encrypted/hash/masked/document 与四个 `draft_*`
metadata 必须全部为 null；identity material 非空时四项 metadata 必须完整且命中
V1 profile + trusted key ID，不允许半空组合。

```text
snapshot.normalized_identity_hash = locked Party identity hash
snapshot.hash_algorithm = submission.draft_hash_algorithm
snapshot.hash_version = submission.draft_hash_version
snapshot.encrypted_payload = locked Party encrypted identity
snapshot.encryption_key_id = submission.draft_encryption_key_id
snapshot.payload_format_version = submission.draft_payload_format_version
```

任一 draft metadata 缺失、profile 常量不等、key ID 空、Party material 与 draft
version 不一致均返回 `identity-snapshot-stale`，且不创建 snapshot。Key rotation
必须产生新明确 profile/key ID provenance；禁止通过解析 `enc:v1` 自行猜测 key ID。

核验决定只允许 pending_verification；`decided_by` 不得等于 drafted、recorded 或
submitted actor，且必须等于当前 `assigned_verifier_id` 并提交匹配的
`expectedAssignmentVersion`。verified 时同 transaction 设置 Party verified pointer；
rejected 时 verified pointer 保持空；两者写 decision fact 后清除 current assignment，
历史由 decision/audit 保留。

Assigned verifier authority：

- Submit transaction 按冻结 policy version 写
  `verification_queue_id/eligibility_policy_snapshot/eligibility_policy_hash`；snapshot
  至少包含 permission、tenant+park relation、data scope、actor exclusions、queue
  predicate 和 policy version，不保存 bundle 名作为资格权威。
- `assigned_verifier_id` 是 decide 的唯一人员权威。通知、task projection 或前端选中
  不能替代该字段；unassigned submission 不能 decide。
- Claim exact route/action：
  `POST /property/identity-submissions/:submissionId/claim` /
  `party.identity.claim`。Body 为 `expectedVersion`、`expectedAssignmentVersion`；
  要求 `party:identity_verify`、identity page、pending、unassigned，并同时通过 frozen
  policy 与 current module/relation/scope/actor-exclusion。
- Reassign/revoke exact route/action：
  `POST /property/identity-submissions/:submissionId/reassign` /
  `party.identity.reassign`。Body 为 `assignedVerifierId`（UUID 或 `null` revoke）、
  `reason`、`expectedVersion`、`expectedAssignmentVersion`；要求
  `party:identity_verify` 加 policy 中明确的 queue-supervisor predicate。目标 verifier
  必须通过相同 eligibility；不能把 submission 指给 maker 或 scope 外 actor。
- Claim、reassign、revoke 都在锁定 current submission 后执行同一双 CAS：
  `WHERE status='pending_verification' AND version=:expectedVersion AND
  assignment_version=:expectedAssignmentVersion`；成功时 submission `version + 1` 且
  `assignment_version + 1`，追加不可变 assignment audit（queue、from/to verifier、
  actor、reason、policy hash、before/after version、request ID/time），并写 outbox；
  零行更新返回 `property-version-conflict`。
- List items 与 total count 必须调用同一个 repository predicate：同
  tenant+park+queue、pending、当前有权 page/read/verify、frozen+current eligibility，
  且为 “assigned to self” 或 “unassigned and claimable”。Auditor/Party relation 的
  只读视图使用显式 mode，不得混入 verifier work-queue count。
- Decision 使用同一 expectedVersion+expectedAssignmentVersion predicate，并额外要求
  `assigned_verifier_id=current actor`；decision fact 保存 CAS 前
  `submissionVersion`、当前 `assignmentVersion/verificationQueueId/policyHash`，
  terminal submission `version + 1`。它重新验证 frozen/current eligibility 与
  maker-checker；任何 claim/reassign/revoke winner 都使旧 decide CAS 失败。

Withdraw/new-draft/re-submit：

- pending_verification 仅在不存在 decision row 时可由 submitter CAS 撤回。
- Pending withdraw 或 identity replace/supersede 若存在 assignment，必须在同一
  transaction 追加 revoke assignment audit、递增 assignment version、清空 assigned
  verifier 后再转换 submission；不能留下 terminal+assigned 组合。
- draft 不支持 withdraw；不再需要时只能由明确的 identity replace/clear command
  supersede，或继续编辑后提交。
- rejected/withdrawn 重提不复活旧 row，也没有 retry endpoint：调用 canonical create
  draft，并携带 `supersedes_submission_id`、旧 row 的 expected status/version。服务在
  同一 transaction 先 CAS 旧 row 到 superseded，再以同 `identity_version`、递增
  `submission_attempt` 创建新 editable draft；submit 时产生新 snapshot revision。
- verified 身份不能“retry”；只有身份修改/清除才能 supersede，并递增
  `identity_version`。
- Supersedes FK 只冻结 same tenant+park+Party identity，不包含 `identity_version`：
  rejected/withdrawn successor 必须由 create CAS 与 deferred trigger 验证
  `new.identity_version=old.identity_version` 且 attempt+1；verified successor 必须验证
  `new.identity_version=old.identity_version+1` 且 attempt=1。Old status/version 必须与
  DTO expected values 逐字相等。禁止恢复五列 supersedes FK，否则 verified successor
  无法合法跨 identity version。
- rejected/withdrawn/verified/superseded rows 和 snapshot 永久保留审计。

### 3.5 `biz_party_identity_decision`

每次 submission 最多一个 append-only decision fact；submission status 是其受约束
projection，不能替代 decision row：

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
party_id uuid NOT NULL
identity_version bigint NOT NULL
submission_id uuid NOT NULL
snapshot_id uuid NOT NULL
verification_queue_id uuid NOT NULL
assignment_version integer NOT NULL
eligibility_policy_hash varchar(64) NOT NULL
decision varchar(16) NOT NULL       # verified | rejected
reason varchar(500) NULL
decided_by uuid NULL
decided_at timestamptz NOT NULL
submission_version integer NOT NULL
source varchar(32) NOT NULL
confidence varchar(32) NULL
legacy_backfill boolean NOT NULL DEFAULT false
legacy_actor_anomaly boolean NOT NULL DEFAULT false
create_time timestamptz NOT NULL
```

Exact constraints：

```text
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, submission_id)
FK (
  tenant_id, park_id, party_id, identity_version, submission_id, snapshot_id,
  verification_queue_id, assignment_version, eligibility_policy_hash
)
  -> biz_party_identity_submission(
       tenant_id, park_id, party_id, identity_version, id, snapshot_id,
       verification_queue_id, assignment_version, eligibility_policy_hash
     )
FK (tenant_id, park_id, verification_queue_id)
  -> biz_party_identity_verification_queue(tenant_id, park_id, id)
FK (tenant_id, park_id, party_id, identity_version, snapshot_id)
  -> biz_party_identity_snapshot(tenant_id, park_id, party_id, identity_version, id)
CHECK (decision IN ('verified', 'rejected'))
CHECK (submission_version > 0)
CHECK (assignment_version > 0)
CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$')
CHECK (decision <> 'rejected' OR length(trim(reason)) > 0)
CHECK (
  (legacy_backfill = false AND decided_by IS NOT NULL AND legacy_actor_anomaly = false)
  OR
  (legacy_backfill = true AND source LIKE 'legacy_%')
)
CHECK (decided_by IS NOT NULL OR legacy_actor_anomaly = true)
CHECK (legacy_actor_anomaly = false OR confidence IS NOT NULL)
```

Decision row 禁止 UPDATE/DELETE。决定命令锁定 submission/snapshot 后，在同一
transaction append decision、CAS submission 到同名 terminal status、维护 Party
verified pointer，并写 audit/outbox；任一失败全部回滚。数据库 deferred trigger
强制 decision 与 submission 的 tenant/park/party/identity_version/snapshot、
verification queue、assignment version、eligibility policy hash、最终 status 和
decided actor/time 一致。非 legacy Decision INSERT 的 immediate trigger 还必须在
submission 仍为 pending 时验证 `assigned_verifier_id=decided_by`，并验证 assignment
audit 中该 `assignment_version` 的最后一条 claim/reassign
`to_verifier_id=decided_by`；同一 transaction 才能清空 current assignee 并转
terminal。Decision 存在后禁止新增 claim/reassign/revoke audit。Withdraw 只在不存在
decision row 时成功；唯一键竞争翻译为 `property-version-conflict`，不得覆盖 winner。

Legacy decision 使用 deterministic `legacy-import` assignment audit；已知历史 verifier
按同一 queue/version/hash 绑定，未知时 decision/audit 均标
`legacy_backfill=true + legacy_actor_anomaly=true`，以 null-safe equality 绑定空 actor，
并保持 tenant non-enforce。除这一显式 anomaly 路径外不得绕过 assigned-verifier
trigger。

### 3.6 `biz_party_identity_assignment_audit`

Claim/reassign/revoke 每次成功追加一行；legacy backfill 追加受控
`legacy-import` 行。全部禁止 UPDATE/DELETE：

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
party_id uuid NOT NULL
identity_version bigint NOT NULL
submission_id uuid NOT NULL
verification_queue_id uuid NOT NULL
action varchar(16) NOT NULL          # claim | reassign | revoke | legacy-import
from_verifier_id uuid NULL
to_verifier_id uuid NULL
acted_by uuid NULL
reason varchar(500) NULL
eligibility_policy_hash varchar(64) NOT NULL
assignment_version_before integer NOT NULL
assignment_version_after integer NOT NULL
request_id varchar(128) NOT NULL
source varchar(32) NOT NULL
confidence varchar(32) NULL
legacy_backfill boolean NOT NULL DEFAULT false
legacy_actor_anomaly boolean NOT NULL DEFAULT false
occurred_at timestamptz NOT NULL
```

```text
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, submission_id, assignment_version_after)
FK (tenant_id, park_id, party_id, identity_version, submission_id)
  -> biz_party_identity_submission(tenant_id, park_id, party_id, identity_version, id)
FK (tenant_id, park_id, verification_queue_id)
  -> biz_party_identity_verification_queue(tenant_id, park_id, id)
CHECK (action IN ('claim', 'reassign', 'revoke', 'legacy-import'))
CHECK (assignment_version_before >= 0)
CHECK (assignment_version_after = assignment_version_before + 1)
CHECK (eligibility_policy_hash ~ '^[0-9a-f]{64}$')
CHECK (
  (legacy_backfill = false AND action <> 'legacy-import' AND acted_by IS NOT NULL
   AND legacy_actor_anomaly = false)
  OR
  (legacy_backfill = true AND action = 'legacy-import' AND source LIKE 'legacy-%')
)
CHECK (
  legacy_actor_anomaly = false
  OR (legacy_backfill = true AND confidence IS NOT NULL AND to_verifier_id IS NULL)
)
CHECK (
  (action = 'claim' AND from_verifier_id IS NULL AND to_verifier_id IS NOT NULL)
  OR (action = 'reassign' AND from_verifier_id IS NOT NULL AND to_verifier_id IS NOT NULL
      AND from_verifier_id <> to_verifier_id AND length(trim(reason)) > 0)
  OR (action = 'revoke' AND from_verifier_id IS NOT NULL AND to_verifier_id IS NULL
      AND length(trim(reason)) > 0)
  OR (action = 'legacy-import' AND from_verifier_id IS NULL
      AND assignment_version_before = 0 AND assignment_version_after = 1)
)
```

Non-legacy audit INSERT 只能由 assignment CAS database function 调用。Function/trigger
必须先 `FOR UPDATE` 锁同 scope submission，再验证：

1. submission 仍为 `pending_verification` 且尚无 decision；
2. audit `verification_queue_id/eligibility_policy_hash` 逐字等于 submission frozen
   values；
3. `assignment_version_before` 等于锁定时 submission current old version，
   `assignment_version_after=before+1`，并且等于该 submission 前一 audit after version
   加一；首条必须 `0→1`，全生命周期不得 gap、duplicate 或倒退；
4. `from_verifier_id` null-safe 等于锁定时 current assignee，action/to verifier 与
   claim/reassign/revoke request 一致；
5. 同一 function 以 submission version + assignment version CAS 更新 assignee/version，
   UPDATE winner 的 old/new 值必须与 audit before/after/from/to 完全一致；零行则整个
   transaction 回滚且不留 audit。

Deferred constraint trigger 在 commit 前反向验证：pending submission current
`assignment_version/assigned_verifier_id` 与最新 audit winner 一致；decision terminal
则 current assignee 已清空，但 decision actor/version 必须与最后一条 claim/reassign
winner 一致且其后没有 audit。Decision trigger 只信任通过上述链的最后一条
claim/reassign audit，并绑定相同 queue/policy hash/version；不得信任客户端
assignment payload 或单独插入的 audit。

`legacy-import` 不调用 runtime CAS function，由 migration-reconcile owner 的隔离函数
写入；必须 `legacy_backfill=true`，未知 actor 另标 anomaly、阻断 enforce。Legacy
路径不能被 API/session role 调用，也不能填补或改写 non-legacy audit 链。

### 3.7 `rel_party_identity_snapshot_file`

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
snapshot_id uuid NOT NULL
file_id uuid NOT NULL
file_version integer NOT NULL
content_sha256 varchar(64) NOT NULL
mime_type varchar(128) NOT NULL
file_size bigint NOT NULL
ordinal integer NOT NULL
captured_at timestamptz NOT NULL
```

约束：

```text
UNIQUE (tenant_id, park_id, snapshot_id, file_id)
UNIQUE (tenant_id, park_id, snapshot_id, ordinal)
FK (tenant_id, park_id, snapshot_id) -> snapshot
FK (tenant_id, park_id, file_id) -> sys_file
CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
CHECK (file_version > 0 AND file_size >= 0 AND ordinal >= 0)
```

`sys_file` 新增 nullable `content_sha256 varchar(64)`，并新增
`UNIQUE (tenant_id, park_id, id)`，作为 snapshot-file 复合 FK 的被引用键。新上传必须
同时计算 SHA-256；
MD5 只保留兼容，不作为 identity evidence。历史文件必须从受控存储重新计算；无法
读取、摘要不一致或存储缺失时记录 anomaly，禁止 submission/enforce，不得伪造摘要。

Identity evidence 使用唯一 protected biz type：

```text
party_identity_evidence
```

上传/metadata/download/delete 分别要求 Party domain permission 与
`file:upload/read/download/delete` 的交集。Snapshot 引用后 generic delete 永久拒绝；
supersede 不删除旧文件或 snapshot。

### 3.8 `rel_party_identity_draft_file`

`pendingFileIds` 的唯一数据库权威是 draft evidence selection relation，不允许仅保存在
HTTP body、内存或从 `sys_file.biz_id` 临时重建：

```text
id uuid PRIMARY KEY
tenant_id varchar(64) NOT NULL
park_id varchar(64) NOT NULL
submission_id uuid NOT NULL
file_id uuid NOT NULL
file_version integer NOT NULL
ordinal integer NOT NULL
selected_by uuid NOT NULL
selected_at timestamptz NOT NULL
```

```text
UNIQUE (tenant_id, park_id, id)
UNIQUE (tenant_id, park_id, submission_id, file_id)
UNIQUE (tenant_id, park_id, submission_id, ordinal)
FK (tenant_id, park_id, submission_id)
  -> biz_party_identity_submission(tenant_id, park_id, id)
FK (tenant_id, park_id, file_id)
  -> sys_file(tenant_id, park_id, id)
CHECK (file_version > 0)
CHECK (ordinal >= 0 AND ordinal < 20)
```

Update command 把 `pendingFileIds` 视为完整 replacement set：锁 Party→submission，
再锁现有 selection（ordinal、file_id 稳定排序）和新 file UUID，验证 draft/version/
scope/biz type/biz id/file version/hash-ready 后，在同一 submission version CAS
transaction 删除旧 selection、按 request array 从 ordinal 0 连续重建、更新 draft
version。重复 file、ordinal gap、超过 20、CAS loser 或任一文件失败时整笔回滚，
旧 selection 保持不变。Draft 可反复 replace。

Submit DTO 不再传或覆盖 file 集合。Submit function 锁定 selection rows
`ORDER BY ordinal,file_id FOR UPDATE`，再按 file UUID 升序锁 physical files；逐 ordinal
验证 selection file version、scope、digest、storage ready，按相同 ordinal 创建
`rel_party_identity_snapshot_file`。Submit 后 selection rows保留为审计证据并转为
immutable；它们必须与 snapshot-file 在 file ID/version/ordinal 上 exact bijection。
Withdraw、reject、verify、supersede 均不删除 selection；draft 状态以外任何
INSERT/UPDATE/DELETE 均由 trigger 拒绝。Selection 只能由 update command function
替换，API/session 无直接 DML。

## 4. Legacy compatibility contract

兼容窗口定义为 canonical API 首次生产发布版本 `R0` 起，保留 `R0` 和 `R0+1`
两个完整发布周期；只有 telemetry 显示旧调用为零、shadow zero-difference 且人工
批准后，`R0+2` 才允许移除旧 payload。

| Legacy route/payload | 兼容权限 | canonical 行为 |
|---|---|---|
| `POST /property/parties` 无 identity | `party:create` | create profile |
| `POST /property/parties` 含 identity | `party:create` + `party:identity_update` | create profile 后调用 identity command |
| `PUT /property/parties/:id` 仅非身份字段 | `party:update` | update profile |
| 同一路由含 identity 字段 | `party:update` + `party:identity_update` | identity command；不得 legacy 直写 |
| `POST /property/parties/:id/verification` | `party:identity_verify` | 查找同 scope current pending submission 后 adapter 到 canonical decision command |

Canonical routes：

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

Identity submission API 统一使用顶层 `/property/identity-submissions/**`。创建 draft 的
body 包含 `partyId`、`expectedIdentityVersion`，驳回/撤回后重提时另带
`supersedesSubmissionId`、`expectedSupersededStatus`、
`expectedSupersededVersion`；后续命令只接受 submission ID + expected
status/version。不存在 retry endpoint。Party API/Page 不拥有第二套 identity CRUD，
只返回经过授权的 `identitySummary` projection 和 canonical submission deep link。
Party detail 不得用 route-local mutation 绕过顶层 submission command。

Identity list/detail business data 使用 camelCase，并由服务端返回：

```text
verificationQueueId
assignedVerifierId
assignmentVersion
eligibilityPolicyHash
allowedActions[]
```

Assignment 相关 exact `allowedActions` 仅为 `party.identity.claim` 与
`party.identity.reassign`；revoke 仍是 reassign command 的 `assignedVerifierId=null`
分支，不新增第三个 route/action。Identity audit route 需要
`party:sensitive_read + audit:read`，返回 masked actor/evidence audit projection，
不得返回 encrypted payload、hash 原文或 policy snapshot 内部 predicate。
Product-access freeze 的最终 action matrix 必须逐字采用上述 claim/reassign
method/path/action IDs；若其稍后修订产生差异，本候选与 child 均停止，不允许实现期
保留 alias 或双路由。

### 4.1 Canonical Identity HTTP wire exact contract

全部 10 条 canonical Identity route 都要求 active `asset` module、
`asset:identity-submissions:page`、各 route 的 action permission 和本节 scope
predicate；page permission 对 mutation、list、detail、audit 一律必需，不存在
“API action permission 可替代 page permission”的例外。`surfaceId` 只用于导航和
审计定位，绝不是 permission。Product access freeze §3.1 的
`requiredPermissions` array 是 endpoint manifest 的唯一 exact-set 权威。

所有正常响应统一包装为：

```ts
{
  code: 0;
  message: "success";
  data: T;
  request_id: string;
  server_time: number;
}
```

只有 envelope 的历史字段 `request_id/server_time` 保留 snake_case；`data` 内全部
字段为 camelCase。Mutation body 拒绝未知字段；UUID 使用 canonical lowercase
hyphenated text；时间使用 UTC RFC 3339 字符串。`clientKey` 为 1..128 个可打印
ASCII 字符，trim 后不得为空；`reason` trim 后 1..500 字符。

Mutation DTO exact-set：

```ts
type CreateIdentityDraftDto = {
  clientKey: string;
  partyId: string;
  expectedIdentityVersion: number;       // integer >= 0
  supersedesSubmissionId?: string;
  expectedSupersededStatus?: "rejected" | "withdrawn" | "verified";
  expectedSupersededVersion?: number;    // integer >= 1
};

type UpdateIdentityDraftDto = {
  clientKey: string;
  expectedVersion: number;               // integer >= 1
  documentType: "id_card" | "passport" | null;
  identityNumber: string | null;
  pendingFileIds: string[];               // unique UUIDs, 0..20, request order retained
};

type SubmitIdentityDto = {
  clientKey: string;
  expectedVersion: number;
};

type ClaimIdentityDto = {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;     // integer >= 0
};

type ReassignIdentityDto = {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;
  assignedVerifierId: string | null;      // null means revoke; no revoke route
  reason: string;
};

type DecideIdentityDto = {
  clientKey: string;
  expectedVersion: number;
  expectedAssignmentVersion: number;     // integer >= 1
  decision: "verified" | "rejected";
  reason?: string;                        // required and non-empty for rejected
};

type WithdrawIdentityDto = {
  clientKey: string;
  expectedVersion: number;
  reason: string;
};
```

Create 只建立空 draft；identity material 必须经 canonical update 写入。Update 中
`documentType/identityNumber` 必须同时为 null 或同时非 null；非 null 时继续使用
`id_card`/`passport` normalization 与 validation contract。`pendingFileIds` 是该 draft
提交时要冻结的完整 replacement set，不是增量 patch。Create 的三个 supersede 字段
必须全缺失，或必须全部出现；status 只允许表中三值。Claim、submit、withdraw、
decision 不接受 route-local payload alias。不存在 generic command、retry 或 revoke
endpoint。

请求头 `X-Idempotency-Key` 是 HTTP replay authority，body `clientKey` 是 durable
`biz_property_mutation_receipt.client_key`。7 条 mutation route 两者都必填并必须
逐字相等；缺失或不等在任何 DB lock/mutation 前返回 400
`property-validation-failed`。Shared、API 与测试中的任何旧 validation code 都必须
零命中。服务端以 header/body 的共同值作为唯一 client key，
不得二选一、拼接或重写。Receipt identity 固定为
`(tenantId,parkId,actorId,actionId,targetId,clientKey)`：create 的 `targetId=partyId`，
其余 route 的 `targetId=submissionId`。Canonical request hash 包含 method、canonical
path、scope、actor、actionId、targetId 和完整 normalized body（含 clientKey），不含
request ID 或 server time。相同 receipt key + 相同 hash 返回首次保存的相同 HTTP
status 与 `data`；相同 key + 不同 hash 返回 409 `idempotency-key-conflict`。Receipt、
identity mutation、assignment/decision audit 和 outbox 必须同一 transaction commit；
失败不得留下 processing/success receipt。GET 不接受或创建 receipt。

List query exact-set：

```ts
type IdentitySubmissionListQuery = {
  page?: number;                          // default 1, integer 1..100000
  pageSize?: number;                      // default 20, integer 1..100
  status?: "draft" | "pending_verification" | "verified"
         | "rejected" | "withdrawn" | "superseded";
  partyId?: string;
  verificationQueueId?: string;
  assignment?: "mine" | "unassigned" | "any"; // default any
  submittedFrom?: string;                 // RFC 3339 inclusive
  submittedTo?: string;                   // RFC 3339 exclusive, > submittedFrom
  sort?: "createTime" | "submittedAt" | "decidedAt" | "updateTime";
  order?: "asc" | "desc";
};
```

默认排序是 `submittedAt desc,id desc`；显式排序始终追加 `id` 同方向作为稳定
tie-breaker，null time 永远排最后。`assignment=mine` 绑定 authenticated actor，
`unassigned` 只匹配 pending 且 assignee null；`any` 不移除 assigned-queue/Party
relation scope。未知 query、重复 scalar query、非法 enum/time/range 一律 400。
List 的 `items` 与 `total` 必须来自同一 normalized predicate；不得先 count 再放宽
scope 或在应用层过滤。

List response `data` 精确为
`{items: IdentitySubmissionProjection[],page,pageSize,total,allowedActions:[]}`；
顶层 list `allowedActions` 固定空数组。Detail、create/update/submit/claim/reassign/
withdraw/decision 的 `data` 都是同一个 projection：

```ts
type IdentitySubmissionProjection = {
  id: string;
  partyId: string;
  partyDisplayName: string;
  status: "draft" | "pending_verification" | "verified"
        | "rejected" | "withdrawn" | "superseded";
  version: number;
  identityVersion: number;
  submissionAttempt: number;
  supersedesSubmissionId: string | null;
  verificationQueueId: string | null;
  verificationQueueName: string | null;
  assignedVerifierId: string | null;
  assignedVerifierDisplayName: string | null;
  assignmentVersion: number;
  eligibilityPolicyHash: string | null;
  evidence: {
    documentType: "id_card" | "passport" | null;
    identityNumberMasked: string | null;
    fileCount: number;
    files: Array<{
      fileId: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      fileVersion: number;
    }>;
  };
  draftedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  withdrawnAt: string | null;
  supersededAt: string | null;
  updateTime: string;
  allowedActions: Array<"party.identity.claim" | "party.identity.reassign">;
};
```

`identityNumberMasked` 只在调用方同时拥有 `party:sensitive_read` 时返回 mask，否则
固定 null；所有 route 永不返回 full identity、cipher、identity/content hash、
encryption key、storage key、policy snapshot 或 download URL。Files 只返回上述
masked metadata；blob download 另走 shared protected-file route 并重新验证当前
module+page+scope+file permission。`allowedActions` 只允许两字面量、去重后按上述顺序，
并按 current row、assignment 与 actor eligibility 服务端裁剪。

Audit query 只接受 `page`（默认 1）、`pageSize`（默认 50，最大 100）、
`sort="occurredAt"` 和 `order="asc"|"desc"`（默认 desc）。其 response `data` 精确为
`{items,page,pageSize,total,allowedActions:[]}`；每个 item 精确为：

```ts
{
  id: string;
  eventType: "draft-created" | "draft-updated" | "submitted" | "claimed"
           | "reassigned" | "revoked" | "verified" | "rejected"
           | "withdrawn" | "superseded" | "legacy-imported";
  submissionVersion: number;
  assignmentVersion: number;
  actor: { id: string | null; displayName: string };
  reason: string | null;
  occurredAt: string;
  evidence: {
    documentType: "id_card" | "passport" | null;
    identityNumberMasked: string | null;
    fileCount: number;
  } | null;
}
```

Audit actor anomaly 使用 `id=null,displayName="历史操作者未知"`；audit evidence 仍按
`party:sensitive_read` 裁剪，绝不返回 raw hash/cipher/policy predicate。Audit route
不接受 mutation key。

Party list/detail 的 canonical `identitySummary` 精确为：

```ts
identitySummary: null | {
  status: "unverified" | "draft" | "pending_verification"
        | "verified" | "rejected" | "withdrawn";
  identityVersion: number;
  currentSubmissionId: string | null;
  currentVerifiedSubmissionId: string | null;
  documentType: "id_card" | "passport" | null;
  identityNumberMasked: string | null;
  submissionDeepLink: string | null;
  updatedAt: string | null;
}
```

无 identity fact 时为 null。Canonical status 不向 Party summary 暴露 `superseded`：
它投影到当前 successor；没有 successor 时为 `unverified`。`submissionDeepLink` 只能是
`/assets/identity-submissions/<currentSubmissionId>` 或 null，由服务端 allowlist
生成；不得拼接外部 URL。`identityNumberMasked` 同样要求
`party:sensitive_read`，否则为 null。Party API 不返回 `allowedActions` 的 identity
mutation，不接收 identity mutation body。

旧 response 字段保留两个周期，但 verification 状态来自 current pointer projection。
旧宽权限不再授权身份写入或核验。Flag rollback 只能关闭新 UI/enforce；旧 API 继续
调用 canonical command，不恢复旧直写。

Legacy 逐状态 projection：

| Canonical current state | Legacy `verification_status` | 写入行为 |
|---|---|---|
| 无 submission / draft / withdrawn / superseded 且无 current verified | `unverified` | 只读 projection |
| pending_verification | `unverified` | 旧 verify adapter 可决定 current pending |
| verified 且 pointer/version 一致 | `verified` | 禁止旧接口直接写 status |
| rejected | `rejected` | canonical create 创建新 draft 并 supersede 旧 row |

若旧客户端只有 `unverified/verified/rejected`，不得引入第四个 legacy 枚举。旧字段永远
不能驱动 canonical command 或 check-in。

## 5. Transaction-aware verifier port 与锁序

### 5.1 Port

Shared contract 冻结等价签名：

```ts
interface IdentityVerificationPort {
  verifyForCheckIn(input: {
    manager: EntityManagerPort;
    scope: TenantParkScope;
    bookingId: string;
    partyIds: readonly string[]; // 调用前去重，port 内再按 UUID 排序
    expectedConsent: "granted";
  }): Promise<readonly VerifiedIdentityEvidence[]>;
}
```

`VerifiedIdentityEvidence` 至少返回：

```text
party_id
submission_id/submission_version
snapshot_id
identity_version
document_type
hash_algorithm/hash_version
file_id/file_version/content_sha256[]
verified_at
```

Port 不得开启新 transaction，不得返回 boolean eligibility，不得暴露明文身份。
调用方把 evidence 写入 check-in audit 后，和入住状态在同一 transaction commit。

### 5.2 跨运行时全局锁序

与 approval/task runtime 统一后，所有跨模块 transaction 只允许以下顺序；某类对象
不存在时跳过，但不得反向补锁：

```text
approval request/execution row
→ lock_property_unit_scope(tenant, park, unit) advisory lock
→ domain source/owning aggregate rows（固定 domain 顺序、同类 UUID 升序）
→ Party rows（去重后 UUID 升序）
→ assignment 或 current identity submission rows（UUID 升序）
→ snapshot rows（UUID 升序）
→ protected file rows（UUID 升序）
→ effect/audit/outbox
```

具体映射：

- check-in 无 approval 时从 booking/source row 开始，再 Party→submission→snapshot→file。
- identity-only command 从 Party 开始，不获取 booking/property/approval lock。
- approval execution 先锁 approval，再按 advisory→source→Party/assignment/submission。
- configure、mode transition、occupancy create/activate/replace/release 和 commercial
  contract trigger 先取得同一 property advisory lock，再锁 unit/config/owning
  aggregate/occupancy。
- task claim/complete 若触及 source，先 source 后 assignment；所有 adapter 使用同一
  顺序，assignment 不得先锁后回锁 source。

任何路径先锁 unit/source/Party/file 后再回取前序锁均禁止。数据库 trigger 与 service
必须使用同一 advisory key。

Generic file delete 必须先解析引用，再按 owning aggregate/reference→snapshot→file
顺序加锁并重验。若现有 generic delete 已先锁 file、无法在该 transaction 安全改序，
必须返回稳定 409 冲突并交由 domain detach/supersede command；不得 file→reference
反向加锁后继续删除。

## 6. Approval-required 边界

在 `B-approval-runtime SHA` 和领域 adapter Gate 之前：

- `POST /property/units/:unitId/mode-transitions`
- `POST /property/occupancies/:occupancyId/release` 且 `force=true`

Action ID 分别固定为 `property.mode-transition.request` 与
`property.occupancy.force-release.request`，不得使用 `property.mode.transition`、
`force-release` 或 route-local 别名。

必须在进入最终领域 mutation 前返回：

```json
{
  "code": 409,
  "message": "approval-required",
  "data": {
    "errorCode": "approval-required",
    "actionId": "property.mode-transition.request",
    "targetId": "...",
    "approvalAvailable": false
  },
  "request_id": "...",
  "server_time": 0
}
```

这两个现有 URL 是唯一 canonical mutation 入口；不得新增
`mode-transition-requests`、`force-release-requests` 或其他旁路。B-0 合同 P0 在该
fail-closed exact contract、normal/super/wildcard 零 mutation 测试请求获批后关闭；
现存直执代码风险转入 `B0.5-S0`，不再反向阻塞合同 Gate。B-0 PASS 后只能先实施
`B0.5-S0`，该切片验证未 PASS 时其余 B-0.5 切片禁行。

normal、super、wildcard 结果一致。B-1 接入后，仍由同一路由创建 approval request，返回
request/decision/execution projection；decision approved 不代表动作已完成，只有
`executionStatus=executed` 表示业务效果完成。

`actionId` 是产品意图，固定为上述两个 `.request` ID；runtime/domain receipt 的
数据库字段 `effect_kind` 是执行结果种类，分别使用
`property.mode.transition`、`property.occupancy.force.release`。API `effectKind` 与
DB `effect_kind` 必须是同一字面量，并逐字引用 runtime/product shared pattern
`^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$`：只允许 lower dot-separated segments，不得含
`-`、`_`、`|` 或从 action 字符串动态推导。不得把 effect kind 作为 API action、
permission 或 idempotency intent，也不得把 `.request` action ID 写入 effect receipt
代替 runtime freeze 的 effect manifest；runtime/product 最终 SHA 若字面量或 regex
不一致则停止 Gate。

普通 generic occupancy release 仅能释放 generic owning source；business-owned
occupancy 的正常 release 仍由 owning aggregate command 执行。

## 7. Asset module effective dependency

依赖图固定为：

```text
homestay       -> asset
housing_rental -> asset
```

不自动启用 asset。有效模块判定必须同时满足：

1. 自身 `rel_tenant_module` active predicate。
2. `sys_module` active predicate。
3. 每个声明 dependency 在同 tenant/park 也满足相同 active predicate。

该 effective predicate 被以下位置共同消费：

- assign/enable/disable/soft-delete/plan apply。
- `/users/me.enabled_modules`。
- `ModuleGuard`。
- Web `hasModule/hasAccess`、菜单和登录跳转。
- migration 中的 menu/role materialization。

所有模块管理写入先取得：

```text
tenant/park module-dependency advisory lock
→ sys_module rows（module_code 排序）
→ rel_tenant_module rows（module_code 排序）
```

同 park 并发 asset disable 与 dependent enable 只能一个成功。缺 asset 启用依赖返回
`409 module-dependency-conflict`；仍有有效依赖时关闭 asset 同样返回 409。Asset
disabled、deleted 或 expired 后 dependent module 的 effective availability 立即变为
false，super/wildcard 不绕过。

## 8. 共享控制面 API/response

### 8.1 API

```text
GET  /property/operations
GET  /property/units/:unitId/operation
PUT  /property/units/:unitId/operation
POST /property/units/:unitId/mode-transitions
GET  /property/units/:unitId/mode-transitions

GET  /property/occupancies
GET  /property/occupancies/:occupancyId
POST /property/occupancies/availability
POST /property/occupancies/:occupancyId/release
```

Exact query DTO：

| API | Filters | Sort allowlist |
|---|---|---|
| `/property/operations` | `page>=1`、`pageSize=1..100`、`keyword<=100`、`buildingId` UUID、`configuredMode` exact enum、`operationStatus` exact enum、`blockerCode` exact enum | `unitCode`、`configuredMode`、`updateTime` |
| `/property/occupancies` | `page>=1`、`pageSize=1..100`、`unitId` UUID、`sourceDomain` exact enum、`sourceType<=64`、`status` exact enum、`startFrom/endTo` ISO-8601 | `startAt`、`endAt`、`updateTime` |
| `/property/units/:unitId/mode-transitions` | `page>=1`、`pageSize=1..100`、`decisionStatus` exact enum、`executionStatus` exact enum | `createTime`、`decisionTime`、`executionTime` |

所有 list data/query 字段使用 camelCase，排序参数固定为 `sort` 与
`order=asc|desc`；非 allowlist 值、未知 filter、无效 UUID/enum/date、
`startFrom>endTo` 一律 400，不静默忽略。默认稳定排序为
`updateTime desc, id asc`，transition log 为 `createTime desc, id asc`。

List API exact envelope：

```text
data.items[]
data.page
data.pageSize
data.total
data.allowedActions[]
```

`allowedActions` 是服务端在 module、page permission、action permission、scope、live
status、actor separation 与 approval availability 全部判定后的 dot-separated、
lower-kebab-segment action ID 集合。Web 只据此呈现按钮；write API 必须重新授权，
不能信任客户端回传。Exact action IDs：

```text
property.operation.update
property.mode-transition.request
property.occupancy.force-release.request
property.task.claim
property.task.start
property.task.block
property.task.unblock
property.task.release
property.notification.mark-read
```

Control list/detail 必须同时返回：

- unit stable identity。
- configured mode/status/version。
- live owning aggregate counts。
- shared occupancy projection。
- blockers exact projection。
- `canRequestTransition`/`canRequestForceRelease` capability。
- approval request/decision/execution projection（可用后）。

每个 blocker exact fields：

```text
code
label
count
sourceDomain
sourceType
sourceId?   # 只有具备 source read permission 时
deepLink?   # 只有目标 route、page、action、scope 权限均通过时
```

`deepLink` 只能由服务端 allowlist builder 生成，不能拼接数据库/用户输入；无权查看
source 时省略 `sourceId/deepLink`，但保留非识别性的 code/count。Detail response
沿用相同 stable identity、version、blockers、`allowedActions`，不得产生第二套字段。
Projection 不替代 live blocker。Generic occupancy API 永远不能声明
commercial_leasing、homestay 或 housing_rental source。

### 8.2 Machine errors

| `errorCode` | HTTP | 可重试 |
|---|---:|---|
| `approval-required` | 409 | 完成审批运行时后重新发起申请 |
| `property-validation-failed` | 400 | 修正字段 |
| `property-action-forbidden` | 403 | 否 |
| `property-resource-not-found` | 404 | 否 |
| `property-version-conflict` | 409 | reload 后由用户确认 |
| `identity-active-submission-exists` | 409 | 打开当前 submission |
| `identity-snapshot-stale` | 409 | 重新提交核验 |
| `identity-file-not-ready` | 409 | 修复文件证据后重试 |
| `identity-actor-separation-required` | 409 | 更换核验人 |
| `module-dependency-conflict` | 409 | 修复模块依赖 |
| `property-mode-blocked` | 409 | 处理 blocker 后重试 |
| `task-already-claimed` | 409 | 刷新 winner |
| `task-source-ineligible` | 409 | 返回任务列表 |
| `task-version-conflict` | 409 | reload 后重试 |
| `property-operation-in-progress` | 423 | 保持只读并刷新 |
| `property-runtime-unavailable` | 503 | 同一 key 安全重试 |

Wire `data.errorCode` 只允许 lower-kebab，不允许 uppercase/snake code 或 message
解析。业务 error detail 使用 camelCase；只有全局 envelope trace/time 使用 snake_case：

```text
code
message
data.errorCode
data.actionId?
data.targetId?
data.expectedVersion?
data.actualVersion?
data.latestVersion?
data.retryable
data.recoveryAction?
data.blockers?
request_id
server_time
```

`request_id` 必须来自同一请求上下文；`server_time` 必须是 Unix epoch
milliseconds number，不得返回 ISO string。不得在个别 controller 返回
`requestId/serverTime`、snake_case business error detail、裸 exception 或另一套
envelope。

## 9. UUIDv5、backfill、shadow 与 rollback

固定 namespace 与 name 公式：

```text
namespace: 49d315c4-4704-5e2b-905b-ee291e97c71b

submission name UTF-8:
  "party-identity-submission\n" + tenant_id + "\n" + park_id + "\n"
  + party_id + "\n" + identity_version + "\n" + submission_attempt
  + "\n" + legacy_source

snapshot name UTF-8:
  "party-identity-snapshot\n" + tenant_id + "\n" + park_id + "\n"
  + party_id + "\n" + identity_version + "\n" + snapshot_revision
  + "\n" + legacy_source

snapshot-file name UTF-8:
  "party-identity-snapshot-file\n" + tenant_id + "\n" + park_id + "\n"
  + snapshot_id + "\n" + file_id
```

禁止 locale、JSON 序列化或数据库默认 collation 参与 name 生成。相同输入跨环境必须
产生相同 UUID；所有数字用无前导零十进制，UUID 用 canonical lowercase，字符串不得
trim/大小写转换。collision 或既有同 ID 不同 checksum 为 P0。

Golden vector（UUIDv5）：

```text
tenant_id=tenant-a
park_id=park-a
party_id=00000000-0000-0000-0000-000000000001
identity_version=1
submission_attempt=1
snapshot_revision=1
legacy_source=legacy-biz-party
submission_id=80b07455-bb4e-5f75-bbd9-3f9e566a2f8c
snapshot_id=73e4e2fa-9f22-5eba-b604-1c2452a3291e

snapshot-file:
snapshot_id=00000000-0000-0000-0000-000000000001
file_id=00000000-0000-0000-0000-000000000002
snapshot_file_id=68064a01-eea2-530c-adc6-5a5b1122865f
```

Legacy mapping：

- verified + 完整 identity：verified submission/snapshot + 两个 current pointer。
- rejected + 完整 identity：rejected submission/snapshot + current identity pointer。
- unverified + 完整 identity：pending_verification submission/snapshot。
- 无 identity：不创建。
- terminal status 但 identity/file 不完整：anomaly，禁止 tenant enforce。

Shadow 硬差异阈值均为零：双 active、cross-scope、pointer、hash/version/file、
check-in eligibility、actor/audit 和 mutation replay。Rollback 仅关闭 UI/enforce 和
新入口；不删除 submission/snapshot/file reference/audit，不恢复旧宽权限或同人核验。

## 10. `000185+` migration 候选与双 history 预检

当前工作树可见最大文件为 `000184_*`。以下仅为未预留候选：

```text
000185 party identity/file digest expand
000186 approval runtime exact expand（引用 runtime freeze）
000187 event/notification + outbox/inbox/DLQ expand
000188 property task assignment expand
000189 module/RBAC/page/bundle definition expand
000190 migration-control/compatibility metadata expand
000191 property/homestay effect owning constraints expand
000192 housing effect owning constraints expand
```

编号职责同时冻结为：

- `000185` 只负责 identity verification queue、submission/decision/assignment audit、
  snapshot、snapshot-file 和 `sys_file.content_sha256`
  的向前兼容 schema。
- `000186` 的职责不得由本文自行摘要或缩窄，逐字引用
  `research/b0-runtime-contract-freeze.md` 的 exact migration/schema block，包括
  approval request/stage/decision/execution、effect manifest、execution effect receipt、
  unified mutation receipt、CAS/claim/fencing/reconcile 所需约束与索引；任何差异以
  runtime freeze 最终 SHA 为权威。
- `000187` 只负责 event/notification、outbox/inbox/DLQ schema 和稳定 event identity。
  `biz_property_outbox.event_id` 是 canonical PK，并提供
  `UNIQUE (tenant_id, park_id, event_id)`；inbox/DLQ 的 `event_id` 和 notification 的
  `source_event_id` 均以同名复合 FK 引用它，禁止另设 `id` 作为事件权威。
- `000188` 只负责 task assignment/projection-rebuild 所需 schema。
- `000189` 只登记 module dependency metadata、RBAC permission/page/bundle
  definitions；绝不写任何 role grant/`rel_role_perm`，不得创建业务数据或测试
  fixture。
- `000190` 只登记 migration control、compatibility/shadow/reconcile metadata 和
  后续 enforce 所需的 disabled-by-default control；不得在 expand 阶段启用任何
  production enforce，也不得把旧数据直接改成 enforced 状态。
- `000191` 只承载 runtime effect manifest 已冻结的 property mode/occupancy 与
  homestay owning unique/audit/receipt-reference prerequisites；不得执行业务 effect。
- `000192` 只承载 housing lease/finance/handover/purchase effect manifest 的 owning
  unique/audit/receipt-reference prerequisites；不得执行业务 effect。

Logical DAG（文件仍按全局编号串行执行）：

```text
B-contract SHA + Track A schema SHA
  → 000185 identity
  → 000186 approval/effect receipt
  → 000187 event/outbox
  → 000188 task
  → 000189 definitions
  → 000190 compatibility control

000186 + 000187 + property/homestay effect-manifest SHA
  → 000191 → B-property-homestay-effect-schema SHA
  → property-foundation-api-owner
  → B-property-foundation-adapter SHA + homestay adapter

000186 + 000187 + housing effect-manifest SHA
  → 000192 → housing adapters

000185..000192 + adapter evidence → B-4 reconcile/enforce
```

`000192` 因全局编号在 `000191` 后执行，但不以 000191 的 homestay objects 为语义依赖。
Effect migration 只由 schema-migration-owner 生成；identity child task 与 domain
adapter owner 只消费正式 SHA，不另产 migration。`000191/000192` 仅是 B-2c adapter
开始前置，不属于 B-0.5 的 prerequisite、deliverable 或 handoff；B-0.5 只消费
`000185–000190 B-schema-expand SHA`。

`B-property-homestay-effect-schema SHA` 是 `000191` 唯一 handoff 名称。B-2c 中
post-B1 property adapter 的唯一 owner 是 `property-foundation-api-owner`，其唯一
handoff 名是
`B-property-foundation-adapter SHA`；对 000191 schema SHA 的消费与 adapter handoff
只作为 downstream DAG 引用，必须等 B-1 runtime handoff 后发生，不反向成为
B-0/B-0.5 的输入或 PASS 证据。

B-0 合同 Gate 只要求 provisional window、候选编号/职责和唯一
schema-migration-owner 已签署；候选编号不是 reservation，不要求在合同 PASS 前
“正式登记”。只有 `B-contract SHA` PASS 后进入 schema implementation Gate，唯一
owner 才重新扫描工作树并在目标数据库同时查询以下双 history，以当时安全最大编号
完成 formal reservation：

```sql
SELECT filename, checksum, status
FROM public.sys_schema_migration_history
WHERE status <> 'succeeded'
   OR filename >= '000185'
ORDER BY filename;

SELECT filename, checksum, status
FROM public.schema_migrations
WHERE status <> 'succeeded'
   OR filename >= '000185'
ORDER BY filename;
```

两表 filename/checksum/status 不一致、存在 running/failed、或工作树出现并发编号时
立即 stop-ship；整个 block 从新的最大安全编号顺延，禁止只移动其中一个文件。

执行阶段：

1. 新表和 nullable/default-safe expand。
2. 新写路径兼容，但 enforce 关闭。
3. deterministic backfill/change capture/mutation replay。
4. duplicate、cross-scope 和 anomaly 清零。
5. 大表 FK/CHECK 先 `NOT VALID`，后 `VALIDATE CONSTRAINT`。
6. partial unique 创建前先查重。
7. shadow zero-difference。
8. per-tenant final lock/reconcile。
9. 人工批准后才 enable enforce。

每个 migration 必须声明 `lock_timeout`、`statement_timeout`、预计锁级别和失败恢复。
若使用 `CREATE INDEX CONCURRENTLY`，文件不得包在显式 `BEGIN` 中；各语句必须幂等，
因为 runner 可能记录 failed 后重跑。Migration、production seed、dev fixture、
backfill 和 enforce 不得混在一个文件。

数据职责分离：

- migration 只创建或扩展 schema、约束、definition 和 migration-control metadata。
- production-safe seed 只维护经过签署的生产基础定义；不得创建默认高权限 role grant、
  固定密码账号、演示业务数据或测试身份。
- dev fixture 只进入 `database/seeds/dev` 或受控测试 fixture 路径，不得由 migration
  或 production seed 调用，也不得在共享、预发布或生产环境运行。
- `000189` 产生的 permission/page/bundle definition 若需要生产角色授权，必须由后续
  独立、已签署的 production-safe seed 变更显式完成，不能在 migration 中推导。
- `000190` 只提供兼容和控制 metadata；实际 enforce 必须等 shadow zero-difference、
  per-tenant final reconcile、技术 Gate 和人工批准后通过独立运行步骤开启。
- `000191/000192` 只扩展 owning constraint/audit/reference；adapter 执行、effect
  receipt 写入、业务 backfill 和 reconcile 均不在 migration 中运行。

## 11. B-0 候选放行清单

本文转为冻结合同前必须全部满足：

| 必签角色 | 签署范围 | 当前状态/证据 |
|---|---|---|
| 产品/IA owner | 顶层 identity/notification workspace、Party profile/deep-link、恢复路径 | `PENDING` |
| Identity/security architect | 六状态、assignment authority、maker-checker、masked/download policy | `PENDING` |
| Runtime/approval architect | action/effect 分离、全局锁序、outbox/event identity | `PENDING` |
| Database/migration owner | decision/assignment schema、复合 FK、000185–000192 DAG | `PENDING` |
| Files/security owner | protected metadata/download、digest、delete lock order | `PENDING` |
| Web/UI/accessibility owner | page permission、allowedActions、deep-link、mobile/keyboard/zoom | `PENDING` |
| QA/concurrency owner | list/count predicate、claim/reassign/revoke/decide race、零 mutation | `PENDING` |
| Operations owner | queue policy、reassign/revoke reason、SLA/anomaly/incident handoff | `PENDING` |
| Party 建档员代表 | profile-only journey 与最近越权 | `PENDING` |
| Identity 录入员代表 | minimal operator grant、draft/upload/submit journey | `PENDING` |
| Assigned verifier 代表 | queue/claim、masked metadata、按需 download、decide journey | `PENDING` |
| Asset manager 代表 | blocker、mode/force-release request 与 fail-closed | `PENDING` |
| Notification recipient 代表 | list/detail/read/deep-link 失权与恢复 | `PENDING` |
| Auditor 代表 | identity audit 与最小敏感读取 | `PENDING` |
| Approval incident operator 代表 | 独立 approval incident page/read/retry 与最小授权 | `PENDING` |
| Event-delivery incident operator 代表 | 独立 event page/read/replay、assigned scope 与 payload 隔离 | `PENDING` |

- [ ] 模式切换/强制释放 fail-closed exact contract 与 normal/super/wildcard 零
      mutation 测试请求已批准，合同 P0 已关闭；代码风险已登记 `B0.5-S0`。
- [ ] 五权、页面、bundle、built-in exact grants 已签署。
- [ ] Submission/decision 状态、pointer、CAS、append-only trigger 和
      tenant+park+party+identity-version composite FK 已由 schema reviewer 接受。
- [ ] Verification queue、assigned verifier、policy snapshot/hash、claim/reassign/revoke
      CAS/audit 与 list/count same-predicate 已签署。
- [ ] SHA-256/file backfill/anomaly 合同已由 files/security reviewer 接受。
- [ ] 统一全局锁序已与 approval、task、homestay、housing、leasing、files owner 对齐。
- [ ] Verifier port transaction ownership 和 evidence payload 已冻结。
- [ ] Legacy `R0/R0+1/R0+2` 兼容退出条件已冻结。
- [ ] Control API/response/error exact-set 已进入 shared contract request。
- [ ] Runtime notification recipient/read/delivery 合同已有复合 scope、幂等、失权
      deep-link 和 durable audit 证据。
- [ ] Outbox canonical `event_id` PK 与 inbox/DLQ/notification 复合引用已冻结。
- [ ] Error detail camelCase、envelope `request_id/server_time:number` 与 action/effect
      separation 已进入 shared/runtime contract request。
- [ ] 产品九类岗位已逐条通过
      route→action→permission/scope→API→DB→audit/outbox→notification 验收。
- [ ] Asset effective dependency 已覆盖所有管理入口和 runtime projection。
- [ ] 实际 UUIDv5 namespace 已填写并有跨环境 golden vector。
- [ ] Provisional migration window、候选编号/职责与唯一 schema-migration-owner 已
      签署；formal reservation 明确延后到 contract PASS 后的 schema implementation
      Gate。
- [ ] `000191/000192` 的 B-2c ownership/DAG 引用已登记，并明确其 migration SHA
      不是 B-0/B-0.5 Gate 输入。
- [ ] `000191` handoff 名固定为 `B-property-homestay-effect-schema SHA`，post-B1
      property adapter owner 固定为 `property-foundation-api-owner`，handoff 固定为
      `B-property-foundation-adapter SHA`，仅在 B-2c downstream DAG 中引用。
- [ ] 独立产品、架构、安全、数据库、QA 和岗位 reviewer 复审
      `open_contract_P0_P1=[]`。

在最后一项完成前，本文始终是 candidate，B-0 不得报告 PASS。合同 reviewer 不再把
尚未实施的直执修复记入 `open_contract_P0_P1`，而是核验其 exact contract、零
mutation 测试请求和 `B0.5-S0` 登记。只有 `open_contract_P0_P1=[]` 且全部签署后才可
生成 `B-contract SHA` 并报告 B-0 PASS；随后只允许实施 `B0.5-S0`。`B0.5-S0` 独立
Gate 未 PASS 前，身份控制面、module dependency 或其他 B-0.5 后续切片均不得启动。

## 12. B-2a C1 Identity / control 纠偏冻结

本节消费 C0 plan raw SHA
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`，并 supersede
本文所有不一致的 occupancy token、task access 与跨运行时锁序语句。

当前 canonical occupancy route 唯一为：

```text
GET  /property/occupancies/:occupancyId
POST /property/occupancies/:occupancyId/release
```

历史 migration/negative drift fixture 中的 `:id` 可作为明确标记的 legacy input 保留，但不得被
manifest、shared、controller、产品合同或检索器当作 canonical route。

Task endpoint access 使用 `requiredPermissions[]` AND
`authorizationAlternatives[]` OR schema。Release 只有 current-assignee+
`property_task:release` 或 queue-supervisor+`property_task:supervise`；unblock 只有 current-assignee+
`property_task:process` 或 queue-supervisor+`property_task:supervise`。所有 alternative 仍必须通过
active modules、current user-park、task read、source 与 queue scope；super/wildcard 不绕过。

Task command、source terminal 与 rebuild 的唯一锁序为：

```text
source row or source-scoped advisory lock
-> assignment rows by UUID network-byte ASC
-> projection head
-> projection rows by taskId UUID network-byte ASC
-> mutation receipt
-> assignment/replacement/control audit rows
```

这条 task 专用顺序覆盖 §5.2 中旧的简写；不得 assignment→source 回锁。所有 resolver、receipt port、
repository 与 replace function 使用同一调用方 `EntityManager` transaction。Completed replay 也先
获取适用 source/assignment/head/projection lock 并重新做 current authority/visibility/identity；
same-terminal replay 还必须先通过 runtime freeze §16.3 的 current-1 predicate。

Migration DAG 唯一为：000185–000190 和 000193 是历史基础；B-2a correction 是
`000194_property_task_projection_contract_correction.sql`。C2 独立链为
185→186→187→188→189→190→193→194，且 194 对 191/192 必须零对象、零 history、零 checksum
依赖。000191/000192 继续分别属于 B-2c homestay/housing effect schema，并各自独立 Gate；只有
B-4 执行 191–194 fresh-equivalence、全链 catalog/constraint/hash reconcile。不得修改任何已成功
migration，也不得为缺失 191/192 建 placeholder。
