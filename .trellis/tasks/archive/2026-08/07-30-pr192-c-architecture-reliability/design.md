# Track C 架构与可靠性设计

## 1. Ownership 与 Handoff

只有收到 B technical handoff SHA 后接管：

```text
apps/api/src/modules/homestay/**
apps/api/src/modules/housing/**
apps/web/features/homestay/**
apps/web/features/housing/**
```

本任务持续独占：

```text
apps/web/components/runtime/MobileTerminalReliability.tsx
scripts/e2e/property-remediation/performance/**
scripts/e2e/property-remediation/evidence/**
```

`apps/web/features/property-shared/offline/**` 默认仍属于父表唯一
`shared-property-web-owner`。C 只有取得该 owner 的显式、path-specific handoff 后
才能接管，handoff 必须包含：

```text
from=shared-property-web-owner
to=C-reliability-owner
owned_path=apps/web/features/property-shared/offline/**
base_sha
handoff_sha
validation_results
known_failures
open_P0_P1=[]
writer_stopped=true
```

`writer_stopped=true` 表示 shared-property-web-owner 已停止写该子路径；在此之前 C
只能只读 characterization，不得修改。handoff 不扩大到
`apps/web/features/property-shared/**` 的其他路径。

可能共享的：

- `apps/api/src/app.module.ts` 只由父级 api-integration-owner 修改。
- `packages/shared/src/property-business/**` 只提交 change request，由 shared-contract owner 修改。
- `apps/web/app/globals.css` 只由 shared Web/Design System owner 修改。
- `database/migrations/**` 默认不修改；确需 schema 必须重新 architecture review 和 reservation。

不得修改其他 task 目录或父 task registry。

### 1.1 接管与返修

接管清单：

- handoff SHA 是当前 branch ancestor。
- owned path 精确为 `offline/**`，不存在通配扩大。
- 原 owner 的未提交改动为零，且已声明停止写入。
- baseline tests、known failures 和 `open_P0_P1=[]` 已记录。
- C owner 在 ownership registry/check log 记录开始时间与 base SHA。

返修流程：

1. handoff 前或 shared sibling path 的缺陷，退回 `shared-property-web-owner` 修复；C
   保持只读，接收新 handoff SHA 后重新基线。
2. handoff 后仅位于 `offline/**` 的缺陷由 C owner 修复并由非修复者复审。
3. 需要 shared contract、Design System 或其他 `property-shared/**` 修改时提交 change
   request，由原唯一 owner 实施；C 不越界修改。
4. 若需把 `offline/**` 返还，C 先提交 targeted tests 和 final SHA，声明
   `writer_stopped=true`；shared-property-web-owner 明确接收后才恢复写入。任何返修都
   不允许两名 owner 同时写同一路径。

## 2. Backend Façade

保持 controller → façade 外部形状。每个闭包按顺序：

1. characterization/integration tests。
2. 确认 transaction、locks、attachments、occupancy、finance dependencies。
3. 抽 query 或完整 command closure。
4. façade 切换。
5. 同一提交删除旧 repository/property-service DI 和旧实现。
6. targeted regression。
7. handoff/checkpoint。

民宿顺序：

1. dashboard/availability query。
2. rates。
3. booking lifecycle。
4. stay/credential/guest。
5. turnover。
6. finance。

住房顺序：

1. dashboard query。
2. tenant/party facade。
3. lease lifecycle。
4. billing。
5. finance/deposit。
6. handover/repair。
7. purchase。

## 3. Property Port

Adapter 先实现但不并行调用。切换提交必须：

- 调用方只注入 port。
- 删除旧 PropertyOperationsService/OccupanciesService DI。
- 不 dual read。
- 不 dual write。
- 保持 advisory lock、DB trigger、exclusion、source owner 和 `[start,end)` 合同。

## 4. Frontend

Route page 只组合 feature components。Feature API 引用 shared response contract。

要求：

- 每页只请求本工作面数据。
- query/mutation 独立。
- 最新请求序列控制。
- 同步 in-flight lock + 稳定 idempotency key。
- target/version-bound draft。
- list/detail identity 分离。
- 失败保留 last successful projection。
- terminal/reorder 不清除已选 detail。

禁止：

- 复制 `apiRequest` 和 response type 到每页。
- 一次 mutation 全量刷新所有业务上下文。
- 用 page membership 决定 detail ownership。

## 5. Offline Draft

IndexedDB key：

```text
tenantId + parkId + userId + route + entityId/draftId
```

- 非敏感 draft TTL 24h。
- logout、账号/tenant/park/module/scope 变化立即清理。
- 身份号码、身份文件、支付凭证默认不保存。
- 现场照片离线队列需显式同意，blob TTL≤2h。
- 不后台自动执行业务 mutation。
- 409 展示 local/server version，人工选择。
- 未真正持久化前，网络 banner 只提示不要刷新。

## 6. Upload Queue

- 复用 shared FileUploader/AttachmentList/FilePreview 和 shared policy。
- domain permission 与 generic file permission 取交集。
- queue 绑定 biz type/id、tenant/park/user/entity version。
- context 变化暂停并阻止提交。
- upload in flight 通知 parent form。
- submit 等待所有上传 promise。
- success/logout/cancel 后按 policy 清理 blob。
- protected evidence 不通过 generic delete 绕过。

## 7. Complexity

硬门禁：

- 新 route client ≤450 行。
- 新普通 component ≤300 行。
- 新 function ≤80 行。
- cyclomatic complexity ≤15。
- 现有超限文件不得增长。

目标：

- route client ≤300。
- component ≤220。
- domain service ≤650。

例外必须有 expiry ADR，但不能豁免权限、财务、并发或数据隔离。

## 8. Performance 与 Evidence

固定资源：

- Web 1 vCPU/1 GiB。
- API 2 vCPU/2 GiB。
- PostgreSQL 2 vCPU/4 GiB。
- Browser worker 2 vCPU/2 GiB。

记录 PostgreSQL 参数、镜像 digest、seed、business clock。每场景：

- warmup 2m。
- formal 10m。
- ≥10,000 requests。
- concurrency 1/10/30。
- 5 runs。
- cold/warm 分开。
- p50/p90/p95/p99、throughput、错误率、CPU/memory/GC/DB waits。

Evidence：

```text
commit SHA
environment digest
dataset/profile checksum
command/time/exit
artifact SHA-256
failure logs
cleanup manifest/result
reviewer
```

## 9. Rollback

- 每个 closure 单独提交，可按 closure 回退。
- 关闭 offline/upload flags。
- 不回滚 B schema 或 durable approval/identity records。
- 不改变 executed approval。
- 若 façade 回退，仍通过 B canonical ports/contracts。
- 目标 RTO≤30m；财务/审批 RPO=0。

## 10. Handoff

C technical handoff：

```text
B base SHA
C final SHA
contract snapshot diff
closure list
complexity report
performance evidence
offline/upload evidence
offline path input/output handoff SHAs
open_P0_P1=[]
```
