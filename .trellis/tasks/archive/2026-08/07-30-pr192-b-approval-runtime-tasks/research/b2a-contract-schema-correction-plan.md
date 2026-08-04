# B-2a Contract / Schema Correction Plan

> 状态：`C0 TWELFTH-REVIEW CANDIDATE / IMPLEMENTATION BLOCKED`
>
> 日期：2026-07-31
>
> 适用任务：`07-30-pr192-b-approval-runtime-tasks`
>
> 本文件只固化 correction 执行方案，不直接修改 freeze、shared、migration 或运行时。

## 1. 结论与边界

B-2a 当前不得开始实现。四份冻结输入和既有 schema/foundation/approval handoff 的
机械 SHA 可复算，但 task 状态、权限 OR、source resolver、projection schema、terminal
fencing、告警和交付 SHA grammar 尚未形成一套可直接实施的唯一合同。

本 correction 使用以下固定批次：

```text
C0 plan signoff
-> C1 freeze/shared 重签
-> C2 000194 + DB Gate
-> C3 mutation receipt port + B-1/foundation re-attest
-> C4 B-2a runtime
-> composition Gate
-> B-AR4 independent review
```

任何批次失败都停止后续批次。不得用后续代码、fixture 或测试替前序合同作决定。

以下既有 handoff 只可作为 correction 的旧输入，不得冒充对新合同的消费：

| 旧输入 | 已冻结值 | correction 后地位 |
|---|---|---|
| `B-contract SHA` | `a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8` | superseded input；不得授权 C4 |
| `B-schema-expand SHA` | `53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874` | 000185–000190 历史基础；必须与 000194 correction handoff 一起消费 |
| `B-property-foundation-runtime SHA` | `19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a` | 代码基线；必须对新 B-contract 重新 attest |
| `B-approval-runtime SHA` | `79691ea945e5c37ddd075ff4e234dbb00eec084ede2b36717393360344e2270d` | B-1 代码基线；receipt port 后必须重新冻结 |

本阶段不包含真人 UAT、生产发布、生产 enforce、生产岗位授权或业务/财务/安全负责人签署。
任何技术 PASS 都不得表述为 production ready。

## 2. 发现清单

| ID | 级别 | 发现 | 实施风险 |
|---|---|---|---|
| F-01 | P1 | Runtime 仅允许 `claimed/in_progress/blocked -> closed`，Product 要求 source success 关闭任一 active assignment，active 又包含 `open` | source terminal 与 claim 竞争没有唯一 winner |
| F-02 | P1 | `requiredPermissions[]` 只能表达 AND，不能表达 release/unblock 的 assignee/supervisor OR | supervisor-only 被错误拒绝，或 controller 绕过 manifest |
| F-03 | P1 | Identity/control freeze 仍含 occupancy `:id`，其他权威已使用 `:occupancyId` | 四输入 exact join 自相矛盾 |
| F-04 | P1 | source eligibility 只有文字要求，没有 resolver、registry、task-key occurrence 合同 | projector/claim 必须自行发明 source 语义 |
| F-05 | P1 | Shared 缺 task list/detail/rebuild response；000188 只有 assignment/audit，没有可版本化 projection authority | rebuild 与 `expectedProjectionVersion` 无法落地 |
| F-06 | P1 | source terminal 时 assignee/token/epoch/timestamp/blocked 字段处理未冻结 | stale owner fencing 和终态数据会漂移 |
| F-07 | P1 | Task PRD/design 的告警字段与 Runtime 的安全字段边界冲突 | 形成第二套 alert wire，并可能泄漏内部信息 |
| F-08 | P1 | mutation receipt 有统一表合同，但 B-1 没有窄 port；多个调用方直接重复 receipt 生命周期 | B-2a 会成为第四套 receipt 实现 |
| F-09 | P1 | `task.enforce` 等 disabled control 仍绑定旧 B-contract hash | 新合同与实际 control metadata 不一致 |
| F-10 | P2 | `B-property-task-runtime SHA` 没有 byte grammar | handoff 不可跨实现者稳定复算 |

首轮 correction Gate 结论是 `P0=0, P1=9, P2=1`。本文件此前依次形成 third、fourth、
fifth、sixth、seventh-review candidate，均未取得 C0 三方 signoff；第八版修正第八轮唯一 P1，
第九版写入同步方案 A，仍未取得 signoff。第九轮架构复核又发现 source-terminal receipt identity
与 durable replacement audit CHECK 两项 P1；第十版逐项修正后，第十轮复核只留下 terminal
`expectedAssignmentVersion` predicate 一项 P1；第十一版修正后，第十一轮复核只留下 §6 completed
replay 旧总则歧义。本版仅消除该歧义并形成 twelfth-review candidate，尚未经第十二轮三方复核，**不得**写
`C0_open_P0_P1=[]`、PASS 或 implementation release；当前仍为
`implementation_release=blocked`。

## 3. 权威层次

修正后仍只有以下权威层次：

1. `b0-runtime-contract-freeze.md`：状态、transition、锁序、assignment/source authority、
   receipt、alert envelope 和 runtime handoff grammar。
2. `b0-product-access-freeze.md`：canonical surface、岗位、字段 projection、permission/scope
   产品语义和 Web 可见性。
3. `b0-identity-control-freeze.md`：Identity 与共享 control API、全局锁序和 occupancy
   canonical token。
4. `b0-schema-physical-addendum.md`：endpoint manifest row schema、物理对象、constraint、
   index、catalog/hash grammar 和 migration ownership。
5. `packages/shared/src/property-business/**`：上述四输入的机械实现；不得自行补语义。
6. 本任务 `prd.md/design.md/implement.md`：只记录 owner、依赖、批次和 Gate 引用；不得重抄
   状态表、字段表、permission OR、alert 或 hash grammar。

发生冲突时停止实施并回到 C1 联合复审，不允许实现者按“更合理的一边”继续。

## 4. 唯一 Canonical 决策

### 4.1 Source success 与六状态

Assignment 状态 exact-set 保持：

```text
open, claimed, in_progress, blocked, closed, cancelled
```

唯一 transition matrix 为：

```text
open -> claimed
claimed -> in_progress
in_progress -> blocked
blocked -> in_progress
claimed/in_progress/blocked -> open
open/claimed/in_progress/blocked -> closed       # owning source success
open/claimed/in_progress/blocked -> cancelled    # owning source cancel/reject/void/delete
```

`closed/cancelled` terminal。选择 `open -> closed` 是因为 source 是业务完成权威，source
可以在 assignment 被领取前成功；assignment 不能迫使已成功 source 等待领取。

### 4.2 `authorizationAlternatives`

Access 分为通用 endpoint row 与 tagged source descriptor，禁止把 domain 字段塞回每个
endpoint：

```ts
interface PropertyTaskEndpointAccess {
  requiredPermissions: readonly string[];
  authorizationAlternatives: readonly {
    requiredPermissions: readonly string[];
    actorPredicate: "current-assignee" | "queue-supervisor";
  }[];
}
type PropertyTaskSourceAccessDescriptor =
  | { tag: "workspace"; sourceType: string; requiredModules: readonly string[];
      surfaceId: string; pagePermission: string; queueCode: string;
      domainRoute: string; sourceDetailPermission: string; }
  | { tag: "internal-rebuild"; sourceType: "internal"; requiredModules: readonly ["asset"];
      maintenanceScope: "current-park"; requiredPermission: "property_task:rebuild"; };
```

该类型只冻结 descriptor schema，不签署任何 production descriptor 值。C4 只交付 resolver
registry/runtime core，不注册真实 source；homestay、housing、property、approval、identity、
turnover、work-order 的 descriptor/resolver/projector 全部由 B-2c/domain adapter downstream
各自重签后注册，未注册一律 fail closed，不得猜测 source 语义。测试只能使用前缀为
`test_fixture_` 的 sourceType/surface/queue/permission/module/route，fixture 必须位于 test-only
编译边界且不得进入 production bundle、module provider 或 startup registry。

普通 task visibility 不要求 `sourceDetailPermission`：workspace list/detail base
read 只要求 current user-park、全部 active modules、surface/page 与 queue scope；
`canReadSourceDetails` 才检查 sourceDetailPermission，并控制 sourceId/deepLink/outcome 等。
Internal rebuild 只要求 asset active + current park + internal maintenance identity +
`property_task:rebuild`，没有伪造 page/surface/queue，也绝不进入普通 Web discovery。

Endpoint 授权公式固定为：

```text
all(row.requiredPermissions)
AND (
  row.authorizationAlternatives is empty
  OR exists one alternative where
     all(alternative.requiredPermissions) AND actorPredicate is true
)
AND authorizeTaskRead(current authority, endpoint, descriptor)
```

数组去重并按 UTF-8 byte 升序；alternative 按
`actorPredicate + TAB + joined requiredPermissions` 的 UTF-8 bytes 排序。空 permission
alternative、重复 alternative 和未知 predicate 均使 manifest Gate 失败。

两条特殊 row 固定为：

```text
property.task.release:
  requiredPermissions=[]
  alternatives=
    property_task:release + current-assignee
    property_task:supervise + queue-supervisor

property.task.unblock:
  requiredPermissions=[]
  alternatives=
    property_task:process + current-assignee
    property_task:supervise + queue-supervisor
```

其余 endpoint 的 `authorizationAlternatives=[]`，原 `requiredPermissions` 保持 AND。
不新增 `/supervise` endpoint、`property.task.supervise` allowedAction 或 generic manage
旁路。49-row endpoint count 保持不变，但 row schema 和 manifest SHA 必须重签。

唯一 evaluator contract：

```ts
interface PropertyTaskAccessEvaluator {
  authorizeTaskRead(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor;
    sourceId: string;
  }): Promise<boolean>;
  canReadSourceDetails(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    descriptor: Extract<PropertyTaskSourceAccessDescriptor,{tag:"workspace"}>;
    sourceId: string;
  }): Promise<boolean>;
  authorizeCommand(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    actor: CurrentPropertyActor;
    endpoint: PropertyTaskEndpointAccess;
    descriptor: PropertyTaskSourceAccessDescriptor;
    sourceId: string;
    action: PropertyTaskAction;
    relation: "unassigned" | "current-assignee" | "queue-supervisor";
    sourceLifecycle: "eligible" | "succeeded" | "cancelled";
  }): Promise<boolean>;
}
```

两条 OR 分支都必须满足 active modules、current user-park、task-read 和 queue-scope；
`queue-supervisor` 只由 evaluator 基于 `queueCode` 与当前 scope 判断，controller/resolver
不得自判。`allowedActions` 必须调用同一个 `authorizeCommand`，不得复制 permission 逻辑。
Projection access cache 仅供候选筛选，永不成为授权权威。

`allowedActions` exact 顺序为 `property.task.claim,property.task.start,property.task.block,
property.task.unblock,property.task.release` 的子序列，矩阵如下；只有 lifecycle=`eligible`
才可能非空：
表中“允许”仍以 evaluator 的完整 module/user-park/source/queue/permission 判断为前提：

| 状态 | actor relation | permission alternative | allowedActions |
|---|---|---|---|
| `open` | `unassigned` | `property_task:claim` | `property.task.claim` |
| `claimed` | `current-assignee` | `property_task:process` | `property.task.start` |
| `claimed` | `current-assignee` | `property_task:release` | `property.task.release` |
| `claimed` | `queue-supervisor` | `property_task:supervise` | `property.task.release` |
| `in_progress` | `current-assignee` | `property_task:process` | `property.task.block` |
| `in_progress` | `current-assignee` | `property_task:release` | `property.task.release` |
| `in_progress` | `queue-supervisor` | `property_task:supervise` | `property.task.release` |
| `blocked` | `current-assignee` | `property_task:process` | `property.task.unblock` |
| `blocked` | `current-assignee` | `property_task:release` | `property.task.release` |
| `blocked` | `queue-supervisor` | `property_task:supervise` | `property.task.unblock,property.task.release` |
| `closed/cancelled` | any | none | empty |

没有列出的组合或 non-eligible lifecycle 返回 empty；`property.task.supervise`、
`property.task.rebuild` 永不出现在 `allowedActions`。

### 4.3 Occupancy canonical token

所有当前 canonical control route 统一为：

```text
GET  /property/occupancies/:occupancyId
POST /property/occupancies/:occupancyId/release
```

Identity freeze §6、§8.1 的 `:id` 必须改为 `:occupancyId`。历史已应用 migration 中的
`:id` 不编辑；用于证明 drift fail-closed 的 negative fixture 也保留，并明确标记为
legacy/drift input，不能被检索器误判为 canonical route。

### 4.4 Resolver、registry 与 `task-key-v1`

API runtime 的唯一 source port：

```ts
interface PropertyTaskSourceResolver {
  readonly sourceType: string;
  readonly taskKind: string;
  readonly assignmentAuthority: "owning" | "derived";
  readonly access: PropertyTaskSourceAccessDescriptor;

  lockAndResolve(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    sourceId: string;
    businessOccurrenceKey: string;
    expectedSourceVersion: number;
    taskKey: string;
  }): Promise<PropertyTaskSourceSnapshot | null>;

  invokeOwningCommand?(input: PropertyTaskOwningCommandInput): Promise<void>;
}

interface PropertyTaskProjectorSource {
  readonly sourceType: string;
  readonly taskKind: string;
  scanCandidates(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    after: { sourceId: string; businessOccurrenceKey: string } | null;
    limit: number; // 1..500
  }): Promise<{
    items: readonly PropertyTaskSourceSnapshot[];
    next: { sourceId: string; businessOccurrenceKey: string } | null;
  }>;
}
```

Registry key 是 exact `(sourceType, taskKind)`；重复注册、空值、TAB/LF 或同 key 不同
`assignmentAuthority/access` 在 module startup 时失败。`scanCandidates` 只能由 projector
调用，固定按 lowercase UUID `sourceId` bytes ASC、再按 `businessOccurrenceKey` UTF-8 bytes
ASC，以 exclusive cursor 翻页；同一 snapshot 中 `next` 是最后一项的二元组，空页必须
返回 null。`PropertyTaskListQuery` 只进入 projection repository 的 API read path，禁止
进入 resolver/projector，也禁止 projection 根据 UI filter 决定是否生成。

`PropertyTaskSourceSnapshot` exact 冻结：

```text
sourceId UUID
sourceVersion positive integer
lifecycle eligible | succeeded | cancelled
businessOccurrenceKey non-empty, no TAB/LF
title / kindLabel / sourceLabel
priority integer 0..100
dueAt timestamptz nullable
sourceDeepLink nullable allowlisted domainRoute
owningAssignment nullable standard projection
```

