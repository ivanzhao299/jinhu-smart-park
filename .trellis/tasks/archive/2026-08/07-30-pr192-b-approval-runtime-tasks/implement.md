# Track B Approval Runtime 与任务实施计划

> 仅规划，不实现代码。

所有 batch 首先校验四份 B-contract 输入：
`B0_IDENTITY_FREEZE_SHA`、`B0_PRODUCT_ACCESS_FREEZE_SHA`、
`B0_RUNTIME_CONTRACT_FREEZE_SHA`，以及 `b0-schema-physical-addendum.md` raw-file
SHA。任一不匹配即停止，最终值不嵌入本文；实施只引用 freeze/addendum，不把其中 exact
schema/state/API/permission/effect manifest 复制成第二套本地合同。

## 0. B-2a correction release sequence

唯一方案是 raw SHA
`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da` 的
`research/b2a-contract-schema-correction-plan.md`。C1.5、C2、000195、C3、C4、
runtime/callsite、AppModule 与 legacy compatibility 已依次完成独立 Gate；纠正版 combined
final signoff `research/b2a-combined-final-signoff-superseding-20260801c.md`（SHA
`e61f39d936ef4a9b968beec645a09f2459419072d2b7c70067b71d7c2cbcc633`）经双独立
GO，B-2a 为 `PASS / CLOSED`，只释放 B-2b。以下阶段和后续门禁仍须串行执行，不得越级：

| Batch | 唯一写 owner/path | 必需输出 |
|---|---|---|
| C1 | freeze owners；`shared-contract-owner`；其后 `property-error-filter-owner` 仅 filter+spec；`task-doc-owner` 仅三份任务文档；observability owner 持 alert mapping | 新四 raw、B-contract/shared/endpoint SHA、独立 filter SHA/sidecar；旧 SHA 标记 superseded |
| C2 | `schema-migration-owner` 仅 `000194_property_task_projection_contract_correction.sql`、专用 runner/fixtures/evidence | projection schema SHA、function-definition sidecar、独立 DB Gate；000185–000193 不改 |
| C3 | `approval-runtime-owner` 仅 `property-approvals/**`；foundation/AppModule 只写各自 re-attestation evidence | 窄 receipt port、新 B-approval runtime SHA、foundation/AppModule v2 attestation |
| C4 | `property-task-owner` 仅 `property-tasks/**`；checker 只写/跑被分配 tests | task runtime SHA、projection callsite SHA/sidecar、`open_P0_P1=[]`；B-3 pending |

C2 只运行当时可用的 `000185→000190→000193→000194` DAG 并证明 000194 对 191/192
零依赖；000191/000192 在 B-2c 各自独立 Gate，B-4 才执行汇合后的 191–194 full-chain
equivalence。C2 不得预先声明该未来证据。

## 1. Subagent Batches

### B-AR0：冻结合同消费检查

并行：

- `approval-contract-planner`：只校验 approval/outbox freeze SHA 和 acceptance，不写 shared 文件。
- `task-contract-planner`：只校验 task/assignment freeze SHA 和 acceptance，不写 shared 文件。
- `runtime-model-reviewer`：只读核对状态、transaction、idempotency。

本子任务不产出或改写 `B-contract SHA`，只消费父级唯一
`shared-contract-owner` 已冻结 handoff；不修改 shared root export 或 contract 文件。

### B-AR1：Schema Handoff 校验

本子任务不产出 schema/migration，只校验父级唯一 `schema-migration-owner` 的
reservation、rerun、checksum 和 schema SHA。B-0 只校验 provisional window；
contract PASS 后才允许 `000185`–`000190` 正式 reservation。该序列只允许 schema/constraint/index/
definitions/disabled metadata；backfill/replay/shadow/final reconcile/validation 属于
B-4。`000191`/`000192` 由同一 owner 在 B-2c adapter 前交付，Homestay/Housing API
owner 与本子任务不得写 migration。
Checkpoint exact schema 只由 `000190` 按 physical addendum 创建，`000186` 只消费
port；`000185`–`000188` 的 transaction/rerun 验证以 addendum 最终定义为物理权威。
`000191` handoff 名称固定为 `B-property-homestay-effect-schema SHA`。
Schema checker 必须逐项断言 mode transition 正确现表、occupancy release audit、
ledger `currency varchar(8) DEFAULT 'CNY'`、所有 amount `numeric(18,2)`、approval 四列
type/FK/partial unique/immutable trigger。

### B-AR2/B-1：Approval Runtime Core

依赖 B-contract SHA、B-schema-expand SHA 和 property-foundation ports：

