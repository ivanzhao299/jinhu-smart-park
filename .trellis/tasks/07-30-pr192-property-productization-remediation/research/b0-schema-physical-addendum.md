# B-0 `000185` / `000189` / `000190` 物理 Schema 冻结附录

> 状态：`frozen after identity handoff limited re-review / independent PASS / migration update pending`
>
> 本文是 B-contract 的第 4 个输入，冻结 `000189` 与 `000190` 的物理对象、键、约束、
> 索引、默认定义行和重跑规则，并在 §1.1 对 `000185` Identity handoff 的双 CAS 与
> 数据库一致性对象作限定补充。
> 它不创建 migration，不写业务代码，不执行 backfill、shadow、reconcile、enforce，
> 也不写任何 role grant。若本文与三份 B-0 freeze 的业务语义冲突，立即 stop-ship，
> 回到联合复审；实现者不得自行选择另一套表名或列名。

四输入 B-contract digest 的唯一现行算法（旧 `b0-contract-v1` 永久 superseded）：

```text
b-contract-v2\n
freeze<TAB>b0-runtime-contract-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-product-access-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-identity-control-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-schema-physical-addendum.md<TAB><raw-file-sha256>\n
```

`<TAB>` 是单个 `0x09`，`\n` 是单个 LF `0x0a`；无 BOM、无 CRLF、文件名不带路径，
SHA-256 为 64 位 lowercase hex，最后一行必须有 LF。四个 raw-file SHA 对原始文件
bytes 计算；四份输入文档都不得嵌入计算结果，避免自引用。上述 manifest bytes 的
SHA-256 即唯一现行 `B-contract SHA`。`000190.sys_property_runtime_control.contract_hash`
中的旧值只作为历史输入；000194 仅按本文 §5.4 的原子 all-old→all-new correction 更新。

本文对 `000189/000190` 的物理表名、列、类型、约束、索引、definition rows、hash
grammar 与 owner 是 authoritative override；三份先行 freeze 保持业务语义权威。
已解决的 runtime checkpoint delta 为：

- `biz_property_runtime_checkpoint` 从 `000186` 移至 `000190` 唯一创建；
- 在 runtime freeze 基线列上增加 `last_run_id uuid NULL`、`updated_by uuid NULL` 与
  row `version integer NOT NULL DEFAULT 1 CHECK(version>0)`；
- `checkpoint_kind` 收窄为本文六值 exact-set；
- 增加稳定 run index `idx_biz_property_runtime_checkpoint_run`；
- checkpoint 不预置行，B-4 runner 只通过 CAS 创建/更新。

Runtime owner 必须同步移除 `000186` 创建 checkpoint 的表述并引用本 override；同步前
不得生成 `000186/000190` SQL。

## 1. 输入、现状与职责边界

权威输入：

- `b0-identity-control-freeze.md`
- `b0-runtime-contract-freeze.md`
- `b0-product-access-freeze.md`
- `b0-schema-physical-addendum.md`（本文，第 4 输入）

只读 inventory：

- 工作树当前最高 migration 为 `000184_*`。
- `public.sys_schema_migration_history` 与 `public.schema_migrations` 当前最高成功项均为
  `000182_*`；两表 filename/checksum/status 差异为零。
- `000185`–`000192` 在只读预检时均未占用。此结果仅证明候选窗口可用，不构成正式
  reservation；唯一 `schema-migration-owner` 落盘前必须重新执行双 history 与工作树
  预检。
- 现有 `sys_module` 是全局 module catalog，`module_code varchar(64)` 通过 active
  partial unique 管理；现有 `sys_permission` 是 tenant-wide definition 的实际存储，
  `tenant_id/park_id` 为当前 `varchar` business scope，active key 是
  `(tenant_id, code)`。
- 当前 bundle 只存在于 shared contract 与 migration CTE，没有 durable bundle
  definition 表；因此 `000189` 新增 definition catalog，但不得把 bundle 直接变成
  service 授权依据。

全局候选职责保持如下，禁止跨文件挪动：

| Migration | 唯一职责 |
|---|---|
| `000185` | identity queue/submission/decision/audit/snapshot/snapshot-file、Party pointer/version、`sys_file.content_sha256` |
| `000186` | approval request/stage/decision/exclusion/audit、effect manifest/receipt、mutation receipt、approval claim/fencing/deferred terminal validation |
| `000187` | outbox/event sequence/inbox/DLQ/replay audit、notification/recipient/delivery |
| `000188` | task assignment/audit/projection rebuild support |
| `000189` | module dependency、permission/page/action definition、bundle/member definition；无 role grant |
| `000190` | runtime checkpoint、compatibility/shadow/anomaly/evidence/control metadata；全部 control 默认关闭 |

`000185`–`000188` 也统一受以下文件级规则约束：

- 每个文件使用单一显式 transaction，首行设置
  `SET LOCAL lock_timeout='5s'`、`SET LOCAL statement_timeout='60s'`。
- 禁止 `CREATE INDEX CONCURRENTLY`；若后续因大表必须 concurrent index，必须拆成新的
  独立 forward migration，不得改写本 block。
- 同 deterministic key、同 frozen definition/hash 是 no-op；同 key 不同
  definition/hash 立即 drift fail。
- 新表/nullable columns/default-safe expand 可重跑；不得用宽泛 `IF NOT EXISTS` 吞掉
  列类型、nullability、constraint/index definition 差异。
- 任一语句失败整文件回滚，runner 记录 failed 后可按同 checksum 重跑；不得跳过失败
  文件继续后续 migration、fixture、seed、backfill 或 enforce。
- `000185`–`000188` 均不得执行 backfill、change-capture 消费、业务 mutation、role
  grant、测试数据或 production enforce。

`biz_property_runtime_checkpoint` 的物理 owner 固定为 `000190`。`000186` 可在 approval
runtime 中消费 checkpoint port，但不得创建同名表、别名表或第二套 checkpoint。

### 1.1 `000185` Identity assignment/decision authority 限定补充

本节只补齐既有 Identity schema 的物理执行权威，不改变 10 条 identity route、
49-row endpoint manifest、7 pages/18 actions、16 bundles/125 members，也不引入
retry/generic/revoke route。`000185` 必须新增以下十个函数（6 command/CAS +
4 trigger functions），函数 identity argument
以 PostgreSQL 16 `pg_get_function_identity_arguments` 为准并进入 catalog marker：

```text
public.fn_party_identity_create_draft_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_party_id uuid,
  p_actor_id uuid,
  p_expected_identity_version bigint,
  p_supersedes_submission_id uuid,
  p_expected_superseded_status character varying,
  p_expected_superseded_version integer
) RETURNS public.biz_party_identity_submission

public.fn_party_identity_update_draft_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_submission_id uuid,
  p_actor_id uuid,
  p_expected_submission_version integer,
  p_document_type character varying,
  p_identity_number_encrypted text,
  p_identity_number_hash character varying,
  p_identity_number_masked character varying,
  p_hash_algorithm character varying,
  p_hash_version integer,
  p_encryption_key_id character varying,
  p_payload_format_version integer,
  p_pending_file_ids uuid[]
) RETURNS public.biz_party_identity_submission

public.fn_party_identity_submit_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_submission_id uuid,
  p_actor_id uuid,
  p_expected_submission_version integer,
  p_verification_queue_id uuid,
  p_eligibility_policy_snapshot jsonb,
  p_eligibility_policy_hash character varying
) RETURNS public.biz_party_identity_submission

public.fn_party_identity_withdraw_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_submission_id uuid,
  p_actor_id uuid,
  p_reason character varying,
  p_request_id character varying,
  p_expected_submission_version integer
) RETURNS public.biz_party_identity_submission

public.fn_party_identity_assignment_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_submission_id uuid,
  p_actor_id uuid,
  p_action character varying,
  p_to_verifier_id uuid,
  p_reason character varying,
  p_request_id character varying,
  p_expected_submission_version integer,
  p_expected_assignment_version integer
) RETURNS public.biz_party_identity_submission

public.fn_party_identity_decision_cas(
  p_tenant_id character varying,
  p_park_id character varying,
  p_submission_id uuid,
  p_actor_id uuid,
  p_decision character varying,
  p_reason character varying,
  p_expected_submission_version integer,
  p_expected_assignment_version integer
) RETURNS public.biz_party_identity_submission

public.fn_guard_party_identity_assignment_audit_insert()
  RETURNS trigger
public.fn_guard_party_identity_decision_insert()
  RETURNS trigger
public.fn_guard_party_identity_draft_file_mutation()
  RETURNS trigger
public.fn_validate_party_identity_consistency()
  RETURNS trigger
```

上述十个 functions 均为 `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`，
固定且唯一 `SET search_path = pg_catalog`；函数 body 中所有非 `pg_catalog` 的
relation、function、sequence、type 均必须写 `public.` schema qualification，不能
依赖 implicit `public` lookup。Owner 必须命中 Gate 输入的 migration schema-owner
allowlist，且不得等于任何 API/session/worker login role。

API/session roles 后续只允许显式获得六个 command/CAS functions 的 `EXECUTE`，不得
拥有 Identity authority tables 的直接写权限。`000185` 必须至少执行：

```text
REVOKE INSERT, UPDATE, DELETE
  ON public.biz_party_identity_submission,
     public.biz_party_identity_snapshot,
     public.rel_party_identity_snapshot_file,
     public.rel_party_identity_draft_file,
     public.biz_party_identity_assignment_audit,
     public.biz_party_identity_decision
  FROM PUBLIC;
REVOKE ALL
  ON FUNCTION public.fn_party_identity_create_draft_cas(...),
              public.fn_party_identity_update_draft_cas(...),
              public.fn_party_identity_submit_cas(...),
              public.fn_party_identity_withdraw_cas(...),
              public.fn_party_identity_assignment_cas(...),
              public.fn_party_identity_decision_cas(...)
  FROM PUBLIC;
```

`public.biz_party` 的 table-wide UPDATE 对 application roles 必须为零；允许的 profile
column UPDATE grant 必须使用 explicit column allowlist，且不得包含
`identity_version/current_identity_submission_id/current_verified_submission_id` 或
identity encrypted/hash/masked/document columns。所有当前 non-owner
login/application role 的上述表 DML ACL 必须由 Gate 查询并证明为空；后续 runtime
grant 只允许 exact function `EXECUTE`。Administrative schema owner 仅用于
migration/受审计恢复，不得出现在服务连接配置。Create/update/submit/withdraw/
supersede 的唯一写入口分别是前四个 functions；supersede 只作为 create function 的
受约束分支，不新增 route/function alias。Assignment audit 的 non-legacy INSERT 唯一入口因此是
`fn_party_identity_assignment_cas`；decision INSERT 唯一入口是
`fn_party_identity_decision_cas`。应用层先 INSERT audit/decision、直接 UPDATE
submission、session GUC 绕过或 SECURITY DEFINER wrapper alias 均不允许。

六个 command/CAS functions 在读取或写入任何业务 row 前必须在当前 transaction
显式执行：

```sql
SET CONSTRAINTS
  public.trg_biz_party_identity_party_consistency,
  public.trg_biz_party_identity_submission_consistency,
  public.trg_biz_party_identity_assignment_consistency,
  public.trg_biz_party_identity_decision_consistency
DEFERRED;
```

这些 trigger 均为 DEFERRABLE，因此 PostgreSQL 16 允许 function 把调用方此前设置为
IMMEDIATE 的 exact constraints 恢复为 DEFERRED；这只延后同 transaction 的四向最终态
检查，不禁用 immediate mutation guards，也不允许越过 commit。Gate 必须覆盖：
`pg_get_functiondef` 对 6 个 command/CAS functions 都包含上述 schema-qualified exact
statement，且 function body 不得使用 `SET CONSTRAINTS ALL DEFERRED`；
调用方先 `SET CONSTRAINTS ALL IMMEDIATE` 后合法调用每个 command function仍成功并在
commit 验证；同样预设下任何 direct table write 在 function 外立即失败；function
返回后制造 pointer/decision/selection 不一致仍在再次
`SET CONSTRAINTS ALL IMMEDIATE` 或 commit 失败。不得承诺在 constraints 保持
IMMEDIATE 时依靠多语句中间态完成合法 command。

四个 non-assignment command functions 的 exact authority：

- `fn_party_identity_create_draft_cas` 对应唯一 create route。它先锁 Party；无
  supersede 参数时要求三个 supersede 参数全 null、Party
  `identity_version=p_expected_identity_version`、两个 current pointer 均为 null
  且不存在 non-legacy submission，
  创建 `identity_version=expected+1,submission_attempt=1` 的空 draft。带 supersede
  时三个参数必须全有：锁 Party 后锁 exact old submission；old 为
  rejected/withdrawn 时新 draft 保持 old identity version 且 attempt+1，old 为
  verified 时新 draft identity version=old+1 且 attempt=1；逐字比较 old
  status/version，先 CAS old→superseded，再插入 new draft、更新 Party
  identity_version/current identity pointer 并清空 verified pointer。任一唯一键或
  CAS loser 全部回滚。它不接受 pending/draft/superseded old row。
  Supersedes 的物理引用固定为：

  ```text
  CONSTRAINT uq_biz_party_identity_submission_party_id
    UNIQUE (tenant_id,park_id,party_id,id)
  CONSTRAINT fk_biz_party_identity_submission_supersedes
    FOREIGN KEY (tenant_id,park_id,party_id,supersedes_submission_id)
    REFERENCES public.biz_party_identity_submission(tenant_id,park_id,party_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  ```

  该 FK 保证 same Party 但允许跨 identity version；任何把 identity version 纳入
  supersedes FK 的旧 definition 必须 drift fail，不得保留为第二约束。
- `fn_party_identity_update_draft_cas` 对应唯一 update route。先 scope lookup Party，
  再按 Party→submission→`p_pending_file_ids` UUID 升序锁定；要求 draft、owner/scope、
  expected version。Document type 与 encrypted/hash/masked 四值必须全 null或全
  non-null；non-null type 只允许 `id_card|passport`，hash/mask/cipher 均由已完成
  canonicalization/encryption 的 service 传入。File array 必须无 null/重复并全部是
  同 scope、`biz_type=party_identity_evidence`、`biz_id=submissionId`、未冻结文件。
  Identity material 四值全 null 时 file array 必须为空，且
  `p_hash_algorithm/p_hash_version/p_encryption_key_id/p_payload_format_version` 必须
  全部为 null；identity material 非空时 crypto quartet 必须全部非空并逐字等于
  V1 profile + trusted key provider。
  Function 更新 Party identity material 与 submission `version+1/update_time`；文件
  association 只验证不改写。
- `fn_party_identity_submit_cas` 对应唯一 submit route。按
  Party→submission→file UUID 顺序锁定，要求 draft、expected version、Party identity
  material 完整且 file metadata/hash ready；queue 必须 active，同 scope，policy
  JSON/hash 与 queue 当前冻结版本逐字一致。Function 创建 immutable snapshot 与
  snapshot-file rows，CAS submission 到 pending、写 submitted actor/time、
  queue/policy/snapshot、`version+1`。不得接受客户端构造的 snapshot ID/hash。
- `fn_party_identity_withdraw_cas` 对应唯一 withdraw route。锁 Party→submission，
  要求 pending、submitter actor、expected version、无 decision、reason 非空。若有
  assignee，function 在同 transaction 以内建的 assignment CAS 语义 append revoke
  audit、assignment version+1、清空 assignee；随后 CAS pending→withdrawn、
  `version+1`、actor/time/reason。它不得通过可外部调用的 revoke alias，也不要求 HTTP
  DTO 新增 `expectedAssignmentVersion`，因为每次 assignment winner 同时递增
  submission version，旧 expected submission version 必然失败。