`lockAndResolve` 必须使用调用方 `EntityManager`。Scope 外或不存在返回安全 not-found；
resolver 返回值必须逐字匹配输入的 occurrence、expected source version 和重算 taskKey，
否则映射现有 `property-version-conflict`；scope/not-found 映射现有
`property-resource-not-found`，权限映射现有 `property-action-forbidden`，resolver/registry
不可用映射现有 `property-runtime-unavailable`。C1 必须冻结 recovery/status golden，不新增
未签 error code。`eligible` 才允许 claim；`succeeded/cancelled` 在相同
source→assignment 锁序内推动 closed/cancelled，不能由前端判断。

`task_key_version=1` 的唯一 bytes：

```text
task-key-v1\n
<sourceType><TAB><sourceId lowercase UUID><TAB><taskKind><TAB><businessOccurrenceKey>\n
```

UTF-8、LF-only、最终 LF；四个值都不得含 TAB/LF。`task_key` 是上述 bytes 的 lowercase
SHA-256。标题、assignee、当前时间和 projection row ID 不得参与。

`taskId` 是稳定 UUIDv5：namespace 固定
`7b2df21d-6bb8-5e2f-a04f-a3ebf43f04a7`，name bytes exact 为
`task-id-v1\n<task_key lowercase hex>\n`（UTF-8/LF-only/final LF）。同 taskKey 在 fresh、
rerun、rebuild 和分页中必须得到同一 taskId；禁止随机 UUID 或 projection row id 充当
taskId。

- `assignmentAuthority=derived`：source command/event 显式创建 assignment；active unique
  决定 one-winner。Projection rebuild 不创建、删除、重置或重新分配 assignment。
- `assignmentAuthority=owning`：approval、identity、turnover、work-order 等只投影 owning
  assignment。Mutation 委托 `invokeOwningCommand`，不得写
  `biz_property_task_assignment` 副本。

Internal rebuild 静态 route 必须先于参数 route 注册：
`POST /property/tasks/internal/rebuild` 不能被 `/:taskId` 捕获；所有 `:taskId` controller
入口先做 UUID validation。不存在 generic Web `/property/tasks/<uuid>`；Web deep-link 只由
已签 downstream workspace descriptor 的 `[taskId]` builder 生成 domain route，不得拼接
sourceId；C4 core 没有 production builder。未注册 builder、占位符残留或 route collision
使 C1/C4 Gate 失败。

### 4.5 Task wire

Shared 必须导出以下 exact wire；`IsoDateTime` 是带时区、毫秒三位、UTC `Z` 的
`YYYY-MM-DDTHH:mm:ss.sssZ`，所有 UUID 输出 lowercase canonical。`null` 必须显式返回；
只有标成 `?` 的条件字段可以 omitted。未知 key 由 response golden 拒绝。

```ts
type PropertyTaskAction =
  | "property.task.claim" | "property.task.start" | "property.task.block"
  | "property.task.unblock" | "property.task.release";
type PropertyTaskStatus =
  | "open" | "claimed" | "in_progress" | "blocked" | "closed" | "cancelled";
type IsoDateTime = string;

interface PropertyTaskListResponse {
  items: readonly PropertyTaskListItem[];
  page: number;       // integer >= 1
  pageSize: number;   // integer 1..100
  total: number;      // integer >= 0
}

interface PropertyTaskListItem {
  taskId: string;
  assignmentAuthority: "owning" | "derived";
  taskKind: string;
  kindLabel: string;
  sourceType: string;
  sourceLabel: string;
  title: string;
  priority: number;
  dueAt: IsoDateTime | null;
  assignmentStatus: PropertyTaskStatus;
  assignmentVersion: number;
  assigneeDisplay: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  allowedActions: readonly PropertyTaskAction[];
  blockedReason?: string; // present iff blocked AND canReadSourceDetails; otherwise omitted
}

interface PropertyTaskDetailResponse extends PropertyTaskListItem {
  sourceId?: string; // iff canReadSourceDetails
  sourceDeepLink?: string | null; // present with sourceId; allowlisted route or null
  claimedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  blockedUntil: IsoDateTime | null;
  outcome?: {
    code: string;
    sourceVersion: number;
    at: IsoDateTime;
  }; // present iff terminal AND canReadSourceDetails; otherwise omitted
}

interface PropertyTaskClaimRequest {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
}
interface PropertyTaskStartRequest {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
}
interface PropertyTaskBlockRequest {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
  reason: string;
  blockedUntil: IsoDateTime | null;
}
interface PropertyTaskUnblockRequest {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
}
interface PropertyTaskReleaseRequest {
  clientKey: string;
  expectedAssignmentVersion: number;
  expectedSourceVersion: number;
  businessOccurrenceKey: string;
  reason: string;
}
interface PropertyTaskMutationResponse {
  task: PropertyTaskDetailResponse;
  replayed: boolean;
  replayedResultRef: string | null;
  originalResultVersion: number;
}

interface PropertyTaskRebuildRequest {
  clientKey: string;
  sourceType: string;
  sourceId: string;
  expectedProjectionVersion: number;
  reason: string;
}
interface PropertyTaskRebuildResponse {
  sourceType: string;
  sourceId: string;
  previousProjectionVersion: number;
  projectionVersion: number;
  projectedTaskCount: number;
  assignmentMutationCount: 0;
  replayed: boolean;
  replayedResultRef: string | null;
  originalResultVersion: number;
}
```

五个 mutation response 使用同一 `PropertyTaskMutationResponse`；不存在 action-specific
宽松对象。所有成功 payload 只由现有 shared `ApiResponse<T>` / `ResponseInterceptor`
包装，错误只由现有 `ApiExceptionFilter` 和 `PropertyErrorCode` wire 输出；task module
不得另造 success/error envelope。

`assigneeDisplay` 是经授权的当前人员 display label 或 null，绝不回退为 UUID。
`sourceId/sourceDeepLink/outcome/blockedReason` 均由 `canReadSourceDetails` 控制；
`blockedReason` 还必须满足 `assignmentStatus === "blocked"`，否则 omitted。Outcome code 必须来自
已签 downstream source registry（C4 test 只能来自 `test_fixture_*`）且匹配
`^[a-z][a-z0-9-]{0,63}$`，未知 code fail closed；deepLink 必须来自 shared
descriptor schema 与 downstream workspace registry/builder。不得返回 claimToken、claimEpoch、内部 payload、worker 或 raw
eligibility snapshot。`allowedActions` 按 §4.2 固定顺序。

Receipt action/resultRef closed grammar 按 replace mode 固定：

| mode | command action exact | resultRef exact |
|---|---|---|
| `manual-rebuild` | `property.task.rebuild` | `property-task-rebuild/<sourceType>/<lowercase sourceId>/v<projectionVersion>` |
| `authority-sync` | `property.task.claim\|start\|block\|unblock\|release` | `property-task/<lowercase receipt target taskId>/v<assignmentVersion>` |
| `authority-sync` | `property.task.source-terminal.closed\|property.task.source-terminal.cancelled` | `property-task-source-terminal/<sourceType>/<lowercase sourceId>/<closed\|cancelled>/v<sourceVersion>` |

所有 version 都是 positive integer，`sourceType` 匹配 `^[a-z][a-z0-9_]{0,63}$`。Action 必须与
receipt `action_id` exact，target 必须与 receipt `target_id` exact；未知 mode/action/prefix 或
mode/action 交叉组合 fail。HTTP command `resultVersion` 始终是 assignment/source 业务版本，
不得偷换成 projection version；只有 manual rebuild response 的 `projectionVersion` 与其
resultRef version 使用 projection generation。List 与 count 必须在同一 repeatable-read scope
snapshot 使用同一 repository predicate/builder。

Replacement audit 的 `business_result_version` 逐行保存上述 receipt/HTTP 业务结果版本且必须为
positive integer；manual-rebuild 时它等于 `to_projection_version`，command 时等于 post-mutation
assignment version，terminal 时等于 locked source version。DB row CHECK 能逐字绑定 manual 与
closed/cancelled 的 source/type/id/terminal/version resultRef，并能绑定 command resultRef 的 UUID
shape 与 version；但 command receipt target taskId 是跨表数据，不能由单行 CHECK 证明，只能由唯一
replace function SELECT 已锁 receipt 后强制 `receipt.target_id` 与 resultRef/task row exact。C2/C4
不得把这项 function-enforced target binding 误报为 DB-row CHECK 或独立 principal 隔离。
Manual audit reason 保留 request 的非空 reason；authority-sync audit reason 不接受客户端文本，
固定为 `authority-sync:<commandAction>`。

HTTP/error matrix 的 `PropertyErrorData` exact 为 `{ errorCode:string,retryable:boolean,
recoveryAction?:string, latestVersion?:number, details:object }`；字段位于现有 error envelope 的 `data`，无 extra key，
`details` 再按每行 allowlist 过滤。只允许以下 canonical code/status/data，不得新增 alias：

| 条件 | HTTP/code | exact `PropertyErrorData` |
|---|---|---|
| claim 锁定后发现 assignment 已被另一 actor 领取 | `409 task-already-claimed` | `{errorCode:"task-already-claimed",retryable:false,recoveryAction:"property.task.refresh",details:{assigneeDisplay:string\|null}}`；display 已授权过滤 |
| 锁定 source 后 lifecycle 非 `eligible` | `409 task-source-ineligible` | `{errorCode:"task-source-ineligible",retryable:false,recoveryAction:"property.task.return-to-workspace",details:{deepLink:string\|null}}`；deepLink 必须已授权 |
| assignment version CAS loser | `409 task-version-conflict` | `{errorCode:"task-version-conflict",retryable:true,recoveryAction:"property.task.reload",latestVersion:<required positive integer>,details:{}}` |
| `expectedSourceVersion !== lockedSourceVersion` | `409 property-version-conflict` | `{errorCode:"property-version-conflict",retryable:true,recoveryAction:"reload",details:{}}`；逐字消费 runtime/product freeze |
| resolver/registry/receipt same-key recovery 暂不可用 | `503 property-runtime-unavailable` | `{errorCode:"property-runtime-unavailable",retryable:true,recoveryAction:"retry-with-same-client-key",details:{}}`；逐字消费 approval producer |
| authority/scope/module/page/queue/permission 缺失 | `403 property-action-forbidden` | `{errorCode:"property-action-forbidden",retryable:false,details:{}}`，`recoveryAction` omitted |
| 已通过 read authority 但 scope 内资源不存在 | `404 property-resource-not-found` | `{errorCode:"property-resource-not-found",retryable:false,details:{}}`，`recoveryAction` omitted |

403/404 的 body shape、message 与 timing Gate 必须证明 no-existence-leakage；所有行逐字复用
现有 `PropertyErrorCode`，未知 data field、details extra、未签拼写或 compatibility alias 都是
stop-ship。

Filter 的 recoveryAction closed exact allowlist 仅为：已签 legacy/global
`reload,retry-with-same-client-key,party.identity.update-draft`，以及 task 专用
`property.task.refresh,property.task.return-to-workspace,property.task.reload`。不得接受
`property.task.retry-same-client-key`，不得要求所有 token dotted，也不得用 action/generic regex
扩张集合。Global error 只使用 legacy/global token；只有 task 专用 error 可使用
`property.task.*`。

### 4.6 Terminal fencing 与字段清理

所有 transition 都使用 assignment `version` CAS；用户 DTO 不接受 claim token/epoch。
字段矩阵固定为：

| Transition | version | epoch/token | assignee | 时间/阻塞/outcome |
|---|---|---|---|---|
| `open -> claimed` | `+1` | epoch `+1`、新 token | 当前 actor | 写 DB `claimedAt`；其余 active/outcome 字段清空 |
| `claimed -> in_progress` | `+1` | 保持 | 保持 | 首次写 `startedAt` |
| `in_progress -> blocked` | `+1` | 保持 | 保持 | reason 非空；`blockedUntil` nullable |
| `blocked -> in_progress` | `+1` | 保持 | 保持 | 清空 blocked fields |
| active claimed 状态 `-> open` | `+1` | epoch 保持、token 清空 | 清空 | 清 claimed/start/blocked/outcome |
| 任一 active `-> closed/cancelled` | `+1` | epoch 保持、token 清空 | 清空 | 保留历史 claimed/start；清 blocked；写完整 outcome |

Epoch 只增不减、不复用；release/terminal 不增加 epoch。Active exact-set 只能是
`open,claimed,in_progress,blocked`。Terminal 后所有用户 assignment mutation 均拒绝。
用户 command fence exact 为 scope + current actor relation + businessOccurrenceKey + taskKey
+ `expectedSourceVersion` + `expectedAssignmentVersion`；token 仅为数据库内部 claim
ownership marker，永不进入 Web。

Source terminal input 必须同时携带 `terminalActorId/businessOccurrenceKey/taskKey/sourceVersion/
expectedAssignmentVersion/outcomeCode/outcomeAt`。`terminalActorId` 必须是 lowercase UUID，且只能来自
downstream resolver/event 已签并可验证的原始 authenticated actor，或已注册 service principal；禁止
用当前 worker、投影器或默认系统账号替代。C4 production registry 仍 exact-empty，只允许
`test_fixture_*` registry 提供测试 actor/service principal。Receipt identity 逐字固定为：
`actorId=terminalActorId`、`targetId=sourceId`、`actionId=property.task.source-terminal.<terminal>`，
其中 terminal 只能是 `closed|cancelled`，identity 必须是
`{tag:"property-task",businessOccurrenceKey,taskKey}`。

Terminal `clientKey` 的 exact grammar 是 `ptst-v1:<lowercase sha256>`，总长 72 ASCII chars，
因此机械满足 receipt 的 `<=128 chars`。SHA-256 输入 canonical bytes 逐字为：

```text
property-task-source-terminal-client-key-v1\n
<tenantId><TAB><parkId><TAB><terminalActorId><TAB><sourceType><TAB><sourceId><TAB><businessOccurrenceKey><TAB><taskKey><TAB><terminal><TAB><sourceVersion><TAB><outcomeCode><TAB><outcomeAt>\n
```

这里 `terminalActorId/sourceId` 是 lowercase UUID，`taskKey` 是 64 lowercase hex，
`sourceVersion` 是无前导零 positive safe integer，`terminal` exact `closed|cancelled`，
`outcomeAt` exact UTC `YYYY-MM-DDTHH:mm:ss.sssZ`，`sourceType/outcomeCode` 使用本合同各自 regex。
`tenantId/parkId/businessOccurrenceKey` 必须为已签非空 UTF-8 字符串；所有字符串字段拒绝 CR、LF、TAB、
NUL、无效 UTF-8 与 normalization 替换，canonical bytes 必须 UTF-8/LF-only/final-LF，不做 trim、case-fold
或 Unicode normalization。尖括号只是说明，不进入 bytes。