- 父表唯一 `approval-runtime-owner`：独占
  `apps/api/src/modules/property-approvals/**`，实现
  request/decision/execution/lease/atomic adapter port。
- `outbox-inbox-worker`：只在 `approval-runtime-owner` 分配的
  `property-approvals/**` 子路径和 base SHA 上实现 publisher/DLQ/inbox。
- approval fault checker：只写/运行 B-1 targeted tests，不修改 runtime。
- `approval-composition-owner`：只在 B-1 runtime 独立 Gate 通过并冻结
  `B-approval-runtime SHA` 后修改 `apps/api/src/app.module.ts`，注册
  `PropertyApprovalsModule` 并执行单独 composition Gate。

`outbox-inbox-worker` 只在 `approval-runtime-owner` 分配的路径和 base SHA 上工作，交付后由
该 owner 整合；本阶段不改 `property-tasks/**`、domain adapters、shared 或 migration。
Runtime Gate 前 `apps/api/src/app.module.ts` diff 必须为零；composition Gate 中
`apps/api/src/modules/property-approvals/**` diff 必须为零。Ownership checker 必须分别
验证两个方向，禁止同一 owner 合并交付。

B-1 Gate：

- state/CAS、maker-checker。
- submitted withdraw/expire 拒绝；pending_approval 仅零 decision 可 withdraw/expire。
- claim epoch/token fencing、heartbeat、reclaim 先 reconcile、commit-unknown。
- max attempt → `infra_exhausted`；incident retry command 必须同时验证 active
  `asset` module、`property:approval-incidents:page`、
  `property_approval:read_incident`、assigned tenant+park approval-incident scope 与
  `property_approval:retry`，且只做 reconcile/CAS，不直执 domain；module assignment
  missing=403、disabled=403、expired=403 必须分别断言。
- atomic domain effect/approval/audit/outbox。
- 十一项 high-risk effect manifest 的 stable line/ordinal、owning unique、
  cardinality、amount/currency/hash invariant。
- inbox dedupe、aggregate order、DLQ/manual replay、notification 正交。
- event-delivery 与 approval incident surface 分离；task admin rebuild 不被聚合为统一
  incident。
- event replay 对 active `asset` module、
  `property:event-delivery-incidents:page`、`property_event:read_incident`、assigned
  tenant+park incident scope、`property_event:replay` 逐维删除验证；module assignment
  missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic read/event
  permission 不可替代。
- approval retry 对 active `asset` module、
  `property:approval-incidents:page`、`property_approval:read_incident`、assigned
  tenant+park approval-incident scope、`property_approval:retry` 逐维删除验证；module
  assignment missing=403、disabled=403、expired=403，缺任一其他维度也 403；generic
  approval read 或 event permission 不可替代。
- event incident DTO 必须包含 `deepLink`，并以 sibling product freeze 同步作为
  product/route Gate；approval incident List 精确断言
  `requestId,incidentId,actionId,sourceType,sourceId,title,executionStatus,errorCode,infraExhaustedAt,lastRetryAt,updatedAt,requestedBy,requestedAt,deepLink,allowedActions`，
  Detail 只多 `safeReconcileSummary,auditTimeline`，且
  `incidentId=requestId`；sort 精确覆盖
  `infraExhaustedAt|lastRetryAt|updatedAt`。

B-1 完成后另起 B-2c property-foundation adapter batch，由
`property-foundation-api-owner` 独占 `property-operations/**`；B-1 diff 必须证明该路径
未修改。B-2c 独立 Gate 消费 foundation/approval/000191 handoff，把正式 mode/release
URL 从 fail-closed 切换为 approval create+effect execute，输出
`B-property-foundation-adapter SHA`。该名称是唯一 adapter handoff，owner 固定为
`property-foundation-api-owner`。
- rollback 和 ownership boundary。

全部通过后单独输出 `B-approval-runtime SHA`，包含 owned paths、ports、
base/output SHA、test evidence、known failures 和 `open_P0_P1=[]`。

### B-AR2a/B-2a：Property Task Runtime Core

本节旧 AR 名称只描述 C4 runtime 工作面；实际 release 必须先完成上文 C1→C2→C3，
并严格依赖新 B-contract/shared/endpoint SHA、独立 `B-property-error-filter SHA`/sidecar、
projection schema/function-definition sidecar、新 `B-approval-runtime SHA` 与 foundation v2
attestation：

- 父表唯一 `property-task-owner` 独占
  `apps/api/src/modules/property-tasks/**`，实现
  assignment/projector/claim/list/count/rebuild。
