# PR192 B 领域集成实施计划

## 1. 分阶段前置条件

### B-0 Final Gate

父任务 `research/` 下三份权威候选
`b0-product-access-freeze.md`、`b0-identity-control-freeze.md` 和
`b0-runtime-contract-freeze.md` 必须先完成最终独立复审。只有
`open_P0_P1=[]` 且最终 `B-contract SHA`、`B-schema-expand SHA`、runtime effect
manifest SHA 已登记，后续 worker 才能启动。

领域计划不抄写或冻结旧 route/status/schema；每个 worker 只消费上述最终 SHA，
发现不一致则提交 change request。

### B0.5-S0 High-risk Stop-ship

第一个代码切片只做高风险 fail-closed：

- 在正式 controller/service 入口、进入领域 transaction 前阻断旧直执。
- normal、superuser、wildcard、旧客户端和缺失/错误 metadata 全部负向覆盖。
- 不创建 approval request，不接 runtime，不实现 identity/control/module dependency。
- 输出独立 `B-high-risk-stopship SHA` 和 `open_P0_P1=[]`。

B-0 合同 Gate 与 B0.5-S0 代码 Gate 分开记录，前者通过不得冒充后者通过。

### B0.5 Module Core

只要求：

- 最终 `B-contract SHA`、`B-schema-expand SHA`、runtime effect manifest SHA。
- 已通过的 `B-high-risk-stopship SHA`。
- 两项输入 Gate 无 open P0/P1。

B0.5 module core 不要求 Track A、identity/approval/task runtime、`B-extension-core`、domain
adapter 或 Web handoff。

### B2c/B3 Domain Integration

- Track A homestay、housing、shared Web technical handoff SHA。
- 最终 `B-contract SHA`、`B-schema-expand SHA`、runtime effect manifest SHA。
- Identity/control、approval runtime、task runtime handoff SHA。
- 已通过的规范 `B-module-core SHA`。
- `B-property-homestay-effect-schema SHA`（000191）与
  `B-housing-effect-schema SHA`（000192）。
- `B-property-foundation-adapter SHA`。
- `B-extension-core` fixture SHA 已由 integration-reconcile 的早期 core fixture
  阶段先行产生；它只包含领域集成测试需要的 B schema fixtures、profile/version/
  checksum 和 crash/concurrency 场景种子，不要求 `B-final-reconcile`、最终
  migration recovery、rollback evidence 或 integration-reconcile 整体完成。
- 所有输入 Gate 无 open P0/P1。
- 本阶段只消费 [current authority locator](research/b2c-current-authority-locator-v1.md)
  登记的 current-only SHA；历史摘要值一律不得作为输入。
- 每个 worker 运行 `trellis-before-dev` 并读取目标 API/Web/shared/module/property/file/
  finance specs。

## 2. Subagent 批次

根/协调 Agent 占一槽，最多三个 subagent。

### B0.5：Module Core Milestone

仅 `module-dependency-owner` 独占 `apps/api/src/modules/saas-modules/**`：

1. 基于 B contract/schema expand 建立 asset dependency。
2. 完成 normal/superuser、enable/disable、multi-park 和 409 tests。
3. 由独立 checker 验证无 B-extension/runtime/domain 依赖。
4. 输出规范 `B-module-core SHA`。
5. 冻结、记录 handoff 并释放 `saas-modules/**`；后续批次不得修改。

B0.5 module core 不等待 D1–D5，core SHA 立即交给 B2b。

### D1：只读 Domain 映射

在 `B-module-core SHA` 和 `B-extension-core SHA` 都可用后并行：

- homestay mapper：check-in、cancel/finance/task adapter points。
- housing mapper：lease/finance/purchase/task adapter points。
- wiring mapper：provider graph、feature flags 和已冻结 module contract。

输出 action→port→transaction→Web slot→test traceability，不改代码。

### D2/B2c：API Adapters