四函数与 assignment/decision functions 都只能写 `000185` 已存在的 Identity/Party
对象，禁止引用 `biz_property_mutation_receipt`、outbox 或任何 `000186+` object。
全迁移应用后，service 必须开启一个外层 database transaction：先建立/锁定
`000186` mutation receipt intent，再调用 exact `000185` function，随后写
`000187` outbox及共享 audit，最后完成 receipt；任一步失败整个外层 transaction
回滚。这样 receipt、command、audit/outbox 仍原子，但 `000185` clean apply/rerun
不依赖未来 migration。Function 只返回 authoritative submission row/result ref，
不自行声称 receipt success。

Draft evidence selection 的 `000185` exact physical objects：

```text
public.biz_party_identity_submission ADD
  draft_hash_algorithm varchar(32) NULL
  draft_hash_version integer NULL
  draft_encryption_key_id varchar(128) NULL
  draft_payload_format_version integer NULL

  CONSTRAINT ck_biz_party_identity_submission_crypto_profile CHECK (
    (
      draft_hash_algorithm IS NULL
      AND draft_hash_version IS NULL
      AND draft_encryption_key_id IS NULL
      AND draft_payload_format_version IS NULL
    )
    OR (
      draft_hash_algorithm = 'hmac-sha256'
      AND draft_hash_version = 1
      AND length(btrim(draft_encryption_key_id)) > 0
      AND draft_payload_format_version = 1
    )
  )

public.rel_party_identity_draft_file
  id uuid NOT NULL DEFAULT public.uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  submission_id uuid NOT NULL
  file_id uuid NOT NULL
  file_version integer NOT NULL
  ordinal integer NOT NULL
  selected_by uuid NOT NULL
  selected_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()

  CONSTRAINT pk_rel_party_identity_draft_file PRIMARY KEY (id)
  CONSTRAINT uq_rel_party_identity_draft_file_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_rel_party_identity_draft_file_file
    UNIQUE (tenant_id,park_id,submission_id,file_id)
  CONSTRAINT uq_rel_party_identity_draft_file_ordinal
    UNIQUE (tenant_id,park_id,submission_id,ordinal)
  CONSTRAINT fk_rel_party_identity_draft_file_submission
    FOREIGN KEY (tenant_id,park_id,submission_id)
    REFERENCES public.biz_party_identity_submission(tenant_id,park_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  CONSTRAINT fk_rel_party_identity_draft_file_file
    FOREIGN KEY (tenant_id,park_id,file_id)
    REFERENCES public.sys_file(tenant_id,park_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  CONSTRAINT ck_rel_party_identity_draft_file_values
    CHECK (file_version>0 AND ordinal>=0 AND ordinal<20)

  INDEX idx_rel_party_identity_draft_file_submission
    (tenant_id,park_id,submission_id,ordinal,file_id)
```

`fn_party_identity_update_draft_cas` 在同一次 expected submission-version CAS 中将
`p_pending_file_ids` 原子 replace 到该表，ordinal 等于 array 的 zero-based index；
函数不得先 delete 后在独立 transaction insert。`fn_party_identity_submit_cas` 不接收
file array：它先以 `ORDER BY ordinal,file_id FOR UPDATE` 锁 selection，再以 file UUID
升序锁 `public.sys_file`，逐行验证 selection `file_version` 与 current file version/
SHA/storage/biz association，随后按 selection ordinal 建 snapshot-file exact
bijection。Submit 后 selection 保留，不清空。

```text
trg_rel_party_identity_draft_file_mutation_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.rel_party_identity_draft_file
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_party_identity_draft_file_mutation()
```

Guard 只允许 update command function 对 locked draft 做完整 replacement；submission
非 draft、version CAS 未持有、submit 已开始或 caller 直接 DML 时 SQLSTATE `23514`。
Selection row 自 draft→pending 的同 transaction 起永久 immutable；withdraw/reject/
verify/supersede 不删除。Deferred consistency 另验证 pending/terminal submission 的
selection 与 snapshot-file file ID/version/ordinal exact bijection。

Update function 的四个 crypto metadata 参数必须逐字等于 shared
`PARTY_IDENTITY_CRYPTO_PROFILE_V1` 与受信 key provider 同次返回的 key ID，并与
encrypted/hash/masked material 一起持久化到上述 draft columns；HTTP 不提供这些
参数。Submit function 只读取 locked draft columns 并 exact-copy 至 snapshot
`hash_algorithm/hash_version/encryption_key_id/payload_format_version`，不得解析
encrypted payload、私自硬编码、重新读取“当前默认 key”或让 submit DTO 覆盖。

`fn_party_identity_assignment_cas` 的 transaction 内精确顺序：

1. 以 scope+submission ID 做不加锁 lookup 取得 `party_id`；无行统一抛 SQLSTATE
   `P0002`、machine token `property-resource-not-found`。
2. `SELECT ... FROM biz_party WHERE tenant_id/park_id/id ... FOR UPDATE`，随后
   `SELECT ... FROM biz_party_identity_submission ... FOR UPDATE`，并确认第二次读取的
   `party_id` 等于第一步；不同则以 SQLSTATE `40001` 抛
   `property-version-conflict`。锁序固定 Party→submission，不得先锁 audit/file。
3. 精确比较 submission `version=p_expected_submission_version` 与
   `assignment_version=p_expected_assignment_version`；任一不等以 SQLSTATE `40001`
   抛 `property-version-conflict`。必须是 `pending_verification`、无 decision，
   queue/policy frozen values 非空。
4. `p_action` exact-set 为 `claim|reassign|revoke`。Claim 要求 old assignee null、
   new non-null；reassign 要求 old/new non-null 且不同、reason 非空；revoke 要求
   old non-null、new null、reason 非空。Claim 的 actor 必须等于 new assignee；
   reassign/revoke 的 actor 必须通过 service 已验证的 queue-supervisor predicate，
   database 仍拒绝 `p_actor_id IS NULL`。
5. 使用 `UPDATE ... WHERE version=p_expected_submission_version AND
   assignment_version=p_expected_assignment_version` 同时写 new assignee、
   `assignment_version+1`、`version+1`、`update_time=clock_timestamp()`；受影响行必须
   精确为 1，否则 SQLSTATE `40001 property-version-conflict`。
6. 在同一 function、同一 transaction 追加唯一 audit：before/after assignment
   version、from/to verifier、queue/policy hash、Party/identity version 必须取自锁定
   row，不接受调用者重复传入；`request_id=p_request_id`，`occurred_at` 取数据库时钟。
   Function 返回更新后的 submission。任一步失败整笔回滚，不能只留 row 或 audit。

`fn_party_identity_decision_cas` 同样执行 Party→submission→snapshot→snapshot-file
（file UUID 升序）锁序；随后：

1. 比较 submission version 与 assignment version 双 CAS，要求
   `pending_verification`、snapshot/queue/policy 完整、尚无 decision。
2. 要求 `assigned_verifier_id=p_actor_id`，且 assignment latest audit 的
   `assignment_version_after=p_expected_assignment_version`、action 为
   `claim|reassign`、`to_verifier_id=p_actor_id`、queue/policy hash 与 submission
   逐字相等；decision 不能信任 DTO 中的 assignee。
3. Maker-checker exact predicate 为 actor 不等于 `drafted_by`、`submitted_by`、
   `recorded_by` 中任一非 null actor。违反时 SQLSTATE `23514`、machine token
   `identity-actor-separation-required`。
4. `p_decision` 只允许 `verified|rejected`；rejected reason 必填，verified reason
   可 null。先 append decision fact，保存 CAS 前 submission version、当前 assignment
   version/queue/policy/snapshot/actor，再以同双 CAS 把 submission 转 terminal、
   清空 current assignee、`version+1`，assignment version保持不变；verified 同
   transaction 更新 Party current verified/current identity pointer，rejected 只更新
   current identity pointer。任一写入失败全部回滚。

Immediate trigger exact-set：

```text
trg_biz_party_identity_assignment_audit_insert_guard
  BEFORE INSERT ON biz_party_identity_assignment_audit
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_party_identity_assignment_audit_insert()

trg_biz_party_identity_decision_insert_guard
  BEFORE INSERT ON biz_party_identity_decision
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_party_identity_decision_insert()
```

Assignment guard 对 non-legacy row 验证 pending/no-decision、连续 version、from/to、
queue/policy/Party/identity 与当前 transaction 中 CAS winner 完全相等；legacy-import
只允许 migration reconciliation owner、`0→1` 与既有 anomaly contract。Decision
guard 在 submission 仍 pending 时验证 assigned verifier、latest audit、maker-checker、
snapshot/queue/policy/version；不满足统一 SQLSTATE `23514`。两个 guard 都不能通过
nullable equality 漏掉 scope 或 actor。

Deferred consistency 使用同一个
`fn_validate_party_identity_consistency()`，由 Party/submission/audit/decision 四向
trigger 调用：

```text
trg_biz_party_identity_party_consistency
  AFTER INSERT OR UPDATE
  ON public.biz_party
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_party_identity_consistency()

trg_biz_party_identity_submission_consistency
  AFTER INSERT OR UPDATE
  ON public.biz_party_identity_submission
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_party_identity_consistency()

trg_biz_party_identity_assignment_consistency
  AFTER INSERT ON public.biz_party_identity_assignment_audit
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_party_identity_consistency()

trg_biz_party_identity_decision_consistency
  AFTER INSERT ON public.biz_party_identity_decision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_party_identity_consistency()
```

Commit 前函数按受影响 submission 的 tenant+park+ID 重新查询最终态并强制：

- Party `identity_version=0` 时两个 current pointer 都为 null，且不存在 non-legacy
  submission；`identity_version>0` 时 `current_identity_submission_id` 必须非 null，
  指向 same scope+Party、`identity_version=Party.identity_version` 且 status 不为
  superseded 的唯一 current submission。Party identity version 必须等于其 non-legacy
  submission 最大 identity version。
- Current submission 为 verified 时两个 Party pointer 必须相等并指向该 verified
  row；为 draft/pending/rejected/withdrawn 时
  `current_verified_submission_id` 必须 null。任何 Party pointer 都不得指向
  superseded、scope/Party/version 不匹配或不存在的 row。
- Supersede transaction commit 前，old row 不得再被任一 Party pointer 引用，new
  draft 必须成为 current identity；verified/rejected decision commit 前分别满足
  verified 双 pointer / rejected current-only pointer。Pointer、submission terminal
  state 与 decision 必须在同一 transaction 达成，不能靠下次请求修复。
- Successor 引用 rejected/withdrawn old row 时必须 same identity version 且
  `submission_attempt=old+1`；引用 verified old row 时必须
  `identity_version=old+1` 且 `submission_attempt=1`。Old status/version 必须等于
  create function 的 expected inputs；其他 old status、version gap 或 cross-Party
  引用在 `SET CONSTRAINTS ... IMMEDIATE`/commit 时失败。
- `assignment_version=0` 时无 audit、assignee null；大于 0 时 audit after versions
  从 1 到 current 连续无 gap，latest audit after=current assignment version。
- pending submission 的 assignee null 时 latest audit 必须是 revoke；assignee 非 null
  时 latest 必须是 claim/reassign 且 to verifier 等于 current assignee。
- terminal `verified|rejected` 必须恰有一条 decision，submission status/decided
  actor/time、snapshot、queue、policy、identity/assignment/submission version 与
  decision 一致；current assignee 必须 null，latest assignment winner 必须是同
  decision actor，decision 后不得有 audit。
- `withdrawn|superseded` 不得有 decision，current assignee 必须 null；若曾 assigned，
  latest audit 必须是同 transaction 产生的 revoke。Draft 不得有 assignment audit
  或 decision。

违反任一项以 SQLSTATE `23514` 回滚 transaction。Party trigger 必须能从 Party row
解析 current submission；其余三个 trigger 必须反查 Party，因此无论先写 pointer
还是先写 terminal row，`SET CONSTRAINTS ALL IMMEDIATE` 和 COMMIT 都得到同一最终态
判定。Immediate guard 是提前失败，
deferred triggers 是 commit authority，两者不可互相替代。

Security Gate 对 10 个 Identity functions 与
`public.fn_transition_property_migration_anomaly(character varying,character varying,uuid,integer,character varying,uuid,character varying,character varying)`
共 11 个 exact regprocedure 逐一保存并断言：

- `pg_proc.proowner` 映射的 role 等于批准的 schema-owner allowlist，且不命中任何
  application/service/worker role；`prosecdef=true`、`provolatile='v'`、
  `prolang=plpgsql`。
- `pg_proc.proconfig` exact-set 只有 `search_path=pg_catalog`；null、多值、
  `public`、`"$user"` 或其他 schema 一律失败。`pg_get_functiondef` 中每个
  non-`pg_catalog` object token 都以 `public.` 限定。
- 通过 `aclexplode(coalesce(proacl,acldefault('f',proowner)))` 展开 function ACL：
  PUBLIC 无 EXECUTE；B-0 schema 阶段除 owner 外无 grantee。后续 runtime handoff
  只允许批准的 application role 对 6 command functions EXECUTE，4 trigger functions
  不得授予 application EXECUTE；anomaly function 在 `000190`/B-schema Gate 不授予
  EXECUTE，后续只按 B-4 signed provisioning allowlist exact-set放行。
- 通过 `aclexplode` 展开六张 Identity authority table ACL（原五张加 draft evidence
  selection relation）与 `biz_party` identity column ACL：
  application role 无 table-wide INSERT/UPDATE/DELETE；允许的 Party profile column
  allowlist不含任何 identity material/version/pointer column。
- 同一 Gate 展开 `biz_property_migration_anomaly` 与
  `biz_property_migration_anomaly_audit` ACL，PUBLIC/application role 均不得拥有
  UPDATE/DELETE；该断言不包含 INSERT，避免改变 anomaly creation/append 合同。
- 通过 `aclexplode(coalesce(pg_namespace.nspacl,
  acldefault('n',pg_namespace.nspowner)))` 断言 `grantee=0`（PUBLIC）不存在 CREATE；
  对每个 application role 调用
  `has_schema_privilege(role_oid,'public','CREATE')=false`。若现状不能满足，Gate
  stop-ship，不得用扩展 search_path 或 function wrapper 规避。

这些 ACL/proconfig/owner/CREATE 查询结果是 B-schema evidence 的独立 signed artifact，
不进入 §4.4 catalog JSON，但缺失或与 allowlist 不等即 Gate FAIL。

PostgreSQL 16 不支持 `CREATE OR REPLACE CONSTRAINT TRIGGER`。重跑必须使用受控 `DO`
block 查询 `pg_trigger`：不存在才执行 exact `CREATE CONSTRAINT TRIGGER`；存在时对
`pg_get_triggerdef(oid,false)`、enabled 状态、constraint deferrable/initially-deferred
属性和 function identity 做逐字 canonical signature 比对，任一 drift 立即失败。
普通 immediate trigger、function 也必须作 full signature drift guard，不能用
`CREATE OR REPLACE` 静默覆盖未知 definition。

新增 catalog marker exact-set 必须包含上述 10 functions、3 immediate triggers、
4 constraint triggers；函数 definition、language、securityDefiner、volatility 与
trigger definition/enabled 均进入 §4.4 catalog hash。ACL 不属于 schema catalog JSON，
但独立 Gate 必须另存 owner、function EXECUTE、六表 DML 与 Party identity column ACL
query 结果并断言 direct
write 为零。Clean apply、同文件直接重跑、CAS race loser、函数中途异常回滚、
 immediate trigger 直写负向、`SET CONSTRAINTS ALL IMMEDIATE` 与 commit-time 四向不一致
负向全部是 `B-schema-expand SHA` 前置证据。Decision 测试必须分别制造：
verified 但 verified pointer 缺失/错指、rejected 仍保留 verified pointer、decision
actor/version/queue/policy 与 terminal submission 不等；每项在
`SET CONSTRAINTS ALL IMMEDIATE` 和 COMMIT 两种时机均以 SQLSTATE `23514` 失败并证明
transaction residual=0。