- task concurrency checker：只写/运行 claim、predicate、rebuild tests。
- ownership checker：确认不修改 `property-approvals/**` 或 owning aggregate 状态。
- callsite checker：按签署 grammar 复算 `B-property-task-projection-callsite SHA`，确认唯一
  replace function 只被 manual rebuild 与签署 command/source-terminal authority-sync 调用，
  无 direct projection/head DML、第二 writer/write function。

B-2a Gate：

- concurrent claim CAS。
- 六状态及 release/unblock/source terminal exact transition。
- source eligibility。
- list/count 同 predicate。
- projection delete/rebuild 后 task set 一致。
- owning assignment 不被覆盖。
- 双 mode 唯一 projection writer：manual-rebuild 与 authority-sync；每个成功 authority
  mutation 在同 transaction、receipt complete 前立即同步完整 snapshot，replay 零 sync/零 audit。
- Terminal receipt fence：active incoming=current 只访问一次 `execute-or-replay`；
  same-terminal incoming=current-1 只访问一次 `existing-only` completed replay；incoming=current/
  current-2/0/overflow/非整数及 identity drift 在 receipt 前冲突，access count=0、零 mutation。
- ownership boundary 和 rollback。

全部通过后单独输出 `B-property-task-runtime SHA`，handoff 明确记录 consumed
foundation/approval SHA、owned paths、base/output SHA、test evidence、known
failures 和 `open_P0_P1=[]`，并独立列出 filter、projection schema/function、callsite SHA。
不得生成组合 runtime SHA。C4 只做 source-neutral/static Web-consumer fixture；sidecar 必须登记
B-3 route roadmap、桌面与 390px、focus、44px、普通 UI 不可发现 internal rebuild 为
required/pending，并写 `B3_web_consumer_status=pending`，不得冒充浏览器 PASS。

### B-AR3：Crash 和并发

分别针对已冻结 milestone 运行，最多三个 checker：

- execution crash/reclaim tests。
- outbox/inbox duplicate/order/DLQ tests。
- assignment/list/count/rebuild tests。

### B-AR4：Independent Check

- architecture checker。
- finance/idempotency checker。
- security/RBAC checker。

## 2. Machine Gates

### State

- 合法笛卡尔组合全通过。
- 非法组合 DB 拒绝。
- stale decision/execution version 409。
- old compatibility status 只读。

### Maker-checker

- self/maker/payment-recorder 拒绝。
- 阈值边界前后 0.01。
- 多 stage 并发。
- 历史角色变化不改变 actor 判定。

### Execution

- claim/heartbeat/reclaim。
- claim epoch/token 每次 ownership change 单调递增，旧 epoch/token 拒绝。
- stable execution key。
- business conflict 不重试。
- infra retry 不重批；耗尽进入 `infra_exhausted`。
- reclaim/commit unknown 均先 reconcile，partial result P0 隔离。

### Atomic/P0

对父 freeze 十一项 high-risk action，逐项使用其 effect manifest：

- domain write 后 commit 前 crash。
- commit 后 ack 前 crash。
- commit success + publish fail。
- broker duplicate。
- consumer duplicate/out-of-order。
- DLQ/manual replay。

必须始终：

```text
domain effect=manifest cardinality
financial row/amount/currency=manifest invariant
approval executed=1
outcome audit=1
stable outbox event=1
consumer side effect=1
```

### Assignment

- 同 task 并发 claim 一个成功。
- exact states 只有 open/claimed/in_progress/blocked/closed/cancelled。
- source 已失效时 claim 失败。
- list/count predicate 相同。
- projection 删除/rebuild 后 task set 一致。
- owning assignment 不被 projection 覆盖。
- 唯一双 mode replace function 与 callsite bilateral exact-set；direct DML/第二 writer 为
  stop-ship。
- source-terminal active=current、same-terminal=current-1 正例，以及 current/current-2/0/
  overflow/非整数 conflict-before-receipt 负例。
- supervisor 复用 release/unblock，无 supervise endpoint；internal rebuild 固定
  `POST /property/tasks/internal/rebuild`，只重建 projection 且要求
  `property_task:rebuild`。

## 3. Validation Commands

