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
| menu-projection-owner | 分阶段独占 `apps/api/src/modules/users/users.service.ts` 的 property projection 与 `apps/web/lib/menu.ts`；先交付 API-only SHA，收到两份 domain route SHA 后才写 Web menu |
| property-workbench-safety-owner | `apps/api/src/shared/property-workbench/**` 和 Track A feature-flag/fail-closed policy tests；不得写领域 service |
| shared-property-web-owner | `apps/web/features/property-shared/**`、`apps/web/app/assets/identity-submissions/**`、`apps/web/app/property/notifications/**`、`apps/web/app/property/event-delivery-incidents/**`、`apps/web/app/property/approval-incidents/**`、`apps/web/app/assets/property-operations/**`、`apps/web/app/assets/property-occupancies/**`、`apps/web/app/assets/property-mode-transitions/**` |
| asset-party-decision-owner | 决定并独占 `apps/web/app/assets/parties/**` target handoff；未交付时要求 housing Party link/redirect=0，或提交正式 acceptance removal |
| homestay-web-owner | `apps/web/app/homestay/**`（含 canonical routes/route guards）、`apps/web/features/homestay/**`、本领域 Web tests |
| housing-web-owner | `apps/web/app/housing/**`（含 canonical routes/route guards；tenant alias 仅在 Party target handoff 后 redirect）、`apps/web/features/housing/**`、本领域 Web tests |
| property-foundation-api-owner | `apps/api/src/modules/property-operations/**`；post-B1 adapter slice 中唯一拥有 mode transition/force release approval adapter |
| approval-runtime-owner | `apps/api/src/modules/property-approvals/**` |
| property-task-owner | `apps/api/src/modules/property-tasks/**` |
| module-dependency-owner | `apps/api/src/modules/saas-modules/**` |
| api-integration-owner | `apps/api/src/app.module.ts` 和最终跨模块 wiring |
| homestay-api-owner | `apps/api/src/modules/homestay/**` 和本领域 API/integration tests；Track A 负责 high-risk server gate、booking/credential projection，Track B 再接 approval adapter |
| housing-api-owner | `apps/api/src/modules/housing/**` 和本领域 API/integration tests；Track A 负责 high-risk server gate、tenant list/create projection，Track B 再接 approval adapter |
| migration-reconcile-owner | `scripts/property-remediation/migration/**` |
| a-bootstrap-owner | `scripts/e2e/property-remediation/bootstrap/**` 及 bootstrap tests；只交 ephemeral DB harness，不写 profile |
| qa-automation-owner | `scripts/e2e/property-remediation/**`（排除 `bootstrap/**`）、fixture、performance、evidence runner；generated runs 只写 ignored `artifacts/property-remediation/runs/**` |
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
8. `000183_*` 只是当前候选编号；实际创建文件前必须重新扫描工作树和 migration
   history，再登记 reservation，不能由计划文档永久占号。

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
文档。以下为 A-C1 当时已通过的独立安全/API checker 基线：

- flag off、unset、true 三态矩阵。
- 当时 8 个 high-risk action × normal/super/wildcard；true 时均为 409。A-2.5
  必须再加入第 9 个 move-out financial variant 并重新 Gate。
- 两个 ledger endpoint 的 safe/high-risk discriminator 邻接用例。
- housing list/create 与 homestay detail/issue/return response snapshot，禁止完整敏感值。
- API 全量 unit、shared/API/Web typecheck，以及 legacy characterization。

任一缺项为 P0/P1 stop-ship。Gate 通过后发布 `A-server-safety SHA` 与修订后的
`A-contract SHA`；open P0/P1 必须为空。

执行记录（2026-07-30）：A0-S 独立复审已 PASS，`open_P0_P1=[]`。复审期间发现并
修复 canonical metadata 缺失/不匹配时可能 fail open 的问题；focused tests 44/44，
API lint/typecheck/build、Shared build、Web typecheck 和 diff check 全部通过。
contract/server-safety baseline 已于 2026-07-30 冻结：
`e709459a034807b3575db604a76bc69bf1c5ff5b`
（`feat(property): freeze Track A access safety baseline`）。

