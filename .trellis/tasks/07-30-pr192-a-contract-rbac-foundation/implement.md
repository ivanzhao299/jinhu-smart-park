# Track A 契约与 RBAC 实施计划

> 仅规划，不实现代码。

## 1. Subagent Batches

总槽位 4；根 Codex 占 1，最多三个 subagent。

### A-C0：证据和合同草案

并行：

- `contract-requirements-planner`：只产出六层 contract/schema request 和验收矩阵，不写 shared 或 migration 文件。
- `rbac-research-worker`：只读核对当前 permission/menu/module/migration。
- `contract-test-planner`：只规划 manifest/migration exact-set tests。

输出：contract draft，不改 menu/migration。

### A-C1：合同冻结

- 父表唯一 `shared-contract-owner` 根据批准的需求包完成 shared contract 和唯一 root export；本子任务不直接写 shared 文件。
- independent checker 校验 shared naming、兼容性和消费者影响。

Gate：

```text
pnpm --filter @jinhu/shared build
pnpm typecheck
```

输出：由 `shared-contract-owner` 提供的 `A-contract candidate SHA` 和 ownership
handoff 记录；独立 stop-ship 未关闭前不得称为最终 A-contract SHA。

### A-C1.5：Server Safety 与 Projection Stop-ship

依赖 A-contract candidate SHA；最多三个实现 owner 并行：

- `property-workbench-safety-owner`：唯一 feature-flag/fail-closed policy。
- `homestay-api-owner`：cancel、ledger discriminator 和
  booking/credential response projection。
- `housing-api-owner`：lease、ledger discriminator、purchase safety，以及 tenant
  list/create projection。

完成后由 `property-env-doc-owner` 串行同步 env examples 和 compatibility 文档，再由
非实现者执行：

```text
flag=unset/off: legacy characterization
flag=true: 当时已实现的 8 actions × normal/super/wildcard = HTTP 409
homestay ledger: charge/payment safe neighbor; refund/waiver blocked
housing ledger: charge/payment safe neighbor; refund/waiver/deposit refund blocked
housing tenant list/create: mobile/email masked
homestay booking detail + credential issue/return: credentialReference masked
```

以上为 A-C1 当时的已通过历史基线；A-2.5 必须在页面启动前加入第 9 个 move-out
financial variant 并重新通过 exact matrix。输出 `A-server-safety SHA`，随后
shared-contract-owner 发布内容不漂移的最终
`A-contract SHA`。任一矩阵或 projection 失败均为 stop-ship，A-1 继续
`in_progress`，不得进入 A-C2。

执行记录（2026-07-30）：A-C1.5 独立复审 PASS，`open_P0_P1=[]`。复审发现并修复
canonical metadata 缺失/不匹配时可能 fail open 的问题；focused tests 44/44，
API lint/typecheck/build、Shared build、Web typecheck、diff check 全部通过。
contract/server-safety baseline 已于 2026-07-30 冻结为
`e709459a034807b3575db604a76bc69bf1c5ff5b`
（`feat(property): freeze Track A access safety baseline`）。A-1 仍为
`in_progress`；在该 checkpoint，A-C2 schema、API projection 与后置 Web 接入尚未
按 Gate 完成。后续 A-C2 slice 结果见下方 runtime fixture 执行记录。

### A-C2a：Schema Migration 与 Exact Tests

严格依赖最终 A-contract SHA 与 A-server-safety SHA，且 stop-ship
`open_P0_P1=[]`：

- 父表唯一 `schema-migration-owner`：接收本任务 schema request，是唯一 Track A migration writer。
- `migration-test-owner`：只写/运行 Track A migration exact-set tests。

要求：

- expected permission exact set 恰好 65，不是 69。
- custom role、legacy operations、wildcard 不自动获得 granular page。
- `000183_*` 仅为候选编号；创建文件前重扫全部 migrations 和 history，再 reservation。
- migration 连续执行两次，definition/grant snapshot 相等。

### A-C2b：API `/users/me` Property Projection

严格依赖 A-C2a schema/exact tests：

- 父表唯一 `menu-projection-owner` 只修改
  `apps/api/src/modules/users/users.service.ts` 的 property projection。
- 只接受 active enabledModules、granular page permission、当前 tenant+park
  role/relation。
