# B-2a C1 HTTP No-Existence-Leak Gate Contract

> 状态：`C1 HTTP GATE CONTRACT FIFTH-REVIEW CANDIDATE / IMPLEMENTATION BLOCKED`
>
> 日期：2026-08-01
>
> 适用任务：`07-30-pr192-b-approval-runtime-tasks`

## 1. 目的与约束

本合同为 C1 冻结一项不依赖数据库的最小真实 Nest HTTP pipeline Gate，用于证明 task
403/404 wire 和 authorization masking 不泄漏资源是否存在。它消费已签署的 B-2a correction
plan 与其中 §4.5 的错误合同，不替代后续 C4 的真实 task runtime/数据库 Gate。

本文件只定义 Gate，当前不得实现。第五版（本版）candidate raw bytes 一旦被架构/运行时、安全/隐私、
测试/质量三方签署即永久不可修改；签署结论与 `implementation_release` 只能写入独立
`b2a-c1-http-leak-gate-signoff.md`，由其引用本合同 raw SHA。实现必须消费该独立 signoff 所引用
的 immutable contract raw，且只有 signoff 证明三方 `PASS`、`open_P0_P1=[]` 才允许开始。

固定边界：

- 不启动、不连接、不模拟 PostgreSQL；不得读取任何真实业务 repository。
- 不新增 npm/pnpm 依赖；使用现有 Nest/Express、Node 原生 HTTP client 与
  `process.hrtime.bigint()`。
- 必须经过真实 Nest route matching、guard、controller dispatch 和全局 exception filter；
  禁止直接调用 filter 的 `catch()` 冒充 HTTP Gate。
- 全局 filter 必须直接实例化生产导出的 `ApiExceptionFilter`；禁止复制、继承、包装或重写
  filter 逻辑。
- fixture controller、guard、内存 repository/counter 与 trace collector 只能定义在
  `apps/api/src/shared/filters/api-exception.filter.spec.ts` 的 test-only 编译边界内，禁止注册到
  `AppModule` 或 production provider graph。
- 实现写路径只允许：
  `apps/api/src/shared/filters/api-exception.filter.spec.ts`，以及本任务 `research/` 下的 Gate
  evidence 和原始 JSON artifact。禁止修改业务 runtime、controller、guard、repository、shared
  contract、migration、`ApiExceptionFilter` 本体或其他文件。

## 2. 最小真实 HTTP fixture

### 2.1 应用与公共路径

测试在进程内创建一个只含 fixture module 的 Nest application，绑定 OS 分配的 loopback
临时端口；测试结束必须 `app.close()`。唯一公共 route template 固定为：

```text
GET /__gate/property/tasks/:taskId
```

四个 case 均经过同一个 Nest controller method、同一个 authorization guard class 和同一个
全局 `ApiExceptionFilter` instance。两个 hidden case 使用长度相同、格式合法的 lowercase UUID；
请求 method、route template、header key set、actor/authority fixture 完全相同，仅 opaque
`:taskId` 值不同。内存 repository 预置 `hidden-existing` 与 `authorized-existing-baseline` UUID，
而 `hidden-missing` 与 `authorized-missing` UUID 不存在；authorization guard 不得读取、探测或
接收该 seed 状态。

固定 test clock 与 CLS：在每次 exact-byte/assertion 与采样窗口中，`Date.now()` 返回同一已记录
的整数，fixture `ClsService.getId()` 返回同一已记录 request id。测试必须在 `finally` 恢复 clock、
关闭 application，不得污染其他 test。此固定只消除 error envelope 的已知非业务波动，不改变
guard/filter 分支。

### 2.2 四个必测 case

| Case | 前置权威 | repository 状态 | 唯一结果 | repository lookup |
|---|---|---|---|---:|
| `hidden-existing` | 同一 actor 无 read authority，guard 走 signed forbidden branch | existing | HTTP 403 `property-action-forbidden` | **0** |
| `hidden-missing` | 与上一行逐字段相同 | missing | HTTP 403 `property-action-forbidden` | **0** |
| `authorized-missing` | read authority 已通过，handler 可查询 | missing | HTTP 404 `property-resource-not-found` | 1 |
| `authorized-existing-baseline` | 与上一行相同的 read authority | existing | fixture HTTP 200 baseline | 1 |