Supersedes Gate 还必须证明：rejected/withdrawn→new draft 的 same-version/attempt+1
成功，verified→new draft 的 exact version+1/attempt=1 成功；cross-Party、旧状态/
版本 CAS 不等、rejected/withdrawn 跨 version、verified 未递增或跳版本全部失败。
Catalog exact-set 相比上一候选只增加
`uq_biz_party_identity_submission_party_id` constraint/backing index，并更新既有
`fk_biz_party_identity_submission_supersedes` definition；10 functions、3 immediate
triggers、4 constraint triggers 的计数不变。

`000185` marker 行的 exact name 固定为（TAB 规则沿用 §4.4）：

```text
table<TAB>public.rel_party_identity_draft_file
column<TAB>public.biz_party_identity_submission.draft_hash_algorithm
column<TAB>public.biz_party_identity_submission.draft_hash_version
column<TAB>public.biz_party_identity_submission.draft_encryption_key_id
column<TAB>public.biz_party_identity_submission.draft_payload_format_version
column<TAB>public.rel_party_identity_draft_file.id
column<TAB>public.rel_party_identity_draft_file.tenant_id
column<TAB>public.rel_party_identity_draft_file.park_id
column<TAB>public.rel_party_identity_draft_file.submission_id
column<TAB>public.rel_party_identity_draft_file.file_id
column<TAB>public.rel_party_identity_draft_file.file_version
column<TAB>public.rel_party_identity_draft_file.ordinal
column<TAB>public.rel_party_identity_draft_file.selected_by
column<TAB>public.rel_party_identity_draft_file.selected_at
constraint<TAB>public.biz_party_identity_submission.ck_biz_party_identity_submission_crypto_profile
constraint<TAB>public.biz_party_identity_submission.uq_biz_party_identity_submission_party_id
constraint<TAB>public.biz_party_identity_submission.fk_biz_party_identity_submission_supersedes
constraint<TAB>public.rel_party_identity_draft_file.pk_rel_party_identity_draft_file
constraint<TAB>public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_scope_id
constraint<TAB>public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_file
constraint<TAB>public.rel_party_identity_draft_file.uq_rel_party_identity_draft_file_ordinal
constraint<TAB>public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_submission
constraint<TAB>public.rel_party_identity_draft_file.fk_rel_party_identity_draft_file_file
constraint<TAB>public.rel_party_identity_draft_file.ck_rel_party_identity_draft_file_values
index<TAB>public.pk_rel_party_identity_draft_file
index<TAB>public.uq_rel_party_identity_draft_file_scope_id
index<TAB>public.uq_rel_party_identity_draft_file_file
index<TAB>public.uq_rel_party_identity_draft_file_ordinal
index<TAB>public.idx_rel_party_identity_draft_file_submission
index<TAB>public.uq_biz_party_identity_submission_party_id
function<TAB>public.fn_party_identity_create_draft_cas(p_tenant_id character varying, p_park_id character varying, p_party_id uuid, p_actor_id uuid, p_expected_identity_version bigint, p_supersedes_submission_id uuid, p_expected_superseded_status character varying, p_expected_superseded_version integer)
function<TAB>public.fn_party_identity_update_draft_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_document_type character varying, p_identity_number_encrypted text, p_identity_number_hash character varying, p_identity_number_masked character varying, p_hash_algorithm character varying, p_hash_version integer, p_encryption_key_id character varying, p_payload_format_version integer, p_pending_file_ids uuid[])
function<TAB>public.fn_party_identity_submit_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_expected_submission_version integer, p_verification_queue_id uuid, p_eligibility_policy_snapshot jsonb, p_eligibility_policy_hash character varying)
function<TAB>public.fn_party_identity_withdraw_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer)
function<TAB>public.fn_party_identity_assignment_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_action character varying, p_to_verifier_id uuid, p_reason character varying, p_request_id character varying, p_expected_submission_version integer, p_expected_assignment_version integer)
function<TAB>public.fn_party_identity_decision_cas(p_tenant_id character varying, p_park_id character varying, p_submission_id uuid, p_actor_id uuid, p_decision character varying, p_reason character varying, p_expected_submission_version integer, p_expected_assignment_version integer)
function<TAB>public.fn_guard_party_identity_assignment_audit_insert()
function<TAB>public.fn_guard_party_identity_decision_insert()
function<TAB>public.fn_guard_party_identity_draft_file_mutation()
function<TAB>public.fn_validate_party_identity_consistency()
trigger<TAB>public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_audit_insert_guard
trigger<TAB>public.biz_party_identity_decision.trg_biz_party_identity_decision_insert_guard
trigger<TAB>public.rel_party_identity_draft_file.trg_rel_party_identity_draft_file_mutation_guard
trigger<TAB>public.biz_party.trg_biz_party_identity_party_consistency
trigger<TAB>public.biz_party_identity_submission.trg_biz_party_identity_submission_consistency
trigger<TAB>public.biz_party_identity_assignment_audit.trg_biz_party_identity_assignment_consistency
trigger<TAB>public.biz_party_identity_decision.trg_biz_party_identity_decision_consistency
```

文件中的实际注释仍必须使用字面量
`-- B0_CATALOG_OBJECT <kind><0x09><name>`；上方 `<TAB>` 只是本文可见占位符，不能原样
写进 migration。

## 2. `000189_property_b_module_rbac_definitions.sql`

### 2.1 Module dependency definition

新增全局 definition 表：

```text
sys_module_dependency
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  module_id uuid NOT NULL
  required_module_id uuid NOT NULL
  dependency_kind varchar(16) NOT NULL DEFAULT 'hard'
  is_enabled boolean NOT NULL DEFAULT true
  create_time timestamptz NOT NULL DEFAULT clock_timestamp()
  update_time timestamptz NOT NULL DEFAULT clock_timestamp()
  is_deleted boolean NOT NULL DEFAULT false
  version integer NOT NULL DEFAULT 1
  remark varchar(500) NULL

  CONSTRAINT ck_sys_module_dependency_not_self
    CHECK (module_id <> required_module_id)
  CONSTRAINT ck_sys_module_dependency_kind
    CHECK (dependency_kind IN ('hard'))
  CONSTRAINT ck_sys_module_dependency_version
    CHECK (version > 0)
  CONSTRAINT fk_sys_module_dependency_module
    FOREIGN KEY (module_id) REFERENCES sys_module(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  CONSTRAINT fk_sys_module_dependency_required
    FOREIGN KEY (required_module_id) REFERENCES sys_module(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT

  UNIQUE INDEX uq_sys_module_dependency_active
    (module_id, required_module_id, dependency_kind)
    WHERE is_deleted = false
  INDEX idx_sys_module_dependency_required_active
    (required_module_id, module_id)
    WHERE is_deleted = false AND is_enabled = true
```

仅登记以下两行；通过 `sys_module.module_code` 解析 ID，任一 module 缺失、软删除或
status 非 `1` 时 migration 失败，不静默跳过：

| module_code | required_module_code | dependency_kind | is_enabled |
|---|---|---|---|
| `homestay` | `asset` | `hard` | `true` |
| `housing_rental` | `asset` | `hard` | `true` |

Effective module 计算固定为：

```text
requested assignment active
AND every active hard dependency assignment active
```

其中 assignment active 精确要求 `rel_tenant_module.enabled=true`、
`status='enabled'`、`is_deleted=false`，且 `expire_time IS NULL OR expire_time>DB clock`；
同时对应 `sys_module.status=1 AND is_deleted=false`。dependency definition 本身不创建
或修改 tenant module assignment。

### 2.2 Permission/page/action definitions

`000189` 不新建 permission 表。它按现有 `sys_permission` 物理模型，使用每 tenant
按 UTF-8 byte order 最小的 active business `park_id` 作为 tenant-wide definition 的
deterministic storage scope，并通过
`ON CONFLICT (tenant_id, code) WHERE is_deleted=false` 幂等 upsert。

18 个 action definition 的完整 VALUES 行如下；表中 `parent` 固定 `NULL`，`module`
是 scope 生成所需 module，不是 `sys_permission` 新列：

| code | name | resource | action | type/perm_type | method | api_path | frontend_route | path | sort_no | parent | module |
|---|---|---|---|---|---|---|---|---|---:|---|---|
| `party:identity_update` | 身份资料录入 | `biz.party_identity` | `update` | `api/40` | `NULL` | `NULL` | `/assets/identity-submissions` | `party:identity_update` | 8101 | `NULL` | `asset` |
| `party:identity_verify` | 身份资料核验 | `biz.party_identity` | `verify` | `api/40` | `POST` | `/api/v1/property/identity-submissions/:submissionId/decisions` | `/assets/identity-submissions` | `party:identity_verify` | 8102 | `NULL` | `asset` |
| `property_approval:create` | 房产业务审批申请 | `biz.property_approval` | `create` | `api/40` | `NULL` | `NULL` | `NULL` | `property_approval:create` | 8110 | `NULL` | `asset` |
| `property_approval:read` | 房产业务审批读取 | `biz.property_approval` | `read` | `api/40` | `GET` | `/api/v1/property/approvals` | `NULL` | `property_approval:read` | 8111 | `NULL` | `asset` |
| `property_approval:decide` | 房产业务审批决定 | `biz.property_approval` | `decide` | `api/40` | `POST` | `/api/v1/property/approvals/:requestId/decisions` | `NULL` | `property_approval:decide` | 8112 | `NULL` | `asset` |
| `property_approval:withdraw` | 房产业务审批撤回 | `biz.property_approval` | `withdraw` | `api/40` | `POST` | `/api/v1/property/approvals/:requestId/withdraw` | `NULL` | `property_approval:withdraw` | 8113 | `NULL` | `asset` |
| `property_approval:retry` | 审批执行重试 | `biz.property_approval_incident` | `retry` | `api/40` | `POST` | `/api/v1/property/approvals/:requestId/retry` | `/property/approval-incidents` | `property_approval:retry` | 8114 | `NULL` | `asset` |
| `property_approval:read_incident` | 审批事故读取 | `biz.property_approval_incident` | `read_incident` | `api/40` | `GET` | `/api/v1/property/approval-incidents` | `/property/approval-incidents` | `property_approval:read_incident` | 8115 | `NULL` | `asset` |
| `property_event:read_incident` | 事件投递事故读取 | `biz.property_event_dlq` | `read_incident` | `api/40` | `GET` | `/api/v1/property/event-delivery-incidents` | `/property/event-delivery-incidents` | `property_event:read_incident` | 8120 | `NULL` | `asset` |
| `property_event:replay` | 事件投递重放 | `biz.property_event_dlq` | `replay` | `api/40` | `POST` | `/api/v1/property/event-delivery-incidents/:dlqId/replay` | `/property/event-delivery-incidents` | `property_event:replay` | 8121 | `NULL` | `asset` |
| `property_task:read` | 房产业务任务读取 | `biz.property_task` | `read` | `api/40` | `GET` | `/api/v1/property/tasks` | `NULL` | `property_task:read` | 8130 | `NULL` | `asset` |
| `property_task:claim` | 房产业务任务领取 | `biz.property_task` | `claim` | `api/40` | `POST` | `/api/v1/property/tasks/:taskId/claim` | `NULL` | `property_task:claim` | 8131 | `NULL` | `asset` |
| `property_task:process` | 房产业务任务处理 | `biz.property_task` | `process` | `api/40` | `POST` | `/api/v1/property/tasks/:taskId/start` | `NULL` | `property_task:process` | 8132 | `NULL` | `asset` |
| `property_task:release` | 房产业务任务释放 | `biz.property_task` | `release` | `api/40` | `POST` | `/api/v1/property/tasks/:taskId/release` | `NULL` | `property_task:release` | 8133 | `NULL` | `asset` |
| `property_task:supervise` | 房产业务任务督办 | `biz.property_task` | `supervise` | `api/40` | `POST` | `/api/v1/property/tasks/:taskId/unblock` | `NULL` | `property_task:supervise` | 8134 | `NULL` | `asset` |
| `property_task:rebuild` | 房产业务任务投影重建 | `biz.property_task_projection` | `rebuild` | `api/40` | `POST` | `/api/v1/property/tasks/internal/rebuild` | `NULL` | `property_task:rebuild` | 8135 | `NULL` | `asset` |
| `property_notification:read` | 房产业务通知读取 | `biz.property_notification` | `read` | `api/40` | `GET` | `/api/v1/property/notifications` | `/property/notifications` | `property_notification:read` | 8140 | `NULL` | `asset` |
| `property_notification:mark_read` | 房产业务通知标记已读 | `biz.property_notification` | `mark_read` | `api/40` | `POST` | `/api/v1/property/notifications/:notificationId/read` | `/property/notifications` | `property_notification:mark_read` | 8141 | `NULL` | `asset` |

`permission_path` 与 `perm_path` 都逐字等于表中 `path`。Action 的
`permission_level/level=3`。

`sys_permission.api_method/api_path/frontend_route` 只是管理 catalog metadata，不是
endpoint→permission 的运行时权威。`property_approval:create` 由 11 个 owning-domain
request endpoint 组合使用，故三列全部 NULL；exact endpoint→permission/action mapping
由计划新增的
`packages/shared/src/property-business/track-b-endpoint-permissions.ts` export
`PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST` 冻结，`000189` 必须逐项验证而不得发明
generic approval create endpoint。`party:identity_update` 覆盖 create/update/submit/withdraw
等多个 command，因此 method/path 为 NULL。Approval generic API 没有 generic frontend
surface；task API 只嵌入 homestay/housing task workbench，故 task frontend route 全为
NULL。

Endpoint manifest row schema 固定为：

```text
method: uppercase HTTP method
path: /api/v1 开头的 canonical path，参数 token 保留 :requestId/:taskId/:notificationId 等
actionId: signed product action_id
requiredPermissions: 去重、UTF-8 byte 升序的非空 permission code array
authorizationAlternatives: 去重并按 actorPredicate+TAB+permissions bytes 排序的 array；
  每项={requiredPermissions:非空去重升序 array,actorPredicate:current-assignee|queue-supervisor}
requiredModule: exact module code
surfaceId: signed surface id；无独立 surface 时 null
```

Manifest exact row count 固定为 `49`，shared 不得新增、删除、合并或拆分 route。权威
来源按类别冻结，不能用单一文档覆盖另一文档：

- 10 个 identity endpoints：signed `b0-product-access-freeze.md` §3.1 identity actions
  与 `b0-identity-control-freeze.md` canonical identity API 的 exact join。
- 9 个 shared property control endpoints：signed
  `b0-identity-control-freeze.md` §8.1 与 `b0-product-access-freeze.md` §3.1 control
  actions 的 exact join；product §3.1 原有 7 行之外必须补入且只能补入：
  - `property.mode-transition.list` / `GET
    /property/units/:unitId/mode-transitions` /
    requiredPermissions=`["asset:property-mode-transitions:page","property_approval:read"]` /
    module `asset` / scope=`tenant+park+unit` /
    surface `asset.property-mode-transitions`；
  - `property.occupancy.availability.check` / `POST
    /property/occupancies/availability` /
    requiredPermissions=`["asset:property-occupancies:page","property_occupancy:read"]` /
    module `asset` / scope=`tenant+park+unit/source candidate` /
    surface `asset.property-occupancies`。
- 21 个 approval/task/event/notification endpoints：signed
  `b0-product-access-freeze.md` §3.1 与 `b0-runtime-contract-freeze.md` §9.1 的 exact
  join，包括 approval/event incident list/detail、approval retry、event replay、
  task rebuild 和 notification mark-read。
- 9 个 owning-domain high-risk request endpoints：signed product §3.1 的九项
  approval actionId/effect mapping与各 owning-domain canonical request route 的 exact
  join；仍禁止 generic approval create route。

计数断言固定为 `10 + 9 + 21 + 9 = 49`。任一 authority side 多行、缺行或
method/path/actionId/module/permission/surface 冲突均 stop-ship，不择一实现。上述两个
新增 control action 是 49 行合同的一部分，不是 alias、可选行或第 50/51 行。
上述 requiredPermissions array 已按 UTF-8 byte order 排序且是完整 exact-set；
`surfaceId` 仅用于产品定位，绝不能替代 page permission、action permission 或 scope
校验。
Endpoint manifest v2 的唯一 grammar 是：