- custom、legacy、wildcard 不自动扩权。
- 输出 `A-api-menu-projection SHA`；此阶段不得修改 `apps/web/lib/menu.ts`，Web
  feature flag/菜单仍不暴露尚未落地的 canonical route。

### A-C2c：Web Menu（后置，不在当前 A-1 提前完成）

等待 shared Web foundation、A-base、A-2.5 closure 和 homestay/housing 两份 route SHA。menu owner
消费 route SHA 后才实现 Web menu、legacy landing、unknown property deep-link
  fail-closed；Party target 已 handoff，housing Web owner 在其独占 app
  route 内实现 tenant alias redirect/guard。Domain Web
owners 持续持有各自 app routes/guards；menu owner不得创建 placeholder 或领域 route。

### A-C2 Runtime Fixture 执行记录（2026-07-30）

A-C2a migration 与 A-C2b API-only projection 切片最终 Gate：
**CLOSED / PASS**，`open_P0_P1=[]`。该结论基于独立临时 PostgreSQL 容器和独立
volume，不代表 A-C2c Web menu 或 A-1 整体完成。

- 隔离 fixture 以 `000176`–`000182` 建立 A-C2 所需基线。
- `000183_property_business_granular_rbac.sql` 连续直跑两次均通过。
- property permission definition/grant exact set 为 65，且二次运行后 timestamp
  稳定。
- 覆盖多园区、module disabled、relation expired、relation missing、relation
  status disabled；`/users/me` projection 均按当前 tenant+park 和 active module
  fail closed。
- custom role、legacy operations 与 wildcard 不会自动扩展 granular page
  permission。
- cross-scope permission assignment 与 role 的 tenant 必须一致，错配默认拒绝。
- cleanup residual counters 为 `0|0|0|0`；临时容器和 volume 已删除。

增量 reviewer 发现 fixture container fallback 不够精确后已自修并复跑：fallback
必须绑定 exact run-id 与双 label，只处理 running container；使用 `docker run --rm`、
official PostgreSQL image、显式 `POSTGRES_DB` 和匿名 volume，并拒绝数据库 URL
override。修复后的同一 Gate 全绿。

`000175` 在空库中是生产数据补丁，会 fail-fast 并完整回滚，且不创建本次 fixture
所需 schema，因此隔离 A-C2 基线明确跳过它。此记录不把该跳过解释为全量空库
migration chain 通过；只证明 A-C2 切片在声明的 `000176`–`000182` 前置基线上成立。

A-1 继续保持 `in_progress`：shared Web foundation、homestay/housing workbenches、
最终 Web menu/landing/alias/deep-link 和 route evidence 尚未交付。

A-base-core 最终 handoff 已冻结：source commit
`32ccc02852c3201c6f68e3b6b89e4398cb102a17`，final run
`abase20260730final32ccc01`，fixture SHA
`3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c`，
profile `68da…107b`；21 pass / 0 fail / 6 runtime skip，真实双 run、journals cleanup
与 residual=0 已由 independent final review PASS，`open_P0_P1=[]`。这只使 A-C2.5
解除依赖并成为下一步，不等于 A-1 或 Track A technical pass；domain Web 仍 blocked。

### A-C2.5：Workbench API/Response Contract Closure

研究可在 A-base 期间先行；Gate 严格位于 A-base handoff 后、任何 workbench Web
实现前。shared-contract、homestay-api、housing-api、schema-migration、
asset-party-decision owners 分别按父计划独占路径，独立 checker 汇总
`A-2.5-contract-closure SHA`。

必须覆盖：shared 全量 response types；homestay tasks/stays/turnover detail/finance
及 guest/work-order candidates；housing tasks/handover list+detail/billing/finance/
repair list+detail；stays detail alias（detail 6→7）；第 9 个 move-out financial
high-risk variant；财务字段/附件 ID 最小投影与 GET read permission。禁止 N+1、
route-local interface、bundle expansion。Party target 使用独立 `asset:party`
权限与 canonical list/detail routes。
Track B high-risk 仍 unavailable。

### A-C3：Machine Gate

独立 checker：

- manifest/route/API coverage。
- tenant uniqueness / park grants / module predicates。
- legacy/wildcard/custom role 负向矩阵。

## 2. Checklist

