# JinHu Smart Park 应收 / 收款删除与作废语义设计

## 1. 目的

本文用于确认应收 / 收款删除接口的当前语义、财务安全风险和后续幂等接入前置条件。

本文最初用于 E2-5B-3 设计确认。E2-5B-3A 已按本文完成删除 / 作废语义保护实施与回归补充，但仍未接入新的 `IdempotencyInterceptor`。

## 2. 当前接口现状

| 接口 | controller method | 当前是否 guard | 当前是否 interceptor | 当前 service 行为 | 当前状态保护 | 当前审计留痕 | 当前风险 |
|---|---|---|---|---|---|---|---|
| `DELETE /leasing/receivables/:id` | `LeasingReceivablesController.remove` -> `LeasingReceivablesService.softDelete` | 是，全局 `IdempotencyKeyGuard` 要求非公开写请求带 key | 否 | 读取 scoped 应收后设置 `isDeleted=true`、`status=void`，并返回 `{ id }` | 阻止 `amountPaid > 0`、`amountWaived > 0`、`invoiceStatus != none`、paid / partial / waived / void 等状态以及 payment application 的应收删除 | controller 有 `AuditLog`；service 写应收状态日志，action 为 `delete` | `DELETE` 名称容易被误解为物理删除；首次成功后再次请求会因 `isDeleted=false` 过滤而变成 NotFound；没有真实 replay |
| `DELETE /leasing/payments/:id` | `LeasingPaymentsController.remove` -> `LeasingPaymentsService.softDelete` | 是，全局 `IdempotencyKeyGuard` 要求非公开写请求带 key | 否 | 读取 scoped 收款后设置 `isDeleted=true`、`status=void`，并返回 `{ id }` | 阻止 void、partial、applied、`sumAppliedAmount > 0` 或存在 application 的收款删除 | controller 有 `AuditLog`；service 未见独立 payment status log | `DELETE` 名称容易被误解为物理删除；首次成功后再次请求会因 `isDeleted=false` 过滤而变成 NotFound；没有真实 replay |

当前两个接口都不是物理删除，而是“软删除 + 置为 void”。但它们仍通过 HTTP `DELETE` 暴露，且未接入真实幂等 interceptor。

## 3. `DELETE /leasing/receivables/:id` 分析

### 当前行为

`LeasingReceivablesService.softDelete` 会先通过 `findOne(scope, id, actor)` 读取当前应收。该查询包含租户、园区、数据权限和 `is_deleted = false` 约束。

删除前当前已有以下保护，E2-5B-3A 已补强状态和 application 校验：

- `amountPaid > 0` 时拒绝，错误为 `Receivable with payments cannot be deleted directly`
- `amountWaived > 0` 时拒绝，错误为 `Receivable with waived amount cannot be deleted directly`
- `invoiceStatus != none` 时拒绝，错误为 `Invoiced receivable cannot be deleted directly`
- `status = void` 时拒绝
- `status = partial / paid / overdue_partial / waived` 时拒绝
- 存在未删除 payment application 时拒绝

通过校验后，service 在事务中执行：

- 设置 `isDeleted = true`
- 设置 `status = RECEIVABLE_STATUS_VOID`
- 设置 `updateBy = actor.sub`
- 保存应收
- 写入应收状态日志，action 为 `delete`，说明为 `删除应收账单`

### 当前语义

当前实现属于软删除 + void，不是物理删除，也不是冲销或反向账务分录。

由于 `findOne` 和列表查询均过滤 `is_deleted = false`，该接口成功后记录会从常规读路径消失。对使用方而言，它更像“删除”；对数据库而言，它保留记录并进入 `void` 状态。

### 财务安全风险

- 已核销或部分核销应收不应删除，否则会破坏收款核销追溯。
- 已开票应收不应删除，否则会破坏发票和账务口径。
- 已减免应收不应删除，否则会丢失减免审批 / 财务活动追溯。
- 当前通过 `amountPaid`、`amountWaived`、`invoiceStatus`、状态枚举和 payment application 查询覆盖主要财务活动保护。
- 当前没有显式 `deleted_at` / `voided_at` 字段，主要依赖审计字段、`isDeleted`、`status` 和状态日志追溯。
- 当前再次执行相同 DELETE 时会因为 `is_deleted = false` 过滤而返回不存在，不能自然形成 replay。