```text
b-endpoint-manifest-v2\n
row<TAB><method><TAB><canonical-route><TAB><canonical-json-sha256>\n
... method + TAB + route UTF-8 byte order ...
```

Canonical JSON 的 key order、array byte order、null/omitted 由 shared golden 固定；lowercase
SHA-256 是 `PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256`。Shared 实现测试必须：

1. 先断言 row count 精确为 49，再逐 row 重算 schema、排序、requiredPermissions 去重
   与 hash；
2. 验证 manifest 使用的 permission/action/module/surface exact-set 与四输入
   `B-contract SHA` 对应 freeze 内容一致；
3. 验证 `000189` 所有非 NULL API metadata 能命中 manifest，同一 permission 映射多个
   endpoint 时允许 metadata method/path 为 NULL；
4. 把 canonical manifest SHA 与 B-contract handoff 一起签署，任一输入变化同时失效；
   输入文档不得嵌入计算后的 shared manifest SHA 或 B-contract SHA 值。

7 个 page definition 的完整 VALUES 行如下；`api_method/api_path` 固定 `NULL`，
`permission_path=perm_path='asset/' || code`，`permission_level/level=2`：

| code | name | resource | action | type/perm_type | api_method | api_path | frontend_route | sort_no | parent | module |
|---|---|---|---|---|---|---|---|---:|---|---|
| `asset:identity-submissions:page` | 身份核验工作台 | `asset.identity_submission` | `page` | `page/20` | `NULL` | `NULL` | `/assets/identity-submissions` | 8201 | `asset` | `asset` |
| `asset:property-operations:page` | 共享房产控制面 | `asset.property_operation` | `page` | `page/20` | `NULL` | `NULL` | `/assets/property-operations` | 8202 | `asset` | `asset` |
| `asset:property-occupancies:page` | 房产占用工作台 | `asset.property_occupancy` | `page` | `page/20` | `NULL` | `NULL` | `/assets/property-occupancies` | 8203 | `asset` | `asset` |
| `asset:property-mode-transitions:page` | 房产模式变更审计 | `asset.property_mode_transition` | `page` | `page/20` | `NULL` | `NULL` | `/assets/property-mode-transitions` | 8204 | `asset` | `asset` |
| `property:notifications:page` | 房产业务通知 | `property.notification` | `page` | `page/20` | `NULL` | `NULL` | `/property/notifications` | 8210 | `asset` | `asset` |
| `property:event-delivery-incidents:page` | 事件投递事故处置 | `property.event_delivery_incident` | `page` | `page/20` | `NULL` | `NULL` | `/property/event-delivery-incidents` | 8211 | `asset` | `asset` |
| `property:approval-incidents:page` | 审批执行事故处置 | `property.approval_incident` | `page` | `page/20` | `NULL` | `NULL` | `/property/approval-incidents` | 8212 | `asset` | `asset` |

`asset:party` 已由 `000184` 定义，不重复创建第二个 code；`000189` 只验证其 active
definition 存在。已有 homestay/housing page/API permission 也只引用，不改名、不创建
alias。

所有新增 action definition 固定：

```text
permission_type='api'
perm_type=40
permission_level=3
level=3
visible=true
keep_alive=false
always_show=false
is_system=true
is_builtin=true
is_tenant_custom=false
is_enabled=true
status='enabled'
permission_path=code
perm_path=code
```

所有新增 page definition 固定：

```text
permission_type='page'
perm_type=20
permission_level=2
level=2
visible=false
keep_alive=false
always_show=false
is_system=true
is_builtin=true
is_tenant_custom=false
is_enabled=true
status='enabled'
```

如果 tenant 没有 active `asset` assignment 或 active `asset` parent，不能为该 tenant
生成这些 definition。缺失 definition 后所有相关路由必须 fail closed。

### 2.3 Durable permission bundle definition

新增全局 catalog；它只表达 signed exact membership，不表达 tenant assignment、role、
module、scope、actor separation 或 approval stage eligibility。

```text
sys_property_permission_bundle
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  bundle_code varchar(128) NOT NULL
  bundle_name varchar(100) NOT NULL
  definition_version integer NOT NULL DEFAULT 1
  definition_hash char(64) NOT NULL
  status varchar(16) NOT NULL DEFAULT 'enabled'
  create_time timestamptz NOT NULL DEFAULT clock_timestamp()
  update_time timestamptz NOT NULL DEFAULT clock_timestamp()
  is_deleted boolean NOT NULL DEFAULT false
  version integer NOT NULL DEFAULT 1
  remark varchar(500) NULL

  CONSTRAINT ck_sys_property_permission_bundle_code
    CHECK (bundle_code ~ '^property-bundle:[a-z][a-z0-9-]*$')
  CONSTRAINT ck_sys_property_permission_bundle_hash
    CHECK (definition_hash ~ '^[0-9a-f]{64}$')
  CONSTRAINT ck_sys_property_permission_bundle_status
    CHECK (status IN ('enabled','disabled'))
  CONSTRAINT ck_sys_property_permission_bundle_versions
    CHECK (definition_version > 0 AND version > 0)

  UNIQUE INDEX uq_sys_property_permission_bundle_active
    (bundle_code) WHERE is_deleted=false
```

```text
rel_property_permission_bundle_member
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  bundle_id uuid NOT NULL
  permission_code varchar(128) NOT NULL
  member_ordinal smallint NOT NULL
  create_time timestamptz NOT NULL DEFAULT clock_timestamp()
  is_deleted boolean NOT NULL DEFAULT false
  version integer NOT NULL DEFAULT 1
  remark varchar(500) NULL

  CONSTRAINT ck_rel_property_bundle_member_ordinal CHECK (member_ordinal > 0)
  CONSTRAINT ck_rel_property_bundle_member_version CHECK (version > 0)
  CONSTRAINT fk_rel_property_bundle_member_bundle
    FOREIGN KEY (bundle_id) REFERENCES sys_property_permission_bundle(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT

  UNIQUE INDEX uq_rel_property_bundle_member_active_code
    (bundle_id, permission_code) WHERE is_deleted=false
  UNIQUE INDEX uq_rel_property_bundle_member_active_ordinal
    (bundle_id, member_ordinal) WHERE is_deleted=false
  INDEX idx_rel_property_bundle_member_permission_active
    (permission_code, bundle_id) WHERE is_deleted=false
```

Bundle hash 的唯一 byte grammar：

```text
property-bundle-v1\n
<bundle_code><TAB><bundle_name>\n
<member_ordinal-4-digit-zero-padded><TAB><permission_code>\n
...（ordinal 升序）
```

UTF-8、无 BOM、单个 `0x09` TAB、LF-only，最后一行有 LF；不 trim、不 Unicode
normalize、不 locale sort。`definition_hash` 是上述完整 bytes 的 lowercase SHA-256。
例如 profile clerk 的 bytes 为：

```text
property-bundle-v1
property-bundle:property-party-profile-clerk	相对方资料录入员
0001	asset:party
0002	party:read
0003	party:create
0004	party:update
```

其可重算 SHA-256 固定为
`f31a3a2efeb4ef4fcac3b4496783f3b3ab6384175fa0ef19818c0a8d655e70a2`。

以下是全部 authoritative `(bundle_code, bundle_name,
member_ordinal:permission_code)` VALUES；ordinal 是合同组成部分，不得按字典序重排：

```text
property-bundle:property-party-profile-clerk | 相对方资料录入员
  0001:asset:party
  0002:party:read
  0003:party:create
  0004:party:update

property-bundle:property-identity-operator | 身份资料录入员
  0001:asset:party
  0002:asset:identity-submissions:page
  0003:party:read
  0004:party:identity_update
  0005:file:read
  0006:file:upload
  0007:file:delete

property-bundle:property-identity-verifier | 实名核验员
  0001:asset:party
  0002:asset:identity-submissions:page
  0003:party:read
  0004:party:identity_verify
  0005:file:read
  0006:file:download

property-bundle:property-homestay-task-operator | 民宿任务处理人
  0001:homestay:tasks:page
  0002:property:notifications:page
  0003:property_task:read
  0004:property_task:claim
  0005:property_task:process
  0006:property_task:release
  0007:property_notification:read
  0008:property_notification:mark_read

property-bundle:property-housing-operator | 住房出租运营人员
  0001:housing:tasks:page
  0002:property:notifications:page
  0003:property_approval:create
  0004:property_approval:read
  0005:property_approval:withdraw
  0006:property_task:read
  0007:property_task:claim
  0008:property_task:process
  0009:property_task:release
  0010:property_notification:read
  0011:property_notification:mark_read

property-bundle:property-asset-manager | 共享房产资产管理员
  0001:asset:property-operations:page
  0002:asset:property-occupancies:page
  0003:asset:property-mode-transitions:page
  0004:property:notifications:page
  0005:property_operation:read
  0006:property_operation:update
  0007:property_operation:transition_mode
  0008:property_occupancy:read
  0009:property_occupancy:force_release
  0010:property_approval:create
  0011:property_approval:read
  0012:property_approval:withdraw
  0013:property_task:read
  0014:property_notification:read
  0015:property_notification:mark_read

property-bundle:property-homestay-finance-operator | 民宿财务操作员
  0001:homestay:finance:page
  0002:homestay:bookings:page
  0003:homestay:finance:read
  0004:homestay:finance:register
  0005:homestay:finance:waive
  0006:homestay:booking:read
  0007:property:notifications:page
  0008:property_approval:create
  0009:property_approval:read
  0010:property_approval:withdraw
  0011:property_notification:read
  0012:property_notification:mark_read

property-bundle:property-housing-finance-operator | 住房出租财务操作员
  0001:housing:finance:page
  0002:housing:finance:read
  0003:housing:finance:register
  0004:housing:finance:waive
  0005:property:notifications:page
  0006:property_approval:create
  0007:property_approval:read
  0008:property_approval:withdraw
  0009:property_notification:read
  0010:property_notification:mark_read

property-bundle:property-homestay-approver | 民宿审批人
  0001:homestay:tasks:page
  0002:property:notifications:page
  0003:property_approval:read
  0004:property_approval:decide
  0005:property_task:read
  0006:property_task:claim
  0007:property_task:process
  0008:property_task:release
  0009:property_notification:read
  0010:property_notification:mark_read

property-bundle:property-housing-approver | 住房出租审批人
  0001:housing:tasks:page
  0002:property:notifications:page
  0003:property_approval:read
  0004:property_approval:decide
  0005:property_task:read
  0006:property_task:claim
  0007:property_task:process
  0008:property_task:release
  0009:property_notification:read
  0010:property_notification:mark_read

property-bundle:property-homestay-task-supervisor | 民宿任务督办人
  0001:homestay:tasks:page
  0002:property:notifications:page
  0003:property_task:read
  0004:property_task:supervise
  0005:property_notification:read
  0006:property_notification:mark_read

property-bundle:property-housing-task-supervisor | 住房出租任务督办人
  0001:housing:tasks:page
  0002:property:notifications:page
  0003:property_task:read
  0004:property_task:supervise
  0005:property_notification:read
  0006:property_notification:mark_read

property-bundle:property-auditor | 房产业务审计员
  0001:asset:identity-submissions:page
  0002:asset:property-occupancies:page
  0003:asset:property-mode-transitions:page
  0004:party:read
  0005:party:sensitive_read
  0006:audit:read
  0007:property_approval:read
  0008:property_task:read

property-bundle:property-event-delivery-operator | 事件投递事故处置员
  0001:property:event-delivery-incidents:page
  0002:property_event:read_incident
  0003:property_event:replay
  0004:audit:read

property-bundle:property-approval-incident-operator | 审批执行事故处置员
  0001:property:approval-incidents:page
  0002:property_approval:read_incident
  0003:property_approval:read
  0004:property_approval:retry
  0005:audit:read

property-bundle:property-task-admin | 房产业务任务投影管理员
  0001:property_task:read
  0002:property_task:rebuild
  0003:audit:read
```

Catalog member integrity 是显式 verification，不使用跨 tenant FK：每个
`permission_code` 必须属于 signed freeze exact-set，并且对每个进入 Track B 的 tenant
能解析为唯一 active `sys_permission(tenant_id,code)`。缺失、重复或指向软删除
permission 均 fail closed。不得向 `rel_role_perm`、`rel_user_role`、`rel_tenant_module`
写任何行。

### 2.4 Target scope source（`000189/000190` 共用）

`tenant_id/park_id` 是运行时业务范围标识，不是 `sys_tenant.id/asset_park.id` 实体
UUID。两文件只能使用同一
`active_asset_assignment_scope → business_target_scope → preflight →
validated_business_target_scope` pipeline；禁止各自扫描不同 tenant/park 集合。
Assignment scope 不得先 inner join tenant/park，以便 orphan/invalid/ambiguous
business key 可被 preflight 发现：

```sql
WITH active_asset_assignment_scope AS (
  SELECT
    assignment.id AS assignment_audit_id,
    btrim(assignment.tenant_id) AS tenant_key,
    btrim(assignment.park_id) AS park_key
  FROM rel_tenant_module assignment
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.module_code = 'asset'
   AND module.status = 1
   AND module.is_deleted = false
  WHERE assignment.enabled = true
    AND assignment.status = 'enabled'
    AND assignment.is_deleted = false
    AND (assignment.start_time IS NULL OR assignment.start_time <= clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time > clock_timestamp())
),
business_target_scope AS (
  SELECT
    tenant_key,
    park_key,
    array_agg(assignment_audit_id ORDER BY assignment_audit_id) AS assignment_audit_ids
  FROM active_asset_assignment_scope
  GROUP BY tenant_key,park_key
  ORDER BY
    convert_to(tenant_key,'UTF8'),
    convert_to(park_key,'UTF8')
)
```

`business_target_scope` 必须保留 trim 后为 NULL/empty/global/all-zero 的 invalid
key 供 preflight 计数，不能用 WHERE 提前丢弃。Global exact-set 为
`''|'0'|'all'|'global'|'*'|'00000000-0000-0000-0000-000000000000'`（ASCII
case-insensitive，比较前仅 `btrim`）；当前 v2 不支持 global sentinel。只有 §4.4
preflight 证明每个 business pair 恰好映射 1 个 active tenant 与 1 个同 scope active
asset park 后，才允许生成 `validated_business_target_scope`。不得把 inner join 后
的行数当作 preflight。

`000189` permission upsert 必须继续派生唯一 tenant-wide scope：

```sql
, asset_parent AS (
  SELECT
    tenant_id,
    (array_agg(id ORDER BY id))[1] AS parent_id,
    count(*) AS parent_count
  FROM sys_permission
  WHERE code='asset'
    AND is_enabled=true
    AND status='enabled'
    AND is_deleted=false
  GROUP BY tenant_id
),
permission_scope AS (
  SELECT tenant_key,park_key,parent_id
  FROM (
    SELECT
      scope.tenant_key,
      scope.park_key,
      parent.parent_id,
      row_number() OVER (
        PARTITION BY scope.tenant_key
        ORDER BY convert_to(scope.park_key,'UTF8')
      ) AS park_ordinal
    FROM validated_business_target_scope scope
    JOIN asset_parent parent
      ON parent.tenant_id=scope.tenant_key
     AND parent.parent_count=1
  ) ranked
  WHERE park_ordinal=1
)
```

任何 upsert 前必须执行 preflight：对 `validated_business_target_scope` 的每个
distinct tenant business key，
`asset_parent.parent_count` 必须精确为 `1`。缺失、重复、disabled、非 enabled 或软删除
parent 都立即 stop-ship 并整笔回滚；不得靠上面 inner join 静默排除 tenant。只有
preflight PASS 后才允许 materialize `permission_scope`，且 25 行必须在单条
`INSERT ... SELECT permission_scope CROSS JOIN signed_25_values` 中全量 upsert；实际影响/
解析数必须等于 `resolved_permission_scope_count * 25`，不允许部分插入。

