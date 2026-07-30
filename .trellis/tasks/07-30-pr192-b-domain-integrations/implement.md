# PR192 B 领域集成实施计划

## 1. 分阶段前置条件

### D0/B1 Module Core

只要求：

- B module/access contract SHA。
- 对应 schema expand SHA。
- 两项输入 Gate 无 open P0/P1。

D0/B1 不要求 Track A、identity/approval/task runtime、`B-extension-core`、domain
adapter 或 Web handoff。

### B2c/B3 Domain Integration

- Track A homestay、housing、shared Web technical handoff SHA。
- Identity/control、approval runtime、task runtime 和 B schema contract SHA。
- 已通过的规范 `B-module-core SHA`。
- `B-extension-core` fixture SHA 已由 integration-reconcile 的早期 core fixture
  阶段先行产生；它只包含领域集成测试需要的 B schema fixtures、profile/version/
  checksum 和 crash/concurrency 场景种子，不要求 `B-final-reconcile`、最终
  migration recovery、rollback evidence 或 integration-reconcile 整体完成。
- 所有输入 Gate 无 open P0/P1。
- 每个 worker 运行 `trellis-before-dev` 并读取目标 API/Web/shared/module/property/file/
  finance specs。

## 2. Subagent 批次

根/协调 Agent 占一槽，最多三个 subagent。

### D0/B1：Module Core Milestone

仅 `module-dependency-owner` 独占 `apps/api/src/modules/saas-modules/**`：

1. 基于 B contract/schema expand 建立 asset dependency。
2. 完成 normal/superuser、enable/disable、multi-park 和 409 tests。
3. 由独立 checker 验证无 B-extension/runtime/domain 依赖。
4. 输出规范 `B-module-core SHA`。
5. 冻结、记录 handoff 并释放 `saas-modules/**`；后续批次不得修改。

D0/B1 不等待 D1–D5，core SHA 立即交给 B2b。

### D1：只读 Domain 映射

在 `B-module-core SHA` 和 `B-extension-core SHA` 都可用后并行：

- homestay mapper：check-in、cancel/finance/task adapter points。
- housing mapper：lease/finance/purchase/task adapter points。
- wiring mapper：provider graph、feature flags 和已冻结 module contract。

输出 action→port→transaction→Web slot→test traceability，不改代码。

### D2/B2c：API Adapters

并行且路径独占：

- homestay-api-owner。
- housing-api-owner。

每个 owner 只消费冻结 ports。完成 targeted integration tests 后输出独立 SHA。

### D3/B3：B Web 与 Final Wiring

第一阶段并行：

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

1. 仅用 B contract/schema expand 实现并验证 module dependency。
2. 输出 `B-module-core SHA`，冻结/释放 `saas-modules/**`，立即 handoff B2b。
3. 等待 `B-extension-core SHA` 后冻结领域 ports、action mapping、lock order、flags。
4. 实现 homestay identity/approval/task adapters。
5. 实现 housing approval/finance/task adapters。
6. Track A Web owner handoff 后接入 B projection/actions。
7. 最后完成 app.module wiring，但不修改已释放的 module path。
8. 使用 `B-extension-core` 运行 concurrency/crash/exactly-once/compatibility tests。
9. 演练领域 flags rollback/re-enable，输出 B-domain-integration SHA。
10. 将 domain SHA、执行结果、before/after mutation evidence 和失败注入结果反向
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

### D0/B1 Module Core Gate

- 输入仅为 B contract/schema expand。
- module dependency 和 superuser/module fail-closed。
- 输出规范 `B-module-core SHA`。
- `saas-modules/**` 已冻结/释放，后续修改数为零。
- 不等待或引用 `B-extension-core`、D1–D5 完成结果。

### B2c/B3 Domain Gate

- 禁止路径修改数为零，ownership/handoff SHA 完整。
- 精确消费已冻结 `B-module-core SHA` 和 `B-extension-core SHA`。
- check-in snapshot evidence/TOCTOU。
- 每项 maker-checker 及执行状态组合。
- crash/reclaim/DLQ replay 后财务/领域 effect 一次。
- task assignment 与 owning aggregate 一致。
- canonical Web 无重复 route/CRUD。
- compatibility、rollback/re-enable、build/startup 通过。

## 5. 完成

Handoff 记录 owner、paths、base/input/output SHA、命令、结果、known failures 和 open
P0/P1。D0/B1 Gate 通过即独立输出 `B-module-core SHA`，不得等待本任务其余批次完成。
之后依赖顺序固定为
`B-module-core → B-extension-core → domain integrations → B-final-reconcile`。
只有 domain machine Gate 通过、禁止路径零修改且 open P0/P1 为零，才输出 domain
handoff。本任务不把 domain pass 冒充最终 B technical Gate。人工签署未完成时生产
高风险 enforce 继续关闭。