### 推荐语义

建议将该接口业务口径限定为：仅允许删除 / 作废未发生财务活动的草稿或未核销应收。

对于已核销、部分核销、已开票、已减免、已作废的应收，不建议通过 DELETE 处理。后续如果需要处理财务更正，应设计独立作废、冲销或撤销流程。

## 4. `DELETE /leasing/payments/:id` 分析

### 当前行为

`LeasingPaymentsService.softDelete` 会先通过 `findOne(scope, id, actor)` 读取当前收款。该查询包含租户、园区、数据权限和 `is_deleted = false` 约束。

删除前当前已有以下保护，E2-5B-3A 已补强状态和 application 行校验：

- 通过 `sumAppliedAmount(scope, paymentId)` 统计未删除 application 的核销金额
- `appliedAmount > 0` 时拒绝，错误为 `Applied payment cannot be deleted directly`
- `status = void` 时拒绝
- `status = partial / applied` 时拒绝
- 存在未删除 application 行时拒绝，即使 applied amount 异常为 0 也不允许普通 softDelete

通过校验后，service 执行：

- 设置 `isDeleted = true`
- 设置 `status = PAYMENT_STATUS_VOID`
- 设置 `updateBy = actor.sub`
- 保存收款
- 返回 `{ id }`

### 当前语义

当前实现属于软删除 + void，不是物理删除，不是反核销，也不会删除 payment application。

由于已核销收款会被 `appliedAmount > 0` 阻断，正常情况下该接口不会破坏已存在的核销关系。但对于未核销收款，成功后该收款会从常规读路径消失。

### 财务安全风险

- 已核销或部分核销收款不应删除，否则会破坏应收余额、收款余额和核销追溯。
- 有 application / allocation 记录的收款不应通过 DELETE 处理。
- 当前通过 `status`、`sumAppliedAmount > 0` 和 application 行存在性阻断主要核销风险，但未见独立 payment status log。
- 当前没有显式 `deleted_at` / `voided_at` 字段，主要依赖审计字段、`isDeleted` 和 `status`。
- 当前再次执行相同 DELETE 时会因为 `is_deleted = false` 过滤而返回不存在，不能自然形成 replay。

### 推荐语义

建议将该接口业务口径限定为：仅允许删除 / 作废未发生核销活动的未核销收款。

对于已核销、部分核销或已有 application 的收款，不建议通过 DELETE 处理。后续如果需要处理资金更正，应设计反核销、冲销或作废流程。

## 5. 推荐业务口径

### 建议一：禁止删除有财务活动记录

以下对象不应允许普通 DELETE：

- 已核销应收
- 部分核销应收
- 已开票应收
- 已减免应收
- 已作废应收
- 已核销收款
- 部分核销收款
- 有 application / allocation 记录的收款
- 已作废收款

### 建议二：普通 DELETE 仅允许未发生财务活动的记录

普通 DELETE 可以保留为低风险清理能力，但应明确只用于：

- 未核销应收
- 未开票应收
- 未减免应收
- 未发生核销关系的收款
- 首发回归或人工录入错误产生的未发生财务活动记录

此时 DELETE 的真实语义仍应表述为“软删除 / 作废未发生财务活动记录”，而不是物理删除。

### 建议三：有财务活动记录应走作废 / 冲销 / 撤销流程

如果记录已经参与账务闭环，应优先设计独立流程：

- `void`：明确作废原因、作废人、作废时间和状态日志。
- `reverse`：针对已核销 / 已入账记录生成反向处理。
- `cancel` / `unapply`：针对核销关系先撤销 application，再处理资金或应收记录。

这些流程比直接 DELETE 更适合审计、报表和财务追溯。

## 6. 后续实施建议

### E2-5B-3A：删除 / 作废语义保护实施

目标：

- 已完成。保留当前“未发生财务活动才允许删除”的保护。
- 已完成。明确已作废对象、已核销对象、有 application 对象的错误口径。
- 视业务需要补充 payment status log 或更明确的作废审计字段。
- 暂不接入 `IdempotencyInterceptor`。

建议文件：