`expectedAssignmentVersion` **有意不进入 clientKey**：同一 source terminal event 只能有一个稳定
unique key，而原始 pre-mutation assignment version 由下述锁后 predicate 先消歧，并由包含该字段的
exact `requestHash` 冻结完整请求。通过 predicate 后，`existing-only` 仍必须 exact 比对 requestHash，
不得因 clientKey 相同而宽松 replay。

Terminal `requestHash` 必须复用 B-1 已有 sorted-key helper，对以下 exact object（无 extra key）
规范化后 JSON bytes 做 SHA-256；key 名、值类型逐字冻结：

```ts
type PropertyTaskSourceTerminalRequestV1 = {
  schemaVersion: "property-task-source-terminal-v1";
  tenantId: string;
  parkId: string;
  terminalActorId: string; // lowercase UUID
  actionId:
    | "property.task.source-terminal.closed"
    | "property.task.source-terminal.cancelled";
  targetId: string; // exact lowercase sourceId UUID
  sourceType: string;
  sourceId: string; // lowercase UUID
  businessOccurrenceKey: string;
  taskKey: string; // 64 lowercase hex
  terminal: "closed" | "cancelled";
  sourceVersion: number; // positive safe integer
  expectedAssignmentVersion: number; // positive safe integer
  outcomeCode: string;
  outcomeAt: string; // exact UTC millisecond ISO
};
```

`actionId` 必须由 terminal 机械映射，`targetId===sourceId`，scope/actor/source/type/id/
occurrence/taskKey/terminal/sourceVersion/outcomeCode/outcomeAt 与 clientKey canonical input 必须逐字相同。
先锁 source/advisory，再按 assignment UUID 排序锁 assignment。规则固定：

Terminal replay/冲突判定对 sourceVersion、terminal、outcome、occurrence 和 taskKey 一律使用
strict `===`，不得使用 coercive equality。

- active 且 `incomingSourceVersion === lockedSourceVersion`，并与 occurrence/taskKey 一致：receipt
  access 前必须满足 `Number.isSafeInteger(incomingExpectedAssignmentVersion)`、值为正、locked active
  assignment version 也是 positive safe integer、`incomingExpectedAssignmentVersion ===
  lockedAssignmentVersion`，且 locked version `< Number.MAX_SAFE_INTEGER` 以保证真实 terminal mutation
  恰好安全地 `version + 1`。任一失败返回 `property-version-conflict` 且 receipt access count=0。
  全部 authority/fence 校验通过后才以 `acquireMode="execute-or-replay"` 取得 terminal receipt；只有
  execute branch 才 CAS 一次进入目标 terminal，affected 必须为 1 且 post-mutation version 必须逐字
  等于 pre-mutation version `+1`；如果 active authority 却回读 completed receipt，视为
  authority/receipt drift 并 fail closed，零 mutation，不得假装 replay；`<` 或 `>` 都
  conflict/reconcile；
- 已在同一 terminal、同 outcomeCode/outcomeAt、同 sourceVersion、同 occurrence/taskKey：只能以
  `acquireMode="existing-only"` 回读上述 exact terminal receipt，但 receipt access 前必须满足 incoming
  expected version 与 locked terminal version 均为 positive safe integer、incoming expected version
  `< Number.MAX_SAFE_INTEGER`，并且 `incomingExpectedAssignmentVersion + 1 ===
  lockedTerminalAssignmentVersion`；它表达原始请求的 pre-mutation version。传 current terminal
  version、current-2、0、负数、非整数、非 safe integer 或会溢出的值都先返回已签
  `property-version-conflict`，receipt access count=0，且零 receipt 读写/业务/projection/audit mutation。
  Predicate 通过后才 existing-only；Absent、started 或 failed 必须 fail closed，且零 INSERT/UPDATE/
  assignment audit/replacement audit；只有 completed 且完整 identity/requestHash/resultHash exact 才
  返回 replay；
- terminal 类型不同、sourceVersion `<`/`>` 当前锁定 version、同 version 不同 outcome，或
  occurrence/taskKey/expected assignment version 不符：必须在 receipt access 之前按 authority
  conflict 返回 `property-version-conflict`，零新 receipt；
- 任何 old/out-of-order event 都不得把 terminal 改回 active 或覆盖 outcome。

Source terminal、用户 mutation和 rebuild 共同服从 §6 全局锁序；禁止先锁 assignment 再
回锁 source。每个真实 terminal mutation 写一条 assignment audit；same-terminal replay 只读
existing receipt，不得补建 receipt 或 audit。

### 4.7 `property-runtime-alert-v1`

唯一告警 envelope：

```ts
interface PropertyRuntimeAlertV1 {
  schemaVersion: "property-runtime-alert-v1";
  alertCode:
    | "property-task-projector-failed"
    | "property-task-terminal-conflict"
    | "property-task-receipt-stuck"
    | "property-task-control-drift";
  severity: "P0" | "P1" | "P2";
  tenantId: string;
  parkId: string;
  stableRef: { kind: string; id: string };
  errorCode: string;
  attempt: number | null;
  ageSeconds: number | null;
  traceId: string;
  runbookKey: string;             // 静态 allowlist key，不是 URL
}
```