实施时按实际 package script 确认，至少计划：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm typecheck
pnpm test
```

另需 dedicated PostgreSQL integration、HTTP contract、fault-injection 和 financial regression。不得用源码正则代替行为测试。

## 4. Stop-ship

P0：

- DB commit 后 domain 再执行。
- 财务 effect 重复。
- partial atomic result。
- maker-checker 绕过。
- event checksum mismatch。

P1：

- 双状态源。
- reclaim 后旧 worker 可完成。
- list/count/assignment drift。
- DLQ replay 生成新语义 event。
- per-aggregate order 破坏。

## 5. Rollback

- 暂停 publisher 不影响 executed approval。
- 关闭 enforce 后高风险 API fail closed。
- 保留所有 durable records。
- forward-fix migration。
- 恢复前运行 pending/retry/DLQ/sequence reconcile。

## 6. Handoff

交付 `pr192-b-integration-reconcile`：

```text
B-approval-runtime SHA
B-property-task-runtime SHA
consumed B-schema-expand SHA
B-property-task-projection-schema SHA
B-property-task-projection function-definition sidecar SHA
B-property-task-projection-callsite SHA
B-property-error-filter SHA / sidecar
B-property-foundation-contract-v2-attestation sidecar SHA
AppModule contract-v2 re-attestation sidecar SHA
B0_IDENTITY_FREEZE_SHA
B0_PRODUCT_ACCESS_FREEZE_SHA
B0_RUNTIME_CONTRACT_FREEZE_SHA
b0-schema-physical-addendum.md raw-file SHA
adapter_ports
feature_flags
test_evidence
known_failures
B3 required Web handoff / route roadmap / pending checks
B3_web_consumer_status=pending
open_P0_P1
```

只有 `open_P0_P1=[]` 才允许 handoff。

## 7. 人工 Gate

本任务完成 B technical evidence，不负责生产签署。Threshold、bundle、break-glass 和生产 enforce 由 external business/finance/security Gate 决定。

## 8. B-1 实施结果与交接（2026-07-31）

B-1 审批运行时核心已经完成并通过当时的独立门禁；下列 SHA 现作为 C3 重签前的
`superseded baseline` 保留，不得冒充对 C1 新合同、C2 schema 或窄 receipt port 的消费。
本任务仍为 `in_progress`，因为 B-2b 扩展测试数据尚未完成；B-2a 已由 superseding
combined final signoff 正式关闭，但不代表 Track B 整体完成。

历史冻结交付（superseded baseline）：

- `B-approval-runtime SHA`：
  `79691ea945e5c37ddd075ff4e234dbb00eec084ede2b36717393360344e2270d`
  （50 个运行时文件）。
- module raw SHA：
  `54de6b20e768e1c4ff87ab0fb5949f808f9ee7488d98545ac4a96a122a413fb5`。
- `000193` raw SHA：
  `c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07`。
- composition 后 `apps/api/src/app.module.ts` raw SHA：
  `225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb`，
  仅增加 2 行模块导入与注册。
- architecture、finance/idempotency、security/RBAC 三方 B-AR4 均为 PASS，
  `P0/P1/P2=0`；composition 独立 Gate 为 PASS。
- Property approvals 本地 specs 19/19、core unit aggregate 64/64、联合 PostgreSQL
  15/15（outbox 10、core 5）、独立财务非 PostgreSQL 17/17 和 PostgreSQL 15/15；
  API typecheck、build、eslint 与 diff-check 均通过。

全量 `pnpm test` 不登记为 PASS：测试入口因环境缺少 `JWT_SECRET`，在现存 IoT 模块
启动阶段失败，未进入 B-1 断言。完整证据、遗留边界和清理记录见
[B-1 最终门禁与交接](research/b1-approval-runtime-final-gate.md)。

## 9. C4 代表性 Gate 执行记录（2026-08-01）

C4 正式 run `b2ac4_runtime_formal_20260801h` 已完成 11/11 PostgreSQL、全部本地门禁、
输入冻结以及专属临时容器和匿名卷的精确清理，`open_P0_P1=[]`。不可变 artifact 与
manifest SHA 分别为 `81b9811e001bd83d56482d106b9b8ccfaf657bfa8190418c98dbce976866ad28`
和 `d717d987636fa3e483ba17f92cc59ccc481d5cf7a902623b47ee76adee37cb15`。

该 run 只覆盖四条代表性跨操作 schedule，artifact 明确记录
`cross_operation_matrix_complete=false` 与
`full_c4_cross_operation_matrix_status=pending`。下一步必须补齐完整双向矩阵，以新的
唯一 runId 通过独立 PostgreSQL Gate，随后才允许 AppModule 单文件装配和 C4 三方终签。
B-3 Web 验收与 production enablement 继续保持 pending/false。

B-4 继续负责历史 receipt proof 回填、约束 `VALIDATE`、`NOT NULL` 收缩和领域行核对。
4 个非本轮创建的历史测试数据库未经授权继续保留；本轮最终联合门禁创建的临时库已
精确清理。人工 production/UAT 尚未签署，因此本文只确认 B-1 技术完成。