每个 tenant 只选择 UTF-8 byte order 最小的 qualifying business `park_id`，且只生成
一组 `18 action + 7 page = 25` 行。不得对同一 tenant 的每个 park 重复插入 permission
definition。Bundle member verification 仍逐 `validated_business_target_scope` 重验
当前 tenant+park module/scope predicate，但 permission catalog 通过
`tenant_key+code` 解析到上述唯一 tenant-wide definition。

`000189.sys_permission.tenant_id/park_id` 与 `000190` 四表的
`tenant_id/park_id` 必须直接写入 trim 后 business `tenant_key/park_key`；禁止 UUID
cast、lowercase UUID normalization、36-char 约束、tenant/park entity UUID 或
tenant_code/park_code 替代。实体 UUID 只进入受控 mapping audit/evidence，不能成为
runtime scope、唯一键、foreign key、catalog name/value 或排序 key。

`000190` 不为 scope 增加指向实体 UUID 的 FK；业务 key 的 active/soft-delete
唯一性由 preflight 与每次写入时的重解析共同保证。防线是：

1. definition row 只能从上述 CTE 生成；
2. B-4 runner 每次 create/update checkpoint/control/anomaly/evidence 都必须重新解析
   同一 active business scope；
3. 四张表内部所有引用使用 `(tenant_id,park_id,id)` 复合 FK；
4. catalog Gate 对每个 varchar scope 以 exact trimmed business key 重新执行 active
   tenant/park predicate，不做 UUID cast。

若 `validated_business_target_scope` 为空，`000189/000190` 仍创建 schema，但插入零
permission、bundle verification 和 control scope rows；migration 成功并输出
`qualifying_scope_count=0` evidence。全局 dependency 与 global bundle catalog 仍按
signed exact-set创建。Bundle verification 只针对同一
`validated_business_target_scope`，不得扩大到 disabled/expired tenant，也不得因某个
tenant 缺 permission 而给它补 role grant。

### 2.5 `000189` ownership 与重跑

- 唯一 owner：`schema-migration-owner`。
- 同 key 同 signed hash：no-op。
- 同 bundle code 不同 hash、同 module pair 不同语义、同 permission code 不同
  resource/action/type/route：立即失败；不得由 upsert 静默改写。
- Migration 只允许创建表/约束/索引和 signed definition rows。禁止 role grant、
  tenant assignment、生产岗位初始化、测试 fixture。
- 建议 `lock_timeout='5s'`、`statement_timeout='60s'`；预期最高锁级别为新表 DDL 的
  `ACCESS EXCLUSIVE` 与 definition upsert 的 row lock。超时即整笔回滚。
- 文件使用单一 transaction；不得使用 `CREATE INDEX CONCURRENTLY`。

## 3. `000190_property_b_migration_compatibility_control.sql`

### 3.1 Runtime checkpoint

```text
biz_property_runtime_checkpoint
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  checkpoint_kind varchar(64) NOT NULL
  checkpoint_key varchar(256) NOT NULL
  checkpoint_version integer NOT NULL DEFAULT 1
  cursor_value varchar(512) NULL
  anomaly_count bigint NOT NULL DEFAULT 0
  status varchar(16) NOT NULL DEFAULT 'disabled'
  evidence_hash char(64) NULL
  last_run_id uuid NULL
  updated_by uuid NULL
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
  version integer NOT NULL DEFAULT 1

  CONSTRAINT ck_biz_property_runtime_checkpoint_kind
    CHECK (checkpoint_kind IN
      ('backfill','change_capture','mutation_replay','shadow_compare',
       'reconcile','constraint_validate'))
  CONSTRAINT ck_biz_property_runtime_checkpoint_status
    CHECK (status IN ('disabled','running','paused','completed','failed'))
  CONSTRAINT ck_biz_property_runtime_checkpoint_counts
    CHECK (checkpoint_version > 0 AND anomaly_count >= 0 AND version > 0)
  CONSTRAINT ck_biz_property_runtime_checkpoint_evidence
    CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$')

  CONSTRAINT uq_biz_property_runtime_checkpoint_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_biz_property_runtime_checkpoint_key
    UNIQUE (tenant_id,park_id,checkpoint_kind,checkpoint_key)
  INDEX idx_biz_property_runtime_checkpoint_run
    (tenant_id,park_id,status,checkpoint_kind,updated_at,id)
```

没有预置 checkpoint 行。B-4 runner 首次 CAS create；创建时 status 必须 `disabled`，
启用运行是 migration 之外的显式操作。

### 3.2 Compatibility/shadow/enforce control

```text
sys_property_runtime_control
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  control_key varchar(128) NOT NULL
  control_kind varchar(32) NOT NULL
  target varchar(64) NOT NULL
  adapter_version integer NULL
  contract_hash char(64) NOT NULL
  enabled boolean NOT NULL DEFAULT false
  control_mode varchar(16) NOT NULL DEFAULT 'disabled'
  enabled_by uuid NULL
  enabled_at timestamptz NULL
  approval_reference varchar(256) NULL
  disabled_reason varchar(500) NOT NULL DEFAULT 'expand-only'
  create_time timestamptz NOT NULL DEFAULT clock_timestamp()
  update_time timestamptz NOT NULL DEFAULT clock_timestamp()
  version integer NOT NULL DEFAULT 1

  CONSTRAINT ck_sys_property_runtime_control_kind
    CHECK (control_kind IN
      ('compatibility_read','compatibility_write','change_capture',
       'mutation_replay','shadow_compare','enforce'))
  CONSTRAINT ck_sys_property_runtime_control_target
    CHECK (target IN
      ('identity','approval','event_notification','task',
       'property_foundation','homestay','housing'))
  CONSTRAINT ck_sys_property_runtime_control_mode
    CHECK (control_mode IN ('disabled','observe','shadow','enforce'))
  CONSTRAINT ck_sys_property_runtime_control_hash
    CHECK (contract_hash ~ '^[0-9a-f]{64}$')
  CONSTRAINT ck_sys_property_runtime_control_version
    CHECK (version > 0 AND (adapter_version IS NULL OR adapter_version > 0))
  CONSTRAINT ck_sys_property_runtime_control_disabled
    CHECK (
      (enabled=false AND control_mode='disabled'
       AND enabled_by IS NULL AND enabled_at IS NULL)
      OR
      (enabled=true AND control_mode<>'disabled'
       AND enabled_by IS NOT NULL AND enabled_at IS NOT NULL
       AND approval_reference IS NOT NULL)
    )

  CONSTRAINT uq_sys_property_runtime_control_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_sys_property_runtime_control_key
    UNIQUE (tenant_id,park_id,control_key)
  INDEX idx_sys_property_runtime_control_effective
    (tenant_id,park_id,target,control_kind,enabled,control_mode)
```

`000190` 只为 §2.4 `validated_business_target_scope` 插入以下 definition rows。每一行都固定
`enabled=false`、`control_mode='disabled'`、`enabled_by/enabled_at/approval_reference=NULL`、
`disabled_reason='expand-only'`：

```text
identity.legacy-read-v1           compatibility_read  identity  adapter_version=1
identity.legacy-write-v1          compatibility_write identity  adapter_version=1
identity.change-capture           change_capture      identity  adapter_version=NULL
identity.mutation-replay          mutation_replay     identity  adapter_version=NULL
identity.shadow-compare           shadow_compare      identity  adapter_version=NULL
identity.enforce                  enforce             identity  adapter_version=NULL
approval.shadow-compare           shadow_compare      approval  adapter_version=NULL
approval.enforce                  enforce             approval  adapter_version=NULL
event-notification.shadow-compare shadow_compare      event_notification adapter_version=NULL
event-notification.enforce        enforce             event_notification adapter_version=NULL
task.shadow-compare               shadow_compare      task      adapter_version=NULL
task.enforce                      enforce             task      adapter_version=NULL
```

`contract_hash` 必须是本文顶部四输入固定 byte grammar 计算出的唯一
`B-contract SHA`，不得用三输入旧 manifest、migration checksum、空 hash 或运行时动态值。
Property foundation/homestay/housing controls 在各自
adapter contract 和 effect schema SHA 可用后由后续独立 forward migration/受审计
control provisioning 增加；`000190` 不预造未签署行。

### 3.3 Durable anomaly

```text
biz_property_migration_anomaly
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  run_id uuid NOT NULL
  checkpoint_id uuid NOT NULL
  anomaly_kind varchar(64) NOT NULL
  source_type varchar(64) NOT NULL
  source_key varchar(256) NOT NULL
  source_version varchar(128) NULL
  expected_hash char(64) NULL
  actual_hash char(64) NULL
  details_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
  status varchar(16) NOT NULL DEFAULT 'open'
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp()
  resolved_at timestamptz NULL
  resolved_by uuid NULL
  resolution_reference varchar(256) NULL
  last_transition_by uuid NULL
  last_transition_reason varchar(1000) NULL
  version integer NOT NULL DEFAULT 1

  CONSTRAINT ck_biz_property_migration_anomaly_kind
    CHECK (anomaly_kind IN
      ('duplicate_active','cross_scope','pointer_mismatch','hash_mismatch',
       'version_mismatch','file_missing','actor_missing','audit_mismatch',
       'mutation_replay_mismatch','projection_mismatch','constraint_violation'))
  CONSTRAINT ck_biz_property_migration_anomaly_status
    CHECK (status IN ('open','acknowledged','resolved','ignored'))
  CONSTRAINT ck_biz_property_migration_anomaly_details
    CHECK (jsonb_typeof(details_redacted)='object')
  CONSTRAINT ck_biz_property_migration_anomaly_hashes
    CHECK ((expected_hash IS NULL OR expected_hash ~ '^[0-9a-f]{64}$')
       AND (actual_hash IS NULL OR actual_hash ~ '^[0-9a-f]{64}$'))
  CONSTRAINT ck_biz_property_migration_anomaly_resolution
    CHECK (
      (status IN ('open','acknowledged') AND resolved_at IS NULL
       AND resolved_by IS NULL AND resolution_reference IS NULL)
      OR
      (status IN ('resolved','ignored') AND resolved_at IS NOT NULL
       AND resolved_by IS NOT NULL AND resolution_reference IS NOT NULL)
    )
  CONSTRAINT ck_biz_property_migration_anomaly_transition_actor
    CHECK (
      (version=1 AND status='open'
       AND last_transition_by IS NULL AND last_transition_reason IS NULL)
      OR
      (version>1 AND last_transition_by IS NOT NULL
       AND length(trim(last_transition_reason))>0)
    )
  CONSTRAINT ck_biz_property_migration_anomaly_version CHECK (version > 0)
  CONSTRAINT fk_biz_property_migration_anomaly_checkpoint
    FOREIGN KEY (tenant_id,park_id,checkpoint_id)
    REFERENCES biz_property_runtime_checkpoint(tenant_id,park_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT

  CONSTRAINT uq_biz_property_migration_anomaly_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_biz_property_migration_anomaly_run_source
    UNIQUE (tenant_id,park_id,run_id,checkpoint_id,anomaly_kind,source_type,source_key)
  INDEX idx_biz_property_migration_anomaly_open
    (tenant_id,park_id,anomaly_kind,detected_at,id)
    WHERE status IN ('open','acknowledged')
  INDEX idx_biz_property_migration_anomaly_run
    (tenant_id,park_id,run_id,checkpoint_id,id)
```

`ignored` 不是 anomaly=0；任何 open/acknowledged/ignored 行都阻断 enforce。只有
resolved 且重新运行得到零 anomaly 才可作为 Gate 输入。

Anomaly 状态审计表：

```text
biz_property_migration_anomaly_audit
  id uuid NOT NULL DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  anomaly_id uuid NOT NULL
  from_status varchar(16) NOT NULL
  to_status varchar(16) NOT NULL
  actor_id uuid NOT NULL
  reason varchar(1000) NOT NULL
  expected_version integer NOT NULL
  resulting_version integer NOT NULL
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()

  CONSTRAINT pk_biz_property_migration_anomaly_audit PRIMARY KEY (id)
  CONSTRAINT ck_biz_property_migration_anomaly_audit_from
    CHECK (from_status IN ('open','acknowledged','resolved','ignored'))
  CONSTRAINT ck_biz_property_migration_anomaly_audit_to
    CHECK (to_status IN ('acknowledged','resolved','ignored'))
  CONSTRAINT ck_biz_property_migration_anomaly_audit_reason
    CHECK (length(trim(reason)) > 0)
  CONSTRAINT ck_biz_property_migration_anomaly_audit_version
    CHECK (expected_version > 0 AND resulting_version=expected_version+1)
  CONSTRAINT fk_biz_property_migration_anomaly_audit_anomaly
    FOREIGN KEY (tenant_id,park_id,anomaly_id)
    REFERENCES biz_property_migration_anomaly(tenant_id,park_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
  CONSTRAINT uq_biz_property_migration_anomaly_audit_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_biz_property_migration_anomaly_audit_version
    UNIQUE (tenant_id,park_id,anomaly_id,resulting_version)
  INDEX idx_biz_property_migration_anomaly_audit_history
    (tenant_id,park_id,anomaly_id,occurred_at,id)
```

唯一 mutation function 固定为：

```text
public.fn_transition_property_migration_anomaly(
  p_tenant_id varchar(64),
  p_park_id varchar(64),
  p_anomaly_id uuid,
  p_expected_version integer,
  p_to_status varchar(16),
  p_actor_id uuid,
  p_reason varchar(1000),
  p_resolution_reference varchar(256)
) RETURNS public.biz_property_migration_anomaly
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
```

Function owner 固定为执行 `000190` 的唯一 `schema-migration-owner` 数据库角色，即
preflight `SELECT current_user` 的 exact value。Preflight 必须显式验证 migration runner
已由数据库管理员授权创建/拥有该 function、不是 API/Web/runtime login role，并把
role name 与 privilege check 写入 migration audit；不得假设 `public` schema 对
`PUBLIC` 开放 CREATE，不满足即 stop-ship，不回退为 app owner。函数体引用的所有应用
table、function、sequence 与 composite return type 必须完全使用 `public.` schema
qualification；仅 PostgreSQL built-in 位于 `pg_catalog`。创建后执行：

```text
ALTER FUNCTION public.fn_transition_property_migration_anomaly(
  varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
) OWNER TO <verified schema-migration-owner>;
REVOKE ALL ON FUNCTION public.fn_transition_property_migration_anomaly(
  varchar,varchar,uuid,integer,varchar,uuid,varchar,varchar
) FROM PUBLIC;
```

`000190` 不授予 EXECUTE。受控 runtime role 的 `GRANT EXECUTE` 只能在 B-4 runner role
签署后由独立、可审计 provisioning 执行。

Gate 必须读取 `pg_get_functiondef` 并扫描：`prosecdef=true`、
`proconfig` 精确含 `search_path=pg_catalog`；除 `pg_catalog` built-in 外不得出现任何
未以 `public.` 限定的 relation/function/type；发现 `search_path` 含 `public`、裸
`biz_property_*` 或裸 helper 名即失败。

同一 Gate 必须对 exact regprocedure 执行 ACL 断言：

```sql
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc proc
  CROSS JOIN LATERAL aclexplode(
    coalesce(proc.proacl, acldefault('f',proc.proowner))
  ) acl
  WHERE proc.oid =
    'public.fn_transition_property_migration_anomaly(character varying,character varying,uuid,integer,character varying,uuid,character varying,character varying)'::regprocedure
    AND acl.grantee=0
    AND acl.privilege_type='EXECUTE'
) AS public_execute_revoked;

SELECT coalesce(role.rolname,'PUBLIC') AS grantee, acl.privilege_type
FROM pg_proc proc
CROSS JOIN LATERAL aclexplode(
  coalesce(proc.proacl, acldefault('f',proc.proowner))
) acl
LEFT JOIN pg_roles role ON role.oid=acl.grantee
WHERE proc.oid =
  'public.fn_transition_property_migration_anomaly(character varying,character varying,uuid,integer,character varying,uuid,character varying,character varying)'::regprocedure
  AND acl.privilege_type='EXECUTE'
ORDER BY grantee COLLATE "C";
```

