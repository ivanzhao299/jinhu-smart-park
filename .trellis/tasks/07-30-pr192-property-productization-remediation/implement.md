# PR192 房产业务产品化整改实施计划

> 本文件只规划执行顺序、所有权、Gate 和验证，不实现业务代码。
>
> 面向非技术人员的阶段进度、负责人、证据和周报入口见
> [执行路线图](./execution-roadmap.md)。

## 1. 前置条件

- 当前分支：`codex/pr192-property-productization-remediation`
- PR 目标分支：`main`
- scope：`workspace`
- assignee：`emvia`
- priority：`P0`
- 所有实现开始前使用 `trellis-before-dev` 读取目标 layer spec。
- 所有实现完成后由不同 subagent 使用 `trellis-check`。
- 根 Codex 固定占一个并发槽；最多三个 subagent 同时运行。

## 2. 最终 Ownership

| Owner | 独占范围 |
|---|---|
| shared-contract-owner | `packages/shared/src/property-business/**`；本计划中唯一允许改 `packages/shared/src/index.ts` 的 owner |
| schema-migration-owner | 本计划全部 `database/migrations/<reserved>_*.sql` |
| menu-projection-owner | `apps/web/lib/menu.ts`；`apps/api/src/modules/users/users.service.ts` 的 property menu projection |
| property-workbench-safety-owner | `apps/api/src/shared/property-workbench/**` 和 Track A feature-flag/fail-closed policy tests；不得写领域 service |
| shared-property-web-owner | `apps/web/features/property-shared/**`、`apps/web/app/assets/parties/**`、`apps/web/app/assets/property-operations/**`、`apps/web/app/assets/property-occupancies/**`、`apps/web/app/assets/property-mode-transitions/**` |
| homestay-web-owner | `apps/web/app/homestay/**`、`apps/web/features/homestay/**`、本领域 Web tests |
| housing-web-owner | `apps/web/app/housing/**`、`apps/web/features/housing/**`、本领域 Web tests |
| property-foundation-api-owner | `apps/api/src/modules/property-operations/**` |
| approval-runtime-owner | `apps/api/src/modules/property-approvals/**` |
| property-task-owner | `apps/api/src/modules/property-tasks/**` |
| module-dependency-owner | `apps/api/src/modules/saas-modules/**` |
| api-integration-owner | `apps/api/src/app.module.ts` 和最终跨模块 wiring |
| homestay-api-owner | `apps/api/src/modules/homestay/**` 和本领域 API/integration tests；Track A 负责 high-risk server gate、booking/credential projection，Track B 再接 approval adapter |
| housing-api-owner | `apps/api/src/modules/housing/**` 和本领域 API/integration tests；Track A 负责 high-risk server gate、tenant list/create projection，Track B 再接 approval adapter |
| migration-reconcile-owner | `scripts/property-remediation/migration/**` |
| qa-automation-owner | `scripts/e2e/property-remediation/**`、fixture、performance、evidence runner |
| property-env-doc-owner | `.env.example`、`.env.production.example` 和 Track A feature-flag/409 compatibility 的环境、部署、测试文档 |
| docs-release-owner | 本任务后续 PRD/UAT/角色手册/发布/回滚文档，但不覆盖 `property-env-doc-owner` 的 env/feature-flag 文档 |

同一路径任意时刻只能有一个 owner。Handoff 必须记录 from/to owner、owned paths、base SHA、handoff SHA、验证命令、已知失败和 open P0/P1。Open P0/P1 非空不得交接。

## 3. Migration 分配

只有 `schema-migration-owner` 创建 migration：

1. 扫描所有 filename 和 migration history。
2. 计算当前最大安全编号。
3. 在实施阶段登记连续 reservation block。
4. 依次分配：
   - A permissions/menu
   - identity snapshot/submission
   - approval decision/execution
   - task assignment
   - outbox/inbox/DLQ
   - module/bundle grants
   - compatibility/reconcile constraints