只允许上述 keys。`errorCode` 与 `stableRef.kind` 匹配
`^[a-z][a-z0-9-]{0,127}$`，`stableRef.id/traceId` 匹配
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`，`attempt/ageSeconds` 非 null 时为非负整数。
`runbookKey` exact allowlist 映射由 `property-runtime-observability-owner` 在 C1 freeze/shared
持有：四个 alertCode 分别映射同名加 `-runbook` 后缀的静态 key；未知 code/key、自由文本
URL 或 runtime 拼接全部拒绝。禁止 payload、证件、银行/个人信息、request body、claim
token、hash 原文、数据库原错或 worker identity。Task `prd.md/design.md/implement.md` 删除
重复 alert 字段/allowlist，只引用 runtime freeze 与 shared 类型。

### 4.8 `B-property-task-runtime SHA`

唯一 grammar：

```text
b-property-task-runtime-v1\n
file<TAB><repo-relative-path><TAB><raw-file-sha256>\n
... path UTF-8 byte order ...
```

范围是 `apps/api/src/modules/property-tasks/**` 的全部 regular files，包括 specs 和该目录
内脚本；排除 coverage、dist、临时文件，禁止 symlink。零文件、重复 path、path 含 TAB/LF、
non-UTF-8、BOM、非 LF-only 或缺 final LF 均失败。每个 raw SHA 是 lowercase hex；整体
bytes 的 SHA-256 即唯一
`B-property-task-runtime SHA`。

唯一受支持 call-site manifest grammar：

```text
b-property-task-projection-callsite-v1\n
call<TAB><replaceMode><TAB><commandAction><TAB><repo-relative-path><TAB><exported-symbol>\n
... replaceMode + TAB + commandAction + TAB + path + TAB + symbol UTF-8 byte order ...
```

Manifest 必须 bilateral exact 覆盖一个 manual rebuild caller 与全部签署 command/terminal
authority-sync caller；mode/action 只允许 §4.5 closed set，path 必须位于
`apps/api/src/modules/property-tasks/**`，重复/额外/缺失 caller、direct SQL writer、TAB/LF/BOM、
非 LF-only/final-LF 都失败。Grammar bytes SHA-256 是
`B-property-task-projection-callsite SHA`。

Consumed SHA、base commit、validation evidence、known failures 和 `open_P0_P1` 放在独立
handoff sidecar，不混入 runtime content hash；sidecar 必须逐项列出并签署，且至少消费
`B-property-task-projection-schema SHA`、replace function definition sidecar SHA 与
`B-property-task-projection-callsite SHA`。

### 4.9 C1 contract / endpoint SHA grammar

所有 raw-file SHA 都是未经 newline normalization 的文件原始 bytes SHA-256。聚合输入
只接受 UTF-8、LF=`0x0a`、TAB=`0x09`、无 BOM、final LF；path/code 中禁止 TAB/LF，hash
是 lowercase 64 hex。

```text
b-contract-v2\n
freeze<TAB>b0-runtime-contract-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-product-access-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-identity-control-freeze.md<TAB><raw-file-sha256>\n
freeze<TAB>b0-schema-physical-addendum.md<TAB><raw-file-sha256>\n
```

顺序逐字固定，不排序。上述完整 bytes 的 SHA-256 才是新 `B-contract SHA`；shared 不参与，
因此 shared 写入 `B_CONTRACT_SHA` 常量后，再按 `b-shared-source-v1` 的 path/raw-SHA grammar
单独计算 shared source SHA，并只放 sidecar。Shared SHA 绝不反向进入 B-contract。Endpoint
manifest 单独 grammar：

```text
b-endpoint-manifest-v2\n
row<TAB><method><TAB><canonical-route><TAB><canonical-json-sha256>\n
... method + TAB + route UTF-8 byte order ...
```

`canonical-json-sha256` 的 JSON key order、array byte order 和 null/omitted 行为由 C1
shared golden 固定；必须恰好 49 row。旧 v1 hash/sidecar 只能列为 superseded input，不能
作为新 grammar 的 output 或消费证明。

### 4.10 `B-property-error-filter SHA`

Filter content hash 的 exact file set 只有以下两个 regular file，顺序固定：

```text
b-property-error-filter-v1\n
file<TAB>apps/api/src/shared/filters/api-exception.filter.ts<TAB><raw-file-sha256>\n
file<TAB>apps/api/src/shared/filters/api-exception.filter.spec.ts<TAB><raw-file-sha256>\n
```

输入必须为 UTF-8、LF-only、无 BOM、final LF；raw SHA 与整体 grammar bytes SHA 均为 lowercase
SHA-256。整体 bytes SHA 是唯一 `B-property-error-filter SHA`。Sidecar 不进入 content hash，
但必须列 consumed new B-contract/shared source SHA、base commit、owned exact files、filter unit/
HTTP exact/leak negative evidence、known failures 与 `open_P0_P1=[]`；两文件之外的 filter/helper
不得悄悄纳入或绕开该 handoff。

## 5. 固定物理对象与 000194

### 5.1 Migration ownership

Correction forward migration 固定为：

```text
000194_property_task_projection_contract_correction.sql
```

只允许唯一 `schema-migration-owner` 创建。不得修改：

- `000185`–`000190`；
- `000193`；
- 已有任何成功 migration。

`000191`/`000192` 继续保留给 B-2c effect schema，不得被 B-2a 抢占或改名。000194
落盘前仍必须重扫工作树和两张 migration history；发现编号占用、双 history 差异、
running/failed 或并行候选时立即 stop-ship，并回到父级重新协调，不能静默换号继续本计划。

C2 的独立 B-2a Gate 只执行/验证当时已交付的
`000185→000186→000187→000188→000189→000190→000193→000194` 链，并以 catalog/dependency
scan 证明 000194 对尚未交付的 000191/000192 零对象、零 history、零 checksum 依赖。缺少
191/192 在该隔离 Gate 不是失败，也不得补跑 placeholder；C2/B-2a 不等待 B-2c，避免 DAG
循环。000191 与 000192 各自由 B-2c 前对应 schema handoff 独立执行 Gate，仍须 forward-only
且不得编辑任何既有成功 migration。

待 C2 与两个 B-2c schema handoff 全部真实交付后，`000191–000194` 的 fresh-equivalence、
全链顺序/catalog/constraint/hash 复核唯一归 B-4 integration-reconcile。C2 不执行、声明或
冒充该全链 PASS；B-4 也不得把未来汇合证据倒填成 C2 当时证据。

`000190` compatibility checkpoint/evidence hash 是历史证据，不参与 projection/control
correction content hash，不更新、不重签、不被 000194 覆盖。

### 5.2 Exact object names

Task projection 物理对象只允许以下三个名称：

```text
biz_property_task_projection_head
biz_property_task_projection
biz_property_task_projection_rebuild_audit
```

不得创建 `task_queue`、`task_read_model`、materialized view 别名或第二套 assignment 表。

以下是三表完整 exact DDL；列、顺序、类型、长度、null/default、constraint/index 名都属于
catalog Gate。Projection **没有** `is_deleted`。

```sql
CREATE TABLE biz_property_task_projection_head (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  projection_version integer NOT NULL,
  content_hash char(64) NOT NULL,
  last_rebuilt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_rebuilt_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_head_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_head_source
    UNIQUE (tenant_id, park_id, source_type, source_id),
  CONSTRAINT uq_biz_property_task_projection_head_stable
    UNIQUE (tenant_id, park_id, id, source_type, source_id),
  CONSTRAINT ck_biz_property_task_projection_head_version
    CHECK (projection_version > 0),
  CONSTRAINT ck_biz_property_task_projection_head_hash
    CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idx_biz_property_task_projection_head_cas
  ON biz_property_task_projection_head
    (tenant_id, park_id, source_type, source_id, projection_version);

CREATE TABLE biz_property_task_projection (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  head_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_key char(64) NOT NULL,
  assignment_authority varchar(8) NOT NULL,
  derived_assignment_id uuid,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  source_version integer NOT NULL,
  business_occurrence_key varchar(256) NOT NULL,
  task_kind varchar(64) NOT NULL,
  queue_code varchar(128) NOT NULL,
  title varchar(500) NOT NULL,
  kind_label varchar(128) NOT NULL,
  source_label varchar(128) NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  assignment_status varchar(16) NOT NULL,
  assignment_version integer NOT NULL,
  assignee_id uuid,
  assignee_display varchar(200),
  claimed_at timestamptz,
  started_at timestamptz,
  blocked_reason varchar(1000),
  blocked_until timestamptz,
  outcome_code varchar(64),
  outcome_source_version integer,
  outcome_at timestamptz,
  source_deep_link varchar(512),
  projection_version integer NOT NULL,
  content_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_task
    UNIQUE (tenant_id, park_id, task_id),
  CONSTRAINT uq_biz_property_task_projection_occurrence
    UNIQUE (tenant_id, park_id, source_type, source_id, task_kind,
            business_occurrence_key),
  CONSTRAINT fk_biz_property_task_projection_head
    FOREIGN KEY (tenant_id, park_id, head_id, source_type, source_id)
    REFERENCES biz_property_task_projection_head
      (tenant_id, park_id, id, source_type, source_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_biz_property_task_projection_assignment
    FOREIGN KEY (tenant_id, park_id, derived_assignment_id)
    REFERENCES biz_property_task_assignment(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_property_task_projection_authority
    CHECK ((assignment_authority='derived' AND derived_assignment_id IS NOT NULL)
        OR (assignment_authority='owning' AND derived_assignment_id IS NULL)),
  CONSTRAINT ck_biz_property_task_projection_status
    CHECK (assignment_status IN
      ('open','claimed','in_progress','blocked','closed','cancelled')),
  CONSTRAINT ck_biz_property_task_projection_positive
    CHECK (source_version>0 AND assignment_version>0 AND projection_version>0
           AND priority BETWEEN 0 AND 100),
  CONSTRAINT ck_biz_property_task_projection_keys
    CHECK (task_key ~ '^[0-9a-f]{64}$'
       AND content_hash ~ '^[0-9a-f]{64}$'
       AND length(btrim(business_occurrence_key))>0
       AND business_occurrence_key !~ E'[\\t\\n\\r]'
       AND queue_code ~ '^[a-z][a-z0-9._:-]{0,127}$'),
  CONSTRAINT ck_biz_property_task_projection_blocked
    CHECK ((assignment_status='blocked')=(blocked_reason IS NOT NULL)),
  CONSTRAINT ck_biz_property_task_projection_open
    CHECK (assignment_status<>'open'
      OR (assignee_id IS NULL AND assignee_display IS NULL AND claimed_at IS NULL
          AND started_at IS NULL AND blocked_until IS NULL)),
  CONSTRAINT ck_biz_property_task_projection_active
    CHECK (assignment_status NOT IN ('claimed','in_progress','blocked')
      OR (assignee_id IS NOT NULL AND assignee_display IS NOT NULL
          AND claimed_at IS NOT NULL)),
  CONSTRAINT ck_biz_property_task_projection_lifecycle
    CHECK ((assignment_status<>'claimed'
            OR (started_at IS NULL AND blocked_reason IS NULL AND blocked_until IS NULL))
       AND (assignment_status<>'in_progress'
            OR (started_at IS NOT NULL AND blocked_reason IS NULL AND blocked_until IS NULL))
       AND (assignment_status<>'blocked' OR started_at IS NOT NULL)
       AND (assignment_status NOT IN ('closed','cancelled')
            OR (assignee_id IS NULL AND assignee_display IS NULL
                AND blocked_reason IS NULL AND blocked_until IS NULL))),
  CONSTRAINT ck_biz_property_task_projection_outcome
    CHECK ((assignment_status IN ('closed','cancelled'))=
      (outcome_code IS NOT NULL AND outcome_source_version IS NOT NULL
       AND outcome_at IS NOT NULL)
       AND (outcome_source_version IS NULL OR outcome_source_version>0)),
  CONSTRAINT ck_biz_property_task_projection_logical_time
    CHECK (updated_at>=created_at)
);
CREATE INDEX idx_biz_property_task_projection_head
  ON biz_property_task_projection
    (tenant_id, park_id, head_id, task_id);
CREATE INDEX idx_biz_property_task_projection_active_queue
  ON biz_property_task_projection
    (tenant_id, park_id, queue_code, assignment_status, priority DESC,
     due_at ASC NULLS LAST, task_id)
  WHERE assignment_status IN ('open','claimed','in_progress','blocked');
CREATE INDEX idx_biz_property_task_projection_assignee
  ON biz_property_task_projection
    (tenant_id, park_id, assignee_id, assignment_status, updated_at DESC, task_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_biz_property_task_projection_source
  ON biz_property_task_projection
    (tenant_id, park_id, source_type, source_id, task_kind,
     business_occurrence_key);

CREATE TABLE biz_property_task_projection_rebuild_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  head_id uuid NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  mutation_receipt_id uuid NOT NULL,
  replace_mode varchar(32) NOT NULL,
  command_action varchar(128) NOT NULL,
  from_projection_version integer NOT NULL,
  to_projection_version integer NOT NULL,
  business_result_version integer NOT NULL,
  projected_task_count integer NOT NULL,
  assignment_mutation_count integer NOT NULL DEFAULT 0,
  reason varchar(1000) NOT NULL,
  request_hash char(64) NOT NULL,
  result_ref varchar(512) NOT NULL,
  result_hash char(64) NOT NULL,
  content_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_biz_property_task_projection_rebuild_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_biz_property_task_projection_rebuild_audit_version
    UNIQUE (tenant_id, park_id, head_id, to_projection_version),
  CONSTRAINT fk_biz_property_task_projection_rebuild_audit_head
    FOREIGN KEY (tenant_id, park_id, head_id, source_type, source_id)
    REFERENCES biz_property_task_projection_head
      (tenant_id, park_id, id, source_type, source_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_biz_property_task_projection_rebuild_audit_receipt
    FOREIGN KEY (tenant_id, park_id, mutation_receipt_id)
    REFERENCES biz_property_mutation_receipt(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_version
    CHECK (from_projection_version>=0
       AND to_projection_version=from_projection_version+1
       AND business_result_version>0),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_counts
    CHECK (projected_task_count>=0 AND assignment_mutation_count=0),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_mode_action
    CHECK ((replace_mode='manual-rebuild' AND command_action='property.task.rebuild')
        OR (replace_mode='authority-sync' AND command_action IN
          ('property.task.claim','property.task.start','property.task.block',
           'property.task.unblock','property.task.release',
           'property.task.source-terminal.closed',
           'property.task.source-terminal.cancelled'))),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_result_ref
    CHECK ((replace_mode='manual-rebuild'
            AND command_action='property.task.rebuild'
            AND business_result_version=to_projection_version
            AND result_ref = 'property-task-rebuild/' || source_type || '/'
              || lower(source_id::text) || '/v' || business_result_version::text)
        OR (replace_mode='authority-sync'
            AND command_action IN
              ('property.task.claim','property.task.start','property.task.block',
               'property.task.unblock','property.task.release')
            AND result_ref ~ ('^property-task/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v'
              || business_result_version::text || '$'))
        OR (replace_mode='authority-sync'
            AND command_action='property.task.source-terminal.closed'
            AND result_ref = 'property-task-source-terminal/' || source_type || '/'
              || lower(source_id::text) || '/closed/v' || business_result_version::text)
        OR (replace_mode='authority-sync'
            AND command_action='property.task.source-terminal.cancelled'
            AND result_ref = 'property-task-source-terminal/' || source_type || '/'
              || lower(source_id::text) || '/cancelled/v' || business_result_version::text)),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_reason
    CHECK (length(btrim(reason))>0
       AND (replace_mode='manual-rebuild'
         OR reason='authority-sync:' || command_action)),
  CONSTRAINT ck_biz_property_task_projection_rebuild_audit_hashes
    CHECK (request_hash ~ '^[0-9a-f]{64}$'
       AND result_hash ~ '^[0-9a-f]{64}$'
       AND content_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idx_biz_property_task_projection_rebuild_audit_source
  ON biz_property_task_projection_rebuild_audit
    (tenant_id, park_id, source_type, source_id, occurred_at DESC, id);

CREATE FUNCTION fn_property_task_projection_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'property-task-projection-audit-immutable' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER trg_biz_property_task_projection_rebuild_audit_immutable
BEFORE UPDATE OR DELETE ON biz_property_task_projection_rebuild_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_task_projection_audit_immutable();

CREATE FUNCTION fn_property_task_projection_generation_exact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id varchar(64);
  v_park_id varchar(64);
  v_head_id uuid;
  v_source_type varchar(64);
  v_source_id uuid;
  v_head_version integer;
BEGIN
  IF TG_TABLE_NAME='biz_property_task_projection_head' THEN
    IF TG_OP='DELETE' THEN
      v_tenant_id := OLD.tenant_id; v_park_id := OLD.park_id; v_head_id := OLD.id;
      v_source_type := OLD.source_type; v_source_id := OLD.source_id;
    ELSE
      v_tenant_id := NEW.tenant_id; v_park_id := NEW.park_id; v_head_id := NEW.id;
      v_source_type := NEW.source_type; v_source_id := NEW.source_id;
    END IF;
  ELSE
    IF TG_OP='DELETE' THEN
      v_tenant_id := OLD.tenant_id; v_park_id := OLD.park_id; v_head_id := OLD.head_id;
      v_source_type := OLD.source_type; v_source_id := OLD.source_id;
    ELSE
      v_tenant_id := NEW.tenant_id; v_park_id := NEW.park_id; v_head_id := NEW.head_id;
      v_source_type := NEW.source_type; v_source_id := NEW.source_id;
    END IF;
  END IF;

  SELECT h.projection_version INTO v_head_version
    FROM biz_property_task_projection_head h
   WHERE h.tenant_id=v_tenant_id AND h.park_id=v_park_id
     AND h.id=v_head_id AND h.source_type=v_source_type
     AND h.source_id=v_source_id;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM biz_property_task_projection p
       WHERE p.tenant_id=v_tenant_id AND p.park_id=v_park_id
         AND p.head_id=v_head_id AND p.source_type=v_source_type
         AND p.source_id=v_source_id
    ) THEN
      RAISE EXCEPTION 'property-task-projection-head-missing' USING ERRCODE='23503';
    END IF;
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM biz_property_task_projection p
     WHERE p.tenant_id=v_tenant_id AND p.park_id=v_park_id
       AND p.head_id=v_head_id AND p.source_type=v_source_type
       AND p.source_id=v_source_id
       AND p.projection_version IS DISTINCT FROM v_head_version
  ) THEN
    RAISE EXCEPTION 'property-task-projection-generation-mismatch'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER trg_biz_property_task_projection_head_generation_exact
AFTER INSERT OR UPDATE OR DELETE ON biz_property_task_projection_head
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_property_task_projection_generation_exact();
CREATE CONSTRAINT TRIGGER trg_biz_property_task_projection_generation_exact
AFTER INSERT OR UPDATE OR DELETE ON biz_property_task_projection
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_property_task_projection_generation_exact();

REVOKE UPDATE, DELETE ON biz_property_task_projection_rebuild_audit FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON biz_property_task_projection_head FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON biz_property_task_projection FROM PUBLIC;
```

`biz_property_task_projection_rebuild_audit` 保留历史物理名称，但从 000194 起诚实定义为所有
受控 projection replacement 的 immutable audit；每次 `manual-rebuild` 或 `authority-sync`
成功 replace 都恰好写一行。`assignment_mutation_count=0` 只表示 replace function 本身不修改
assignment，不表示同 transaction 的先前 command/terminal 没有修改 assignment。Head 的历史
列名 `last_rebuilt_at/last_rebuilt_by` 同样表示最后一次受控 replacement，不只 manual rebuild。

000194 唯一 projection/head write entry function 的 exact 双-mode signature/body 与
least-exposure grant 为：

```sql
CREATE FUNCTION public.fn_property_task_projection_scalar_v1(
  p_value text, p_kind char(1)
) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN 'N'
    WHEN p_kind='I' AND p_value ~ '^(0|[1-9][0-9]*)$' THEN 'I' || p_value
    WHEN p_kind='S' THEN 'S' || octet_length(convert_to(p_value,'UTF8'))::text || ':' || p_value
    ELSE NULL
  END
$$;
REVOKE ALL ON FUNCTION public.fn_property_task_projection_scalar_v1(text,char)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_scalar_v1(text,char)
  TO CURRENT_USER;

CREATE FUNCTION public.fn_property_task_projection_row_hash_v1(
  p_row jsonb
) RETURNS char(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(digest(convert_to(
    'property-task-projection-content-v1' || E'\n'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskKey','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentAuthority','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'derivedAssignmentId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceType','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'businessOccurrenceKey','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'taskKind','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'queueCode','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'title','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'kindLabel','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceLabel','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'priority','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'dueAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentStatus','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assignmentVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assigneeId','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'assigneeDisplay','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'claimedAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'startedAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'blockedReason','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'blockedUntil','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeCode','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeSourceVersion','I') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'outcomeAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'sourceDeepLink','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'createdAt','S') || E'\t'
    || public.fn_property_task_projection_scalar_v1(p_row->>'updatedAt','S') || E'\n',
    'UTF8'),'sha256'),'hex')::char(64)
$$;
REVOKE ALL ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_row_hash_v1(jsonb)
  TO CURRENT_USER;

CREATE FUNCTION public.fn_property_task_projection_replace_v1(
  p_tenant_id varchar(64), p_park_id varchar(64),
  p_source_type varchar(64), p_source_id uuid, p_actor_id uuid,
  p_receipt_id uuid, p_replace_mode varchar(32), p_command_action varchar(128),
  p_result_version integer, p_expected_projection_version integer,
  p_request_hash char(64), p_result_ref varchar(512),
  p_result_hash char(64), p_reason varchar(1000), p_rows jsonb
) RETURNS TABLE(previous_projection_version integer,
                projection_version integer, projected_task_count integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE
  v_head_id uuid;
  v_previous integer;
  v_next integer;
  v_count integer;
  v_affected integer;
  v_content_hash char(64);
  v_receipt_action varchar(128);
  v_receipt_target uuid;
  v_receipt_actor uuid;
BEGIN
  IF p_source_id IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' THEN
    RAISE EXCEPTION 'property-task-projection-invalid-input' USING ERRCODE='22023';
  END IF;
  IF p_tenant_id IS NULL OR length(btrim(p_tenant_id))=0
     OR p_park_id IS NULL OR length(btrim(p_park_id))=0
     OR p_source_type IS NULL OR p_source_type !~ '^[a-z][a-z0-9_]{0,63}$'
     OR p_actor_id IS NULL OR p_receipt_id IS NULL
     OR p_replace_mode IS NULL OR p_replace_mode NOT IN ('manual-rebuild','authority-sync')
     OR p_command_action IS NULL
     OR NOT (
       (p_replace_mode='manual-rebuild'
        AND p_command_action='property.task.rebuild')
       OR
       (p_replace_mode='authority-sync' AND p_command_action IN
         ('property.task.claim','property.task.start','property.task.block',
          'property.task.unblock','property.task.release',
          'property.task.source-terminal.closed',
          'property.task.source-terminal.cancelled'))
     )
     OR p_result_version IS NULL OR p_result_version<=0
     OR p_expected_projection_version IS NULL OR p_expected_projection_version<0
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_result_hash IS NULL OR p_result_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR length(btrim(p_reason))=0
     OR (p_replace_mode='authority-sync'
         AND p_reason IS DISTINCT FROM ('authority-sync:' || p_command_action))
     OR p_result_ref IS NULL THEN
    RAISE EXCEPTION 'property-task-projection-invalid-input' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
     WHERE jsonb_typeof(e.value)<>'object'
  ) THEN
    RAISE EXCEPTION 'property-task-projection-row-shape' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
     WHERE (SELECT count(*) FROM jsonb_object_keys(e.value))<>30
        OR NOT (e.value ?& ARRAY[
          'taskId','taskKey','assignmentAuthority','derivedAssignmentId',
          'sourceType','sourceId','sourceVersion','businessOccurrenceKey',
          'taskKind','queueCode','title','kindLabel','sourceLabel','priority',
          'dueAt','assignmentStatus','assignmentVersion','assigneeId',
          'assigneeDisplay','claimedAt','startedAt','blockedReason','blockedUntil',
          'outcomeCode','outcomeSourceVersion','outcomeAt','sourceDeepLink',
          'contentHash','createdAt','updatedAt'])
  ) THEN
    RAISE EXCEPTION 'property-task-projection-row-shape' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
     WHERE jsonb_typeof(value->'taskId')<>'string'
        OR jsonb_typeof(value->'sourceId')<>'string'
        OR jsonb_typeof(value->'taskKey')<>'string'
        OR jsonb_typeof(value->'contentHash')<>'string'
        OR jsonb_typeof(value->'assignmentAuthority')<>'string'
        OR jsonb_typeof(value->'sourceType')<>'string'
        OR jsonb_typeof(value->'businessOccurrenceKey')<>'string'
        OR jsonb_typeof(value->'taskKind')<>'string'
        OR jsonb_typeof(value->'queueCode')<>'string'
        OR jsonb_typeof(value->'title')<>'string'
        OR jsonb_typeof(value->'kindLabel')<>'string'
        OR jsonb_typeof(value->'sourceLabel')<>'string'
        OR jsonb_typeof(value->'assignmentStatus')<>'string'
        OR jsonb_typeof(value->'sourceVersion')<>'number'
        OR jsonb_typeof(value->'assignmentVersion')<>'number'
        OR jsonb_typeof(value->'priority')<>'number'
        OR jsonb_typeof(value->'createdAt')<>'string'
        OR jsonb_typeof(value->'updatedAt')<>'string'
        OR jsonb_typeof(value->'derivedAssignmentId') NOT IN ('string','null')
        OR jsonb_typeof(value->'assigneeId') NOT IN ('string','null')
        OR jsonb_typeof(value->'outcomeSourceVersion') NOT IN ('number','null')
        OR jsonb_typeof(value->'dueAt') NOT IN ('string','null')
        OR jsonb_typeof(value->'claimedAt') NOT IN ('string','null')
        OR jsonb_typeof(value->'startedAt') NOT IN ('string','null')
        OR jsonb_typeof(value->'blockedUntil') NOT IN ('string','null')
        OR jsonb_typeof(value->'outcomeAt') NOT IN ('string','null')
        OR jsonb_typeof(value->'assigneeDisplay') NOT IN ('string','null')
        OR jsonb_typeof(value->'blockedReason') NOT IN ('string','null')
        OR jsonb_typeof(value->'outcomeCode') NOT IN ('string','null')
        OR jsonb_typeof(value->'sourceDeepLink') NOT IN ('string','null')
        OR NOT pg_input_is_valid(value->>'taskId','uuid')
        OR NOT pg_input_is_valid(value->>'sourceId','uuid')
        OR (value->>'derivedAssignmentId' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'derivedAssignmentId','uuid'))
        OR (value->>'assigneeId' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'assigneeId','uuid'))
        OR value->>'sourceVersion' !~ '^[1-9][0-9]*$'
        OR value->>'assignmentVersion' !~ '^[1-9][0-9]*$'
        OR value->>'priority' !~ '^(0|[1-9][0-9]*)$'
        OR (value->>'outcomeSourceVersion' IS NOT NULL
            AND value->>'outcomeSourceVersion' !~ '^[1-9][0-9]*$')
        OR NOT pg_input_is_valid(value->>'sourceVersion','integer')
        OR NOT pg_input_is_valid(value->>'assignmentVersion','integer')
        OR NOT pg_input_is_valid(value->>'priority','integer')
        OR (value->>'outcomeSourceVersion' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'outcomeSourceVersion','integer'))
        OR (value->>'dueAt' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'dueAt','timestamp with time zone'))
        OR (value->>'claimedAt' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'claimedAt','timestamp with time zone'))
        OR (value->>'startedAt' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'startedAt','timestamp with time zone'))
        OR (value->>'blockedUntil' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'blockedUntil','timestamp with time zone'))
        OR (value->>'outcomeAt' IS NOT NULL
            AND NOT pg_input_is_valid(value->>'outcomeAt','timestamp with time zone'))
        OR NOT pg_input_is_valid(value->>'createdAt','timestamp with time zone')
        OR NOT pg_input_is_valid(value->>'updatedAt','timestamp with time zone')
  ) THEN
    RAISE EXCEPTION 'property-task-projection-row-invalid' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT ordinality,
               (value->>'taskId')::uuid AS task_id,
               lag((value->>'taskId')::uuid) OVER (ORDER BY ordinality) AS prior_id
          FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(value,ordinality)
      ) ordered
     WHERE prior_id IS NOT NULL AND prior_id>=task_id
  ) THEN
    RAISE EXCEPTION 'property-task-projection-row-order' USING ERRCODE='22023';
  END IF;

  SELECT h.id,h.projection_version
    INTO v_head_id,v_previous
    FROM biz_property_task_projection_head h
   WHERE h.tenant_id=p_tenant_id AND h.park_id=p_park_id
     AND h.source_type=p_source_type AND h.source_id=p_source_id;
  IF FOUND THEN
    IF v_previous<>p_expected_projection_version THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
  ELSE
    IF p_expected_projection_version<>0 THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
    v_head_id := uuid_generate_v4();
    v_previous := 0;
  END IF;
  v_next := v_previous+1;

  SELECT r.action_id,r.target_id,r.actor_id
    INTO v_receipt_action,v_receipt_target,v_receipt_actor
    FROM biz_property_mutation_receipt r
   WHERE r.tenant_id=p_tenant_id AND r.park_id=p_park_id
     AND r.id=p_receipt_id AND r.receipt_status='started'
     AND r.request_hash=p_request_hash
     AND r.result_ref IS NULL AND r.result_hash IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property-task-projection-receipt-conflict' USING ERRCODE='40001';
  END IF;

  IF v_receipt_actor IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'property-task-projection-receipt-conflict' USING ERRCODE='40001';
  END IF;
  IF v_receipt_action IS DISTINCT FROM p_command_action THEN
    RAISE EXCEPTION 'property-task-projection-action-conflict' USING ERRCODE='22023';
  END IF;
  IF p_replace_mode='manual-rebuild' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id
       OR p_result_version<>v_next
       OR p_result_ref IS DISTINCT FROM ('property-task-rebuild/' || p_source_type || '/'
                           || lower(p_source_id::text) || '/v' || p_result_version::text) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSIF p_command_action IN
    ('property.task.claim','property.task.start','property.task.block',
     'property.task.unblock','property.task.release') THEN
    IF p_result_ref IS DISTINCT FROM ('property-task/' || lower(v_receipt_target::text)
                                      || '/v' || p_result_version::text)
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
          WHERE (value->>'taskId')::uuid=v_receipt_target
            AND (value->>'assignmentVersion')::integer=p_result_version
       ) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSIF p_command_action='property.task.source-terminal.closed' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id
       OR p_result_ref IS DISTINCT FROM ('property-task-source-terminal/' || p_source_type || '/'
                           || lower(p_source_id::text) || '/closed'
                           || '/v' || p_result_version::text)
       OR jsonb_array_length(p_rows)=0
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
          WHERE (value->>'sourceVersion')::integer<>p_result_version
             OR value->>'assignmentStatus'<>'closed'
       ) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSIF p_command_action='property.task.source-terminal.cancelled' THEN
    IF v_receipt_target IS DISTINCT FROM p_source_id
       OR p_result_ref IS DISTINCT FROM ('property-task-source-terminal/' || p_source_type || '/'
                           || lower(p_source_id::text) || '/cancelled'
                           || '/v' || p_result_version::text)
       OR jsonb_array_length(p_rows)=0
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
          WHERE (value->>'sourceVersion')::integer<>p_result_version
             OR value->>'assignmentStatus'<>'cancelled'
       ) THEN
      RAISE EXCEPTION 'property-task-projection-result-ref-conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'property-task-projection-action-conflict' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e(value)
     WHERE value->>'sourceType' IS DISTINCT FROM p_source_type
        OR (value->>'sourceId')::uuid IS DISTINCT FROM p_source_id
        OR value->>'taskKey' IS NULL OR value->>'taskKey' !~ '^[0-9a-f]{64}$'
        OR value->>'contentHash' IS NULL OR value->>'contentHash' !~ '^[0-9a-f]{64}$'
        OR value->>'contentHash' IS DISTINCT FROM
           public.fn_property_task_projection_row_hash_v1(value)
        OR (value->>'sourceVersion')::integer<=0
        OR (value->>'assignmentVersion')::integer<=0
        OR (value->>'priority')::integer NOT BETWEEN 0 AND 100
        OR value->>'taskId' IS DISTINCT FROM
           lower(((value->>'taskId')::uuid)::text)
        OR value->>'sourceId' IS DISTINCT FROM
           lower(((value->>'sourceId')::uuid)::text)
        OR (value->>'dueAt' IS NOT NULL AND
            value->>'dueAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
        OR (value->>'claimedAt' IS NOT NULL AND
            value->>'claimedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
        OR (value->>'startedAt' IS NOT NULL AND
            value->>'startedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
        OR (value->>'blockedUntil' IS NOT NULL AND
            value->>'blockedUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
        OR (value->>'outcomeAt' IS NOT NULL AND
            value->>'outcomeAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
        OR value->>'createdAt' IS NULL OR
           value->>'createdAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        OR value->>'updatedAt' IS NULL OR
           value->>'updatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  ) THEN
    RAISE EXCEPTION 'property-task-projection-row-invalid' USING ERRCODE='22023';
  END IF;

  SELECT count(*)::integer,
         encode(digest(convert_to(COALESCE(string_agg(
           lower((value->>'taskId')::uuid::text) || E'\t'
           || (value->>'contentHash') || E'\n','' ORDER BY ordinality),''),'UTF8'),
           'sha256'),'hex')::char(64)
    INTO v_count,v_content_hash
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(value,ordinality);

  DELETE FROM biz_property_task_projection p
   WHERE p.tenant_id=p_tenant_id AND p.park_id=p_park_id
     AND p.head_id=v_head_id AND p.source_type=p_source_type
     AND p.source_id=p_source_id;

  INSERT INTO biz_property_task_projection (
    tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
    derived_assignment_id,source_type,source_id,source_version,
    business_occurrence_key,task_kind,queue_code,title,kind_label,source_label,
    priority,due_at,assignment_status,assignment_version,assignee_id,
    assignee_display,claimed_at,started_at,blocked_reason,blocked_until,
    outcome_code,outcome_source_version,outcome_at,source_deep_link,
    projection_version,content_hash,created_at,updated_at)
  SELECT p_tenant_id,p_park_id,v_head_id,
         (value->>'taskId')::uuid,(value->>'taskKey')::char(64),
         value->>'assignmentAuthority',NULLIF(value->>'derivedAssignmentId','')::uuid,
         p_source_type,p_source_id,(value->>'sourceVersion')::integer,
         value->>'businessOccurrenceKey',value->>'taskKind',value->>'queueCode',
         value->>'title',value->>'kindLabel',value->>'sourceLabel',
         (value->>'priority')::integer,NULLIF(value->>'dueAt','')::timestamptz,
         value->>'assignmentStatus',(value->>'assignmentVersion')::integer,
         NULLIF(value->>'assigneeId','')::uuid,value->>'assigneeDisplay',
         NULLIF(value->>'claimedAt','')::timestamptz,
         NULLIF(value->>'startedAt','')::timestamptz,value->>'blockedReason',
         NULLIF(value->>'blockedUntil','')::timestamptz,value->>'outcomeCode',
         NULLIF(value->>'outcomeSourceVersion','')::integer,
         NULLIF(value->>'outcomeAt','')::timestamptz,value->>'sourceDeepLink',
         v_next,(value->>'contentHash')::char(64),
         (value->>'createdAt')::timestamptz,(value->>'updatedAt')::timestamptz
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY e(value,ordinality)
   ORDER BY (value->>'taskId')::uuid;
  GET DIAGNOSTICS v_affected=ROW_COUNT;
  IF v_affected<>v_count THEN
    RAISE EXCEPTION 'property-task-projection-insert-count' USING ERRCODE='21000';
  END IF;

  IF v_previous=0 THEN
    INSERT INTO biz_property_task_projection_head (
      id,tenant_id,park_id,source_type,source_id,projection_version,content_hash,
      last_rebuilt_at,last_rebuilt_by,created_at,updated_at)
    VALUES (v_head_id,p_tenant_id,p_park_id,p_source_type,p_source_id,v_next,
            v_content_hash,clock_timestamp(),p_actor_id,clock_timestamp(),clock_timestamp());
  ELSE
    UPDATE biz_property_task_projection_head h
       SET projection_version=v_next,content_hash=v_content_hash,
           last_rebuilt_at=clock_timestamp(),last_rebuilt_by=p_actor_id,
           updated_at=clock_timestamp()
     WHERE h.tenant_id=p_tenant_id AND h.park_id=p_park_id
       AND h.id=v_head_id AND h.source_type=p_source_type
       AND h.source_id=p_source_id AND h.projection_version=v_previous;
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    IF v_affected<>1 THEN
      RAISE EXCEPTION 'property-task-projection-version-conflict' USING ERRCODE='40001';
    END IF;
  END IF;

  INSERT INTO biz_property_task_projection_rebuild_audit (
    tenant_id,park_id,head_id,source_type,source_id,actor_id,mutation_receipt_id,
    replace_mode,command_action,from_projection_version,to_projection_version,business_result_version,
    projected_task_count,
    assignment_mutation_count,reason,request_hash,result_ref,result_hash,content_hash)
  VALUES (p_tenant_id,p_park_id,v_head_id,p_source_type,p_source_id,p_actor_id,
          p_receipt_id,p_replace_mode,p_command_action,v_previous,v_next,p_result_version,v_count,0,
          p_reason,p_request_hash,p_result_ref,p_result_hash,v_content_hash);

  RETURN QUERY SELECT v_previous,v_next,v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_property_task_projection_replace_v1(
  varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,
  char,varchar,char,varchar,jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_property_task_projection_replace_v1(
  varchar,varchar,varchar,uuid,uuid,uuid,varchar,varchar,integer,integer,
  char,varchar,char,varchar,jsonb)
  TO CURRENT_USER;
```

Caller 必须在同一 transaction 严格按 §6 先锁 source→assignments→head→projection→receipt 并
完成 assignment bilateral、逐行 content hash 与 receipt identity（含 `actor_id=p_actor_id` exact）
验证，再调用同一个 function。
Function 是 `SECURITY INVOKER`，只对 caller 已持锁的同一 head/projection/receipt 做 reentrant
validation/DML；不得取得 advisory lock、锁新 source/assignment、acquire receipt、complete
receipt、commit 或开启 transaction。固定 replacement 顺序是 DELETE old projection → INSERT new
projection(vNext) → head INSERT/CAS(vNext) → audit；stable FK 与 generation constraint trigger 都
deferred 到 commit，因此第二次及后续 replacement 可行，audit 历史 `to_projection_version` 不受
current head version 限制。任一步 affected/count/hash 不符即 RAISE，整 transaction rollback。
Top-level null/array guard 先于 `jsonb_array_elements`；item object guard 先于
`jsonb_object_keys`；所有 UUID/integer/timestamptz cast 前先做 JSON type、regex/range 与
`pg_input_is_valid` guard。Exact row 没有 boolean 字段，任何 boolean 落入 string/number/null
slot 都稳定映射 `property-task-projection-row-invalid`；non-object/unknown/missing key 稳定映射
`property-task-projection-row-shape`，不得泄漏 native cast/function error。

双 mode caller contract 固定：

- `manual-rebuild` 保持现有 `POST /property/tasks/internal/rebuild`、internal-only identity、
  `property_task:rebuild`、external request/response、receipt replay 和 result semantics；不新增
  endpoint/action。
- `authority-sync` 不暴露 controller、permission 或 `allowedActions`。只有签署的
  claim/start/block/unblock/release command 与 source-terminal internal call-site 可用。Caller
  在同一 transaction 先按 source→assignment→head→projection 锁序持锁，再 acquire 原业务
  receipt 并确认 execute branch/`started/result-null`；随后完成业务 authority mutation 及对应
  assignment audit，从已锁 source+assignment authority 重算**完整** canonical projection snapshot，以当前 head version
  调用 function `authority-sync`，最后才用同一 action/resultRef/resultVersion/resultHash complete
  同一 receipt。Sync/function/audit/receipt complete 任一步失败，source/assignment mutation、
  assignment audit、projection/head、replacement audit 与 receipt 全部同 transaction rollback。
- Authority-sync snapshot 在业务 mutation 之后生成，function 不修改 assignment；每次成功 replace
  只令 projection version `+1`。HTTP mutation response/resultRef 的 `resultVersion` 仍是 post-mutation
  assignment/source version；replacement audit 的 `business_result_version=p_result_version`，并独立
  记录 projection from/to version。
- Same-key completed replay 在 current authorization 后直接走既有 replay contract：零 authority
  mutation、零 sync/function 调用、零新 assignment/replacement audit、零新 receipt。

未知 mode/action/resultRef prefix fail closed。不得把 authority-sync 伪装成
`property.task.rebuild`/`property-task-rebuild`，也不得增加第二 writer、第二 function 或第四张
projection table。

Migration 对四表、五个 helper/immutable functions、replace function 和四个 triggers 逐对象
preexisting guard：全部不存在才创建；全部存在且 columns/default/check/FK/index、prokind、
provolatile、prosecdef、proconfig、ACL 与 normalized `pg_get_functiondef` hash exact 才接受 rerun；
partial、额外对象或任一定义不符 fail。不得引用不存在的 deployment role；当前 migration 与
application 使用同一 `CURRENT_USER`。Replace function 固定 `SECURITY INVOKER`，是唯一受支持的
repository 代码路径，但不是独立 DB principal 安全边界。DB 本阶段只强制 CHECK、FK、deferred
constraint trigger 与 audit immutability；table owner 仍可直接 DML。`REVOKE ... FROM PUBLIC`
只减少 public exposure，不撤销 owner 固有权限，也不得表述为 EXECUTE-only 或不可绕过 ACL。
C4 以 static repository/SQL scan、code ownership 与 integration tests 保证只有 manual rebuild
repository 和签署的 command/terminal authority-sync call-sites 调用 replace function；真正的 NOLOGIN object owner/runtime role privilege split 移交 Track C
hardening，不阻塞 B-2a，且当前 Gate 不得误报为已实现。

Function definition sidecar grammar 固定为：

```text
b-property-task-projection-function-v1\n
function<TAB><schema.name(identity-args)><TAB><normalized-pg-get-functiondef-sha256>\n
... schema.name(identity-args) UTF-8 byte order ...
```

Normalization 只把 `pg_get_functiondef(oid)` 的 CRLF 拒绝、要求 UTF-8/LF-only/final LF，不做
空白或 identifier 改写；raw definition bytes SHA-256 为 lowercase hex。000194 preexisting guard
内嵌每个 expected definition hash，Gate sidecar 同时列出这些逐函数 hash、完整 grammar bytes
SHA 与 000194 raw SHA；三者不相等或不可独立复算即 stop-ship。Replace function 的 identity-args
signature 仍逐字包含现有 `p_result_version integer` 位置，不新增重载；其 normalized definition hash
必须覆盖将 `p_result_version` INSERT 到 audit `business_result_version` 以及 manual/command/closed/
cancelled 四分支 binding 的完整 body。旧 definition hash 或出现第二 signature 均 stop-ship。

Head CAS：caller 锁定后，head absent 只接受 `expectedProjectionVersion=0` 并 INSERT version
1；已存在 N 只接受 expected=N 并 UPDATE 为 N+1。并发 insert/update loser 由 caller 在固定
锁序回读 winner：如果 receipt identity/hash 与 winner 完全一致则按 replay 返回 winner；
否则 version conflict。绝不把 absent 当 version 1，也不跳号。Projection 与 rebuild audit
只以 stable `(tenant_id,park_id,head_id,source_type,source_id)` composite FK 指向 head；可变
`projection_version` 不进入 FK。Projection row 仍保存其 generation，两个
`DEFERRABLE INITIALLY DEFERRED` constraint trigger 从 head 和 projection 两侧安排 commit-time
检查，提交时该 head 的全部 current projection row 必须 strict
`projection.projection_version === head.projection_version`；rebuild audit 的历史
`to_projection_version` 只受自身递增 CHECK，不与 current head version 比较；历史物理名
rebuild audit 同时记录 manual-rebuild 与 authority-sync replacement。

Projection `content_hash` 按每行以下 bytes 计算，head/audit `content_hash` 是所有 row
`task_id<TAB>content_hash<LF>` 按 task_id UUID network bytes 升序连接后的 SHA-256；空集合
是空 bytes SHA-256。标量编码 `N`=null、`S<decimal UTF-8 byte length>:<bytes>`=string、
`I<base10>`=integer、时间先格式化为 §4.5 UTC ISO string：

```text
property-task-projection-content-v1\n
<taskId><TAB><taskKey><TAB><assignmentAuthority><TAB><derivedAssignmentId>
<TAB><sourceType><TAB><sourceId><TAB><sourceVersion>
<TAB><businessOccurrenceKey><TAB><taskKind><TAB><queueCode><TAB><title>
<TAB><kindLabel><TAB><sourceLabel><TAB><priority><TAB><dueAt>
<TAB><assignmentStatus><TAB><assignmentVersion><TAB><assigneeId>
<TAB><assigneeDisplay><TAB><claimedAt><TAB><startedAt><TAB><blockedReason>
<TAB><blockedUntil><TAB><outcomeCode><TAB><outcomeSourceVersion>
<TAB><outcomeAt><TAB><sourceDeepLink><TAB><createdAt><TAB><updatedAt>\n
```

尖括号中的每个值必须使用上述 N/S/I 编码；createdAt/updatedAt 是 source/assignment 的
logical event time，rebuild rerun不得改写。`taskId` 只能用 §4.4 UUIDv5 算法。Derived row
必须引用 assignment；owning row 不得引用它。Projection 是可重建 read model，不是 source、
assignment 或授权权威；受支持的 repository 代码只允许 manual-rebuild caller 与签署
command/terminal authority-sync caller 调用 replace function；但这不是 table owner 的独立数据库权限边界。
Replacement audit `content_hash` 始终等于该次完整 canonical row set 的 head hash；
`replace_mode/command_action/business_result_version/result_ref` 不混入 projection content hash，而由
audit exact columns/CHECK、receipt identity/resultHash 和 function definition hash 分别冻结。
Manual audit row 的 `business_result_version=to_projection_version` 且 resultRef 逐字含 source；terminal
row 按 closed/cancelled 分支分别逐字含 source、terminal 与 business result version。Command row CHECK
只冻结 `property-task/<lowercase UUID>/v<business_result_version>` shape；其 UUID 必须等于 receipt target
taskId 且对应 snapshot row assignmentVersion 的约束由 function 在 SELECT receipt 后执行，属于
function-enforced binding，不属于跨表 DB-row CHECK。当前同 CURRENT_USER/table-owner 可绕过 function 的
诚实边界仍按上文保留，Track C hardening 前不得宣称独立 DB principal 防绕过。

### 5.3 Disabled control hash 原子迁移

第四个、且唯一的 control correction 对象是：

```sql
CREATE TABLE sys_property_runtime_control_contract_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  control_id uuid NOT NULL,
  control_key varchar(128) NOT NULL,
  correction_key varchar(64) NOT NULL DEFAULT 'b2a-contract-correction-000194',
  old_contract_hash char(64) NOT NULL,
  new_contract_hash char(64) NOT NULL,
  old_version integer NOT NULL,
  new_version integer NOT NULL,
  old_disabled_reason varchar(500) NOT NULL,
  new_disabled_reason varchar(500) NOT NULL,
  old_update_time timestamptz NOT NULL,
  new_update_time timestamptz NOT NULL,
  evidence_hash char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT uq_sys_property_runtime_control_contract_audit_scope_id
    UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_sys_property_runtime_control_contract_audit_correction
    UNIQUE (tenant_id, park_id, control_id, correction_key),
  CONSTRAINT fk_sys_property_runtime_control_contract_audit_control
    FOREIGN KEY (tenant_id, park_id, control_id)
    REFERENCES sys_property_runtime_control(tenant_id, park_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_key
    CHECK (correction_key='b2a-contract-correction-000194'),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_versions
    CHECK (old_version>0 AND new_version=old_version+1),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_hashes
    CHECK (old_contract_hash ~ '^[0-9a-f]{64}$'
       AND new_contract_hash ~ '^[0-9a-f]{64}$'
       AND evidence_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sys_property_runtime_control_contract_audit_times
    CHECK (new_update_time=occurred_at AND new_update_time>=old_update_time)
);
CREATE INDEX idx_sys_property_runtime_control_contract_audit_control
  ON sys_property_runtime_control_contract_audit
    (tenant_id, park_id, control_key, occurred_at, id);
CREATE FUNCTION fn_property_runtime_control_contract_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'property-runtime-control-contract-audit-immutable'
    USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER trg_sys_property_runtime_control_contract_audit_immutable
BEFORE UPDATE OR DELETE ON sys_property_runtime_control_contract_audit
FOR EACH ROW EXECUTE FUNCTION fn_property_runtime_control_contract_audit_immutable();
REVOKE UPDATE, DELETE ON sys_property_runtime_control_contract_audit FROM PUBLIC;
```

每条 `evidence_hash` 是以下 UTF-8/LF-only/final-LF bytes SHA-256；时间使用 §4.5 格式，
每个尖括号值都用 §5.2 的 `S<byte-length>:<UTF-8 bytes>` 编码，禁止裸 delimiter：

```text
runtime-control-contract-audit-v1\n
<tenantId><TAB><parkId><TAB><controlId><TAB><controlKey>
<TAB><oldHash><TAB><newHash><TAB><oldVersion><TAB><newVersion>
<TAB><oldDisabledReason><TAB><newDisabledReason>
<TAB><oldUpdateTime><TAB><newUpdateTime>\n
```

000194 物化 validated scope 与签署的 12-key `(control_key,control_kind,target,
adapter_version)` exact set 后，只允许四态分支：

1. **all-old disabled**：全部 expected row 存在且 config exact、`enabled=false`、mode
   disabled、old hash、无本 correction audit；用一个 frozen `changed_at`、单 transaction
   set-based UPDATE 为 new hash/version+1/new reason/new time，并逐 control INSERT audit；两者
   affected count 都必须等于 `scope_count*12`。
2. **all-new exact audit**：全部 row 已是 new hash、disabled、config/reason/version/time 与
   唯一 audit exact，并用同一 S-length decoder 重建 bytes/recompute evidenceHash；纯 no-op，UPDATE/INSERT count=0，绝不增加 version、update_time、
   occurred_at 或 audit row。
3. **mixed/unknown**：old/new 混合、未知 hash、缺/多 row 或 audit、old row 已有 audit、
   new row 无 exact audit，整笔失败。
4. **enabled/config drift**：任一 enabled、mode 非 disabled、enabled metadata、control kind/
   target/adapter/scope/12-key drift，整笔失败。

更新后 old hash 为 0，new hash/audit 都须 bilateral exact-set。000190 的 migration history、
checksum、catalog/evidence hash 原值不改；000194 raw SHA、history/checksum、before/after counts
和每 control evidence 进入新的签名 Gate artifact，不回写历史 evidence。

000194 失败依赖 transaction rollback；成功后不提供 destructive down，只允许新的
forward-fix。

## 6. Narrow `PROPERTY_MUTATION_RECEIPT_PORT`

统一 receipt 仍由 B-1 owner 持有，B-2a 不直接 import entity 或操作
`biz_property_mutation_receipt` repository。

唯一窄 port：

```ts
const PROPERTY_MUTATION_RECEIPT_PORT = Symbol("PROPERTY_MUTATION_RECEIPT_PORT");

type PropertyMutationIdentity =
  | { tag: "general" }
  | { tag: "property-task"; businessOccurrenceKey: string; taskKey: string };

interface PropertyMutationReceiptPort {
  acquire(manager: EntityManager, input: {
    acquireMode: "execute-or-replay" | "existing-only";
    scope: TenantParkScope;
    actorId: string;
    actionId: string;
    targetId: string;
    clientKey: string;
    requestHash: string;
    identity: PropertyMutationIdentity;
  }): Promise<
    | { kind: "execute"; receiptId: string }
    | { kind: "replay"; resultRef: string; resultVersion: number; resultHash: string }
  >;

  complete(manager: EntityManager, input: {
    scope: TenantParkScope;
    actorId: string;
    actionId: string;
    targetId: string;
    clientKey: string;
    requestHash: string;
    identity: PropertyMutationIdentity;
    receiptId: string;
    resultRef: string;
    resultVersion: number;
    resultHash: string;
  }): Promise<void>;
}
```

- 必须使用调用方 `EntityManager`，不得开启新 transaction。
- Exact unique key 沿用 scope+actor+action+target+clientKey。所有现有 B-1/general command 明确传
  `acquireMode="execute-or-replay"`，其 request hash、identity、插入/并发/replay 行为与 golden bytes
  完全不变；mode 只选择 receipt access 状态机，不进入 unique key、requestHash 或 resultHash。
- `execute-or-replay` 先 SELECT exact unique identity；absent INSERT started。并发 unique conflict 必须
  回读并锁 winner，再按相同状态机判定，不得把 winner 当 500 或再执行。
- `existing-only` 绝不 INSERT，且只供 source 已处于 same terminal 的 replay recovery。Absent、
  started、failed 都 fail closed 为 `property-runtime-unavailable`，completed 只有完整 scope/actor/
  action/target/clientKey/identity/requestHash/resultRef/resultVersion/resultHash 全部 exact 且重算
  resultHash 通过才返回 replay；不同 identity/requestHash 仍为 `idempotency-key-conflict`。所有失败
  分支零 receipt/authority/projection/audit mutation。
- `general` 是旧 B-1 的原 identity，不写空 occurrence/taskKey sentinel；只有 task action
  使用 `property-task` tag。同完整 identity/request hash + completed 返回 replay；不同 request hash、occurrence 或
  taskKey 返回 `idempotency-key-conflict`；同 hash started/failed 返回
  `property-runtime-unavailable` 和 same-key recovery。
- `complete` 必须带回 acquire 的完整 scope/actor/action/target/clientKey/requestHash/
  identity，并以 `receipt_status='started' AND result_ref IS NULL AND result_hash IS NULL` CAS
  UPDATE；WHERE 还必须逐项匹配 receiptId、scope、actor/action/target/clientKey、requestHash
  和由 identity 纳入的 requestHash，SET completed/resultRef/resultHash/completedAt；affected
  必须为 1，0 行即 fail，不得宽松补写 completed。
- Request hash 继续使用 B-1 当前 sorted-key normalization + JSON + SHA-256 语义；task
  request 在 normalization 前必须把 route `taskId` 解析成并加入 `taskKey` 与
  `businessOccurrenceKey`，因此同 taskId 不可能跨 occurrence 重放。先抽取
  唯一 helper 并用既有 golden 证明 bytes/hash 不变。本 correction 不切换 RFC 8785，
  避免历史 replay 漂移。Source-terminal 必须额外逐字遵守 §4.6 的 clientKey canonical bytes、
  exact request object、原始 signed `terminalActorId` 和 existing-only replay 合同。

所有 command/rebuild/terminal 的全局锁序唯一固定为：

```text
source row or source-scoped advisory lock
-> assignment rows by UUID network-byte ASC
-> projection head
-> projection rows by taskId UUID network-byte ASC
-> mutation receipt
-> assignment/rebuild/control audit rows
```

不得交换或跳回前级。Receipt replay 也必须先取得它前面的适用 source/assignment/head/
projection locks并重新做 current authority/visibility 与 identity 校验后才读 receipt。普通 command
与 manual-rebuild 的 completed replay 不要求 current version 等于 original expected version；只有
它们各自的 execute branch 才校验 expected source/assignment/projection version equality。
Source-terminal completed replay 是明确例外：必须先按 §4.6 在 receipt access 前校验
`incomingExpectedAssignmentVersion + 1 === lockedTerminalAssignmentVersion`，随后才允许
`existing-only` exact receipt replay，且仍为零 source/assignment/projection mutation、零新 audit。
无 projection 的普通 command 仍经过 head/projection 空集合阶段。所有锁和 port 都使用同一 caller
`EntityManager` transaction。

Source-terminal 在锁后先判 authority winner：不同 terminal/outcome/sourceVersion/occurrence/taskKey
必须在 receipt 前拒绝，零新 receipt；active-first 才用 `execute-or-replay`，same-terminal 才用
`existing-only`。两条路径都必须在 receipt 前持有 source→assignment→head→projection locks；
existing-only completed replay 不调用 replace function，也不新建 assignment/replacement audit。

Rebuild caller 必须先按上述顺序持有 source/advisory、全部 assignment、head 和 current
projection locks，之后才调用 receipt port `acquire` 取得/锁定 receipt，最后调用
`fn_property_task_projection_replace_v1`。Replace function 不调用 `acquire`，只以普通 SELECT
重验 caller 已锁 receipt 的 scope/id/started/requestHash/result-null 条件；function 内任何
新前序资源锁都使 lock-order Gate 失败。

Result bytes exact：

```text
property-mutation-result-v1\n
<actionId><TAB><targetId lowercase UUID><TAB><identityTag>
<TAB><resultRef><TAB><resultVersion>\n
```

`resultHash` 是这些 bytes 的 lowercase SHA-256，`resultVersion` 为正整数；identityTag 是
`general` 或 `property-task:<taskKey>:<length>:<businessOccurrenceKey>`，occurrence 按 UTF-8
byte length 编码，taskKey 必须 64 lowercase hex。Task/rebuild `resultRef` 必须符合 §4.5。
Replay 必须重算并比对 resultHash；receipt outcome 只保存 original resultRef/version/hash，
不保存、伪造或返回原 task 快照。API replay 在 current authorization 后读取 current task
projection，返回 current detail + `replayed=true` + original `replayedResultRef` +
`originalResultVersion`；execute 返回 current detail、`replayed=false`、
`replayedResultRef=null` 和本次 `originalResultVersion`。

Port/provider 由 `approval-runtime-owner` 在 `property-approvals/**` 内抽取并由
`PropertyApprovalModule` export。该改动必须生成新的 `B-approval-runtime SHA` 并重跑
B-1 targeted、ownership 和 composition Gate。B-2a 只注入 port，不得复制 lifecycle。

## 7. 批次执行表

### C0 — Plan signoff

| 项 | 要求 |
|---|---|
| Owner | `b2a-correction-plan-owner` |
| 唯一可写路径 | 本文件 |
| 输入 | 旧四 raw/B-contract/schema/foundation/approval handoff；三方 correction 共识 |
| 输出 | 本文件 raw SHA；twelfth-review evidence；三方逐项 disposition（本文件不得预写 `C0_open_P0_P1=[]`） |
| Stop-ship | 任一决策仍有两种实现、object/migration 名不唯一、owner 重叠 |
| 回滚 | 仅撤销本 plan 变更；不得触碰 runtime/schema 数据 |
| 验证 | Markdown/diff-check；逐项覆盖 F-01..F-10；确认只新增本文件 |

### C1 — Freeze/shared 重签

| 项 | 要求 |
|---|---|
| Owner | 四输入各自 freeze owner；`shared-contract-owner` 串行消费；其后唯一 `property-error-filter-owner` 串行消费 error contract；`task-doc-owner` 只同步本任务 `prd.md/design.md/implement.md`；`property-runtime-observability-owner` 持 alert allowlist/runbook mapping |
| 可写路径 | 四份 freeze、contract manifest、`packages/shared/src/property-business/**` 与必要 root export/tests；`property-error-filter-owner` 仅 `apps/api/src/shared/filters/api-exception.filter.ts` 及其 spec；以及本任务 `prd.md/design.md/implement.md`；不得写 migration/runtime |
| 输入 | C0 plan SHA、旧四 raw、旧 B-contract、现有 49-row manifest |
| 输出 | 按 §4.9 重算的新四 raw SHA、新 `B-contract SHA`、新 shared source SHA、新 endpoint manifest SHA；按 §4.10 独立输出 `B-property-error-filter SHA`/sidecar；task docs 删除重复 alert；旧值 superseded 清单 |
| Stop-ship | 49 rows 数量变化；OR 被实现成 AND；`:id` canonical 残留；task docs 值与 freeze 冲突；hash 不可复算 |
| 回滚 | 回滚未签署的 C1 文件；旧 handoff 仍只作旧基线，不恢复 implementation release |
| 验证 | Shared build/tests；filter 在 shared contract 后串行，使用 §4.5 closed exact `RECOVERY_ACTION` allowlist，不复用通用 action regex；按 errorCode details allowlist 仅保留 assigneeDisplay/deepLink、其余 details 清空，并跑 filter unit + HTTP exact/leak negatives；独立复算 `B-property-error-filter SHA`；49 route/permission/access bilateral exact-set；OR/active module/user-park/source/queue negative；typed wire null/omitted/order golden；terminal expectedAssignmentVersion contract golden 固定 active=current 正例、same-terminal incoming=current-1 正例，以及 same-terminal incoming=current/current-2/0/overflow/非整数负例并断言 conflict-before-receipt；source-neutral resolver/descriptor schema 与 `test_fixture_*` deep-link/route-collision test registry，production registry exact-empty；四 raw+B-contract/endpoint byte grammar独立重算；独立 contract re-Gate |

### C2 — 000194 + DB Gate

| 项 | 要求 |
|---|---|
| Owner | 唯一 `schema-migration-owner` |
| 可写路径 | `database/migrations/000194_property_task_projection_contract_correction.sql`、专用 schema Gate runner/fixtures/evidence、对应 Gate 报告；不得改 000185–000193 |
| 输入 | 新 B-contract/endpoint SHA、旧 B-schema、C0 plan SHA、双 history/worktree reservation evidence |
| 输出 | 000194 raw SHA、projection catalog/security/control-hash artifact、function-definition hash sidecar、`B-property-task-projection-schema SHA`、cleanup evidence、`open_P0_P1=[]` |
| Stop-ship | 编号占用；§5.1 当时可用链失败；000194 依赖 191/192；191/192 被改/伪造 placeholder；四表 exact catalog、audit mode/action/businessResultVersion/resultRef CHECK 或双-mode function signature/hash漂移；把 command target function binding 误报为 row CHECK；control 分支非 all-old/all-new；少/多更新一行；audit/cleanup 缺失 |
| 回滚 | late failure 必须回滚本 transaction 的建表、projection、control UPDATE 与 audit；成功后仅 forward-fix；不得删 assignment/audits/receipt/replacement audit，projection 仅可由唯一双-mode function replace |
| 验证 | 当时可用 185–190→193→194 链、000194 对 191/192 零依赖、rerun no-op、signed preexisting exact 与 drift rejection；不运行/不冒充未来 191–194 full-chain Gate，后者归 B-4；三表+历史名 replacement audit 新 `business_result_version`/CHECK；manual 与 terminal closed/cancelled 对 source/type/id/terminal/version 逐字 DB-row CHECK positive+negative，command UUID/version shape DB-row CHECK positive+negative；唯一 function SELECT receipt 后 command target taskId+snapshot assignmentVersion exact positive/forged negative，并在报告中标为 function-enforced；双 mode/action/resultRef positive+negative、receipt actor exact positive + forged `p_actor_id` negative、唯一 function signature/body/definition hash、FK/index/trigger/revoke exact；head absent/concurrent winner；每次 replace projection version+1且 audit一行、`business_result_version=p_result_version`、assignment_mutation_count=0；late failure atomic rollback；runner 每次先生成 exact DB name 并保持 `created=false`，仅 createdb exit=0 后置 true，createdb失败绝不drop；psql/migration/test status 任一非0保留原失败，若 created=true 则 trap 只drop exact name，drop失败或临时文件清理失败使 runner FAIL；fake createdb/psql/dropdb 覆盖 create-fail、test-fail/drop-pass、test-pass/drop-fail、signal 与 success 矩阵；2M projection rows 下 list/count/assignee/source `EXPLAIN (ANALYZE,BUFFERS)` 禁止 Seq Scan，p95<=200ms、shared blocks<=20000；rebuild batch/lock timeout预算继承 runtime freeze，未冻结则 stop-ship；control 四态、per-row audit、000190 evidence不变 |

### C3 — Receipt port + B-1/foundation re-attest

| 项 | 要求 |
|---|---|
| Owner | `approval-runtime-owner` 抽 port；property-foundation owner 与 `approval-composition-owner` 只做新合同 re-attest |
| 可写路径 | `apps/api/src/modules/property-approvals/**`；foundation/AppModule re-attest 只写各自任务 evidence/handoff，C3 不改 `apps/api/src/app.module.ts` 或 foundation runtime code；独立 Gate 若发现真实不兼容必须另立 correction batch |
| 输入 | 新 B-contract/shared/endpoint SHA、旧 B-approval/foundation SHA、C2 schema SHA |
| 输出 | 新 `B-approval-runtime SHA`；foundation runtime content SHA 保持原值 `19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a`，另出明确命名的 `B-property-foundation-contract-v2-attestation` sidecar SHA；AppModule original raw SHA 与 v2 re-attestation sidecar；receipt port contract/test evidence |
| Stop-ship | Task owner直接写receipt；port 缺少 execute-or-replay/existing-only closed semantics；一般命令 request/result hash golden变化；B1业务行为漂移；foundation content SHA 被伪造为新代码 SHA；v2 attestation 未列新 contract；AppModule raw bytes 变化 |
| 回滚 | 回滚 port/composition 未签署代码；保持高风险和 task enforce disabled；不删除 receipt |
| 验证 | B1 targeted/PG/idempotency tests；execute-or-replay insert-conflict winner、started CAS affected=1、same/different identity/hash、ambiguous retry；existing-only absent/started/failed fail closed 且零 INSERT，completed exact replay，identity/hash mismatch conflict；port contract fixture 对 active incoming=current 只允许一次 execute-or-replay access、same-terminal incoming=current-1 只允许一次 existing-only access，same-terminal incoming=current/current-2/0/overflow/非整数全部在 port 调用前 conflict 且 port access count=0；一般命令 request/result hash golden bytes 不变；terminal clientKey 72-char/canonical bytes/request-object golden，并证明 clientKey 不含 expectedAssignmentVersion 而 requestHash exact 包含；result grammar、全锁序/replay-zero-mutation；API typecheck/build/eslint；确认 `apps/api/src/app.module.ts` raw SHA 不变只 re-attest；foundation content SHA 与独立 v2 sidecar 分别复算 |

### C4 — B-2a runtime

C4 的 product artifact 仅包含 source-neutral resolver registry 与 runtime core；production
registry 必须为空。真实 source adapters 及其 descriptor 值全部留给 B-2c/domain adapter
downstream handoff，不以 C4 fixture、HTTP golden 或 module boot 冒充已支持 source。

| 项 | 要求 |
|---|---|
| Owner | 唯一 `property-task-owner`；checker 只写/运行被分配 tests |
| 可写路径 | `apps/api/src/modules/property-tasks/**`；不得改 approvals/shared/migration/owning aggregate |
| 输入 | 新 B-contract/shared/endpoint SHA、已复算 `B-property-error-filter SHA`/sidecar、旧 core B-schema + C2 `B-property-task-projection-schema SHA` + replace function-definition sidecar SHA、新 foundation/approval handoff、receipt port |
| 输出 | `B-property-task-runtime SHA`、`B-property-task-projection-callsite SHA`、handoff sidecar、claim/predicate/replacement evidence、terminal actor/clientKey/requestHash/receipt-mode evidence、known failures、`open_P0_P1=[]`，以及明确 `B3_web_consumer_status=pending`（不得写 PASS） |
| Stop-ship | 业务代码发现 direct projection/head DML、第二 projection writer/write function、未签 call-site 或成功 authority mutation 未同步 projection；terminalActorId 非已签原始 actor/registered principal、terminal clientKey/requestHash/identity 漂移或 same-terminal 补建 receipt；注册任一真实 production source；第二状态源；resolver未注册仍猜source；owning assignment副本；list/count drift；replace function mutation assignment；token暴露；旧SHA消费 |
| 回滚 | `task.enforce` 保持 disabled；停止 projector/worker；保留 assignment、assignment/control/replacement audit 和 receipt；projection 只允许唯一双-mode function replace；forward-fix only |
| 验证 | 独立验算并消费 `B-property-error-filter SHA`/sidecar、projection schema/function definition sidecar；C4 static repository/SQL scan 与 `B-property-task-projection-callsite SHA` bilateral exact 证明无 direct projection/head DML/第二 writer，且唯一 function 仅由 manual rebuild 与签署 command/terminal authority-sync call-sites 调用；逐 command/terminal 证明 authority mutation→完整 snapshot→authority-sync→same receipt complete 的同 transaction 顺序、sync failure 全回滚、completed replay 零sync/零audit；terminal 覆盖已签原始 authenticated actor/registered service principal、C4-only `test_fixture_*`、72-char clientKey canonical bytes、exact sorted-key requestHash、target/action/property-task identity、receipt actor exact 及 forged `p_actor_id` fail-closed；PG Gate 固定 active incoming=current 正例且真实 mutation version 恰好+1、same-terminal incoming=current-1 completed existing-only replay 正例，以及 same-terminal incoming=current/current-2/0/overflow/非整数负例；每例独立断言 execute-or-replay/existing-only/total receipt access count，所有负例均为 access count=0、`property-version-conflict`、零 receipt/业务/projection/audit mutation；active-first execute-or-replay，same-terminal existing-only absent/started/failed 零 INSERT fail closed、completed exact replay；不同 terminal/outcome/sourceVersion/occurrence/taskKey 在 receipt 前拒绝且零 receipt access；mode/action/businessResultVersion/resultRef HTTP/receipt golden，manual/terminal DB-row CHECK 与 command function target binding evidence 分栏；production startup registry exact-empty、所有未注册真实 source fail closed，且 `test_fixture_*` 只存在 test compile graph；current-park 与 active-module/user-park/source/queue scope；49 route/wire/error recovery HTTP golden、`:taskId` UUID/static route collision、test-only deep-link builder；六状态/非法邻接；occurrence/taskKey/source/assignment terminal fencing及 old/same replay；§7 C4 跨操作并发 Gate；OR权限/allowedActions；list/count同snapshot；manual rebuild set/content hash equality；owning/derived边界；receipt replay current-detail/original-result；alert leakage；Web-consumer contract fixture 静态证明普通 UI 无 rebuild discovery，不运行 390px/focus/44px browser Gate；API typecheck/build/eslint |

#### C4 跨操作并发 Gate

Dedicated PostgreSQL Gate 固定 `SET LOCAL lock_timeout='5s'`、
`SET LOCAL statement_timeout='60s'`，隔离 fixture 固定 `deadlock_timeout='1s'`；禁止以 sleep
猜时序。每个 A-first/B-first schedule 都由 coordinator 执行：双方先在
`lock-before-ready` latch 汇合；coordinator 只放行 designated first 取得
source row/source-scoped advisory lock，并令 first 在 `after-first-lock` latch 暂停；随后放行
second，使用 `pg_locks` 与 `pg_stat_activity` 同时确认 first 持有预期 lock、second 的
`wait_event_type='Lock'` 且确实等待同一资源，才释放 first。反向 schedule 交换 designated
first。禁止双方都先持锁再等待同一 barrier；无法在 timeout 内观测预期 holder/waiter 时 case
直接 FAIL，不得降级为非确定性并发测试。

Gate 分为两类：

1. **共享 source/assignment fence**：claim/start/block/unblock/release（只在各自适用状态）
   分别 ↔ source terminal。每对执行 command-first 与 terminal-first；只能 one-winner。Loser
   必须按锁后重读返回该 schedule 已签的 `task-already-claimed`、
   `task-source-ineligible`、`task-version-conflict` 或 `property-version-conflict`，不得返回
   500/deadlock/lock-timeout。Winner 在其业务 transaction 内恰好一次 authority-sync；loser
   零 authority mutation、零 sync、零 assignment/replacement audit、零新 receipt。
2. **共享 head replacement fence**：manual rebuild 分别 ↔
   claim/start/block/unblock/release authority-sync，以及 manual rebuild ↔ source-terminal
   authority-sync，每对执行两种相反启动顺序。Rebuild-first 时，manual replace 先提交
   projection `N→N+1`；command/terminal 随后锁后重读 current head，以 `authority-sync` 在同一
   业务 transaction 生成 post-mutation snapshot 并 `N+1→N+2`，两者 two-success。Command/
   terminal-first 时，其 authority-sync 先 `N→N+1`；manual rebuild 随后必须重读 current
   source/assignment/head。若 external `expectedProjectionVersion=N` 已失效，manual 只返回已签
   `task-version-conflict` 且零 replace/audit/receipt；若其签署 expected version 已是 N+1 且
   source fence 仍有效，才允许 manual `N+1→N+2` two-success。不得为任何 schedule 发明 conflict。

每个 schedule 必须证明与同顺序串行执行等价：最终 list/detail/count 与锁后 source+
assignment authority 一致，projection/head content hash 和 version 在业务 commit 时立即 current，
不存在异步 projection window；每个实际成功
动作最多一条 mutation receipt 及其对应 assignment/replacement audit，domain effect 不重复，版本按
实际成功次数逐次 `+1` 且不跳号，无 lost update/deadlock/timeout，所有 transaction 在 60s 内
结束。Same-key rebuild replay 与 same-terminal replay 均为零新增 mutation/audit/receipt；不同
key、terminal、outcome 或 version 仍按各自已签 conflict 处理。

### B3 downstream Web handoff（required / pending）

B3 的唯一 Web owner 必须在 route roadmap 接入真实 downstream descriptor 后执行浏览器 Gate：
390px card layout 无横向溢出、error summary 可 focus、所有主要 CTA touch target 至少 44px，
普通 UI 不可发现 internal rebuild。B-2a sidecar 必须列出该 required handoff 与 route roadmap、
owner、pending checks 和 `B3_web_consumer_status=pending`；C4/B-AR4 不得把 fixture 静态合同误报为
B3 browser PASS，也不得因此扩大 C4 Web ownership。

### Composition Gate 与 B-AR4

| 项 | 要求 |
|---|---|
| Owner | `property-task-composition-owner` 仅接线；architecture、security/RBAC、reliability/idempotency 独立 reviewer |
| 可写路径 | composition 仅 `apps/api/src/app.module.ts`；B-AR4 reviewer 只读，除被明确分配的 Gate evidence |
| 输入 | C4 frozen runtime SHA、独立复算的 `B-property-error-filter SHA`/sidecar 与全部新 handoff |
| 输出 | composition raw SHA；B-AR4 三方 PASS；`P0/P1/P2`、cleanup、skipped checks |
| Stop-ship | composition 前 runtime 未冻结；composition diff 混入 runtime SHA；任一 reviewer P0/P1；全量测试失败被误报 PASS |
| 回滚 | 回滚 composition 单文件接线；runtime/schema durable rows不删除，task enforce仍 disabled |
| 验证 | 先独立验算 `B-property-error-filter SHA` 与 exact/leak evidence，再做 module boot、controller route metadata、targeted HTTP+PostgreSQL、ownership diff、API typecheck/build；全量测试若受环境阻断必须精确报告 |

### Retention / legal hold / cleanup

`property-data-retention-owner` 独占 retention 证据，并逐类恢复父 freeze。Mutation receipt
自 completed/failed terminal 起保留 24 months，届满处理只复用现有 table-owner policy，本计划
不新增 delete path。Task assignment 与 projection head 按父 freeze 的 source-terminal 规则保留；
projection rows 是 current read model，只由 manual-rebuild 或签署 authority-sync 通过唯一
replace function 原子替换，不是 durable audit。Assignment audit、历史名 projection rebuild audit（现为全部受控
replacement audit）和 control contract audit
均由 immutable trigger 保护，至少保留父 freeze 各自周期；本阶段不自动 DELETE。它们未来若
需删除，只能经过独立 policy/legal review 与 forward migration 调整 immutability/privilege，
不得由普通 retention job 绕过 trigger。所有类别存在 legal hold 时继续保留，hold release 后
按各自原始 anchor/policy 重新计算，禁止统一改成 tenant/park closure anchor。Migration
rollback、rebuild、deploy cleanup 和 worker cleanup 不删除 durable audit/receipt/assignment。
Runner 临时 DB/文件由
`schema-gate-runner-owner` 按 C2 exact created-flag cleanup；Docker cleanup 不触碰数据库数据。

## 8. Correction 验收清单

- [ ] F-01..F-10 全部由唯一 freeze/shared/schema/port authority关闭。
- [ ] 四 raw、新 B-contract、shared source、endpoint manifest 全部可机械复算。
- [ ] 49-row endpoint count 不变，release/unblock OR 有正负机器证据。
- [ ] Identity canonical control route 不再含 `occupancies/:id`。
- [ ] 000194 是唯一 correction migration，000185–000190/193 未改，191/192 未占用。
- [ ] 三个 task projection 物理对象名称逐字一致，无 alias。
- [ ] Projection/replacement audit 只以 stable composite FK 指向 head；deferred generation trigger
  在 commit 双向验证 current rows，历史 audit version 不绑定 current head。
- [ ] Replace function 是完整可执行 SQL、`SECURITY INVOKER` 与 PUBLIC least-exposure revoke；
  caller 先取得 receipt，function 不逆序获取 source/assignment/receipt，并有 exact definition-hash sidecar。
- [ ] 唯一 replace function 精确支持 manual-rebuild/authority-sync；audit
  mode/action/businessResultVersion/resultRef exact，每次 replacement 一行，所有成功 authority
  mutation 同 transaction 立即同步 projection；manual/terminal DB-row CHECK 与 command receipt-target
  function binding 分栏取证，不伪造跨表 CHECK。
- [ ] 明确 migration/app 同 CURRENT_USER、owner 可 DML；DB 只强制 constraint/immutability，
  C4 scan/tests 禁止业务 direct DML；NOLOGIN owner/runtime split 留给 Track C hardening。
- [ ] 全部 disabled control row 从旧 hash 原子迁至新 hash并有签名审计。
- [ ] Receipt port 没有改变一般命令历史 request/result hash；execute-or-replay 与 existing-only
  状态机 closed exact，并输出新 B-approval runtime SHA。
- [ ] Terminal actor 只能来自已签原始 authenticated actor/registered service principal；clientKey
  72-char canonical SHA、exact sorted-key request object、source-target/action/property-task identity
  全部有 golden。ClientKey 有意不含 expectedAssignmentVersion，requestHash exact 包含；active
  incoming=current 才 execute-or-replay 且 mutation version 恰好+1，same-terminal incoming=current-1
  才 existing-only。Same-terminal incoming=current/current-2/0/overflow/非整数及不同 terminal/outcome/
  sourceVersion/occurrence/taskKey 全部在 receipt access 前冲突，access count=0 且零 mutation/audit。
- [ ] Foundation runtime content SHA 保持
  `19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a`，raw bytes 未改。
- [ ] 独立输出并复算 `B-property-foundation-contract-v2-attestation SHA`，不得冒充
  foundation runtime content SHA。
- [ ] AppModule 只复算 original raw SHA 并输出 v2 re-attestation sidecar；
  `apps/api/src/app.module.ts` raw bytes 未改。
- [ ] C4 production registry 为空；真实 source 全部 downstream，`test_fixture_*` 不进入
  production compile graph，未注册 source fail closed。
- [ ] blockedReason 仅在 blocked 且 canReadSourceDetails 时返回；error matrix exact 且 403/404
  无 existence leakage。
- [ ] 每个 `PropertyErrorData.errorCode` 与 row code exact，recoveryAction 逐行使用 closed exact
  allowlist 中的 task-specific 或已签 legacy/global token；唯一 filter owner 串行实现 allowlist、
  details allowlist 与 HTTP leak negatives，并输出可复算 `B-property-error-filter SHA`/sidecar。
- [ ] C4 与 B-AR4 均独立验算并消费 `B-property-error-filter SHA`；mandatory handoff 逐字列出。
- [ ] C2 只验证 185–190→193→194 当时可用链及 000194 对 191/192 零依赖；B-2c 分别 Gate
  191/192，B-4 才复核汇合后的 191–194 full chain，无 DAG 循环或越权 PASS。
- [ ] Command↔terminal 共享 fence 双顺序 one-winner；rebuild↔command/terminal 按锁后 fence
  允许合法 two-success、不发明 conflict；coordinator 观测 holder/waiter，全部 schedule 串行等价、
  无 lost update/deadlock/timeout、零重复 effect/audit/receipt，并覆盖 same-key/same-terminal replay。
- [ ] C4 只交付 Web-consumer contract fixture；B3 真实 390px/focus/44px/no-rebuild browser Gate
  及 route roadmap 在 B-2a sidecar 中保持 required/pending，不得误报 PASS。
- [ ] Receipt 24 months 复用现有 owner policy；immutable assignment/rebuild/control audits 至少
  保留父 freeze 周期且本阶段不自动 DELETE；projection current rows可 rebuild replace；legal hold 保留。
- [ ] B-2a 只消费新 handoff，owning/derived assignment 不混写。
- [ ] Runtime SHA 按 `b-property-task-runtime-v1` 重算一致。
- [ ] `B-property-task-projection-callsite SHA` bilateral exact，无 direct DML、第二 projection writer/write function、
  缺失或额外 call-site，并消费 projection schema/function definition handoff。
- [ ] `open_P0_P1=[]` 后才允许 composition/B-AR4。
- [ ] 真人 UAT、production enablement 与人工签署明确留在后续阶段。

## 9. 最终放行语句

只有 C0–C4、composition Gate 和 B-AR4 全部 PASS，且新 handoff sidecar 同时列出：

```text
new B-contract SHA
old core B-schema-expand SHA
B-property-task-projection-schema SHA
B-property-task-projection function-definition sidecar SHA
B-property-task-projection-callsite SHA
B-property-error-filter SHA / sidecar
original B-property-foundation-runtime content SHA = 19bf8971238947fb235b0cd32a455a5f744a76494ee185d3517ceb0ecd149d4a
B-property-foundation-contract-v2-attestation sidecar SHA
original AppModule raw SHA
AppModule contract-v2 re-attestation sidecar SHA
new B-approval-runtime SHA
B-property-task-runtime SHA
endpoint manifest SHA
terminal actor / clientKey canonical bytes / requestHash / receipt-mode evidence
owned paths
validation evidence
known failures
B3 required Web handoff / route roadmap / pending checks
B3_web_consumer_status=pending
open_P0_P1=[]
```

才可宣告 `B-2a technical PASS`。该结论不等于 Track B 完成、人工 UAT 完成或生产就绪。