只有 `A-server-safety SHA` 和最终 `A-contract SHA` 均已交付后，按顺序执行：

1. schema-migration-owner 完成 Track A permission schema migration 和 exact tests；
   expected permission set 恰好 65，不是 69。custom、legacy operations、wildcard
   均不得自动扩权。
2. menu-projection-owner 只完成 API `/users/me` property projection 基础：
   enabledModules、granular page-only、current tenant+park relation filtering，输出
   `A-api-menu-projection SHA`。此时禁止修改 `apps/web/lib/menu.ts`，Web 不暴露
   canonical route。
3. qa-automation-owner 只建立 traceability/evidence schema，不生成页面 route evidence。

输出：A-contract SHA、A-server-safety SHA、A-schema SHA、
`A-api-menu-projection SHA`。

执行记录（2026-07-30）：A-C2 migration+API-only projection slice
**CLOSED / TECHNICAL PASS**，`open_P0_P1=[]`。独立临时 PostgreSQL
容器/volume 以 `000176`–`000182` 为
声明基线，000183 连续直跑两次通过；65 exact、多园区、
disabled/expired/missing/status-disabled、timestamp 稳定以及 custom/legacy/
wildcard 不扩权均通过。cleanup residual counters=`0|0|0|0`，容器和 volume 已删除。
cross-scope permission assignment 与 role tenant 一致性通过。增量 review 自修后的
container fallback exact rerun 使用 exact run-id、双 label、running 状态、
`docker run --rm`、official PostgreSQL image、显式 `POSTGRES_DB`、匿名 volume，
并拒绝数据库 URL override。
空库 `000175` 是 fail-fast 回滚的生产数据补丁且不提供 fixture schema，故隔离基线
跳过；不得将此证据解释为全量空库 migration-chain PASS。A-1 保持 `in_progress`。

### Batch A0.5：Shared Web Foundation

严格依赖 A-contract SHA、A-server-safety SHA、A-schema SHA 和
`A-api-menu-projection SHA`，由 shared-property-web-owner 独占
`apps/web/features/property-shared/**`，完成共享 picker、task presentation、detail、
dialog、page-state 和 DS adapters。本批一个实现 owner，最多两个只读/独立 checker；
不得依赖 Track B identity、approval 或 task runtime。

Integration-ready 输出已冻结为
`d2a015f9ba931b2024e6360570697c77b74ea3fb`
（`feat(property): add shared workbench foundation`），三路 S2 final review PASS，
`open_P0_P1=[]`；14 specs、boundary 5/5、ESLint、workspace typecheck、shared/Web
build 全绿。Handoff 包含 owned paths、A-contract
base SHA、组件 API、纯函数/组件静态与单测、lint/typecheck/build、known
limitations 和 `open_P0_P1=[]`。本批不得创建 preview/生产 route；该 SHA 仅表示
integration-ready，不代表 final UI Gate。Shared child 保持 `in_progress`，直到首个
canonical route 补齐浏览器证据。

### Batch A0.6-pre：Ephemeral DB Bootstrap

`a-bootstrap-owner` 先提取/新增 `A-ephemeral-db-bootstrap`，只允许 exact ephemeral
container，执行 `000001`–`000174` + 结构化 `skip-record:000175` +
`000176`–`000183`。复用 A-C2 exact run-id、双 label、running、`--rm`、official
PostgreSQL、显式 `POSTGRES_DB`、匿名 volume、拒绝 URL override 和 cleanup 约束。
独立 checker PASS、`open_P0_P1=[]` 后输出 `A-ephemeral-db-bootstrap SHA`；此前
A-base implementation 不得开始。

执行记录（2026-07-30）：独立 checker **PASS**，`open_P0_P1=[]`；正式
`A-ephemeral-db-bootstrap` handoff SHA：
`b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268`。
Reviewer 提出的 4 项 P1 已全部修复。Owner 自验为 7 pass / 0 fail / 1 Windows
platform skip，并在 Linux 完成 SIGTERM 1/1；same-run-id 双链通过。Checker 完成
关键 runtime 复验，最终 residual=0。RISK-A-004 已关闭；在该 bootstrap Gate
完成时，A0 implementation 状态为 `unblocked_not_started`，其后已由 A-base final
Gate 更新为 provisioned/frozen。