5. 其他 worker 只提交 schema request。
6. 新 migration 并发进入仓库时重新检查编号。
7. checksum/history 冲突立即 stop-ship。

## 4. 执行批次

### Batch A0：合同与 Schema

先由 shared-contract-owner 冻结六层 manifest、response contracts；产品规划 subagent
冻结 IA、permission bundle、legacy compatibility。输出 A-contract candidate SHA 后，
必须先执行下述 A0-S stop-ship 批次，不能直接开始 menu/migration：

### Batch A0-S：Server Fail-closed 与 Field Projection

严格依赖 A-contract candidate SHA，最多三个实现 owner 并行：

- property-workbench-safety-owner：实现 `PROPERTY_WORKBENCH_V2` 的唯一 server-side
  policy；off/unset 保持 legacy，true 返回统一 409，super/wildcard 不绕过。
- homestay-api-owner：接入 homestay cancel 与 ledger discriminator；修复 booking
  detail、credential issue/return 的 `credentialReference` masked projection。
- housing-api-owner：接入 lease、ledger discriminator、purchase 共 6 个领域入口；
  修复 tenant list/create 的 `mobile`/`email` masked projection。

三份实现完成后，property-env-doc-owner 串行同步 env example、部署/测试和 compatibility
文档。独立安全/API checker 必须运行：

- flag off、unset、true 三态矩阵。
- 8 个 high-risk action × normal/super/wildcard；true 时均为 409。
- 两个 ledger endpoint 的 safe/high-risk discriminator 邻接用例。
- housing list/create 与 homestay detail/issue/return response snapshot，禁止完整敏感值。
- API 全量 unit、shared/API/Web typecheck，以及 legacy characterization。

任一缺项为 P0/P1 stop-ship。Gate 通过后发布 `A-server-safety SHA` 与修订后的
`A-contract SHA`；open P0/P1 必须为空。

执行记录（2026-07-30）：A0-S 独立复审已 PASS，`open_P0_P1=[]`。复审期间发现并
修复 canonical metadata 缺失/不匹配时可能 fail open 的问题；focused tests 44/44，
API lint/typecheck/build、Shared build、Web typecheck 和 diff check 全部通过。
当前可冻结 contract/server-safety candidate；尚未生成 commit SHA，不在计划中编造。

只有 `A-server-safety SHA` 和最终 `A-contract SHA` 均已交付后：

- schema-migration-owner 完成 Track A permissions/menu schema migration。
- qa-automation-owner 只建立 traceability/evidence schema，不生成页面 route evidence。

输出：A-contract SHA、A-server-safety SHA、A-schema SHA。

### Batch A0.5：Shared Web Foundation

严格依赖 A-contract SHA 与 A-server-safety SHA，由 shared-property-web-owner 独占
`apps/web/features/property-shared/**`，完成共享 picker、task presentation、detail、
dialog、page-state 和 DS adapters。本批一个实现 owner，最多两个只读/独立 checker；
不得依赖 Track B identity、approval 或 task runtime。

输出规范的 `A-shared-web-foundation SHA`，handoff 包含 owned paths、A-contract
base SHA、组件 API、验证证据、known limitations 和 `open_P0_P1=[]`。

### Batch A0.6：A-base-core

严格依赖 A-contract SHA 与 A-schema SHA，由 qa-automation-owner 生成
`A-base-core`，完成 deterministic checksum、生产保护和 cleanup rehearsal，输出
`A-base-core fixture SHA`。A1 页面 worker 只能基于该 SHA 开始；core 发布后不得由
页面 worker 改写。

### Batch A1：前端 extract-first

前置仅为 A-contract SHA、A-schema SHA、A-base-core fixture SHA 和
`A-shared-web-foundation SHA`；不依赖 menu/landing/redirect handoff。最多两个
subagent 并行：

- homestay-web-owner：输出 `A-homestay-route SHA`。
- housing-web-owner：输出 `A-housing-route SHA`。

每个工作流先 characterization，再抽取，再删除旧 block；不得保留新旧双实现。
两份 handoff 均须包含 consumed foundation SHA、owned routes、base/output SHA、验证结果和
`open_P0_P1=[]`。

