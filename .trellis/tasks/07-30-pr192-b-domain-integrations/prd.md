# PR192 B 领域集成

## 1. 目标

把 Track B 已冻结的 identity/control、approval runtime、task assignment 和 shared
contract 接入真实民宿/住房领域与 Track A canonical Web，使生产代码具备 module
依赖、check-in identity 原子校验、maker-checker、任务/审批展示和最终 Nest wiring。

本任务填补 B 基础能力与 owning aggregate 之间的明确责任，不修改基础运行时内部、
shared contract 或 migration。

## 2. 分阶段输入 Handoff

### 2.1 B1 Module Core

只依赖：

- B module/access contract SHA。
- 对应 schema expand SHA。

不得依赖 Track A Web、identity/approval/task runtime、`B-extension-core` 或任何
B2c/B3 产物。通过后输出规范名称 `B-module-core SHA`，供 B2b core fixture 校验。

### 2.2 B2c/B3 Domain Integration

以下输入必须具备 SHA 和 machine Gate：

- Track A homestay/housing workbench handoff。
- Track A shared Web foundation handoff。
- Identity/control foundation contract、verifier port、lock order SHA。
- Approval decision/execution/outbox API contract SHA。
- Property task assignment/projection contract SHA。
- B schema/migration SHA。
- Module/bundle/access manifest SHA。
- 已冻结的 `B-module-core SHA`。
- 早期 `B-extension-core SHA`。

Open P0/P1 非空不得接入。

## 3. 生产集成范围

### 3.1 Module dependency

- 在 `apps/api/src/modules/saas-modules/**` 实现 asset 是 homestay/housing_rental 的
  显式依赖。
- 缺 asset 启用依赖模块返回 409；仍有依赖时关闭 asset 返回 409。
- 不自动赠送或静默启用 asset；superuser 不绕过 module。
- 本能力在独立 B1 milestone 完成；输出 `B-module-core SHA` 后冻结并释放
  `apps/api/src/modules/saas-modules/**`，后续 B2c/B3 不再修改该路径。

### 3.2 民宿 API/Web

- Homestay check-in 在 owning transaction 调用 identity verifier port，执行统一锁序
  和 current verified snapshot 重验，并写 evidence audit。
- 需 approval 的取消/终止/财务动作创建 request，不再直接执行。
- Task projection/assignment 轻动作调用 owning aggregate command。
- Track A read-only slots 接入 identity、approval 和 task 状态；不复制 canonical page。

### 3.3 住房 API/Web

- 租约审批/作废/提前退租、退款/减免/押金退款、采购审批/付款/退款/作废接入
  approval request/execution adapter。
- Financial command 在领域 transaction 保持住房子账、decimal 和幂等合同。
- Housing task/approval UI 复用 Track A canonical detail/tab 和 shared presentation。
- Party detail 始终深链 asset canonical UI。

### 3.4 Final wiring

- `apps/api/src/app.module.ts` 由 api-integration-owner 最后一次接入已验证模块。
- Wiring 不改变外部 URL/DTO/response；old client 兼容由 contract/E2E 验证。

## 4. 不拥有

- `packages/shared/**`。
- `database/migrations/**`、seed 或 reconcile scripts。
- `apps/api/src/modules/property-approvals/**` 内部。
- `apps/api/src/modules/property-tasks/**` 内部。
- `apps/api/src/modules/property-operations/**` identity/control 内部。
- A shared Web foundation 内部。
- 通用 workflow 或 leasing 财务表。

需要变更时向原 owner 提交 change request 并等待新 SHA。

## 5. 安全与失败合同

- 所有适配器 fail closed；缺 contract/module/scope/policy/snapshot 时不得回退旧直执。
- Approval decision 通过不等于领域动作完成；只有 runtime execution 调用领域 command。
- Domain adapter 必须以稳定 execution idempotency key 防重，业务效果与 approval
  executed/audit/outbox 的事务边界遵循 runtime contract。
- Identity check-in 不允许事务外 pre-read；snapshot 变化返回 409/terminal conflict。
- Task API 不得直接把 owning aggregate 标为完成。
- 关闭 feature flag 只关闭新入口/enforce，不删除 approval/identity/audit，也不恢复
  旧宽权限或高风险直执。

## 6. 验收标准

- [ ] B1 module core 只消费 contract/schema expand，不等待 `B-extension-core`。
- [ ] `B-module-core SHA` 在 B2b 前独立输出，路径随后冻结并释放。
- [ ] asset module dependency 对 normal/superuser、启用/关闭组合均通过。
- [ ] Homestay check-in adapter 同事务重验 snapshot，并发/TOCTOU 测试通过。
- [ ] 民宿需审批动作不能直执，approval request/execution 回写正确。
- [ ] 住房 lease/finance/purchase 高风险路径全部接 maker-checker。
- [ ] 住房财务 exactly-once effect、decimal 和 housing 子账边界通过。
- [ ] Task assignment/queue 只调用 owning aggregate，projection 可重建。
- [ ] 两领域 Web 只复用 canonical routes/detail，不恢复重复 CRUD。
- [ ] 未授权/未启用/跨 scope/旧 client 全部 fail closed 或兼容符合合同。
- [ ] app.module 只有 integration owner 修改并通过 build/startup。
- [ ] Feature flag rollback/re-enable 保留新数据且不恢复旧高风险行为。
- [ ] shared/migration/runtime 内部文件零修改。
- [ ] Open P0/P1 为零且输出 B-domain-integration handoff SHA。