- [ ] 读取相关 Trellis specs。
- [ ] 冻结 canonical route/page/action 清单。
- [ ] 冻结 bundle，不硬编码 Persona。
- [ ] 向 `shared-contract-owner` 交付六层 manifest、validator 和 response contract 需求包。
- [ ] 接收并验收 `shared-contract-owner` 的 contract candidate SHA；只有
  A-server-safety Gate 通过后才接收最终 contract SHA。
- [ ] 接收并验收 `property-workbench-safety-owner` 的 flag 三态与 super/wildcard
  fail-closed 证据。
- [ ] 接收 homestay/housing 两组 field projection response snapshot。
- [ ] 接收 `property-env-doc-owner` 的 env/default/409 compatibility 同步证据。
- [x] 向 `schema-migration-owner` 交付 schema request；reservation 后验收 forward migration。
- [x] 验收 65-permission exact set，custom/legacy/wildcard 无自动扩权。
- [x] 验收 API-only `/users/me` projection slice，确认 Web 未提前暴露。
- [ ] 两份 domain route SHA 后，才向 `menu-projection-owner` 交付 Web
  menu/landing/redirect 工作包。
- [x] 运行 exact-set migration 两次。
- [x] 输出 before/after permission diff。
- [x] A-base handoff 后完成 A-2.5，输出交付 SHA 链。
- [x] 9-action/variant、7 detail routes、response/GET/field/file matrix 全部闭合。
- [x] Party canonical list/detail target 与独立页面权限完成 handoff。
- [x] 独立 checker 无 P0/P1。
- [ ] 生成 handoff SHA。

## 3. Machine Gates

- Shared build。
- Workspace typecheck。
- manifest validation。
- permission duplicate scan。
- migration rerun。
- active/missing/disabled/expired module matrix。
- normal/superuser matrix。
- single/multi-park matrix。
- cross-scope permission assignment / role tenant consistency。
- exact fixture equality。
- fixture container exact run-id/dual-label/running fallback、`--rm`、official
  PostgreSQL、`POSTGRES_DB`、anonymous volume、URL override rejection。
- legacy-only/custom-role negative cases。
- direct route landing/403 contract。
- `PROPERTY_WORKBENCH_V2` unset/off/true matrix。
- 9 high-risk action/variant normal/super/wildcard 409 exact set。
- 两个 ledger discriminator 的 safe/high-risk 邻接矩阵。
- housing tenant list/create 与 homestay credential 三入口敏感字段负向 snapshot。

## 4. 风险与 Stop-ship

P0：

- 跨 tenant/park grant。
- wildcard 绕过 module。
- legacy permission 获得新高风险能力。
- `PROPERTY_WORKBENCH_V2=true` 时任一 high-risk action 可到达领域 mutation，或
  super/wildcard 绕过 409。
- API 返回完整 Party `mobile`/`email` 或 credential `credentialReference`。

P1：

- route/page/API manifest 缺项。
- migration rerun 产生不同结果。
- custom role 自动扩权。
- seeded/static menu 结果不一致。

## 5. Rollback

- 通过 feature flag 关闭新工作台。
- off/unset 只恢复 legacy API；不得用关闭 Web 掩盖 true 状态下缺失的 server gate。
- 不删除 permission/audit 数据。
- forward-fix migration。
- 恢复菜单前使用保存的 role-permission snapshot 验证，不批量恢复宽权限。

## 6. 人工 Gate

Codex 完成 machine Gate 后输出 IA/bundle 差异包。产品/业务负责人确认 page 名称和 bundle 含义。未签署不阻止文档和自动化完成，但阻止将合同标记为生产产品冻结。

## 7. Handoff

交付对象：

- `pr192-a-homestay-workbenches`
- `pr192-a-housing-workbenches`
- `pr192-a-automated-gates`
- Track B shared-contract owner

Handoff 必须包含 SHA、路径、命令、结果和 `open_P0_P1=[]`。

## 8. 2026-07-31 最终执行记录

交付 SHA：`3766509` shared、`44d6769` Homestay API、`8a0bd17` Housing API、
`5a557e5` RBAC、`d33fad9` integration/Party。最终 API full unit 91/91、Web default
`tsc`/lint/build 154、独立多轮 Gate 与 DB evidence 均通过，`open_P0_P1=[]`。

真实 desktop/390、keyboard、zoom/reflow 仍因 Chrome connector `sandboxCwd`
基础设施未验；该项属于整体 UI/release Gate，不回退本合同任务完成状态。