第一条必须返回 true。第二条在 `000190` Gate 只允许 verified
`schema-migration-owner`；`PUBLIC` 以及任何未签署 API/Web/runtime role 均不得出现。
后续 B-4 provisioning 若新增 runtime grantee，必须逐项与当次 signed allowlist
exact-set 比较，不能按 role prefix 放行。ACL/owner 因环境相关而明确不进入 schema
catalog hash；完整 query result、数据库 identity、allowlist SHA 与采集时间保存为独立
`b0-function-acl-evidence.json`，对 raw bytes 计算 SHA-256并随 Gate handoff 交付。

函数在单 transaction 中：

1. 以 scope+id `FOR UPDATE` 取行；不存在返回 not-found，不泄露其他 scope。
2. `version<>p_expected_version` 抛 `anomaly-version-conflict`。
3. 只允许 `open->acknowledged|resolved|ignored` 和
   `acknowledged->resolved|ignored`；`resolved/ignored` terminal，其他转移抛
   `anomaly-transition-invalid`。
4. `p_actor_id` 非空、trim 后 reason 非空；terminal 转移另要求 trim 后
   `p_resolution_reference` 非空，acknowledged 转移要求它为 NULL。
5. 对 `resolved/ignored` 写 `resolved_at=clock_timestamp()`、
   `resolved_by=p_actor_id`、`resolution_reference=p_resolution_reference`；
   acknowledged 保持三个 resolution 列为 NULL。
6. 所有转移写 `last_transition_by=p_actor_id`、
   `last_transition_reason=p_reason`，更新 status、`version=version+1` 并插入一行
   audit，返回更新后 row。

表级物理保护固定为：

- `trg_biz_property_migration_anomaly_transition_guard BEFORE UPDATE`：只接受上述合法
  status/CAS 列变更；禁止修改 scope/run/checkpoint/kind/source/hash/details/detected_at，
  且要求 version 精确 +1。
- `trg_biz_property_migration_anomaly_audit_required AFTER UPDATE DEFERRABLE INITIALLY
  DEFERRED`：transaction 结束前必须存在唯一 audit，并逐字段验证
  `tenant_id=NEW.tenant_id`、`park_id=NEW.park_id`、`anomaly_id=NEW.id`、
  `from_status=OLD.status`、`to_status=NEW.status`、
  `expected_version=OLD.version`、`resulting_version=NEW.version`、
  `actor_id=NEW.last_transition_by`、`reason=NEW.last_transition_reason`。任一不等或
  缺失整笔回滚；仅检查“有一行”不合格。
- `trg_biz_property_migration_anomaly_no_delete BEFORE DELETE`：无条件抛错。
- `trg_biz_property_migration_anomaly_audit_immutable BEFORE UPDATE OR DELETE`：无条件
  抛错。
- Migration 执行 `REVOKE UPDATE, DELETE ON biz_property_migration_anomaly FROM PUBLIC`
  和 `REVOKE UPDATE, DELETE ON biz_property_migration_anomaly_audit FROM PUBLIC`；
  后续 runtime grant 只能授予 transition function `EXECUTE`，不得授予表 UPDATE/DELETE。

### 3.4 Immutable evidence

```text
biz_property_migration_evidence
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4()
  tenant_id varchar(64) NOT NULL
  park_id varchar(64) NOT NULL
  run_id uuid NOT NULL
  checkpoint_id uuid NOT NULL
  evidence_kind varchar(64) NOT NULL
  artifact_uri varchar(512) NULL
  artifact_hash char(64) NOT NULL
  row_count bigint NOT NULL
  anomaly_count bigint NOT NULL
  min_source_key varchar(256) NULL
  max_source_key varchar(256) NULL
  contract_hash char(64) NOT NULL
  migration_set_hash char(64) NOT NULL
  generated_by varchar(128) NOT NULL
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp()

  CONSTRAINT ck_biz_property_migration_evidence_kind
    CHECK (evidence_kind IN
      ('inventory','backfill','change_capture','mutation_replay',
       'shadow_compare','reconcile','constraint_validation','rollback_drill'))
  CONSTRAINT ck_biz_property_migration_evidence_hashes
    CHECK (artifact_hash ~ '^[0-9a-f]{64}$'
       AND contract_hash ~ '^[0-9a-f]{64}$'
       AND migration_set_hash ~ '^[0-9a-f]{64}$')
  CONSTRAINT ck_biz_property_migration_evidence_counts
    CHECK (row_count >= 0 AND anomaly_count >= 0)
  CONSTRAINT fk_biz_property_migration_evidence_checkpoint
    FOREIGN KEY (tenant_id,park_id,checkpoint_id)
    REFERENCES biz_property_runtime_checkpoint(tenant_id,park_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT

  CONSTRAINT uq_biz_property_migration_evidence_scope_id
    UNIQUE (tenant_id,park_id,id)
  CONSTRAINT uq_biz_property_migration_evidence_run_kind
    UNIQUE (tenant_id,park_id,run_id,checkpoint_id,evidence_kind,artifact_hash)
  INDEX idx_biz_property_migration_evidence_run
    (tenant_id,park_id,run_id,checkpoint_id,generated_at,id)
```

Evidence 表 append-only。稳定 trigger
`trg_biz_property_migration_evidence_immutable` 在 `BEFORE UPDATE OR DELETE` 无条件抛错。
Anomaly 只允许受审计状态转移，不能删除；control/checkpoint 更新使用 version CAS。

### 3.5 `000190` ownership、默认关闭与重跑

- 唯一 owner：`schema-migration-owner`。
- Migration 只创建 schema 和 disabled definition rows；不创建 checkpoint/anomaly/evidence
  运行数据，不运行 runner，不开启任何 control。
- 同 `control_key` 同 contract hash 且仍 disabled：no-op。不同 hash、已经 enabled、
  或存在非 disabled mode：立即失败；migration 不得覆盖生产控制状态。
- 所有 table/constraint/index/trigger 使用上述稳定名称；对象已存在但 definition 不同
  时失败，不能用宽泛 `IF NOT EXISTS` 隐藏 drift。
- 建议 `lock_timeout='5s'`、`statement_timeout='60s'`；单 transaction，失败整笔回滚，
  不继续 B-4 runner、fixture 或 enforce。
- `000190` 重跑不得重置 checkpoint、清空 anomaly、删除 evidence、降低 adapter version
  或把 control 改回 disabled。任何这类恢复必须是单独、已批准、可审计操作。

## 4. Catalog verification 与交付证据

### 4.1 落盘前 stop-ship

唯一 owner 必须在创建 `000189/000190` 前重新执行：

```sql
SELECT filename, checksum, status
FROM public.sys_schema_migration_history
WHERE status <> 'succeeded' OR filename >= '000185'
ORDER BY filename;

SELECT filename, checksum, status
FROM public.schema_migrations
WHERE status <> 'succeeded' OR filename >= '000185'
ORDER BY filename;
```

并扫描 `database/migrations/000185*` 至 `000192*`。任一占用、双 history 差异、
running/failed 或并行候选存在时，`000185`–`000192` 整段从新最大安全编号顺延；
禁止只移动 `000189/000190` 或编辑已成功 migration。

### 4.2 `000189` exact verification

Gate 至少验证：

1. dependency active exact-set 等于
   `{homestay->asset:hard, housing_rental->asset:hard}`，无第三行。
2. 新增 action/page code exact-set 与 §2.2 相等，`asset:party` 唯一且未被重复。
3. 16 个 bundle code exact-set 相等；每个 definition hash 由有序 member rows 重算一致。
4. Bundle member union 中每个 code 能在 shared permission catalog 与每个目标 tenant 的
   active `sys_permission` 唯一解析。
5. `rel_role_perm`、`rel_user_role`、`rel_tenant_module` 行数和 checksum 在 migration
   前后不变。
6. 无 legacy/wildcard/prefix 推导 grant。

### 4.3 `000190` exact verification

Gate 至少验证：

1. 12 个 control key exact-set 相等，全部 `enabled=false/mode=disabled`。
2. 无 migration 创建的 checkpoint、anomaly、evidence 行。
3. 所有 FK、CHECK、UNIQUE、partial index、immutable trigger 的名称和 definition 与本文
   相等。
4. 同文件重跑 no-op；人为制造同 key 不同 hash 或 enabled control 时重跑必须失败。
5. Cross-scope checkpoint FK 插入失败；duplicate anomaly source、duplicate evidence
   artifact 失败；evidence UPDATE/DELETE 失败。
6. Enforce 仍关闭，旧数据与业务表 row count/checksum 不变。

### 4.4 `migration_set_hash` / `B-schema-expand SHA`

Schema catalog dump 使用 PostgreSQL 16 `pg_catalog` 生成
`b0-schema-catalog-v2` RFC 8785 canonical JSON Lines。
每个 `000185`–`000190` 文件必须为自己创建或 ALTER 的每个结构对象写唯一 marker：
`-- B0_CATALOG_OBJECT <kind><TAB><schema.qualified.name>`。六文件 marker 合集装载到临时表：

```sql
CREATE TEMP TABLE b0_catalog_target (
  kind text NOT NULL CHECK (kind IN
    ('table','column','constraint','index','function','trigger','definition-row')),
  name text NOT NULL,
  PRIMARY KEY (kind,name)
) ON COMMIT DROP;
```

Marker 只用于 table/column/constraint/index/function/trigger。动态 scope 的
definition-row 不写静态 marker，也不把实体 UUID 派生的 name 插入 target temp table；
它们由 signed-row query 直接导出，并单独断言
“2 dependency + 每 permission_scope 25 permission + 16 bundle + 125 frozen bundle
members + 每 validated_business_target_scope 12 control”的 exact count。Marker 或 definition-row
缺失、多余、重复、无法解析稳定 business scope 都 drift fail。V2 canonical input
明确排除 catalog OID、owner/role identity、ACL、container/volume identity、
temporary runtime role、generated timestamp、统计信息、物理 relfilenode，以及
permission/runtime-control mapping 的 tenant/park entity UUID。这些值不得进入 name、
definition、排序 key、fixture 或 manifest。顶层 JSON 每 kind 都固定只有
`definition,kind,name` 三个 key；`definition` 的 exact keys/values 如下：

| kind | `definition` exact keys |
|---|---|
| `table` | `persistence,partitionKey,rlsEnabled` |
| `column` | `dataType,default,generated,identity,notNull,ordinal` |
| `constraint` | `deferrable,definition,initiallyDeferred,type` |
| `index` | `definition,primary,unique,valid` |
| `function` | `definition,language,securityDefiner,volatility` |
| `trigger` | `definition,enabled` |
| `definition-row` | `rowType,values` |

空文本使用 `""`，SQL NULL 使用 JSON `null`，boolean/number 保持 JSON 原生类型。
`dataType=format_type(atttypid,atttypmod)`；default 使用
`pg_get_expr(adbin,adrelid)`；constraint/index/function/trigger definition 分别使用
`pg_get_constraintdef(oid,false)`、`pg_get_indexdef(oid)`、
`pg_get_functiondef(oid)`、`pg_get_triggerdef(oid,false)`。Canonical extraction view
固定输出 `(kind text,name text,definition jsonb)`：

```sql
CREATE TEMP VIEW b0_schema_catalog_export(kind,name,definition) AS
SELECT 'table', n.nspname||'.'||c.relname,
       jsonb_build_object(
         'persistence',c.relpersistence::text,
         'partitionKey',coalesce(pg_get_partkeydef(c.oid),''),
         'rlsEnabled',c.relrowsecurity)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t
  ON t.kind='table' AND t.name=n.nspname||'.'||c.relname
UNION ALL
SELECT 'column', n.nspname||'.'||c.relname||'.'||a.attname,
       jsonb_build_object(
         'dataType',format_type(a.atttypid,a.atttypmod),
         'default',coalesce(pg_get_expr(d.adbin,d.adrelid),''),
         'generated',a.attgenerated::text,
         'identity',a.attidentity::text,
         'notNull',a.attnotnull,
         'ordinal',a.attnum)
FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
JOIN b0_catalog_target t
  ON t.kind='column'
 AND t.name=n.nspname||'.'||c.relname||'.'||a.attname
WHERE a.attnum>0 AND NOT a.attisdropped
UNION ALL
SELECT 'constraint', n.nspname||'.'||c.relname||'.'||x.conname,
       jsonb_build_object(
         'deferrable',x.condeferrable,
         'definition',pg_get_constraintdef(x.oid,false),
         'initiallyDeferred',x.condeferred,
         'type',x.contype::text)
FROM pg_constraint x
JOIN pg_class c ON c.oid=x.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t
  ON t.kind='constraint'
 AND t.name=n.nspname||'.'||c.relname||'.'||x.conname
UNION ALL
SELECT 'index', ni.nspname||'.'||i.relname,
       jsonb_build_object(
         'definition',pg_get_indexdef(i.oid),
         'primary',x.indisprimary,
         'unique',x.indisunique,
         'valid',x.indisvalid)
FROM pg_index x
JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace ni ON ni.oid=i.relnamespace
JOIN b0_catalog_target t
  ON t.kind='index' AND t.name=ni.nspname||'.'||i.relname
UNION ALL
SELECT 'function',
       n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
       jsonb_build_object(
         'definition',pg_get_functiondef(p.oid),
         'language',l.lanname,
         'securityDefiner',p.prosecdef,
         'volatility',p.provolatile::text)
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
JOIN b0_catalog_target t
  ON t.kind='function'
 AND t.name=n.nspname||'.'||p.proname||'('||
            pg_get_function_identity_arguments(p.oid)||')'
UNION ALL
SELECT 'trigger', n.nspname||'.'||c.relname||'.'||g.tgname,
       jsonb_build_object(
         'definition',pg_get_triggerdef(g.oid,false),
         'enabled',g.tgenabled::text)
FROM pg_trigger g
JOIN pg_class c ON c.oid=g.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN b0_catalog_target t
  ON t.kind='trigger'
 AND t.name=n.nspname||'.'||c.relname||'.'||g.tgname
WHERE NOT g.tgisinternal;
```

`definition-row` 由同名第二个 `UNION ALL` view 分支输出，exact `rowType/values` 为：

- `module-dependency`：
  `moduleCode,requiredModuleCode,dependencyKind,isEnabled`；
- `permission`：
  `tenantId,parkId,code,name,parentCode,resource,action,permissionPath,permPath,
  permissionLevel,level,sortNo,permissionType,permType,apiMethod,apiPath,frontendRoute,
  visible,keepAlive,alwaysShow,isSystem,isBuiltin,isTenantCustom,isEnabled,status`；
- `bundle`：
  `bundleCode,bundleName,definitionVersion,definitionHash,status`；
- `bundle-member`：
  `bundleCode,memberOrdinal,permissionCode`；
- `runtime-control`：
  `tenantId,parkId,controlKey,controlKind,target,adapterVersion,contractHash,enabled,
  controlMode,disabledReason`。

Canonical signed-row extraction 只有一个 scope authority：runner 必须先完整产生
`business_target_scope`、执行下文 stable-scope preflight 并物化
`b0_scope_canonical`，再把 §2.4 tenant-wide `permission_scope` 物化为
`b0_permission_scope_canonical(tenant_key,park_key)`（每 tenant 唯一，且
`PRIMARY KEY(tenant_key), UNIQUE(tenant_key,park_key)`）。后者每行必须通过
`(tenant_key,park_key)` JOIN 回 `b0_scope_canonical`；任何未命中或多重命中均在
definition extraction 前失败。固定 SQL 不得重新 JOIN `sys_tenant/asset_park`，也不得
从未 `btrim` 的源业务字段重算 canonical scope：