- `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `scripts/e2e/first-release-leasing.mjs`

验收标准：

- 未核销 / 未开票 / 未减免应收可按当前口径软删除。
- 已核销 / 已减免 / 已开票应收删除被拒绝。
- 未核销收款可按当前口径软删除。
- 已核销或有 application 的收款删除被拒绝。

E2-5B-3A 回归已扩展 `first-release-leasing.mjs`，覆盖未发生财务活动对象可 softDelete、已核销 / 有 application 对象删除被拒绝。payment softDelete 仍缺少独立状态日志，后续如需补齐应单独设计表结构或复用统一状态日志机制。

### E2-5B-3B：删除 / 作废幂等接入

目标：

- 在语义保护完成后决定是否在 DELETE 上接入 `IdempotencyInterceptor`。
- 如果保留 DELETE，same key replay 应返回第一次 `{ id }`，不能因第二次查不到 `isDeleted=false` 记录而变成失败。
- 如果改为 POST action，例如 `POST /leasing/receivables/:id/void`，则以 action body 的 reason / remark 构造稳定 fingerprint。

风险：

- DELETE 通常没有 body，conflict case 缺少有意义的不同 payload。
- 如果未来增加 query/body 表达作废原因，需要明确是否纳入 fingerprint。

验收标准：

- missing key 返回 `400`。
- first request 成功软删除 / 作废。
- replay same key same payload 返回第一次结果。
- 不同 key 对已作废对象的行为有明确业务错误。
- 如存在合法 body 差异，same key different payload 返回 `409`。

### E2-5B-3C：作废 / 冲销专项设计

目标：

- 设计有财务活动记录的作废、冲销、反核销或撤销流程。
- 明确是否新增独立 action 接口。
- 明确账务余额、核销关系、审计日志和报表口径。

适用范围：

- 已核销应收
- 已开票应收
- 已减免应收
- 已核销收款
- 有 application / allocation 的收款

## 7. 回归测试设计

后续实施优先扩展 `scripts/e2e/first-release-leasing.mjs`，不新增 runner。

建议覆盖：

- 未核销应收可删除 / 作废。
- 已核销应收删除被拒绝。
- 已开票或已减免应收删除被拒绝。
- 未核销收款可删除 / 作废。
- 有 application 的收款删除被拒绝。
- 已作废对象重复请求行为明确。
- 如果接入幂等，则补 missing key / first / replay / conflict。

当前 `first-release-leasing.mjs` 已能构造合同、应收、收款和核销链路，后续可复用：

- 独立手工应收作为未核销删除候选。
- 已 apply 的应收作为删除拒绝候选。
- 未核销测试收款作为删除候选。
- 已 apply 的收款作为删除拒绝候选。

## 8. Go / No-Go 判断

- 是否可以直接接入幂等：不建议。当前虽然已有部分状态保护，但 DELETE 的业务语义、审计口径和重复请求行为需要先确认。
- 是否必须先补业务语义保护：建议先做 E2-5B-3A，明确删除 / 作废边界和错误口径。
- 哪些接口可以上线前暂缓：如果首发不提供账务删除操作入口，且 release 文档明确异常账务走人工复核，可以暂缓幂等接入。
- 哪些接口必须明确不对首发开放：已核销、已开票、已减免或已有 application 的账务记录不应允许普通 DELETE。
- 是否需要产品 / 财务确认：需要。尤其是“删除是否等价于作废”“作废记录是否应在列表 / 报表可追溯”“收款是否需要独立状态日志”。

## 9. 结论

当前两个 DELETE 接口实际都是软删除 + void，E2-5B-3A 已完成语义保护补强：

- `DELETE /leasing/receivables/:id` 已阻断已收款、已减免、已开票、已作废、财务活动状态和有 application 的应收，并写应收状态日志。
- `DELETE /leasing/payments/:id` 已阻断已作废、部分核销、已核销、有核销金额或有 application 的收款，但未见独立 payment status log。

下一步不建议直接接入 `IdempotencyInterceptor`。推荐顺序是：

1. E2-5B-3B：再决定 DELETE 或 POST void action 的幂等接入方式。
2. E2-5B-3C：对已发生财务活动记录设计作废 / 冲销 / 反核销专项流程。
3. 单独确认 payment softDelete 是否需要独立状态日志。

在完成这些前，不应把应收 / 收款 DELETE 视为“真实幂等已覆盖”。
