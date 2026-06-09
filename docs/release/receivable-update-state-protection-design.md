# JinHu Smart Park 应收修改业务状态保护设计

## 1. 目的

本文用于分析并记录 `PUT /leasing/receivables/:id` 的字段修改和状态保护边界，为后续真实幂等接入提供前置条件。

该接口属于账务对象修改接口。直接接入 `IdempotencyInterceptor` 可以防止同一请求重复执行，但不能阻止错误修改 `amount_paid`、`amount_waived`、`invoice_status`、`status` 等敏感字段。因此 E2-5B-2B 已先实施业务状态保护，E2-5B-2C 已在该保护基础上接入真实幂等。

## 2. 当前接口现状

| 项目 | 当前状态 |
|---|---|
| Controller | `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts` |
| Method | `LeasingReceivablesController.update` |
| Route | `PUT /leasing/receivables/:id` |
| DTO | `UpdateLeasingReceivableDto` |
| Service | `LeasingReceivablesService.update` |
| 权限 | `LEASING_RECEIVABLE_UPDATE` |
| Guard | 受全局 `IdempotencyKeyGuard` 约束，非公开写请求需要 `X-Idempotency-Key` |
| Interceptor | 已接入 `IdempotencyInterceptor` |
| 回归数据 | `first-release-leasing.mjs` 已覆盖未核销应收 update missing key / first / replay / conflict、敏感字段拒绝、核销后状态保护 |

E2-5B-2B 实施后的 service update 行为：

- 通过 `findOne(scope, id, actor)` 读取应收，保留租户、园区与数据权限隔离。
- 普通 update DTO 仅允许 `remark` 和 `due_date`。
- 即使 DTO 被绕过，service 也会拒绝合同、租户、费用类型、期间、金额、已收、减免、开票状态、状态、来源等敏感字段。
- 根据当前账务金额重新计算 `amount_remain`、`overdue_days` 和派生状态。
- 当状态变化时写入应收状态日志。

当前软删除逻辑已有部分保护：`amountPaid > 0`、`amountWaived > 0` 或 `invoiceStatus != none` 时拒绝删除；普通 update 现在也已补齐同类状态保护。

## 3. 当前允许修改字段

| 字段 | 当前是否可传 | 当前是否会写入 | 风险等级 | 建议策略 |
|---|---|---|---|---|
| `ar_code` | 否 | 否 | 中 | 已禁止普通 update 修改 |
| `contract_id` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `park_tenant_id` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `fee_type` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `period_start` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `period_end` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `due_date` | 是 | 是 | 中 | 可作为普通修改候选，但已核销 / 已开票 / 已作废时应禁止 |
| `amount_due` | 否 | 否 | P0 | 已禁止普通 update 修改 |
| `amount_paid` | 否 | 否 | P0 | 已禁止普通 update 修改 |
| `amount_waived` | 否 | 否 | P0 | 已禁止普通 update 修改 |
| `late_fee` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `invoice_status` | 否 | 否 | P0 | 已禁止普通 update 修改 |
| `status` | 否 | 否 | P0 | 已禁止普通 update 直接传入 |
| `source_type` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `source_id` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `generate_batch_no` | 否 | 否 | 高 | 已禁止普通 update 修改 |
| `remark` | 是 | 是 | 低 | 允许普通修改；作废 / 删除对象除外 |

## 4. 字段保护建议

### 允许普通修改字段

- `remark`：展示和说明字段，不直接影响账务金额、状态和核销关系。
- `due_date`：可作为普通修改候选，但仅限未核销、未减免、未开票、未作废应收；若修改会改变逾期状态，应由 service 重新推导状态并记录状态日志。

### 受限修改字段

- `ar_code`：允许无财务活动时修改，但必须继续执行唯一性校验。
- `amount_due`：直接影响应收金额和剩余金额，只允许无核销、无减免、无开票、非作废应收修改。
- `late_fee`：影响剩余金额，建议仅允许无财务活动时修改，长期应由逾期计算或调整流程维护。
- `fee_type`：影响账务科目和合同期间唯一性，只允许无财务活动时修改。
- `period_start` / `period_end`：影响账期和合同期间唯一性，只允许无财务活动时修改。

### 禁止普通修改字段