### Batch A0.6：A-base-core

严格依赖 A-contract SHA、A-schema SHA、`A-api-menu-projection SHA` 与
`A-ephemeral-db-bootstrap SHA`，由 qa-automation-owner 生成 `A-base-core`，完成
父设计全部 exact rows、deterministic checksum、support 最小权限、独立 exception
super actor、2,000 个小型有效测试 PNG、生产保护和 cleanup rehearsal，输出
`A-base-core fixture SHA`。A1 页面 worker 必须同时取得该 SHA 与后置
`A-2.5-contract-closure SHA` 才能开始；core 发布后不得由页面 worker 改写。所有
generated artifacts 写入 ignored
`artifacts/property-remediation/runs/**`，不得在 `scripts/**` 下提交 runs。
Candidate 性能阈值只记录观测，不能产生批准 PASS。

执行记录（2026-07-30）：source commit
`32ccc02852c3201c6f68e3b6b89e4398cb102a17`，final run
`abase20260730final32ccc01`，fixture handoff SHA
`3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
profile checksum `68da…107b`。Owner gate 21 pass / 0 fail / 6 runtime skip，
真实双 run 已覆盖；两次 run 各有 journals 10,010 events / 2,002 resources 且均已
清理，final residual=0。Independent final review PASS，`open_P0_P1=[]`。
状态为 `A-base-core provisioned / handoff frozen`，不等于 Track A technical pass。
A-2.5 已解除依赖并成为下一步；domain Web 继续 blocked。

### Batch A-2.5：Workbench API/Response Contract Closure

严格串行位于 A-base handoff 之后、Batch A1 Web 之前。合同代码可提前只读研究或由
其 owner 实现，但任何 workbench Web owner 不得提前开始。

- shared-contract-owner：冻结所有现有/新增 response types，禁止 route-local
  interface。
- homestay-api-owner：闭合 tasks、stays、turnover detail、finance，并对 guest/
  work-order candidates 作正式采用/移除决定。
- housing-api-owner：闭合 tasks、handover list/detail、billing、finance、repair
  list/detail。
- schema-migration-owner：独占任何必要 forward migration；不得由 API owner 写。
- asset-party-decision-owner：交付存在的 canonical Party target，或形成正式
  acceptance removal；此前 link/redirect 请求数为 0。
- independent contract gate：核对 response/GET/field/file/high-risk/route matrix，
  `open_P0_P1=[]` 后输出 `A-2.5-contract-closure SHA`。

强制条件：stays detail alias 使 detail route 6→7；move-out financial variant 成为
第 9 个 high-risk；财务字段和附件 ID 最小投影；GET 精确 read permission；禁止
N+1、route-local interface 和扩 bundle；Track B high-risk 仍 unavailable。

### Batch A1：前端 extract-first

前置为 A-contract SHA、A-schema SHA、A-base-core fixture SHA、
`A-shared-web-foundation SHA` 与 `A-2.5-contract-closure SHA`；不依赖
menu/landing/redirect handoff。最多两个
subagent 并行：

- homestay-web-owner：输出 `A-homestay-route SHA`。
- housing-web-owner：输出 `A-housing-route SHA`。

每个工作流先 characterization，再抽取，再删除旧 block；不得保留新旧双实现。
两份 handoff 均须包含 consumed foundation SHA、owned routes、base/output SHA、验证结果和
`open_P0_P1=[]`。

首个输出 domain route SHA 的 owner 还必须在真实 route 上执行 shared foundation 的
desktop/mobile/keyboard/focus/zoom/ARIA 浏览器矩阵并交 evidence；shared owner负责
组件缺陷修复与 final UI Gate 签收，qa-automation-owner 负责追溯。该证据未完成时
不阻止 integration-ready SHA 被消费，但不得报告 foundation final UI Gate PASS。

### Batch A2：Web Menu Projection

- menu-projection-owner：消费两份 A1 route SHA 后才修改 Web menu，实现 canonical
  menu、legacy module landing 和 unknown property deep-link fail-closed；不得创建
  领域 route 或 placeholder。
- housing-web-owner：在 `apps/web/app/housing/**` 独占范围内、收到两份 route SHA
  后且 Party target 已 handoff 时实现 tenant alias redirect 与 route guard；未交付
  时保持 link/redirect=0，menu owner 不接管该路径。
- 两者共同输出 `A-web-menu-projection SHA`。

### Batch A2.5：Route Evidence

- qa-automation-owner：消费两份 route SHA 和 `A-web-menu-projection SHA` 后生成
  `A-route-evidence`，运行精确角色
  Web/API E2E、route/page/API/data/file、viewport/WCAG 和 cleanup；不得改写
  `A-base-core`。

输出 `A-route-evidence SHA` 后才能进入独立检查。

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

- `research/b0-product-access-freeze.md`：产品、访问、岗位、交互与 projection 候选。
- `research/b0-identity-control-freeze.md`：Party/identity/control 候选。
- `research/b0-runtime-contract-freeze.md`：runtime exact schema/effect manifest 候选。
- final-independent-gate reviewers：产品/RBAC、identity/control、安全/财务、架构/QA
  分别复审后交叉核对，问题回派原 owner。

本段记录 B-0 的执行约束；四输入 freeze 现已完成 final8 独立签署。当前 Batch B0
状态为 `PASS / CLOSED`，`open_P0_P1=[]`。最终 `B-contract SHA`、endpoint authority
SHA、`B-schema-expand SHA` 与 catalog SHA 见本文件第 16 节；B0.5 S1 仅解除阻塞并
等待独立重新 Gate。
B-0 合同 Gate 只登记 provisional window。`000185_*`–`000190_*` 仅在合同 PASS 后、
schema-migration-owner 开始 core schema implementation 并重扫 history 时形成正式
reservation；`000191_*`、`000192_*` 保持 provisional，必须在 B2c 前由同一 owner
再次重扫并正式 reservation。全部编号只能由 schema-migration-owner 创建或修改；
homestay/housing/domain API owner 对 `database/migrations/**` 的修改数必须为零。

本批最多三个 subagent。最终 SHA 是下游唯一输入；领域任务不得复制候选 route、
status、schema 或 effect 定义。

### Batch B0.5：Property Foundation 与 Module Core

- **S0 首切片 / high-risk code stop-ship**：只允许 homestay/housing API owner 在最终
  合同列出的正式高风险入口、进入 service/transaction 前实现 fail-closed；覆盖
  normal、superuser、wildcard、旧客户端和 metadata 缺失/错误。不得创建 approval
  request、接入 runtime、实现 identity/control 或修改 module dependency。独立
  checker PASS 后输出 `B-high-risk-stopship SHA`。
- property-foundation-api-owner：共享控制面、Party/identity，输出
  `B-property-foundation-runtime SHA`。
- module-dependency-owner：asset dependency，输出 `B-module-core SHA`。

本批严格依赖最终 `B-contract SHA`、`B-schema-expand SHA` 和 runtime effect manifest
SHA。S0 必须先独立关闭，之后才调度 property foundation/module core；B-0 合同 Gate
PASS 不等于 S0 代码 Gate PASS。每份 handoff 都必须包含 owned paths、base/output
SHA、targeted tests 和 `open_P0_P1=[]`。

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

先由唯一 schema-migration-owner 独立串行交付：

- 000191 → `B-property-homestay-effect-schema SHA`。
- 000192 → `B-housing-effect-schema SHA`。

两份 handoff 必须分别包含正式 reservation、rerun、约束、checksum、base/output SHA
和 `open_P0_P1=[]`，且不得冒充 000185–000190 `B-schema-expand SHA`。

随后由 property-foundation-api-owner 独立消费 `B-approval-runtime SHA` 与
`B-property-homestay-effect-schema SHA`（000191），仅实现 property mode/release
approval adapter，完成独立 Gate 后输出 `B-property-foundation-adapter SHA` 并释放
路径。除该唯一 slice 外，其余 owner 对 `property-operations/**` 修改数为零。

领域 API 严格依赖 `B-extension-core fixture SHA`、validation SHA、上述两份
effect-schema SHA 和 `B-property-foundation-adapter SHA`；缺任一时 homestay/housing
领域 API lanes 不得启动，但 schema reservation/implementation 与 foundation adapter
子阶段按 DAG 先行。
随后最多两个领域 subagent 并行：

- homestay-api-owner：approval、check-in snapshot adapter，输出
  `B-homestay-domain SHA`。
- housing-api-owner：approval、finance/purchase/lease integration，输出
  `B-housing-domain SHA`。

两份领域 SHA 通过后，api-integration-owner 串行完成最终 API module wiring，输出
`B-api-wiring SHA`。B domain D3 自动化必须消费冻结的 extension fixture 和上述三份
SHA，不得提前运行。

### Batch B3：B Web 与共享资产控制面

- shared-property-web-owner：Party/identity/control plane，并独占
  `/assets/identity-submissions/**`、`/property/notifications/**`、
  `/property/event-delivery-incidents/**`、`/property/approval-incidents/**`，以及
  `/assets/property-operations/**`、`/assets/property-occupancies/**`、
  `/assets/property-mode-transitions/**` 对应 route 目录；不得另设 identity Web owner
  写入这些路径。
- homestay-web-owner：approval/task/finance UI。
- housing-web-owner：approval/task/finance/purchase UI。

本批依赖 B2c 的 homestay/housing domain SHA 与 API wiring SHA，最多三个 subagent；
分别输出 shared、homestay、housing Web SHA。D3、targeted Gate 与 wiring smoke 全部
通过后汇总为 `B-domain-integration handoff SHA`，包含所有输入/输出 SHA、owned
paths、验证结果和 `open_P0_P1=[]`。

B3 Gate 必须提供 identity 顶层 list/detail 与 Party tab deep-link、notification
list/detail、event-delivery incident list/detail/replay、approval incident
list/detail/retry 的精确岗位机器证据，并覆盖
320/360/390/768/desktop、keyboard、screen reader、200%/400% zoom/reflow、
forced-colors；缺任一矩阵不得 handoff。
Event replay 还必须逐维移除 active `asset` module、incident page、
`property_event:read_incident`、assigned tenant+park incident scope 与
`property_event:replay` 并全部断言 403；`asset` module assignment missing、
disabled、expired 必须拆分为三个 403 case，generic event/read 不可替代任何一维。

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
`A-server-safety SHA` 后才能用于新工作台；A-2.5 必须补齐第 9 个 move-out
financial variant，并在 Track B adapter 前对全部 9 个高风险 action/variant 返回
服务端 409。该 flag 不得只控制 Web。

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
- flag off/unset/true 与 9-action/variant fail-closed matrix。
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
- [x] Track A A-2.5 业务代码、共享契约、RBAC 与工作台已按交付 SHA 实现。

## 15. 2026-07-31 执行结论

A-2.5 实现与机器门禁已完成：shared/Homestay/Housing/RBAC、17/7 routes、Party
canonical target 均已闭合，最终 API full unit 91/91、Web default `tsc`/lint/build 154、独立多轮
Gate 和 DB evidence 通过，`open_P0_P1=[]`。

真实 desktop/390 visual、keyboard、zoom/reflow 未执行，并按用户决定转入外部
UAT。Track A 技术任务关闭并允许进入 Track B；在补齐人工证据前不得宣称生产就绪。

P2 mixed-scope 文案用例：同一检查批次同时包含 shared contract、SQL migration/seed
和 Web evidence 时，报告必须按 owner 与证据拆分，不能把某一 scope 的 P2 文案或
fixture 差异笼统归责为另一 scope 的实现失败；P2 不改变 `open_P0_P1=[]`。

## 16. 2026-07-31 Track B B-0 执行结论

B-0 已完成并通过独立门禁，`open_P0_P1=[]`。四输入合同、49-row shared endpoint
authority、7 个页面权限、18 个动作权限、16 个权限包/125 个成员、28 个错误码以及
000185–000190 数据库扩展均已冻结和实现。

最终证据：

- `B-contract SHA=5704ab723ebd4bcc69b4e4fcf6039992ac6752b195b97beba31be5260b55d87d`
- `endpoint authority SHA=3cff469fa092cdf6d254c86f275be194734a5eb4a1abe9591abaf4c1748f5adf`
- `B-schema-expand SHA=db1a9a93c6a5933d3a59fe14e7e62e8469b90af1d726f2663bf140809eedfb9a`
- `catalog SHA=e172de5cfa6ad61dfd610134c43a2618918858d4f7af4efd24bd758af046eec7`
- PostgreSQL 16 evidence：
  [持久化 final8 JSON](research/b0-schema-gate-final8.json)；
  原始执行记录 `/tmp/pr192-b0-schema-gate-final8.json`

数据库门禁覆盖首次应用、直接重跑、故障注入后的恢复、漂移拒绝、目录与授权核验、
Identity 三类 successor、四向一致性回滚、双会话 CAS race 及临时环境清理；
`open_P0_P1=[]`、cleanup PASS。Runtime effect manifest 未定义独立 byte grammar，继续以已签署的
runtime freeze raw SHA 为唯一来源，不生成无合同依据的新摘要。

B-0 限定重开已由 final8 重新 CLOSED/PASS。`B0.5-S0` 既有 PASS 保持有效；
`B0.5-S1` 仅解除阻塞并等待独立重新 Gate，不得标记 S1 PASS，S2/S3 继续禁行。

## 17. 2026-07-31 B0.5-S0 执行结论

`B0.5-S0` 已通过最终独立门禁，`open_P0_P1=[]`。两个正式高风险 URL 在 Audit、
Idempotency 和领域 Service 前返回 exact `409 approval-required`；normal、
superuser、wildcard 和旧客户端字符串 `force=true` 均无法绕过，`force=false`
低风险路径保持可达。

- `B-high-risk-stopship SHA=d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8`
- HTTP+DB evidence：
  `/tmp/pr192-b05-s0-http-db-b05s0-1785467231-1449385.json`
- Cleanup evidence：
  `/tmp/pr192-b05-s0-cleanup-b05s0-1785467231-1449385.json`

真实 HTTP Gate 使用正式 controllers、Guard、Permission/Module/Idempotency/Audit/
Response/Exception 链和隔离 PostgreSQL 16；六张 mode/occupancy/audit/idempotency/
outbox 表前后快照一致，Audit、Idempotency 与领域 Service 调用增量均为 0。临时容器
和匿名卷已清理。S0 放行后进入 S1 shared/schema handoff，不直接跳过到 B-1。

## 18. 2026-08-04 当前执行状态

- [x] Track A 技术交付完成。
- [x] Track B 技术交付、最终 Chrome 全矩阵 UAT 与 Trellis 归档完成；产品 P0/P1=0，
  无跳过。不得重复执行或重复归档 Track B。
- [x] Track C C1/C2 技术实现、合同/复杂度、全量 API、统一隔离 PostgreSQL 与
  clean-provision Gate 通过；产品 `open_P0_P1=[]`。
- [ ] Track C C3：E 轮在 23 个完整 PASS cell 后因外部 executor 终止而作废并 residual=0；
  F 轮通过 clean provision/check-config 和首格后，独立审计确认 `b994d163` 尚缺 canonical
  occupancy port、upload rollback flag 与 rollback/output handoff，故主动停止并 residual=0。
  先完成技术缺口与 rollback rehearsal，再在 final SHA 上重跑完整 30-cell；不得拼接 E/F。
- [ ] Track C C4：性能证据须由非实施者独立复核；Chrome 增量 15/15 因宿主
  `sandboxCwd` local-file-URI 错误在插件执行前 BLOCKED，保留环境 P1
  `C-P1-CHROME-HOST-ENVIRONMENT`，不得伪造 PASS 或误报为产品缺陷。
- [ ] 外部真人岗位 UAT 与业务、财务、安全/审计、发布签署仍为
  `awaiting_human_gate`。父任务保持 `in_progress`；当前不得声明
  `codex_complete` 或 `production_ready`。