`hidden-existing`/`hidden-missing` 本身就是签署的 legitimate-forbidden 403 基线，不再存在
“hidden 返回 404”的第二语义。两者必须在 repository query 之前，由同一个 authorization
branch 抛出 exact 相同的 signed `ForbiddenException`。`authorized-missing` 则证明只有 read
authority 通过后，handler 才查询并以合法 404 拒绝 missing；`authorized-existing-baseline`
证明同一 authorized 查询路径对 existing 能进入同一 repository lookup 并成功，防止 fixture
把 authorized 分支写成无条件 404。

fixture 不得先查询“存在吗”再决定 403，也不得在 guard 中使用 seed、taskId allowlist 或存在性
oracle。若任一 hidden case 的 handler enter counter、repository lookup counter 或任何 resource
branch counter 非 0，Gate 立即 FAIL。仅仅返回相同 403 不足以 PASS。

## 3. Exact HTTP wire

所有响应均断言真实 HTTP status、原始 response bytes、`Content-Type` 与 `Content-Length`；禁止只对
解析后的对象做部分匹配。JSON key 顺序使用生产 filter 实际序列化顺序，并在 artifact 中保存
原始 UTF-8 body 及其 SHA-256。

合法 403 必须满足：

```json
{
  "code": 403,
  "message": "Resource not available",
  "data": {
    "errorCode": "property-action-forbidden",
    "retryable": false,
    "details": {}
  },
  "request_id": "<fixed-gate-request-id>",
  "server_time": "<fixed-integer>"
}
```

`authorized-missing` 的合法 404 必须满足：

```json
{
  "code": 404,
  "message": "Resource not available",
  "data": {
    "errorCode": "property-resource-not-found",
    "retryable": false,
    "details": {}
  },
  "request_id": "<fixed-gate-request-id>",
  "server_time": "<fixed-integer>"
}
```

上面是结构展示；exact expected bytes 必须由固定值拼成单行 UTF-8 JSON，不得把
`server_time` 序列化成字符串。403 与 404 分别断言 status 正确，不能以一个状态替代另一个。
`authorized-existing-baseline` 必须 status=200、repository lookup=1；其 fixture-only success body
只用于证明 authorized existing 路径可达，不得被记录或描述成产品 success wire。

`hidden-existing` 与 `hidden-missing` 还必须逐字满足：

- status、message、data、递归 key set 和 key order 完全相同；
- raw canonical response bytes 完全相同，body SHA-256 完全相同；
- `Content-Length` header 存在、为十进制 body byte length，且两 case 完全相同；
- `recoveryAction`、`latestVersion` 与任何 extra key 均 omitted；
- body/header 不含 task/source UUID、tenant、park、queue、module、permission、actor、token、epoch、
  SQL、stack、class、repository、exist/missing/hidden 等内部或存在性信息。

header 比较只覆盖业务可控且由该 fixture 产生的 `Content-Type`/`Content-Length`；Node/Express
自动生成的连接、日期等传输 header 不得被误列为产品 wire，也不得据此宣称等价。

### 3.1 恶意 canary 输入与裁剪/拒绝

403 与 404 各自除 clean signed input 外，必须通过真实 HTTP pipeline 注入恶意 canary。恶意
payload 不得只塞进测试断言对象，必须存在于 guard/handler 实际抛给 production filter 的 Nest
HTTP exception response body。`errorCode` 与 `retryable` 是 signed control fields，不属于恶意
canary；clean 与 `canary-crop` 的 403/404 output 必须按 §3 exact 保留二者。`canary-crop` 的完整
own-key insertion order 与 value 固定如下，不得增加、删除、重排或替换字段：