- `amount_paid`：必须由收款核销 / 反核销流程维护。
- `amount_waived`：必须由减免 / 豁免流程维护。
- `invoice_status`：必须由开票流程维护。
- `status`：应由金额、到期日、核销、作废等业务动作推导或流转。
- `contract_id`：修改合同归属会改变账务上下文，不应通过普通 update 完成。
- `park_tenant_id`：修改租户归属会影响核销、对账和权限语义，不应通过普通 update 完成。
- `source_type` / `source_id` / `generate_batch_no`：属于来源和批次追溯字段，不应由普通 update 改写。

## 5. 状态保护建议

代码中当前主要应收状态包括：

- `20`：generated / 未核销
- `40`：partial / 部分核销
- `50`：paid / 已核销
- `60`：overdue / 已逾期
- `70`：overdue_partial / 逾期且部分核销
- `80`：waived / 已减免
- `90`：void / 已作废

开票状态中 `10` 表示未开票；非 `10` 应视为已进入开票流程。

| 应收状态 | 是否允许普通 update | 原因 | 建议错误 |
|---|---|---|---|
| `20` 未核销 | 允许白名单字段；敏感字段需无财务活动 | 未核销对象仍可做有限修正 | `Receivable field is not allowed for ordinary update` |
| `40` 部分核销 | 仅建议允许 `remark` | 已有核销关系，金额 / 期间 / 租户变更会影响账务 | `Partially paid receivable cannot be financially updated` |
| `50` 已核销 | 仅建议允许 `remark` | 已完成资金闭环，不应再改账务字段 | `Paid receivable cannot be financially updated` |
| `60` 已逾期 | 若无核销、无减免、未开票，可允许 `due_date` / `remark`；其它字段受限 | 逾期本身可由到期日变化重新推导，但金额类仍高风险 | `Overdue receivable cannot be updated except allowed fields` |
| `70` 逾期且部分核销 | 仅建议允许 `remark` | 同时有逾期和核销关系 | `Partially paid overdue receivable cannot be financially updated` |
| `80` 已减免 | 仅建议允许 `remark` | 减免金额属于独立业务流程 | `Waived receivable cannot be financially updated` |
| `90` 已作废 | 禁止普通 update | 作废对象不应继续编辑 | `Void receivable cannot be updated` |
| 已开票 | 仅建议允许 `remark` | 开票后金额、期间、租户等变更会影响票据和账务一致性 | `Invoiced receivable cannot be financially updated` |
| 已删除 / archived | 禁止普通 update | 当前查询已排除 `isDeleted=true`，如后续暴露也应拒绝 | `Deleted receivable cannot be updated` |

## 6. Service 层保护建议

建议在 `LeasingReceivablesService.update` 中增加显式字段和状态保护，优先放在读取当前应收之后、执行业务校验和 `Object.assign` 之前。

建议判断：

- `hasPayment = amountPaid > 0`
- `hasWaiver = amountWaived > 0`
- `isInvoiced = invoiceStatus !== "10"`
- `isVoid = status === "90"`
- `hasFinancialActivity = hasPayment || hasWaiver || isInvoiced`

建议保护流程：

1. 读取当前应收，继续沿用现有租户、园区和数据权限校验。
2. 检查 DTO 中是否包含禁止字段。
3. 如果包含 `amount_paid`、`amount_waived`、`invoice_status`、`status`、`contract_id`、`park_tenant_id`、`source_type`、`source_id`、`generate_batch_no`，直接拒绝普通 update。
4. 如果当前应收为 `void` / 已删除，拒绝普通 update。
5. 如果当前应收已核销、部分核销、已减免或已开票，只允许 `remark` 这类非账务字段。
6. 对 `amount_due`、`late_fee`、`fee_type`、`period_start`、`period_end`、`ar_code` 这类受限字段，要求当前应收无核销、无减免、未开票、未作废。
7. 对 `due_date`，允许未核销 / 未减免 / 未开票对象修改；若导致逾期状态变化，由 service 统一推导并记录状态日志。
8. 保留现有金额不变量校验、字典校验、合同期间唯一性校验和状态日志逻辑。

错误消息建议保持稳定、可回归：

- `Receivable financial fields cannot be updated through ordinary update`
- `Receivable with financial activity cannot be updated`
- `Void receivable cannot be updated`
- `Invoiced receivable cannot be updated through ordinary update`

审计方面，controller 已有 `@AuditLog`，状态变化也已有状态日志。后续如果普通 update 禁止直接传入 `status`，状态日志应只记录 service 推导出的真实状态变化。

