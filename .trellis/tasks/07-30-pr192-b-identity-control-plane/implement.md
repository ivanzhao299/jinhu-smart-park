# PR192 B 身份与共享控制面实施计划

## 1. 前置条件

- Track A technical handoff SHA 已通过。
- `07-30-pr192-a-shared-web-foundation` 已完成；B1 只读取其组件合同来形成
  `B-identity-ui-input SHA`，不在 B1 接管或修改任何 Web 路径。
- B schema/shared contract reservation 和 owner 已冻结。
- B0 shared contract 至少定义 approval-required boundary；B1 不等待 approval
  runtime 实现完成，缺少可调用 runtime 时高风险动作保持 fail closed。
- 所有 worker 运行 `trellis-before-dev`。B1 API worker 读取 property-business、
  shared occupancy、module、file upload、migration/operations specs；Web spec 只用于
  编写 UI input contract，Web worker 到父计划 B3 才启动。

## 2. Subagent 批次

根/协调 Agent 占一槽，最多三个 subagent 并行。共享路径按 owner 串行 handoff。

### I0：合同与 schema request

并行只读/规划：

- identity architect：状态、锁序、CAS、check-in evidence。
- property control researcher：现有 API/occupancy/module 行为。
- compatibility reviewer：legacy data/API、backfill 和 shadow 风险。

输出 schema/contract/API change requests，分别交 shared-contract-owner 和
schema-migration-owner；本任务 worker 不直接修改其路径。

### I1：Expand handoff

- schema-migration-owner 交付 identity/property expand migration SHA。
- shared-contract-owner 交付 Party/identity/control response/access contract SHA。
- architecture checker 验证 partial unique、immutable snapshot、tenant/park scope、
  permission code 和 migration rerun。

任一 Gate 失败不得进入实现。

### I2：B1 Foundation API/Runtime Core

可并行：

- property-foundation-api-owner：canonical commands、projection、identity verifier
  port、file/occupancy policy 和 control API approval-required boundary。
- API contract tester：本任务 API/HTTP/permission/DB core tests，不改实现文件。
- UI contract writer：只产生 route/UX/permission/response 输入合同，不创建或修改
  `apps/web/**`。

I2 禁止 canonical Party/control Web、homestay/housing adapter、backfill、shadow 和
final reconcile。

### I3：B1 Core Milestone

独立 architecture checker 验证 API/runtime/schema-consumption core。通过后立即输出：

- `B-property-foundation-runtime SHA`：供父计划 B2b core fixture 与 B2c domain
  integrations 消费。
- `B-identity-ui-input SHA`：供父计划 B3 Web 消费。

这两个 SHA 的输出不得等待 I4–I7。

### I4：B2c Domain Handoff

顺序：

1. foundation owner 冻结 identity verifier port/lock contract SHA。
2. handoff 给真实子任务 `07-30-pr192-b-domain-integrations` 的
   `homestay-api-owner`，由该子任务在 `apps/api/src/modules/homestay/**` 实现同
   transaction check-in adapter。
3. handoff 给 approval-runtime-owner，接模式切换/force-release request。
4. `07-30-pr192-b-domain-integrations` 的 api-integration-owner 最后独占
   `apps/api/src/app.module.ts` wiring。

本任务不跨路径实现相邻 owner 代码。

### I5：B3 Canonical Web

前置必须同时包含：

- `B-identity-ui-input SHA`。
- `B-domain-integration SHA`（父计划 B2c 完成）。
- A shared Web foundation SHA。

之后才由父计划 B3 的 `shared-property-web-owner` 接管既有 shared/Party 路径并实现
全部 Party/identity/control Web；资产 route paths 仍须经过父 ownership 治理确认。
B1 不得提前并行执行本批次。

### I6：B4 Migration/Shadow

- migration-reconcile-owner：change capture、UUIDv5 backfill、replay、shadow/final reconcile。
- compatibility QA：old API/client、rollback/re-enable。
- concurrency QA：identity/check-in/file/occupancy race。

三个 subagent 路径和测试资源必须互不冲突；共享数据库场景串行运行。

### I7：完整 Technical Gate

- security/identity reviewer。
- occupancy/architecture reviewer。
- UI/accessibility reviewer。

Checker 只报告，修复回派原 owner。P0/P1 由非修复者复审。

## 3. 实施顺序

1. 冻结数据模型、状态机、锁序、permission/file contract。
2. 执行 forward-only expand migration；失败立即停止。
3. 实现 canonical Party commands/projection 和 protected file freeze。
4. 实现共享房产控制面 query 及 approval-required command boundary。
5. 运行 B1 core Gate，输出 `B-property-foundation-runtime SHA` 和
   `B-identity-ui-input SHA`；此时不要求任何 Web、check-in 或 shadow。
6. 将 identity verifier port/lock SHA 与 approval request contract handoff 给
   `07-30-pr192-b-domain-integrations`，由其完成 check-in adapter 和 final wiring。
7. B2c handoff 完成后，父计划 B3 owner 实现 canonical Party/identity/control Web。
8. B4 运行 compatibility adapter、change capture、backfill、replay、shadow。
9. per-tenant final lock/reconcile 零差异后才允许 identity enforce。
10. 汇总 B2c/B3/B4 evidence，输出 `B-identity-control-technical SHA`。

## 4. 验证

至少运行：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web build
pnpm typecheck
pnpm test
```

数据库可用时运行 migration twice、targeted PostgreSQL integration、相关
first-release auth/files/users-assets/homestay regression。不得用源码正则代替行为
验证。

### B1 Core Machine Gate

- schema/shared contract consumption、API build 和 HTTP/DB contracts。
- 四权 exact-set、module/scope/field/file 正负矩阵。
- active submission unique、CAS、锁序和 immutable snapshot。
- verifier actor separation 与 identity verifier port。
- asset dependency、live blocker、occupancy cross-domain race。
- force release/mode transition 在无 runtime 时不执行。
- `apps/web/**`、homestay/housing adapters、backfill/shadow 零实现。
- 输出 `B-property-foundation-runtime SHA` 与 `B-identity-ui-input SHA`。

### 完整 Technical Machine Gate

- 四权 exact-set、module/scope/field/file 正负矩阵。
- active submission unique、CAS、锁序和 immutable snapshot。
- verifier actor separation。
- create/supersede/verify/check-in 竞争与 TOCTOU。
- file bind/delete 两种顺序恰一成功且无 dangling reference。
- legacy mapping/backfill rerun/change replay/shadow zero-difference。
- old client/API compatibility、rollback/re-enable。
- asset dependency、live blocker、occupancy cross-domain race。
- force release/mode transition 未审批不执行。
- canonical Party UI、mobile、WCAG/DS。
- B2c/B3/B4 输入 evidence 全部存在。

## 5. Handoff 与完成

每次 handoff 记录：

```text
from/to owner
owned paths
base SHA
handoff SHA
contract/schema SHA
validation commands/results
known failures
open P0/P1
```

B1 只要求 schema consumption、foundation/identity API/runtime core、contract tests
和 core architecture review 通过，且 open P0/P1 为零，即可输出
`B-property-foundation-runtime SHA` 与 `B-identity-ui-input SHA`；不得等待
check-in/domain adapters、Web、shadow 或 rollback。

只有后续 B2c domain、B3 Web、B4 shadow/reconcile/rollback Gate 全部通过且 open
P0/P1 为零，才输出不同名称的 `B-identity-control-technical SHA`。人工 UAT 和生产
签署仍由父任务外部泳道执行，不影响记录 technical pass，但未完成时不得开启生产
高风险 enforce。