```text
message="tenant secret existence detail"
errorCode="<case-signed-property-error-code>"
retryable=false
actionId="property.task.must-not-leak"
targetId="00000000-0000-4000-8000-ffffffffffff"
expectedVersion=9007199254740991
actualVersion=9007199254740990
latestVersion=8999999999999999
blockers=["secret-blocker"]
claimToken="secret-claim-token"
claimEpoch=777
stack="secret-stack"
sql="select secret"
repository="SecretTaskRepository"
sourceId="00000000-0000-4000-8000-eeeeeeeeeeee"
internalPayload={"tenantId":"secret-tenant","parkId":"secret-park"}
details={"sourceId":"secret-source","internal":{"sql":"secret-sql"}}
```

其中 hidden pair 的 `errorCode` 都是 `property-action-forbidden`；authorized 404 probe 的
`errorCode` 是 `property-resource-not-found`。`canary-invalid-recovery` 只在
`latestVersion` 后、`blockers` 前插入
`recoveryAction="property.task.attacker-token"`，其余 key/order/value bytes 保持不变。

因 403/404 的签署合同要求 `recoveryAction` omitted，production filter 对错误 recovery token 的
当前 fail-closed 行为必须单独可见，不能被测试偷偷删除后再调用 filter：

1. `canary-crop` probe 注入上述完整 body，但不含 `recoveryAction`；expected status/message
   保持对应 403/404，`data.errorCode` 与 `data.retryable` 必须 exact 保留签署值，`data.details`
   必须 exact 为 `{}`。禁止输出只覆盖恶意 message value 与未签/敏感 extra keys/values：
   `actionId,targetId,expectedVersion,actualVersion,latestVersion,blockers,claimToken,claimEpoch,stack,
   sql,repository,sourceId,internalPayload`，以及输入 `details.sourceId`、`details.internal` 的 key/value。
   这些禁止项均不得出现在 raw body；不得把必须保留的 `errorCode/retryable` 计为泄漏 canary。
2. `canary-invalid-recovery` probe 在同一输入上再加入错误 `recoveryAction`；expected
   status/message 保持对应 403/404，但 `data` 必须 exact 为 `null`，证明 production filter
   拒绝未签 token，而不是回显、兼容或降级接受。

两个 probe 都必须断言 raw bytes、Content-Length、递归 key set、敏感字符串 absence 和实际
production filter 输入/输出 witness。不得把 `data:null` 的 fail-closed probe 冒充 clean 403/404
产品 wire；clean signed input 和 `canary-crop` 仍必须满足本节 exact structured data。

## 4. Authorization-before-query 结构证明

fixture 必须为每个请求产生不可变 trace。事件 vocabulary、顺序与计数固定如下：

```text
guard.enter
guard.base-read-authority.denied
guard.forbidden
```

两个 hidden case 的 trace event sequence、operation counters、guard decision code 必须 exact
相同。controller method 在 Nest route resolution 中相同，但两 case 均不得进入 handler；
`handler.enter=0`、`repository.lookup=0`、`resource.branch=0`。trace 中禁止写入 taskId 或 seed
existence。

生产 filter 没有测试 trace hook，且本 Gate 禁止包装或修改它，因此 filter branch 使用可复算的
输入/输出 witness，而不伪造内部 trace。timing hidden pair 的 `filterInputWitness` 唯一固定为
§3.1 完整 `canary-crop` exception response body：包含 `message,errorCode,retryable`、完整
`details` 嵌套和本合同冻结的全部未签/敏感 extra keys，只排除该 probe 明确不含的
`recoveryAction`。两个 guard
必须抛出同一 Nest exception class、同一 status；该 body 的 own key set、key insertion order、
每个递归 value 和完整序列化 bytes 在两 case 必须 exact 相同。禁止只比较
`{message,errorCode,retryable,details}` 子集后声称同一输入。

实际同一 `ApiExceptionFilter` instance 消费后，status、raw body 与 Content-Length 又必须 exact
相同。artifact 分别记录完整 `filterInputWitness` 与 `filterOutputWitness`。clean signed witness
只作为独立 clean probe 保存，不参与 timing hidden pair，也不得替换完整 canary-crop witness。
这组输入/输出 witness 是本 Gate 对“同一 filter branch”的判据；不得用 mock filter 或 fixture
自己生成响应。