### Batch A2：Menu Projection 与 Route Evidence

- menu-projection-owner：消费两份 A1 route SHA，实现 canonical
  menu/landing/redirect，输出 `A-menu-projection SHA`。
- qa-automation-owner：消费两份 route SHA 和 `A-menu-projection SHA` 后生成
  `A-route-evidence`，运行精确角色
  Web/API E2E、route/page/API/data/file、viewport/WCAG 和 cleanup；不得改写
  `A-base-core`。

本批最多两个 subagent；输出 `A-menu-projection SHA` 与 `A-route-evidence SHA`。

### Batch A3：独立检查

- homestay reviewer。
- housing reviewer。
- RBAC/UX reviewer。

Gate A：

- manifest。
- menu/page/API/data/file。
- legacy 不扩权。
- desktop/mobile/WCAG/DS。
- A-base-core fixture SHA、cleanup，以及独立 A-route-evidence SHA。

Track A PASS 后，高风险生产 mutation 仍关闭。

### Batch B0：B schema 和合同

- shared-contract-owner：approval/identity/task/outbox contracts，输出
  `B-contract SHA`。
- schema-migration-owner：消费 contract SHA 完成 B expand migrations，输出
  `B-schema-expand SHA`。
- architecture checker：状态、原子性、锁序和 compatibility 审查。

本批最多三个 subagent；输出：B-contract SHA、B-schema-expand SHA 和
architecture review evidence。

### Batch B0.5：Property Foundation 与 Module Core

- property-foundation-api-owner：共享控制面、Party/identity，输出
  `B-property-foundation-runtime SHA`。
- module-dependency-owner：asset dependency，输出 `B-module-core SHA`。

本批严格依赖 B-contract SHA 和 B-schema-expand SHA，最多两个 subagent。每份
handoff 都必须包含 owned paths、base/output SHA、targeted tests 和
`open_P0_P1=[]`。

### Batch B1：Approval Runtime Core

本批只允许父表唯一 `approval-runtime-owner` 修改
`apps/api/src/modules/property-approvals/**`，实现 decision/execution、
maker-checker、claim/reclaim、atomic domain port 和 outbox/inbox/DLQ。前置为
B-contract SHA、B-schema-expand SHA 和已冻结的 property-foundation ports。

一个实现 owner，最多两个独立 fault/architecture checker。State/CAS、atomic crash、
outbox/inbox ordering、maker-checker 和 rollback Gate 全部通过后，单独输出规范的
`B-approval-runtime SHA`；handoff 包含 owned paths、ports、base/output SHA、
targeted evidence、known failures 和 `open_P0_P1=[]`。

### Batch B2a：Property Task Runtime Core

- 本批只允许父表唯一 `property-task-owner` 修改
  `apps/api/src/modules/property-tasks/**`，消费 B-contract/schema、
  `B-property-foundation-runtime SHA` 和 `B-approval-runtime SHA`，实现
  assignment、projection、list/count/rebuild，输出
  `B-property-task-runtime SHA`。

本批一个实现 owner，最多两个独立 concurrency/projection checker；未取得 claim
CAS、list/count predicate、rebuild 和 owning-assignment evidence 不得 handoff。
handoff 单独记录 owned paths、base/output SHA、consumed approval SHA、known failures
和 `open_P0_P1=[]`，不得与 `B-approval-runtime SHA` 合并。

### Batch B2b：B-extension-core Fixture

严格消费三个 runtime handoff：

```text
B-property-foundation-runtime SHA
B-approval-runtime SHA
B-property-task-runtime SHA
```

并同时校验 `B-module-core SHA`、B-schema-expand SHA 和 A-base-core checksum：

- qa-automation-owner：生成 `B-extension-core fixture SHA` 与 combined checksum。
- migration-reconcile-owner：校验 before/after mutation manifest、rerun 和 cleanup，
  输出 `B-extension-core validation SHA`。