```sql
CREATE TEMP VIEW b0_schema_definition_row_export(kind,name,definition) AS
SELECT 'definition-row'::text AS kind,
       'definition.module-dependency.'||m.module_code||'.'||r.module_code AS name,
       jsonb_build_object(
         'rowType','module-dependency',
         'values',jsonb_build_object(
           'moduleCode',m.module_code,
           'requiredModuleCode',r.module_code,
           'dependencyKind',d.dependency_kind,
           'isEnabled',d.is_enabled)) AS definition
FROM sys_module_dependency d
JOIN sys_module m ON m.id=d.module_id
JOIN sys_module r ON r.id=d.required_module_id
WHERE d.is_deleted=false
UNION ALL
SELECT 'definition-row',
       'definition.permission.'||canonical_scope.tenant_canonical||'.'||p.code,
       jsonb_build_object(
         'rowType','permission',
         'values',jsonb_build_object(
           'tenantId',canonical_scope.tenant_key,
           'parkId',canonical_scope.park_key,
           'code',p.code,'name',p.name,'parentCode',parent.code,
           'resource',p.resource,'action',p.action,
           'permissionPath',p.permission_path,'permPath',p.perm_path,
           'permissionLevel',p.permission_level,'level',p.level,
           'sortNo',p.sort_no,'permissionType',p.permission_type,
           'permType',p.perm_type,'apiMethod',p.api_method,
           'apiPath',p.api_path,'frontendRoute',p.frontend_route,
           'visible',p.visible,'keepAlive',p.keep_alive,
           'alwaysShow',p.always_show,'isSystem',p.is_system,
           'isBuiltin',p.is_builtin,'isTenantCustom',p.is_tenant_custom,
           'isEnabled',p.is_enabled,'status',p.status))
FROM sys_permission p
JOIN b0_permission_scope_canonical permission_scope
  ON permission_scope.tenant_key=p.tenant_id
 AND permission_scope.park_key=p.park_id
JOIN b0_scope_canonical canonical_scope
  ON canonical_scope.tenant_key=permission_scope.tenant_key
 AND canonical_scope.park_key=permission_scope.park_key
LEFT JOIN sys_permission parent ON parent.id=p.parent_id
WHERE p.is_deleted=false
  AND p.remark='PR192 Track B frozen permission definition'
UNION ALL
SELECT 'definition-row',
       'definition.bundle.'||b.bundle_code,
       jsonb_build_object(
         'rowType','bundle',
         'values',jsonb_build_object(
           'bundleCode',b.bundle_code,'bundleName',b.bundle_name,
           'definitionVersion',b.definition_version,
           'definitionHash',b.definition_hash,'status',b.status))
FROM sys_property_permission_bundle b
WHERE b.is_deleted=false
UNION ALL
SELECT 'definition-row',
       'definition.bundle-member.'||b.bundle_code||'.'||
         lpad(m.member_ordinal::text,4,'0'),
       jsonb_build_object(
         'rowType','bundle-member',
         'values',jsonb_build_object(
           'bundleCode',b.bundle_code,'memberOrdinal',m.member_ordinal,
           'permissionCode',m.permission_code))
FROM rel_property_permission_bundle_member m
JOIN sys_property_permission_bundle b ON b.id=m.bundle_id
WHERE b.is_deleted=false AND m.is_deleted=false
UNION ALL
SELECT 'definition-row','definition.runtime-control.'||
       canonical_scope.tenant_canonical||'.'||canonical_scope.park_canonical||'.'||
       c.control_key,
       jsonb_build_object(
         'rowType','runtime-control',
         'values',jsonb_build_object(
           'tenantId',canonical_scope.tenant_key,
           'parkId',canonical_scope.park_key,
           'controlKey',c.control_key,'controlKind',c.control_kind,
           'target',c.target,'adapterVersion',c.adapter_version,
           'contractHash',c.contract_hash,'enabled',c.enabled,
           'controlMode',c.control_mode,'disabledReason',c.disabled_reason))
FROM sys_property_runtime_control c
JOIN b0_scope_canonical canonical_scope
  ON c.tenant_id=canonical_scope.tenant_key
 AND c.park_id=canonical_scope.park_key;
```

最终 exporter 必须先执行
`INSERT INTO b0_canonical_row SELECT * FROM b0_schema_catalog_export UNION ALL
SELECT * FROM b0_schema_definition_row_export`；只有该 INSERT 通过 PK/UNIQUE 与 exact
count Gate 后，才能从 `b0_canonical_row` 排序/canonicalize。不得直接流式拼接或遗漏
任一 view。

Definition-row name 分别固定为
`definition.module-dependency.<moduleCode>.<requiredModuleCode>`、
`definition.permission.<b0_scope_canonical.tenant_canonical>.<code>`、
`definition.bundle.<bundleCode>`、
`definition.bundle-member.<bundleCode>.<4-digit-ordinal>`、
`definition.runtime-control.<b0_scope_canonical.tenant_canonical>.<b0_scope_canonical.park_canonical>.<controlKey>`。
Permission/runtime-control `values.tenantId/parkId` 固定为
`b0_scope_canonical.tenant_key/park_key`，即预检后 `btrim` 的实际业务 key；
canonical name 中的 scope segment 固定为
`tenant-id:<sys_tenant.tenant_id>` / `park-id:<asset_park.park_id>`。实体
`sys_tenant.id/asset_park.id` UUID 只用于 mapping audit，绝不进入 runtime scope 或
canonical name/value；
`b0_scope_canonical` 是 permission/runtime-control extraction 的唯一 canonical
scope 权威源。

V2 stable-scope preflight 必须在 definition-row query 前完成。它从 active `asset`
module assignment 产生 distinct trimmed business target `(tenant_key,park_key)`，
但不得以内连接提前丢弃 tenant/park；随后对每个 business target 精确断言：

- `tenant_key/park_key` 均非 NULL、empty、global 或 all-zero placeholder；
- 按 exact trimmed key 恰好命中 1 行 `sys_tenant`：
  `btrim(tenant_id)=tenant_key/status=1/is_deleted=false`，且未过期；
- 按 exact trimmed pair 恰好命中 1 行 `asset_park`：
  `btrim(tenant_id)=tenant_key/btrim(park_id)=park_key/
  status='enabled'/is_deleted=false`；
- tenant mapping count 与 park mapping count 都必须精确为 1；0 是 orphan，>1 是
  ambiguous，均 fail closed；
- active target 集合中 `(tenant_key,park_key)` 唯一；多个 assignment 可聚合到同一
  business pair 并保留 `assignment_audit_ids`，但不得产生多份 runtime scope；
- `sys_tenant.id/asset_park.id` UUID 只随唯一 mapping 进入 audit columns；任何
  canonical/runtime comparison 都不得消费这些 UUID。

Preflight PASS 后才允许 materialize：

```sql
CREATE TEMP TABLE b0_scope_canonical (
  tenant_key text NOT NULL,
  park_key text NOT NULL,
  tenant_canonical text NOT NULL,
  park_canonical text NOT NULL,
  tenant_entity_uuid uuid NOT NULL,
  park_entity_uuid uuid NOT NULL,
  PRIMARY KEY (tenant_key,park_key),
  UNIQUE (tenant_canonical,park_canonical),
  CHECK (tenant_key=btrim(tenant_key) AND park_key=btrim(park_key)),
  CHECK (tenant_canonical='tenant-id:'||tenant_key),
  CHECK (park_canonical='park-id:'||park_key)
) ON COMMIT DROP;
```

`tenant_key/park_key` 均使用 `btrim` 后原始业务文本，不 lower、不 UUID 化。Business
target count、成功 tenant mapping count、成功 park mapping count 与
`b0_scope_canonical` row count 必须全部相等；
`invalid_business_scope_count=0`、`missing_tenant_mapping_count=0`、
`ambiguous_tenant_mapping_count=0`、`missing_park_mapping_count=0`、
`ambiguous_park_mapping_count=0`、`duplicate_business_pair_count=0`。任一不等或
非零都在生成 definition row 前失败。Audit UUID 不参与这些 scope equality/count，
但每行必须非空且来自该 business mapping 的唯一实体。

Definition exact-set 不得用总数代替。Gate 必须 materialize 带主键的
`b0_signed_permission_code(code)`（§2.2 signed 25 codes）与
`b0_signed_control_key(control_key)`（§3.2 signed 12 keys）。两种 definition 的
cardinality authority 必须分开，禁止把一个 generic canonical-scope loop 同时用于
25/12：

```text
for each b0_permission_scope_canonical row (one row per tenant):
  signed 25 permission codes EXCEPT actual permission codes for that permission scope = empty
  actual permission codes for that permission scope EXCEPT signed 25 codes            = empty

for each validated_business_target_scope row (one row per tenant+park):
  signed 12 control keys EXCEPT actual control keys for that business target = empty
  actual control keys for that business target EXCEPT signed 12 keys         = empty
```

Permission actual set 只取该 `b0_permission_scope_canonical(tenant_key,park_key)`、
active/non-deleted 且
`remark='PR192 Track B frozen permission definition'` 的 code；runtime-control actual
set 只取该 `validated_business_target_scope(tenant_key,park_key)` 的 control key。
每个 permission scope 必须独立得到 signed 25 exact-set；每个 business target 必须
独立得到 signed 12 exact-set。一个 tenant/park 的缺项不能由另一个 scope 的多项抵消，
permission/control 也不能彼此抵消；缺一添一即使各自总数仍为 25/12 也必须失败。
Module dependency 的 signed 2-pair exact-set、16 bundle 与
125 ordered member exact-set 继续按 §2.1/§2.3 双向 anti-join 验证，不以总数或 hash
单独替代。每个 permission scope 的
`permission_missing_count/permission_extra_count` 必须各自为 0；每个 business
target 的 `control_missing_count/control_extra_count` 必须各自为 0。

Structural 与 definition rows 在 RFC 8785 canonicalization 前必须全部插入：

```sql
CREATE TEMP TABLE b0_canonical_row (
  kind text NOT NULL,
  name text NOT NULL,
  definition jsonb NOT NULL,
  PRIMARY KEY (kind,name),
  UNIQUE (name)
) ON COMMIT DROP;
```

因此 canonical `(kind,name)` duplicate 与跨 kind 的同 name 均在 hash 前失败；Gate
还必须显式断言 `canonical_kind_name_duplicate_count=0` 与
`canonical_name_duplicate_count=0`，不能依赖最后排序或 map 覆盖。

V2 已验证集合只允许可解析到 active、非删除 tenant/park business identifier 的 scoped
rows；NULL、空、orphan 或“global”物理 scope 没有 canonical sentinel，也不得被静默
转成随机字符串或 all-zero UUID。若未来需要 global scope，必须先定义并独立验证新的
stable sentinel/grammar；当前 v2 对此类 row fail closed。SQL 必须显式
`jsonb_build_object` 列出上述 key，不允许 `to_jsonb(row)` 把审计时间、ID、version、
remark 混入。Exporter 分别断言 structural target 行数与 structural view 行数相等，
以及 definition-row query 行数与上述 exact count 相等。

Static drift Gate 必须拒绝 permission/runtime-control scope 使用 tenant/park entity
UUID、tenant_code、park_code、未 trim key 或 UUID cast/normalization；必须证明 permission
分支同时 JOIN `b0_permission_scope_canonical` 与 `b0_scope_canonical`，control 分支
JOIN `b0_scope_canonical`，且两者只从 canonical table 输出上述 prefixes。Extraction
SQL 若重新 JOIN `sys_tenant/asset_park`、读取未 trim 的 business field 或自行重算
prefix，均为 static drift。无法命中 canonical scope 的 row 会造成 definition-row
exact count 不等并失败，不允许被 exporter 静默遗漏。

数据库表达式将 CRLF/CR 转 LF，删除每行尾部空格，不 trim 其他字符。Structural 与
definition rows 合并后，唯一排序 key 是 UTF-8 bytes
`kind + 0x09 + name`，使用无 locale 的 byte comparison；SQL `C` collation 只可作为
等价预排序，不是第二权威。每行随后用 RFC 8785 canonicalizer 输出
`{"definition":...,"kind":"...","name":"..."}`。文件头固定
`b0-schema-catalog-v2\n`，每个 JSON 后一个 LF，末尾必须有 LF。

Exporter fixture bytes 固定为：

```text
b0-schema-catalog-v2
{"definition":{"dataType":"uuid","default":"uuid_generate_v4()","generated":"","identity":"","notNull":true,"ordinal":1},"kind":"column","name":"public.example.id"}
```

Fixture 最后一行有 LF，其 golden SHA-256 为
`39d3638f9ddc76c07232d5707ef73c040319590cf807fd68098c6b19733dbd02`。
Exporter 未先通过该 fixture 时不得生成 `<catalog-sha256>`。

ACL/proconfig/owner/schema-CREATE 与 runtime privilege probe 不进入 catalog，但必须
生成独立 `b0-schema-security-v1` signed artifact。Artifact 只输出归一化判定，不输出
实际 owner/role/grantee 名、OID、container/volume、timestamp、run ID 或 temporary
role 名。Exact row kinds/content 为：

- `function-security`：10 个 Identity marker function 加
  `public.fn_transition_property_migration_anomaly(character varying,character varying,uuid,integer,character varying,uuid,character varying,character varying)`
  共 11 行，name 使用上述 exact stable regprocedure signature；facts exact keys 为
  `language,ownerApproved,ownerIsApplication,proconfig,publicExecute,
  securityDefiner,unexpectedExecuteGrantCount,volatility`。
- `relation-security`：六张 Identity authority table 各一行；facts exact keys 为
  `applicationDeleteViolationCount,applicationInsertViolationCount,
  applicationUpdateViolationCount,publicDelete,publicInsert,publicUpdate`。
- `anomaly-relation-security`：name exact-set 只有
  `public.biz_property_migration_anomaly` 与
  `public.biz_property_migration_anomaly_audit` 两行；facts exact keys 只有
  `applicationDeleteViolationCount,applicationUpdateViolationCount,
  publicDelete,publicUpdate`。该 kind 不检查或输出 INSERT 权限，禁止误把 anomaly
  creation/append 合同扩大为 INSERT deny。
- `column-security`：name 固定 `public.biz_party#identity-columns`；facts exact keys 为
  `identityColumnApplicationUpdateViolationCount,
  tableWideApplicationUpdateViolationCount`。
- `schema-security`：name 固定 `public`；facts exact keys 为
  `applicationCreateViolationCount,publicCreate`。
- `runtime-probe`：name 固定 `identity-command-authority`；facts exact keys 为
  `approvedCommandExecuteCount,directPartyIdentityDmlDenied,
  securityDefinerCommandSucceeded,temporaryRoleRemoved`。

Facts 的 PASS exact values：

```text
function-security:
  language="plpgsql"
  ownerApproved=true
  ownerIsApplication=false
  proconfig=["search_path=pg_catalog"]
  publicExecute=false
  securityDefiner=true
  unexpectedExecuteGrantCount=0
  volatility="v"
relation-security:
  all three application violation counts=0
  publicInsert/publicUpdate/publicDelete=false
anomaly-relation-security:
  applicationDeleteViolationCount=0
  applicationUpdateViolationCount=0
  publicDelete/publicUpdate=false
column-security:
  both violation counts=0
schema-security:
  applicationCreateViolationCount=0
  publicCreate=false
runtime-probe:
  approvedCommandExecuteCount=6
  directPartyIdentityDmlDenied=true
  securityDefinerCommandSucceeded=true
  temporaryRoleRemoved=true
```

完整 security artifact exact row count 为 22（11 function + 6 Identity relation +
2 anomaly relation + 1 column + 1 schema + 1 runtime probe）；每个 kind 的 name
exact-set 必须双向比较，不能用总数替代。特别是 anomaly function 的
ownerApproved/ownerIsApplication/proconfig/publicExecute/
unexpectedExecuteGrantCount 与其他 function 使用同一 PASS exact values，不能只依赖
`b0-function-acl-evidence.json`。