hidden pair 共同构成唯一预签 403 forbidden trace。`authorized-missing` 必须验证
`guard.base-read-authority.allowed -> handler.enter -> repository.lookup -> handler.not-found`
且 lookup exact 1；`authorized-existing-baseline` 必须使用相同 allowed/handler/repository 前缀、
lookup exact 1 后成功。四条都记录各自 filter/response witness；不得用 authorized 支线放宽
hidden pair 的查询前拒绝要求。

## 5. Timing no-existence-leak 判据

### 5.1 唯一 PASS 判据

本 Gate 对结构性 timing side-channel 使用预先签署的等价判据：

```text
same route handler selection
AND same guard branch and trace
AND handler non-entry in both cases
AND same filter input/output witness, proving the same production filter branch
AND exact same operation counts
AND repository/resource query count = 0 in both cases
AND exact same canonical response bytes and Content-Length
```

全部成立才是 `timing_no_existence_leak=PASS`。任一 case 进入 handler/resource/repository 分支，
或 trace/计数/bytes 不同，立即 FAIL。

这比易抖动的墙钟阈值更强：它直接排除了因“存在时多做一次查询/分支”产生的秘密相关工作，
并证明公共 HTTP 输出相同；墙钟分布会受到 JIT、GC、scheduler、CPU frequency、邻居进程和网络
栈噪声影响，有限样本的“未观察到显著差异”不能证明等价。因此不得设置、调优或事后发明
平均值、百分位、方差、显著性或纳秒差阈值，也不得以墙钟相近宣称 PASS。

### 5.2 诊断性墙钟样本

虽然墙钟不参与 PASS，仍必须记录可复查的诊断样本：

- hidden pair 的 warmup/测量统一使用 §3.1 `canary-crop` 输入；两 case 的完整 exception input
  bytes 必须相同。clean 与 `canary-invalid-recovery` 仍各自运行 exact probe，但不混入 timing 样本。
- warmup 固定为 40 个请求：从 `hidden-existing` 开始，严格按
  `hidden-existing,hidden-missing` 交替 20 轮。artifact 必须保存完整 `warmupOrder`。warmup 不记录
  测量样本、不初始化或消费 derived seed/PRNG state；禁止使用随机 warmup。
- measurement 固定为两个 hidden case 各 100 个样本。诊断采样的 case label 只能是
  `hidden-existing`、`hidden-missing`；不得复用旧 `legitimate-*` 名称。
- PRNG 固定为 `xorshift32-v1`。每步对 unsigned 32-bit state 依次执行
  `x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state = x >>> 0`；按输出最低 bit 选择下一 case，
  同时维持两个 case 的剩余额度，某一额度耗尽后只选另一 case。
- seed 不得人工选择。执行时先读取 signed contract raw bytes、base commit 与执行中的 spec raw
  bytes，计算 `SHA-256(contractRawBytes || UTF8(lowercaseBaseCommit + "\n") || specRawBytes)`，取
  digest 前 4 bytes 按 unsigned big-endian 解释为 32-bit seed；若结果为 0，唯一替代值固定为
  `0x6d2b79f5`。contract raw 只包含本规则而不包含执行 seed，spec raw 也不得硬编码 seed，故无
  自引用。artifact 同时记录 digest、derived seed 十进制/八位 lowercase hex 和是否使用零值替代。
- warmup 全部结束后，measurement 开始前才以派生的非零 seed 初始化一次 xorshift32 state；
  measurement 的第一步才允许首次消费该 state。artifact 必须保存 `measurementInitialState`、
  完整 `measurementOrder` 与最后一步后的 `measurementFinalState`。不得先按 case 分组再采样，
  不得在 warmup 消费 state，不得重复初始化，也不得重跑后挑选“更好”的 seed/artifact。
- 每个请求紧邻调用 `process.hrtime.bigint()` 记录 `startNs`、`endNs` 与 `elapsedNs` 的十进制
  字符串；禁止转成有精度损失的 JSON number。