本批最多两个 subagent。任一输入 handoff 缺失时 fail closed；后续 worker 不得就地
改写 core。

### Batch B2c：Homestay/Housing Domain Integrations

严格依赖 `B-extension-core fixture SHA` 和 validation SHA，最多两个领域 subagent
并行：

- homestay-api-owner：approval、check-in snapshot adapter，输出
  `B-homestay-domain SHA`。
- housing-api-owner：approval、finance/purchase/lease integration，输出
  `B-housing-domain SHA`。

两份领域 SHA 通过后，api-integration-owner 串行完成最终 API module wiring，输出
`B-api-wiring SHA`。B domain D3 自动化必须消费冻结的 extension fixture 和上述三份
SHA，不得提前运行。

### Batch B3：B Web 与共享资产控制面

- shared-property-web-owner：Party/identity/control plane，并独占
  `/assets/property-operations/**`、`/assets/property-occupancies/**`、
  `/assets/property-mode-transitions/**` 对应 route 目录；不得另设 identity Web owner
  写入这些路径。
- homestay-web-owner：approval/task/finance UI。
- housing-web-owner：approval/task/finance/purchase UI。

本批依赖 B2c 的 homestay/housing domain SHA 与 API wiring SHA，最多三个 subagent；
分别输出 shared、homestay、housing Web SHA。D3、targeted Gate 与 wiring smoke 全部
通过后汇总为 `B-domain-integration handoff SHA`，包含所有输入/输出 SHA、owned
paths、验证结果和 `open_P0_P1=[]`。

### Batch B4：Domain Handoff 后最终 Reconcile

严格依赖 `B-domain-integration handoff SHA`：

- migration-reconcile-owner：backfill、shadow、reconcile、rollback。
- qa-automation-owner：crash/concurrency/exactly-once-effect。
- compatibility QA subagent：old API/client、rerun、rollback/re-enable。

本批最多三个 subagent。
本批次发布 `integration-reconcile-final SHA`。若发现 core fixture 缺陷，退回
qa-automation-owner 重新发布 `B-extension-core fixture SHA`，随后重跑 domain D3、
domain handoff 和本批次；不得直接修改既有 core。

### Batch B5：Technical Gate

- security technical reviewer。
- finance technical reviewer。
- architecture reviewer。

本批最多三个 subagent。
Gate B technical：

- identity zero-difference。
- maker-checker。
- approval CHECK/CAS。
- DB commit 后永久 executed。
- outbox/inbox/DLQ。
- assignment 权威和 rebuild。
- B-extension-core/combined checksum 与 integration-reconcile-final SHA。
- compatibility 和 rollback。

输出：B-technical handoff SHA。

### Human Lane 准备

Codex facilitator：

- 准备隔离 UAT 环境、任务卡和记录模板。
- 验证用户和 fixture。
- 完成后释放并发槽。

真实岗位 UAT 可与 Track C 并行，不保持常驻 subagent。

### Batch C0：内部拆分

只依赖 B technical SHA，不依赖真人 UAT：

- homestay decomposition。
- housing decomposition。
- weak-network/shared reliability。

### Batch C1：非功能

- performance/evidence。
- contract/complexity QA。
- docs/release/rollback。

### Batch C2：Technical Gate

- architecture reviewer。
- QA reviewer。
- release reviewer。

## 5. Feature Flags

Track A：

```text
PROPERTY_WORKBENCH_V2
```

`PROPERTY_WORKBENCH_V2` off/unset 必须保持 legacy API；true 在
`A-server-safety SHA` 后才能用于新工作台，并在 Track B adapter 前对 8 个高风险
action 返回服务端 409。该 flag 不得只控制 Web。

Track B：

```text
PROPERTY_CONTROL_PLANE_V1
PROPERTY_IDENTITY_V2_SHADOW
PROPERTY_IDENTITY_V2_ENFORCE
PROPERTY_APPROVAL_SHADOW
PROPERTY_APPROVAL_ENFORCE
PROPERTY_TASK_ASSIGNMENT_V1
PROPERTY_OUTBOX_PUBLISH_V1
```