先由唯一 schema-migration-owner 独立串行完成 effect-schema batch：

1. 重扫 history 并正式 reservation 000191/000192。
2. 000191 只交付 property-operation + homestay owning effect schema，输出
   `B-property-homestay-effect-schema SHA`。
3. 000192 只交付住房 owning effect schema，输出
   `B-housing-effect-schema SHA`。
4. 两份 handoff 分别记录 rerun、约束、checksum、base/output SHA 和
   `open_P0_P1=[]`，不得冒充 000185–000190 `B-schema-expand SHA`。

随后由 `property-foundation-api-owner` 独立实施 post-B1 adapter slice：

- 唯一拥有 property-operations mode transition/force release approval adapter。
- 消费 current B-contract、runtime effect authority、B-schema-expand、
  `B-approval-runtime-v2 SHA`、`B-property-foundation-runtime-v2 SHA`、
  `B-property-homestay-effect-schema SHA`（000191）、B-module-core 及 B-extension
  fixture/validation handoff。
- 独立验证 request、execution effect、scope、super/wildcard fail-closed 和 rollback。
- 输出 `B-property-foundation-adapter SHA` 后释放路径。

并行且路径独占：

- homestay-api-owner。
- housing-api-owner。

缺任一 effect-schema SHA 或 `B-property-foundation-adapter SHA` 时，homestay/housing
领域 API lanes 均不得启动；这不阻断 schema reservation/implementation 与 foundation
adapter 子阶段。每个 owner 只消费冻结 ports
与对应 effect-schema SHA，且不得修改 migration；完成 targeted integration tests 后
输出独立 SHA。

### D3/B3：B Web 与 Final Wiring

第一阶段并行：

- shared-property-web-owner 实现顶层 identity submission list/detail、Party identity
  tab deep-link、notification list/detail、event-delivery incident list/detail 与
  approval incident list/detail。
- homestay-b-web-owner 接管 Track A homestay SHA，填充 B slots。
- housing-b-web-owner 接管 Track A housing SHA，填充 B slots。

两者完成后，api-integration-owner 单独修改 `apps/api/src/app.module.ts`。Wiring 不与
API owners 并行。

### D4：跨域自动化

并行：

- identity/check-in concurrency checker。
- approval/finance/task crash-replay checker。
- compatibility/rollback/browser checker。

共享数据库 destructive/reclaim 场景串行调度，fixture 使用早期
`B-extension-core` checksum，不等待最终 reconcile evidence。

### D5：独立 Gate

- architecture/ownership reviewer。
- security/finance reviewer。
- Web/role E2E reviewer。

Checker 不直接修复；问题回派原 owner，P0/P1 由非修复者复审。

## 3. 实施顺序

1. 对三份 B-0 候选执行最终独立 Gate，生成最终合同/schema/effect SHA。
2. 仅实现并验证 B0.5-S0 高风险 fail-closed，输出独立 stop-ship SHA。
3. 仅用最终 SHA 与 stop-ship SHA 实现并验证 module dependency。
4. 输出 `B-module-core SHA`，冻结/释放 `saas-modules/**`，立即 handoff B2b。
5. 等待 `B-extension-core SHA`，再由 schema owner 独立交付 000191/000192 两份
   effect-schema SHA。
6. property-foundation-api-owner 消费 approval runtime+000191，独立交付
   `B-property-foundation-adapter SHA`。
7. 三份前置 SHA 均存在后，从最终合同解析领域 ports/action/effect mapping。
8. 实现 homestay identity/approval/task adapters。
9. 实现 housing approval/finance/task adapters。
10. Track A Web owner handoff 后接入 B projection/actions。
11. 最后完成 app.module wiring，但不修改已释放的 module path。
12. 使用 `B-extension-core` 运行 concurrency/crash/exactly-once/compatibility tests。
13. 演练领域 flags rollback/re-enable，输出 B-domain-integration SHA。
14. 将 domain SHA、执行结果、before/after mutation evidence 和失败注入结果反向
   handoff 给 integration-reconcile 的 `B-final-reconcile` 阶段；由其完成最终
   migration recovery、shadow/rollback 和 combined checksum Gate。