- 每个样本同时记录 status、Content-Length、body SHA、trace、operation counters 与零 repository
  lookup 断言结果。
- 可以输出 min/median/p95 等描述性诊断，但必须标记 `diagnostic_only=true`，不得输出
  equality verdict、阈值或显著性结论；异常样本不得删除。

## 6. 原始 artifact 与可复算证据

原始 JSON artifact 建议固定路径：

```text
.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-http-leak-gate-artifact.json
```

artifact 必须为 UTF-8、LF-only、无 BOM、final LF，至少包含：

```text
schemaVersion
gateId
generatedAt
contractRawSha256
signoffRawSha256
signoffContractRawSha256
signoffImplementationRelease
filterSourceRawSha256
filterSpecRawSha256
filterAggregateSha256
consumedSharedSourceSha256
baseCommit
dirtyWorktreeDisclosure
executionCwd
executionCommand
executionExitCode
nodeVersion
osPlatform
osRelease
osArch
nestVersion
fixedClockMs
fixedRequestId
randomAlgorithm
randomSeed
randomSeedInputSha256
randomSeedHex
randomSeedZeroSubstituted
warmupOrder[]
measurementInitialState
measurementOrder[]
measurementFinalState
timingWarmupCountPerHiddenCase
timingSampleCountPerHiddenCase
orderedTimingSamples[]
exactWireCases{}
maliciousCanaryCases{}
structuralEquivalence{}
diagnosticOnlyTimingSummary{}
```

`baseCommit` 使用 `git rev-parse HEAD`；Node/OS 来自当前进程，不允许手填。四个 exact case key
必须逐字为 `hidden-existing`、`hidden-missing`、`authorized-missing`、
`authorized-existing-baseline`。`orderedTimingSamples[]` 保留两个 hidden case 随机交错后的原始顺序。
每个 sample 保存 case、sequence、start/end/elapsed ns、raw body、body SHA、content length、trace、
counters 与 assertion booleans。

artifact/evidence 必须绑定执行时 exact bytes，而不是只写文件名或工作树描述：

- 本 signed contract regular file raw SHA-256；
- 独立 signoff regular file raw SHA-256、其中引用的 contract raw SHA 与
  `implementation_release=allowed`；
- `apps/api/src/shared/filters/api-exception.filter.ts` raw SHA-256；
- `apps/api/src/shared/filters/api-exception.filter.spec.ts` raw SHA-256；
- 按 correction plan §4.10 `b-property-error-filter-v1` grammar 独立复算的
  `B-property-error-filter SHA`；
- 本次消费的 signed shared source SHA-256；
- base commit，以及 dirty worktree disclosure 中与上述 exact file bytes 的关系；
- 未经 shell 展开的完整执行 argv/command 字符串、absolute cwd、exit code；
- `process.version` 与 OS platform/release/arch。

执行前先读取并冻结这些 bytes/hash，验证独立 signoff 后，seed 从同一 contract/spec/base commit
输入机械派生；测试结束后再次复算 contract/signoff/filter/spec raw SHA，任一 before/after 不同
立即 FAIL，artifact 不得发布为有效证据。signoff 引用、filter aggregate SHA、shared SHA 或 base
commit 不匹配签署 handoff 也立即 FAIL。

artifact 写入后计算 raw-file lowercase SHA-256；evidence 必须记录 artifact path、raw SHA、生成
命令、targeted test exit code、实际 sample/warmup 数、Node/OS/base commit、四 case exact wire
结论、全部 canary probe、hidden pair 结构判据逐项结论和任何 known failure。reviewer 必须能够仅凭
仓库 exact files、base commit、命令/cwd 与 artifact 重算 contract/filter/spec raw SHA、filter
aggregate SHA、seed/input digest 和 artifact SHA。任何修改 artifact 后都必须重算 SHA，禁止在
hash 后回填字段。

墙钟差异只能作为诊断事实记录，不能作为“存在/不存在相同”的证据；最终等价结论只能引用
§5.1 的结构判据。

## 7. Gate 命令与失败条件

