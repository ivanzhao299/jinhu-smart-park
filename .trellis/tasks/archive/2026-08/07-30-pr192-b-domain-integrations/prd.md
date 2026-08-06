# PR192 B 领域集成

## 1. 目标

把 Track B 经最终独立 Gate 冻结的 identity/control、approval runtime、task
assignment 和 shared contract 接入真实民宿/住房领域与 Track A canonical Web，使生产代码具备 module
依赖、check-in identity 原子校验、maker-checker、任务/审批展示和最终 Nest wiring。

本任务填补 B 基础能力与 owning aggregate 之间的明确责任，不修改基础运行时内部、
shared contract 或 migration。

## 2. 分阶段输入 Handoff

### 2.1 B-0 权威候选登记

B-0 当前只登记以下三份权威候选，均位于父任务 `research/`：

- `b0-product-access-freeze.md`
- `b0-identity-control-freeze.md`
- `b0-runtime-contract-freeze.md`

三份候选必须由最终独立 Gate 一起复审；在 `open_P0_P1=[]`、生成最终
`B-contract SHA`、`B-schema-expand SHA` 和 runtime effect manifest SHA 前，本领域
任务不得把候选内容写成生产实现。领域计划不复制 route、状态机、表结构或 effect
定义；只消费最终 SHA 指向的 exact contract/schema/effect manifest。

### 2.2 B0.5-S0 高风险代码 Stop-ship

首个实现切片只允许关闭高风险旧直执：所有冻结为需审批的正式领域入口在进入
service/transaction 前 fail closed，normal、superuser、wildcard 和旧客户端均不得
旁路。该切片不创建审批 request、不实现 identity/control/module core，也不改变
领域业务结果。

B-0 合同 Gate 通过仅冻结合同，不代表 B0.5-S0 代码 stop-ship 已通过；S0 必须以实际
controller/service 负向测试单独关闭。

### 2.3 B0.5 Module Core

只依赖：

- B module/access contract SHA。
- 对应 schema expand SHA。

不得依赖 Track A Web、identity/approval/task runtime、`B-extension-core` 或任何
B2c/B3 产物。通过后输出规范名称 `B-module-core SHA`，供 B2b core fixture 校验。

### 2.4 B2c/B3 Domain Integration

以下输入必须具备 SHA 和 machine Gate：

- Track A homestay/housing workbench handoff。
- Track A shared Web foundation handoff。
- 最终 `B-contract SHA`、`B-schema-expand SHA` 和 runtime effect manifest SHA。
- Identity/control foundation、approval runtime、task runtime 的已验证 handoff SHA。
- Module/bundle/access manifest SHA。
- 已冻结的 `B-module-core SHA`。
- 早期 `B-extension-core SHA`。
- `B-property-homestay-effect-schema SHA`（000191）与
  `B-housing-effect-schema SHA`（000192）。
- `B-property-foundation-adapter SHA`，由 post-B1 property foundation slice 独立交付。

Open P0/P1 非空不得接入。

## 3. 生产集成范围

### 3.1 Module dependency

- 在 `apps/api/src/modules/saas-modules/**` 实现 asset 是 homestay/housing_rental 的
  显式依赖。
- 缺 asset 启用依赖模块返回 409；仍有依赖时关闭 asset 返回 409。
- 不自动赠送或静默启用 asset；superuser 不绕过 module。
- 本能力在独立 B0.5 module-core milestone 完成；输出 `B-module-core SHA` 后冻结并释放
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

### 3.4a Property Approval Adapter

在两个领域 API owner 启动前，`property-foundation-api-owner` 独立拥有
`apps/api/src/modules/property-operations/**` 中 mode transition/force release approval
adapter，消费 approval runtime SHA 与
`B-property-homestay-effect-schema SHA`（000191），通过独立 Gate 后输出
`B-property-foundation-adapter SHA`。该 slice 不接管其他 property-operations 内部。

### 3.5 B3 Canonical Web

- shared-property-web-owner 负责顶层 identity submission list/detail、Party identity
  tab deep-link、notification list/detail，以及受保护 event-delivery incident 与
  approval incident list/detail routes。
- 民宿/住房 Web owner 只填充各自 canonical workbench/detail slot，不复制上述共享
  routes。
- B3 machine Gate 必须覆盖上述 routes、event replay 与 approval retry 的 exact
  allowed action，以及 320/360/390/768/desktop、keyboard、screen reader、
  200%/400% zoom/reflow、forced-colors。
- Event replay 负向矩阵必须逐维缺失 active `asset` module、incident page、
  `property_event:read_incident`、assigned tenant+park incident scope 与
  `property_event:replay` 并全部断言 403；其中 `asset` module assignment missing、
  disabled、expired 为三个独立 403 用例，generic event/read 不可替代。

## 4. 不拥有

- `packages/shared/**`。
- `database/migrations/**`、seed 或 reconcile scripts；候选 `000191_*`、`000192_*`
  仅归 schema-migration-owner，并须在 B2c 前重扫 history、正式 reservation 和
  handoff；homestay/housing API owner 均不得创建或修改。
- `apps/api/src/modules/property-approvals/**` 内部。
- `apps/api/src/modules/property-tasks/**` 内部。
- `apps/api/src/modules/property-operations/**` identity/control 内部；唯一例外是上述
  post-B1 property-foundation-api-owner adapter slice，其余 owner 修改数仍为零。
- A shared Web foundation 内部。
- 通用 workflow 或 leasing 财务表。

需要变更时向原 owner 提交 change request 并等待新 SHA。

## 5. 安全与失败合同

- 所有适配器 fail closed；缺 contract/module/scope/policy/snapshot 时不得回退旧直执。
- Approval decision 通过不等于领域动作完成；只有 runtime execution 调用领域 command。
- Domain adapter 必须以稳定 execution idempotency key 防重，业务效果与 approval
  executed/audit/outbox 的事务边界遵循 runtime contract。
- 九个领域高风险 approval `actionId` 必须消费最终合同中的 `.request` exact value；
  `effectKind` 只消费 lower dot-separated runtime allowlist。Effect receipt/manifest
  DDL、unique/FK/CHECK/cardinality/hash 只引用最终 runtime effect manifest SHA，
  domain 计划和 adapter 不复制或派生。
- Identity check-in 不允许事务外 pre-read；snapshot 变化返回 409/terminal conflict。
- Task API 不得直接把 owning aggregate 标为完成。
- 关闭 feature flag 只关闭新入口/enforce，不删除 approval/identity/audit，也不恢复
  旧宽权限或高风险直执。

## 6. 验收标准

- [ ] B0.5 module core 只消费 contract/schema expand，不等待 `B-extension-core`。
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

## 7. 2026-08-03 执行状态补录

危立帅已代表产品、财务、数据责任人确认 DEC-01～DEC-06 A；可信签署人目录、
issuer/evidence reference、民宿/住房领域及审计/安全角色授权已线下签署留存，并由用户
明确授权直接执行。对应 decision record 与 trusted signer directory 已通过 validator。

本轮已关闭民宿取消/历史财务、住房退租交接/采购转移/付款退款状态、真实唯一约束名、
checkout 动态 effect cardinality、TypeORM PostgreSQL `RETURNING` 结果形状等 P0/P1。
API、Shared、Web、Nest startup 与真实 PostgreSQL 原子回归均通过。当前唯一未关闭项为
应用内浏览器运行时拒绝 Linux 工作区 URI，导致桌面/390px/缩放/forced-colors 视觉证据
无法采集；该项不得以生产构建替代。