Track C：

```text
PROPERTY_OFFLINE_DRAFTS_V1
PROPERTY_UPLOAD_QUEUE_V1
```

生产高风险 `PROPERTY_APPROVAL_ENFORCE` 只在 Production Readiness Gate 后开启。

## 6. 自动验证计划

### L0

- manifest schema。
- route/page/API 唯一映射。
- permission tenant uniqueness / park grants。
- ownership 和 complexity。
- flag off/unset/true 与 8-action fail-closed matrix。
- housing tenant、homestay credential field projection snapshots。

### L1

- 状态机、金额、日期、mask、policy、task sorting。

### L2

- 页面状态、focus、picker、task、draft/upload。

### L3

- PostgreSQL locks/constraints。
- occupancy concurrency。
- identity create/supersede/verify/check-in concurrency。
- approval claim/reclaim/commit crash。
- financial exactly-once-effect。

### L4

- module、permission、data、field、file、idempotency HTTP contracts。
- old API/client compatibility。

### L5

- 精确角色菜单/直达/API E2E。
- 360px、390px、desktop。
- deep-link、back context、scope/module combinations。

### L6

- 可复现性能。
- WCAG 2.2 AA 和 Design System 证据。
- migration/rollback/cleanup。
- 真人岗位 UAT 由外部人员执行，Codex 只记录。

建议验证命令在各子任务创建后按影响范围确定，至少包含：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
node scripts/e2e/first-release-regression.mjs
```

数据库、财务和 first-release 变更还需运行对应 direct regression；不得用源码正则测试代替行为测试。

## 7. 数据集和性能

A Gate 使用 `property-remediation-a-base-v1`，不得要求 B 表存在。

B Gate 使用 `property-remediation-b-extension-v1`，必须验证：

- required A profile ID/checksum。
- B schema SHA。
- combined checksum。
- before/after mutation manifest。

性能固定 CPU、内存、PostgreSQL 参数、seed、business clock、预热、10 分钟正式运行、至少 10,000 请求、5 个 run、冷暖缓存和请求分布。保存 p50/p90/p95/p99、错误率、资源峰值和 95% CI。

## 8. Stop-ship

P0：

- 跨 tenant/park 或敏感数据泄露。
- 财务重复/错账。
- occupancy 冲突。
- maker-checker 绕过。
- partial DB commit。
- fixture 污染生产。

P1：

- 核心岗位主任务失败。
- permission/page/API 不一致。
- approval/identity/rollback/migration Gate 失败。
- WCAG critical/serious。
- 性能门槛显著失败。

P0/P1 修复后必须由非修复者复审并重新运行相应 traceability 闭包。

## 9. 人工 Gate

Codex 任务完成不包含代替以下人员签署：

- 真实岗位代表。
- 业务负责人。
- 财务负责人。
- 安全/审计负责人。
- 生产 rollout approver。

人工未完成时：

- `codex_execution_status` 可为 `codex_complete`。
- `production_readiness_status` 保持 `awaiting_human_gate`。
- 高风险生产动作继续 fail closed。

## 10. 本规划阶段完成条件

- [x] 父任务 PRD、design、implement、review-gates 已完成。
- [x] `task.py validate` 通过。
- [x] 父任务已设置 branch/base/scope 并 start。
- [x] 已创建并链接 11 个规划子任务：
  1. `pr192-a-contract-rbac-foundation`
  2. `pr192-a-shared-web-foundation`
  3. `pr192-a-homestay-workbenches`
  4. `pr192-a-housing-workbenches`
  5. `pr192-a-automated-gates`
  6. `pr192-b-identity-control-plane`
  7. `pr192-b-approval-runtime-tasks`
  8. `pr192-b-domain-integrations`
  9. `pr192-b-integration-reconcile`
  10. `pr192-c-architecture-reliability`
  11. `pr192-human-uat-production-readiness`
- [ ] 尚未修改业务代码。