实现阶段使用仓库现有 API unit-test entry，仅运行指定 filter spec；不需要也不得启动数据库。
evidence 必须记录实际执行的完整命令，不能在本候选合同中预写 PASS。targeted command 成功后
再执行 API typecheck；若 typecheck 有既有无关失败，必须列出原始失败和归因，不能把 targeted
Gate PASS 扩张成 API 全量 PASS。

以下任一条件为 stop-ship：

- 未经过真实 Nest HTTP pipeline，或没有使用生产 `ApiExceptionFilter`。
- 403/404 状态或 exact wire 不符合 §3。
- hidden pair 任一不是 exact 403 `property-action-forbidden`，或 authorized missing 不是查询一次后
  exact 404 `property-resource-not-found`。
- `authorized-existing-baseline` 未查询一次并成功，导致 authorized fixture 可能是无条件 404。
- hidden pair 的 response canonical bytes、Content-Length、trace 或 operation counts 不同。
- hidden pair 任一 handler/repository/resource counter 非 0。
- guard 读取 repository、seed、存在性 oracle，或按 hidden taskId 分支。
- 恶意 message 与任一本合同冻结的未签/敏感 extra key/value 未实际进入 HTTP exception input，或其中
  任一禁止项出现在 output。
- clean/`canary-crop` 的 `errorCode/retryable` 未按 403/404 signed control fields exact 保留，或把
  二者错误计为禁止输出 canary。
- 错误 recovery token 未实际插入冻结位置，或未使 structured `data` fail closed 为 null。
- timing PASS 依赖墙钟阈值、统计显著性或删除异常样本。
- 未按签署 raw bytes/base commit/spec bytes 与 `xorshift32-v1` 机械派生/消费 seed，固定顺序、
  人工选 seed、在 warmup 消费 seed、重复初始化、未保存 initial/final state、挑选重跑 artifact、
  样本不足，或未用 `process.hrtime.bigint()`。
- warmup 不是固定 20 轮交替、未保存 warmup order，或 measurement 不是派生 state 的唯一消费期。
- 缺 immutable contract/signoff/filter/spec raw SHA、signoff contract 引用与 release、filter aggregate
  SHA、consumed shared SHA、完整 command/cwd/exit、Node/OS/base commit，或 before/after exact bytes
  改变。
- 原始 artifact 缺失、SHA 不可复算，或 artifact 含敏感/真实业务数据。
- 为通过 Gate 修改业务 runtime/filter 本体、启动数据库或新增依赖。

## 8. 三方签署与实施释放

实施前必须由互不替代的三方对本文件 raw SHA 逐字复核：

1. 架构/运行时 reviewer：真实 pipeline、同 route/branch、生产 filter 消费和零 repository
   dependency。
2. 安全/隐私 reviewer：masking、敏感字段、authorization-before-query 与结构 timing 判据。
3. 测试/质量 reviewer：四 case、exact bytes/content-length、随机采样、artifact/SHA 可复算性与
   cleanup。

签署结论唯一写入：

```text
.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-http-leak-gate-signoff.md
```

该独立 signoff 必须记录本 immutable contract path/raw SHA、三位 reviewer 的 P0/P1/P2 与逐项
disposition、`open_P0_P1` 和 `implementation_release`。不得在本合同追加签名、PASS、reviewer、
implementation SHA 或执行结果；也不得为把状态从 candidate 改成 signed 而修改本合同任何 byte。

只有独立 signoff 中三方均 `PASS`、`open_P0_P1=[]` 且
`implementation_release=allowed`，唯一 filter-spec/evidence owner 才可实现。实现与后续 reviewer
必须先读取 signoff，复算 signoff 引用的本合同 raw SHA 与当前文件 exact 一致；不一致、signoff
缺失或仍 blocked 一律停止。无论签署前后，本合同顶部状态永久保持
`FIFTH-REVIEW CANDIDATE / IMPLEMENTATION BLOCKED`，其中 blocked 表示“本合同自身不授予实施”，
实施授权只来自独立 signoff。当前候选阶段的外部状态为：

```text
implementation_release=blocked
database_execution=forbidden
business_runtime_change=forbidden
```
