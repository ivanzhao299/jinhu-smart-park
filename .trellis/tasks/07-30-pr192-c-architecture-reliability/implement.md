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
- C2 scoped offline reliability：`38c433d3` 已提交；非敏感草稿 24h TTL、
  tenant/park/user/module/permission scope、logout/401 cleanup、敏感字段 fail-closed，
  以及现场图片队列的显式同意/2h TTL/context binding 契约已落地。首个真实消费者为
  `/homestay/bookings` 创建草稿表单；上传恢复生产接入仍在执行，不能标记 PASS。
- C2 frontend cleanup：`c0678d18` 已提交；`HomestayListClient` 从 451 行降到
  233 行，请求/筛选状态已抽成独立 hook，相关契约 7/7 PASS。
- C1 Housing dashboard closure：`88033a9a` 已提交；Dashboard 行为测试 6/6、
  Housing suite 99 PASS / 2 PostgreSQL conditional skip。下一 tenant/party closure 执行中。
- C1 Homestay dashboard/availability closure：`7ab44df4` 已提交；targeted 39/39、
  Homestay suite 87 PASS / 3 PostgreSQL conditional skip。下一 rates closure 执行中。
- C3 machine gates：`17641fde` 已提交；自测 10/10，contract snapshot PASS，
  complexity Gate 在修复住房 dashboard complexity 21 后已 PASS。
- C3 formal performance：**NOT RUN / NOT PASS**。正式执行器和固定资源环境仍需完成；
  验收器会对缺失的 30 个矩阵单元、2m warmup、10m formal、10k samples、资源遥测
  与 cleanup proof fail closed。
- 当前 Track C：`in_progress`；不得归档，不得将 machine-gate self-test 等同于
  formal performance evidence。

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