## 4. 验证

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

另运行 module、homestay、housing、files、idempotency、first-release regression，
B-extension PostgreSQL integration、精确角色 API/Web E2E 和 app startup smoke。

### B0.5 Module Core Gate

- 输入仅为 B contract/schema expand。
- module dependency 和 superuser/module fail-closed。
- 输出规范 `B-module-core SHA`。
- `saas-modules/**` 已冻结/释放，后续修改数为零。
- 不等待或引用 `B-extension-core`、D1–D5 完成结果。

### B2c/B3 Domain Gate

- 禁止路径修改数为零，ownership/handoff SHA 完整。
- 精确消费已冻结 `B-module-core SHA` 和 `B-extension-core SHA`。
- 精确消费两份独立 effect-schema SHA 与 `B-property-foundation-adapter SHA`；
  domain API migration 修改数为零。
- check-in snapshot evidence/TOCTOU。
- 每项 maker-checker 及执行状态组合。
- crash/reclaim/DLQ replay 后财务/领域 effect 一次。
- task assignment 与 owning aggregate 一致。
- canonical Web 无重复 route/CRUD。
- Identity/notification/event-delivery-incident/approval-incident canonical routes，
  event replay 与 approval retry allowed action 通过精确岗位 E2E。
- Event replay 对 active `asset` module、incident page、
  `property_event:read_incident`、assigned tenant+park incident scope、
  `property_event:replay` 逐维执行缺失测试并全部断言 403；generic event/read 不可
  替代。`asset` module assignment missing、disabled、expired 必须是三个独立 403
  case。
- 320/360/390/768/desktop、keyboard、screen reader、200%/400% zoom/reflow、
  forced-colors 机器证据通过。
- compatibility、rollback/re-enable、build/startup 通过。

## 5. 完成

Handoff 记录 owner、paths、base/input/output SHA、命令、结果、known failures 和 open
P0/P1。B0.5 module core Gate 通过即独立输出 `B-module-core SHA`，不得等待本任务其余批次完成。
之后依赖顺序固定为
`B-module-core → B-extension-core → domain integrations → B-final-reconcile`。
只有 domain machine Gate 通过、禁止路径零修改且 open P0/P1 为零，才输出 domain
handoff。本任务不把 domain pass 冒充最终 B technical Gate。人工签署未完成时生产
高风险 enforce 继续关闭。

## 6. 2026-08-03 集成与质量门记录

已完成：

- 三路 subagent 分别实现/复核 DEC-01/02、DEC-04/05/06、adapter/authority/cardinality，
  由 root 独立重跑集成门。
- API lint、typecheck、build、Nest application-context startup：PASS。
- Homestay/Housing/Property approval/task/identity/operations 宽回归：PASS。
- Shared build 与 24 tests：PASS。
- Web lint、typecheck、生产 build：PASS，158 routes。
- DEC decision validator 16/16 与实际 decision record + signer directory：PASS。
- PostgreSQL 16 临时库：000001～000188 baseline + 000191，DEC-01 atomic
  success/rollback 与 DEC-02 direct+mapped legacy over-allocation：PASS；临时库已删除。
- `git diff --check` 与最终源码扫描在收尾阶段重跑。

待关闭：

- B3 实际浏览器视觉/交互证据。应用内浏览器 bootstrap 因
  `sandboxCwd is not a local file URI` 拒绝当前 Linux 工作区；不得用静态 HTML 或独立
  Playwright 冒充规定的浏览器验收。

操作说明：验证过程中默认本地开发库已被一个 subagent 前向推进至 000188，000189
preflight 正确失败；未回滚任何 migration。该事实需保留在最终交付说明中。