Rows 先进入 `PRIMARY KEY(kind,name), UNIQUE(name)` 临时表，按 UTF-8 bytes
`kind + 0x09 + name` 排序，并逐行使用 RFC 8785 输出
`{"facts":...,"kind":...,"name":...}`。Header 固定
`b0-schema-security-v1\n`，每行与文件末尾均有 LF。Security fixture bytes 固定为：

```text
b0-schema-security-v1
{"facts":{"applicationDeleteViolationCount":0,"applicationUpdateViolationCount":0,"publicDelete":false,"publicUpdate":false},"kind":"anomaly-relation-security","name":"public.example_anomaly"}
{"facts":{"publicExecute":false,"searchPath":["pg_catalog"],"securityDefiner":true},"kind":"function-security","name":"public.example()"}
```

Fixture 最后一行有 LF，golden SHA-256 固定为
`ecd0c793f1687d6e531c3879c4fa903c5cbcaf752c8c8a477b4702b6c80054b9`。
Artifact bytes 还必须扫描并拒绝 owner/role/grantee/OID/run/container/volume/timestamp
字段及 temporary role literal，避免动态身份泄漏。Security artifact 的签名输入是
上述固定 row name、exact facts key 与 PASS value；任何 row 缺失、多余、重复、facts
key 缺失/多余或 value 漂移，即使 row count 不变也必须在生成 security SHA 前失败。
实际 owner/role/grantee 只可用于计算 boolean/count 判定并进入独立受控审计证据，
不得成为 artifact 的 name、value 或排序 key。

最终 schema manifest 的唯一 grammar：

```text
b0-schema-expand-v2\n
<000185 exact filename><TAB><raw-file-sha256>\n
<000186 exact filename><TAB><raw-file-sha256>\n
<000187 exact filename><TAB><raw-file-sha256>\n
<000188 exact filename><TAB><raw-file-sha256>\n
<000189 exact filename><TAB><raw-file-sha256>\n
<000190 exact filename><TAB><raw-file-sha256>\n
catalog<TAB><catalog-sha256>\n
security<TAB><security-sha256>\n
```

Filename 使用实际预约后的 basename，按 migration number 升序；SHA 为文件 raw bytes
lowercase SHA-256。UTF-8、无 BOM、TAB=`0x09`、LF-only、最终 LF。该 manifest bytes
的 SHA-256 同时是唯一 `migration_set_hash` 与唯一 `B-schema-expand SHA`。

算法无循环：migration 文件与 catalog dump 都不嵌入 `migration_set_hash`；
`biz_property_migration_evidence.migration_set_hash` 只在六个 migration 已应用并完成
catalog dump 后，由 B-4 runner 写入。任何 migration 文件或 catalog object 变化都会
产生新 SHA，并要求重新独立 Gate。

V2 negative fixtures 必须逐项独立证明 hash 生成前 fail closed：

1. assignment business `tenant_id/park_id` 为 NULL、empty、global 或 all-zero；
2. tenant `status<>1`、soft-deleted、expired，或同 trimmed `tenant_id` active mapping
   为 0 或 >1；
3. park 非 enabled、soft-deleted，或同 trimmed `(tenant_id,park_id)` active mapping
   为 0 或 >1；
4. 同 business pair 的多个 assignment 未被聚合，或 mapping/entity UUID 被误用为
   runtime scope/canonical name/value；
5. 任一 scope 缺 1 个 signed permission、额外 1 个 permission，以及“缺一添一但
   count 仍为 25”；
6. 任一 scope 缺 1 个 signed control、额外 1 个 control，以及“缺一添一但 count
   仍为 12”；
7. dependency pair、bundle code/member 缺失或多余；
8. 重复 `(kind,name)`、跨 kind 同 name；
9. 任一 function owner 不在批准 allowlist、owner 命中 application/service/worker
   role，或 `language/securityDefiner/volatility` 偏离 exact PASS value；
10. function `proconfig` 为 NULL、缺少/额外配置、search path 不等于唯一
    `pg_catalog`，或 PUBLIC/非批准 application role 获得 EXECUTE；
11. 六张 authority relation 对 PUBLIC 开放 INSERT/UPDATE/DELETE，application role
    获得任一 table-wide DML，或 `biz_party` identity column/table-wide UPDATE
    allowlist 越权；
12. anomaly function 的 owner allowlist、application-owner、PUBLIC/意外 EXECUTE
    或 `proconfig` 任一事实漂移；两张 anomaly relation 对 PUBLIC/application role
    开放 UPDATE/DELETE。该 fixture 不得把 INSERT 权限作为失败条件；
13. `public` schema 对 PUBLIC 或任一 application role开放 CREATE；
14. runtime probe 的 6 个批准 command function 不可执行、direct identity DML 未被
    拒绝、SECURITY DEFINER command 失败，或 temporary role 未删除；
15. security row 缺失/多余/重复、facts key/value 漂移，或 artifact 泄漏实际
    owner/role/grantee/OID、run/container/volume/timestamp/temporary-role literal。

每个 fixture 都必须返回稳定 Gate failure，且不产生 catalog bytes/catalog SHA、
security artifact/security SHA、schema manifest 或 migration evidence；清理后临时
表、temporary role、container 和 anonymous volume 无残留。Security fixture 的
negative drift 必须至少覆盖“row count 相同但 anomaly function ownerApproved
翻转”、“row count 相同但 anomaly function unexpectedExecuteGrantCount 增加”与
“row count 相同但 anomaly relation applicationUpdateViolationCount 增加”三类语义
漂移，证明 totals 不能替代 exact content。

V2 determinism Gate 的正式最小样本是 **3 次彼此独立的 fresh PostgreSQL 16 run**；
少于 3 次直接失败，允许扩大到最多 5 次但不得用额外 run 掩盖任一失败。每次都从空
database、fresh production seed 与新临时 container/anonymous volume/runtime role
开始，完整执行相同 migration set、structural markers、definition rows、fixture、
catalog、security artifact 与 manifest，并在结束后证明 temporary role、container/
anonymous volume 均不存在。

3 次正式 run 必须全部 PASS，并逐字相等：

- 六个 migration filename/raw SHA 的有序集合；
- structural marker count 与 definition-row exact count；
- `b0-schema-catalog-v2` bytes 及 catalog SHA；
- `b0-schema-security-v1` bytes 及 security SHA；
- `b0-schema-expand-v2` manifest bytes、`migration_set_hash` /
  `B-schema-expand SHA`；
- supersedes branches、四向 consistency rollback 与 CAS one-winner/SQLSTATE 40001
  loser 行为证据；
- cleanup result，且 errors exact empty。

任一 run 失败、count/hash/bytes/migration set 不等或 cleanup 残留都使 determinism
Gate FAIL，不得选多数结果。已验证的
`ar1-schema-determinism-v2.json` 只证明 v2 algorithm 在 3 fresh runs
`marker_count=1101/definition_row_count=180` 下可重现；合同或 migration 后续发生
字节变化时必须生成新的三轮证据，不能沿用其中旧 catalog/security/schema hash。

### 4.5 Handoff

`B-schema-expand SHA` 只在 `000185`–`000190` 全部经过：

- clean-database apply；
- 同 schema rerun；
- 双 history checksum/status 核对；
- catalog exact-set 核对；
- stable-scope preflight、definition bilateral exact-set 与 canonical duplicate 核对；
- security exact row/facts、fixture、negative drift 与三轮 artifact SHA 核对；
- rollback/retry/failure injection；
- 独立 schema Gate；

后生成。本文 SHA、最终 migration SHA、schema catalog dump 与 signed security
artifact 都进入 handoff；security SHA 必须作为 manifest 的 `security<TAB>...` 行参与
唯一 `B-schema-expand SHA`，不得旁路保存或只在报告中引用。本文自身不等于
`B-schema-expand SHA`，也不授权 B-0.5、B-1 或 B-4 开启业务写入。

## 5. B-2a C1 / 000194 物理纠偏冻结

本节消费 C0 plan raw SHA
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`，并 supersede
本文所有不一致的 task endpoint access、projection-only-rebuild、control hash 和 migration DAG
语句。本文只冻结；C1 不创建 migration、不启动数据库。

### 5.1 Endpoint access v2

49-row count 与 route 不变。只有以下两 row 的 `requiredPermissions=[]` 且 alternatives 非空：

```text
property.task.release:
  property_task:release + current-assignee
  property_task:supervise + queue-supervisor
property.task.unblock:
  property_task:process + current-assignee
  property_task:supervise + queue-supervisor
```

其余 row `authorizationAlternatives=[]` 且 requiredPermissions 保持原 AND。空 alternative
permission、重复 alternative、未知 predicate、OR 实现为 AND、缺/多 route 都使 Gate 失败。
Occupancy canonical token 只能是 `:occupancyId`；task/approval/notification 分别保持
`:taskId/:requestId/:notificationId`。

### 5.2 Projection exact objects 与约束

000194 只允许新增以下四表，禁止 alias、第二 assignment/read-model 表：

```text
biz_property_task_projection_head
biz_property_task_projection
biz_property_task_projection_rebuild_audit
sys_property_runtime_control_contract_audit
```

Head exact authority columns 为 id、tenant_id、park_id、source_type、source_id、
projection_version、content_hash、last_rebuilt_at/by、created_at/updated_at；scope id、source 与
stable(source+id) 唯一，version>0，hash lowercase 64 hex，CAS index exact
`(tenant_id,park_id,source_type,source_id,projection_version)`。

Projection exact authority columns为 id/scope/head_id/task_id/task_key/assignment_authority/
derived_assignment_id/source identity+version+occurrence/task_kind/queue/title+labels/priority/due_at/
assignment status+version/assignee display+id/claimed+started+blocked/outcome/deep_link/
projection_version/content_hash/created+updated。它没有 `is_deleted`。唯一键是 scope+id、scope+taskId、
scope+source+taskKind+occurrence；stable deferred FK 绑定 scope/head/source，derived assignment FK
绑定 scope assignment。CHECK 必须逐字强制 derived 与 assignment id 的双向关系、六状态、positive
versions、priority 0..100、task/content hash、非空无 TAB/LF occurrence、queue regex、blocked/open/
active/terminal/outcome 字段矩阵与 updated>=created。Active queue、assignee、source 和 head/task 索引
逐列采用 C0 plan §5.2 exact 定义。

Replacement audit exact columns为 scope/head/source/actor/receipt、replace_mode、command_action、
from/to projection version、`business_result_version`、projected count、
`assignment_mutation_count=0`、reason、request/result/content hashes、result_ref、occurred_at。每
scope+head+toVersion 唯一，FK 绑定 stable head 与 receipt；to=from+1。Mode/action closed set：
manual-rebuild 只配 `property.task.rebuild`；authority-sync 只配 claim/start/block/unblock/release/
source-terminal.closed/source-terminal.cancelled。DB row CHECK 逐字绑定 manual 与 terminal 的
source/type/id/terminal/business version resultRef；command 只强制 task UUID/version shape，receipt
target taskId 与 snapshot assignment version由唯一 function 在锁定 receipt 后跨表强制，不得误报为
row CHECK。Manual reason 保留非空 request reason；authority-sync reason 固定
`authority-sync:<commandAction>`。Audit UPDATE/DELETE trigger 永久拒绝。

Head 与 projection 的 stable FK 不绑定可变 generation；两个 deferred constraint triggers 在 commit
强制每个 current projection row 的 projection_version 与 head exact，并允许第二次及后续 replacement。
当前 projection rows 可替换；head、assignment/audit、replacement audit 自 source terminal 至少保留
7 年，legal hold 优先，immutable audit 不自动删除。

### 5.3 唯一双 mode writer

000194 只能创建以下 helper/writer，名称、identity args、volatility/security/config/ACL 与 normalized
`pg_get_functiondef` SHA 全部进入 catalog Gate：

```text
public.fn_property_task_projection_scalar_v1(text,char)
public.fn_property_task_projection_row_hash_v1(jsonb)
public.fn_property_task_projection_replace_v1(
  varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,
  char,varchar,char,varchar,jsonb)
fn_property_task_projection_audit_immutable()
fn_property_task_projection_generation_exact()
fn_property_runtime_control_contract_audit_immutable()
```

Replace function `SECURITY INVOKER SET search_path=pg_catalog,public`，输入 scope/source/actor/receipt、
replaceMode/action、business result version、expected projection version、request/result hash/ref/reason
及 exact JSON rows；返回 previousVersion/newVersion/projectedCount。它必须依次验证 top-level array、
item object、exact 30-key row、JSON type、cast-validity、UUID/time canonical、ascending unique taskId、
row hash、scope/source、started receipt/actor/action/target、mode/action/resultRef/bilateral assignment，
然后 DELETE old rows→INSERT new generation→head INSERT/CAS→INSERT one audit。任何 count/hash/version/
receipt mismatch RAISE 并整 transaction rollback。Function 不 acquire/complete receipt、不锁新的
source/assignment、不 commit/开 transaction；caller 已按 runtime freeze §16.4 持有全部前序锁。

Manual rebuild 与所有 command/terminal authority-sync 都必须 bilateral 出现在
`b-property-task-projection-callsite-v1` manifest；direct SQL writer、第二 function、额外/缺 caller
失败。当前 migration/application 同一 CURRENT_USER，所以 function 是唯一受支持 repository code
path，但不是独立 DB principal 边界；REVOKE PUBLIC 不能误报为 table owner 不可绕过。NOLOGIN
object-owner/runtime-role privilege split 明确移交 Track C hardening。

Function-definition sidecar grammar：

```text
b-property-task-projection-function-v1\n
function<TAB><schema.name(identity-args)><TAB><normalized-pg-get-functiondef-sha256>\n
... name bytes order ...
```

Definition 必须 UTF-8/LF-only/final-LF，不做 whitespace/identifier rewrite。

### 5.4 Disabled control 原子 correction

`sys_property_runtime_control_contract_audit` exact 保存 scope/control id+key、固定 correction key
`b2a-contract-correction-000194`、old/new contract hash+version+disabled reason+time、evidence hash 与
occurred_at；scope+id、scope+control+correction 唯一，FK control，newVersion=oldVersion+1，
newTime=occurredAt>=oldTime，hash lowercase hex，UPDATE/DELETE trigger 拒绝。

000194 物化签署的 12-key `(control_key,control_kind,target,adapter_version)` 后只允许：all-old、
disabled/config exact、无 correction audit时用一个 changed_at set-based UPDATE new hash/version/reason/
time并逐行 INSERT audit，affected 都为 scopeCount*12；all-new 且 exact audit/evidence 重算时纯 no-op；
old/new mixed、unknown/缺/多 row或audit、enabled/mode/config/scope/key drift全部 fail并 rollback。
Evidence bytes 使用 `runtime-control-contract-audit-v1` 与 C0 plan §5.3 的 S<byte-length> scalar
encoding。000190 history/checksum/evidence 永不修改。

### 5.5 Migration 与 handoff DAG

Correction 文件名固定 `000194_property_task_projection_contract_correction.sql`。不得修改
000185–000190、000193 或任何成功 migration；000191/000192 留给 B-2c。C2 只执行当时已交付的
185→190→193→194 并证明 194 对 191/192 零依赖；191/192 各自 schema Gate；B-4 才执行
191–194 fresh-equivalence、全链顺序/catalog/constraint/hash reconcile。Partial/unknown preexisting
objects、双 history drift、running/failed 或编号并发占用 stop-ship，不静默换号。

Projection schema handoff 至少包含 000194 raw SHA、完整 catalog/security/control artifact、逐 function
definition SHA、function grammar SHA、call-site sidecar消费、cleanup evidence与 open_P0_P1=[]。Fresh、
rerun no-op、drift rejection、late failure atomic rollback、receipt actor/target forged negatives、双 mode
positive/negative、generation+1/audit exactly-one、2M rows query budgets和安全 runner cleanup均由 C2
独立数据库 Gate 验证；本 C1 文档本身不声称这些实现证据已通过。
