# Track C 架构与可靠性实施计划

> 仅规划，不实现代码。

## 1. Entry Gate

开始前必须：

- [x] B technical handoff SHA 已记录：`f4797adf` 及其正式 signoff。
- [x] B `open_P0_P1=[]`。
- [x] approval/identity/assignment/outbox contract snapshot 已冻结。
- [x] 各 domain owner 已由完成的 Track B handoff 释放路径。
- [x] `shared-property-web-owner` 已对
  `apps/web/features/property-shared/offline/**` 提供 path-specific handoff SHA。
- [x] offline handoff 记录 `writer_stopped=true`、base SHA、validation、known
  failures 和 `open_P0_P1=[]`，且 handoff SHA 是当前 branch ancestor。
- [x] 当前 branch 基于 B SHA。

Human UAT 未完成不是 Entry blocker。

## 1.1 执行状态（2026-08-04）

- B technical base：`f4797adf`，Entry Gate 已满足。
- C1 Homestay 已按单 closure 提交 dashboard/availability、rates、booking read、
  transaction support、booking command、stay/credential/guest、turnover 与 finance；最终
  SHA 为 `56b79013`，`HomestayService` 已由 2564 行降至 498 行，domain service `<=650`
  目标达成。完整 Homestay 最近一次 96 PASS / 3 PostgreSQL conditional skip。
- C1 Housing 已按单 closure 提交 dashboard、tenant/party、lease read、lease command、
  billing、finance/deposit、handover/repair、purchase 与 lease approval/checkout；最终 SHA
  为 `e9d8ffa8`，`HousingService` 已由 3554 行降至 488 行，domain service `<=650` 目标
  达成。完整 Housing 最近一次 124 PASS / 2 PostgreSQL conditional skip。
- C2 frontend/offline 基础 SHA 为 `38c433d3`、`c0678d18`、`92d062fa`、`c7c0eb51`；
  最终可靠性返修 SHA 为 `dddf8565`。三轮独立复审依次发现并关闭 queue 初始化窗口、
  `remark` fingerprint 漂移、module assignment/enable/expiry scope 三类 P1；最终 reviewer
  结论 `P0/P1/P2=0`、`open_P0_P1=[]`。真实 Nest multipart HTTP 已覆盖同 key replay、
  异 file/remark 409；C2 technical PASS。
- C3 machine gates：`17641fde`、`cd8ee7d8`、`b414aee0` 已提交；contract 与 complexity
  当前 PASS，正式性能执行器和隔离固定资源环境的自测通过。现有 UAT 容器因无资源限制、
  共享数据库/挂载且无 browser worker，已被正式审计拒绝用于性能验收。
- C3 formal performance：**NOT RUN / NOT PASS**。仍缺 30 个矩阵单元（2 scenarios x
  concurrency 1/10/30 x 5 runs）、每单元 2m warmup + 10m formal、>=10k requests、
  完整资源遥测、hash 与 cleanup proof；总运行时至少 6 小时。
- Track C Chrome 新切片：当前 WSL task 在任何 Chrome 扩展代码执行前被
  `sandboxCwd is not a local file URI: file:///home/jinhuit/...` 拦截。不得以应用内浏览器、
  Playwright 或 Computer Use 代替。既有 2026-08-04 Track B 全矩阵 UAT 仍保留且不重复，
  但不能冒充 Track C 新增离线/上传界面复验。
- 当前 Track C：`in_progress`；不得归档，不得将 machine-gate self-test、既有 Track B
  Chrome UAT 或环境健康检查等同于 Track C technical PASS。

## 2. Subagent Batches

### C0：基线

并行：

- homestay characterization owner。
- housing characterization owner。
- reliability/performance baseline owner。

只增加测试/报告，不移动实现。若 offline path handoff 尚未完成，reliability owner
只能只读 characterization。

### C1：Backend Closure

最多三个并行，但两个 domain 各自串行闭包：

- homestay decomposition worker。
- housing decomposition worker。
- property-port checker。

每个 closure 通过 targeted regression 后才进入下一个。

### C2：Frontend/Offline

- homestay feature cleanup。
- housing feature cleanup。
- C-reliability-owner 仅在 Entry Gate 的 path-specific handoff 完成后接管
  `apps/web/features/property-shared/offline/**`，并实现 shared offline/upload
  reliability。

不得与 C1 同时修改相同 feature/domain path；需要显式 SHA handoff。

返修按 ownership 路由：

- pre-handoff baseline 或其他 `property-shared/**` 路径问题退回
  `shared-property-web-owner`，C 停写并等待新 handoff SHA。
- post-handoff `offline/**` 问题由 C owner 修复、独立 reviewer 复审。
- shared contract、globals/DS 或 sibling feature 问题只提交 change request。
- 返还 `offline/**` 时 C 先输出 final SHA、测试和 `writer_stopped=true`，原 owner
  显式接收后才能继续写。

### C3：Non-functional

- reproducible performance/evidence。
- complexity/contract QA。
- docs/rollback checker。

### C4：Independent Review

- architecture reviewer。
- QA/reliability reviewer。
- release reviewer。

## 3. Machine Gates

### Compatibility

- OpenAPI/response snapshot 无未批准差异。
- old canonical/legacy routes。
- DTO validation。
- state/finance/occupancy/idempotency regression。

### Architecture

- no dual DI。
- no dual write/read。
- façade only orchestration。
- response types import shared。
- no source regex as sole correctness evidence。
- offline path handoff SHA、ancestor、单 writer 和返修记录完整。

### Frontend

- per-page request isolation。
- stable selection/detail。
- refresh/error/terminal behavior。
- 360/390/768/desktop。
- WCAG/DS。

### Offline/Upload

- TTL。
- logout/account/tenant/park/module/scope purge。
- sensitive fields not persisted。
- upload context and promise locking。
- 409 manual conflict。
- service worker does not submit business mutations。

### Performance/Evidence

- fixed resources/config。
- minimum duration/sample/5 runs。
- CI/error thresholds。
- artifact hashes。
- cleanup residual=0。

## 4. Validation Commands

按实际影响运行：

```bash
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web build
pnpm --filter @jinhu/shared build
pnpm typecheck
pnpm test
node scripts/e2e/first-release-regression.mjs
```

补充 targeted homestay/housing、approval/identity/finance、browser mobile、performance 和 cleanup。

## 5. Stop-ship

P0：

- 财务/approval/identity/occupancy 行为变化。
- sensitive draft 泄露。
- duplicate domain effect。

P1：

- 外部 contract 漂移。
- dual implementation。
- rollback closure 不可用。
- weak-network 文案与能力不一致。
- performance/WCAG Gate 失败。

## 6. Rollback

- 按 closure commit 回退。
- 关闭 `PROPERTY_OFFLINE_DRAFTS_V1`、`PROPERTY_UPLOAD_QUEUE_V1`。
- 保留 B durable data。
- 回退后运行相同 contract/finance/occupancy regression。
- rollback evidence 写入 handoff。

## 7. 人工 Gate

C technical PASS 后可将 `codex_execution_status` 推进到 `track_c_technical_passed` 或 `codex_complete`。External human lane 仍可为 awaiting；只有 Production Readiness Gate 需要真人 UAT 和签署。

## 8. Handoff

向父任务交付：

- B base SHA、C final SHA。
- ownership handoff records。
- offline path input/output handoff SHA 与 writer stop/resume records。
- contract/complexity/performance reports。
- rollback rehearsal。
- validation results。
- `open_P0_P1=[]`。