## 7. DTO 层收窄建议

当前 `UpdateLeasingReceivableDto` 允许传入过多账务敏感字段。建议分两步治理：

### 短期

- 保留 DTO 以降低兼容风险。
- 在 service 层做字段 denylist / allowlist 拦截。
- 对禁止字段返回明确业务错误，避免静默忽略造成调用方误判。

### 中期

- 将普通 update DTO 收窄到安全字段，例如 `remark`、受限 `due_date`、必要时的 `ar_code`。
- 将金额调整、减免、开票、状态流转拆到独立接口或独立 DTO。
- 对 `amount_due`、`late_fee` 等财务修正字段建立明确的调整 / 审批 / 审计口径。

本阶段只做设计，不修改 DTO。

## 8. 后续幂等接入设计

字段和状态保护完成后，`PUT /leasing/receivables/:id` 已接入 `IdempotencyInterceptor`。

建议接入方式：

- 在 controller method 上按既有模式增加 `@UseInterceptors(new IdempotencyInterceptor())`。
- 保持全局 `IdempotencyKeyGuard` 语义不变。
- 不改变 service 返回结构。

`scripts/e2e/first-release-leasing.mjs` 已覆盖：

- 使用独立创建的未核销、未减免、未开票手工应收作为测试对象。
- missing key：不带 `X-Idempotency-Key` 返回 `400`。
- first request：带 key 修改允许字段，例如 `remark` 或 `due_date`。
- replay same key same payload：返回成功，关键 id 与修改字段一致。
- conflict same key different payload：同 key 修改不同 `remark` / `due_date`，返回 `409`。
- duplicate side-effect check：replay 后通过详情确认字段没有额外漂移。
- failed retry：敏感字段请求同 key 重试仍返回 `400`，不会被 replay 成成功。

不建议在已核销、已开票或已作废应收上做幂等成功回归；这些场景应作为业务保护拒绝回归。

## 9. 实施拆分建议

### E2-5B-2B：应收修改字段 / 状态保护实施

- 目标：收紧 `PUT /leasing/receivables/:id` 的字段和状态边界。
- 建议文件：
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`
  - `apps/api/src/modules/leasing-receivables/dto/update-leasing-receivable.dto.ts`（如决定收窄 DTO）
  - 对应 service / controller 测试或 `first-release-leasing.mjs` 的保护场景验证
- 是否接 interceptor：未接入，按阶段边界留到 E2-5B-2C。
- 验收标准：
  - 已完成：禁止普通 update 修改 `amount_paid`、`amount_waived`、`invoice_status`、`status`、租户、合同和来源追溯字段。
  - 已完成：已核销、部分核销、已减免、已开票、已作废应收不能普通 update。
  - 已完成：未核销未开票应收可以修改 `remark` 和 `due_date`。
  - 已完成：`first-release-leasing.mjs` 已覆盖允许字段修改、敏感字段拒绝、状态保护。

### E2-5B-2C：应收修改幂等接入 + 回归

- 目标：在业务状态保护完成后，为 `PUT /leasing/receivables/:id` 接入真实幂等。
- 建议文件：
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts`
  - `scripts/e2e/first-release-leasing.mjs`
  - 幂等覆盖相关文档
- 验收标准：
  - 已完成：missing key 返回 `400`。
  - 已完成：same key + same payload replay 成功且结果一致。
  - 已完成：same key + different payload 返回 `409`。
  - 已完成：replay 不造成账务字段漂移，敏感字段失败请求不会被 replay 成成功。

## 10. Go / No-Go 判断

- 是否可以直接接 interceptor：已在 E2-5B-2C 接入。
- 是否必须先补业务保护：已完成 E2-5B-2B。
- 可以接受的短期风险：删除类接口和批量生成接口仍按专项设计暂缓。
- 上线前必须关闭的风险：该接口在幂等维度已完成；后续不得放宽字段 / 状态保护。

## 11. 结论

`PUT /leasing/receivables/:id` 的字段 / 状态保护和真实幂等接入均已完成。

下一步推荐：

1. 保持字段 / 状态保护不放宽。
2. 保持 `first-release-leasing.mjs` 中的 replay / conflict 和业务保护失败回归。
3. 继续将删除类接口和批量生成接口留在专项设计，不与本接口混在同一个 PR 中处理。
