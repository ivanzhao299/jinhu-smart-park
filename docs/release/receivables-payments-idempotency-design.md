# JinHu Smart Park 应收 / 收款 P0 接口幂等扩展设计

## 1. 目的

本文用于分析应收 / 收款编辑删除类 P0 接口是否适合接入当前幂等机制，并制定安全实施顺序。

本文最初用于 E2-5B 设计和风险分层。E2-5B-1 已按本设计完成 `POST /leasing/receivables` 与 `PUT /leasing/payments/:id` 的真实幂等接入和回归补齐；E2-5B-3A / E2-5B-3B 已补充应收 / 收款删除与作废语义保护和 DELETE 幂等接入，详见 [receivable-payment-delete-void-design.md](./receivable-payment-delete-void-design.md)。

## 2. 当前幂等机制边界

当前幂等机制仍是两层：

- `IdempotencyKeyGuard`：全局要求非公开写请求携带 `X-Idempotency-Key`，但不提供 replay / conflict。
- `IdempotencyInterceptor`：显式接入后才提供 replay / conflict / failed retry。

当前 fingerprint 基于 tenant / park / user / method / path / query / body 构建，适合稳定 JSON 请求。

当前机制不适合直接覆盖：

- multipart 文件内容请求
- 批量部分成功语义
- body 不稳定或依赖服务端实时计算的请求
- 需要先确认业务状态保护的财务删除 / 作废类请求

因此，“接口已要求带 key”不能等同于“接口已经真实幂等”。

## 3. 目标接口清单

| 接口 | 模块 | controller method | 当前状态 | 业务语义 | 是否资金相关 | 是否适合当前 interceptor | 风险等级 | 建议策略 |
|---|---|---|---|---|---|---|---|---|
| `POST /leasing/receivables/generate-batch` | `leasing-receivables` | `LeasingReceivablesController.generateBatch` | 仅 guard | 按合同批量生成应收 | 是 | 不建议直接第一批接入 | P0 | 批量生成专项设计 |
| `POST /leasing/receivables` | `leasing-receivables` | `LeasingReceivablesController.create` | 已接 interceptor | 手工创建应收 | 是 | 是 | 已完成 | E2-5B-1 已接入并回归 |
| `PUT /leasing/receivables/:id` | `leasing-receivables` | `LeasingReceivablesController.update` | 已接 interceptor | 修改应收备注 / 到期日 | 是 | 是，已完成字段 / 状态保护 | 已完成 | E2-5B-2C 已接入并回归 |
| `DELETE /leasing/receivables/:id` | `leasing-receivables` | `LeasingReceivablesController.remove` | 已接 interceptor | 软删除并置为 void | 是 | 是，DELETE path + query fingerprint 稳定 | P0 | E2-5B-3B 已完成 replay / query conflict / failed retry |
| `PUT /leasing/payments/:id` | `leasing-payments` | `LeasingPaymentsController.update` | 已接 interceptor | 修改收款金额 / 方式 / 凭证等 | 是 | 是，已优先覆盖未核销收款 | 已完成 | E2-5B-1 已接入并回归 |
| `DELETE /leasing/payments/:id` | `leasing-payments` | `LeasingPaymentsController.remove` | 已接 interceptor | 软删除并置为 void | 是 | 是，DELETE path + query fingerprint 稳定 | P0 | E2-5B-3B 已完成 replay / query conflict / failed retry；payment status log 仍待治理 |

## 4. 接口逐项分析

### 4.1 `POST /leasing/receivables/generate-batch`

- 当前业务行为：接收 `contract_ids` 与 `billing_month`，逐合同生成租金、押金、物业费等应收。
- 主要副作用：可能创建多条应收记录，并返回每个合同 / 费用项的生成结果。
- 幂等适配性：请求是 JSON body，fingerprint 技术上稳定，但接口存在批量部分成功语义。
- replay 语义：same key replay 应返回首次批量生成结果，不能二次生成账务。
- conflict 语义：same key + different contract list / billing month 应返回 `409`。
- 业务状态前置校验：需确认已生成、已核销、已作废、部分失败场景如何表达。
- 推荐处理方式：不放入第一批直接接入，先做批量生成专项设计，明确 partial success / retry / skip 的状态语义。
- 回归测试建议：后续使用独立批量场景，断言 replay 不增加应收数量，并记录每个合同的生成行状态。

### 4.2 `POST /leasing/receivables`

- 当前业务行为：手工创建一条应收，校验租户、合同、费用类型、期间、编码唯一性，并写入状态日志。
- 主要副作用：直接形成应收账务对象。
- 幂等适配性：JSON body 稳定，资源创建语义清晰，适合当前 `IdempotencyInterceptor`。
- replay 语义：same key + same payload 返回第一次创建的应收，不能创建第二条应收。
- conflict 语义：same key + different amount / period / fee type / remark 返回 `409`。
- 业务状态前置校验：创建本身已有编码与合同期间唯一性校验，但幂等仍可避免重试时触发重复业务异常。
- 推荐处理方式：E2-5B-1 已完成真实幂等接入。
- 回归测试建议：`first-release-leasing.mjs` 已使用现有测试合同 / 租户创建独立手工应收，覆盖 missing key、first、replay、conflict，并通过列表确认 replay 不重复创建。

### 4.3 `PUT /leasing/receivables/:id`

- 当前业务行为：普通 update 已收窄为修改 `remark` 与 `due_date`，禁止直接修改金额、已收、减免、开票状态、状态、合同、租户和来源追溯字段。
- 主要副作用：可能改变到期日、逾期天数和派生状态，并在状态变化时写状态日志。
- 幂等适配性：JSON body 稳定，已接入当前 interceptor。
- replay 语义：same key + same payload 返回第一次修改结果，不能造成字段漂移。
- conflict 语义：same key + different `remark` / `due_date` 返回 `409`。
- 业务状态前置校验：已收金额 > 0、已减免金额 > 0、已开票、已作废、部分核销 / 已核销 / 逾期部分核销 / 已减免状态均拒绝普通 update。
- 推荐处理方式：E2-5B-2B / E2-5B-2C 已完成。
- 回归测试建议：`first-release-leasing.mjs` 已覆盖 missing key、first、replay、conflict、敏感字段拒绝、失败请求不 replay 成成功、核销后状态保护。

### 4.4 `DELETE /leasing/receivables/:id`

- 当前业务行为：不是硬删除；当 `amountPaid > 0`、`amountWaived > 0` 或 `invoiceStatus != none` 时拒绝删除，否则软删除并置为 `void`。
- 主要副作用：应收从可用账务对象变为作废 / 不可见对象，并写状态日志。
- 幂等适配性：请求 body 通常为空，path + query fingerprint 稳定；E2-5B-3B 已接入当前 interceptor。
- replay 语义：same key replay 应返回第一次 `{ id }` 响应，不能第二次真实执行删除逻辑。
- conflict 语义：使用 same key + different query 构造 `409 conflict`；query 仅用于 fingerprint 回归，不改变业务语义。
- 业务状态前置校验：已有部分保护，但删除 / 作废是否允许作为首发财务动作仍需产品 / 财务确认。
- 推荐处理方式：E2-5B-3A 已明确普通 DELETE 仅用于未发生财务活动记录；E2-5B-3B 已接入真实幂等。已发生财务活动记录仍需后续作废 / 冲销专项设计。
- 回归测试建议：`first-release-leasing.mjs` 已使用独立未核销应收验证 missing key / first / replay / query conflict，并用已核销应收验证 failed retry 不 replay 成成功。

### 4.5 `PUT /leasing/payments/:id`

- 当前业务行为：修改收款编码、租户、时间、方式、金额、付款人、流水号、附件、备注等，并根据已核销金额重新计算未核销金额和状态。
- 主要副作用：改变资金记录金额、未核销金额、收款状态、凭证信息。
- 幂等适配性：JSON body 稳定，适合当前 interceptor。
- replay 语义：same key + same payload 返回第一次修改结果，不能重复造成资金状态漂移。
- conflict 语义：same key + different amount / method / remark 返回 `409`。
- 业务状态前置校验：当前已禁止收款金额低于已核销金额，也禁止已核销收款更换租户；但是否允许已核销收款修改非金额字段仍需业务口径确认。
- 推荐处理方式：E2-5B-1 已完成真实幂等接入，第一版回归只覆盖未核销收款；已核销收款编辑边界作为业务状态保护专项补充。
- 回归测试建议：`first-release-leasing.mjs` 已创建一笔未核销测试收款后执行 update replay / conflict，避免复用已经 apply 的收款。

### 4.6 `DELETE /leasing/payments/:id`

- 当前业务行为：不是硬删除；若已存在核销金额则拒绝删除，否则软删除并置为 `void`。
- 主要副作用：收款记录从可用资金对象变为作废 / 不可见对象。
- 幂等适配性：请求 body 通常为空，path + query fingerprint 稳定；E2-5B-3B 已接入当前 interceptor。
- replay 语义：same key replay 应返回第一次 `{ id }` 响应，不能第二次真实执行删除逻辑。
- conflict 语义：使用 same key + different query 构造 `409 conflict`；query 仅用于 fingerprint 回归，不改变业务语义。
- 业务状态前置校验：已有“已核销收款不可删除”的保护，但删除是否应改名为作废 / 冲销需产品 / 财务确认。
- 推荐处理方式：E2-5B-3A 已明确普通 DELETE 仅用于未发生核销活动记录；E2-5B-3B 已接入真实幂等。已发生核销活动记录仍需后续反核销 / 冲销专项设计。
- 回归测试建议：`first-release-leasing.mjs` 已使用独立未核销收款验证 missing key / first / replay / query conflict，并用已 apply 收款验证 failed retry 不 replay 成成功。

## 5. 第一批实施建议

建议第一批只做 2～3 个接口，避免一次把财务状态模型和幂等接入混在一起。

| 优先级 | 接口 | 推荐动作 | 原因 | 前置条件 |
|---|---|---|---|---|
| 1 | `POST /leasing/receivables` | 已接入 interceptor | JSON body 稳定，创建副作用明确，数据可由现有 leasing 回归构造 | `first-release-leasing.mjs` 已覆盖 |
| 2 | `PUT /leasing/payments/:id` | 已接入 interceptor，第一版只回归未核销收款 | JSON body 稳定，资金记录修改风险高，现有 service 已有部分已核销保护 | 已核销收款可编辑字段边界仍需后续确认 |
| 3 | `PUT /leasing/receivables/:id` | 已完成状态保护和 interceptor 接入 | 修改金额 / 状态风险高，已收窄到 `remark` / `due_date` | `first-release-leasing.mjs` 已覆盖 replay / conflict |

E2-5B-1 已完成最小 PR 范围：

1. `POST /leasing/receivables`
2. `PUT /leasing/payments/:id`

`PUT /leasing/receivables/:id` 已完成字段 / 状态保护，并已在 E2-5B-2C 接入 `IdempotencyInterceptor` 与 replay / conflict 回归，详见 [receivable-update-state-protection-design.md](./receivable-update-state-protection-design.md)。

## 6. 暂缓接口

| 接口 | 暂缓原因 | 后续方向 |
|---|---|---|
| `DELETE /leasing/receivables/:id` | 当前是软删除 + void，属于财务作废语义；E2-5B-3A 已补强已核销 / 已减免 / 已开票 / application 保护 | E2-5B-3B 再决定幂等接入 |
| `DELETE /leasing/payments/:id` | 当前是软删除 + void，已核销 / 有 application 收款不可删；payment softDelete 仍缺少独立状态日志 | E2-5B-3B 再决定幂等接入，payment status log 另列治理项 |
| `POST /leasing/receivables/generate-batch` | 批量部分成功、跳过、失败行语义复杂；直接套 interceptor 容易掩盖 per-contract 状态 | 批量生成专项设计 |

这些接口不是不重要，而是“不应该急着用通用锤子敲”。它们需要先把账务语义说清楚，再做幂等接入和回归。

## 7. 回归测试设计

后续实施优先扩展 `scripts/e2e/first-release-leasing.mjs`，不新增统一 runner。

每个接入接口都应覆盖：

- missing key：不带 `X-Idempotency-Key` 返回 `400`
- first request：带 key 第一次成功
- replay same key same payload：返回成功且关键 id / 金额 / 状态与第一次一致
- conflict same key different payload：返回 `409`
- duplicate side-effect check：通过列表 / 详情确认未重复创建、未重复核销、未重复作废

针对账务状态还需要补：

- 未核销 / 未开票 / 未作废对象允许测试修改
- 已核销应收不允许随意修改金额或删除
- 已核销收款不允许删除
- 删除类接口如果后续接入，必须明确验证“作废后 replay 不二次执行”

## 8. 实施分批建议

### E2-5B-1：应收创建 / 修改幂等

- 目标接口：`POST /leasing/receivables` 已完成；`PUT /leasing/receivables/:id` 已完成 E2-5B-2B 字段 / 状态保护和 E2-5B-2C 幂等接入
- 风险：应收金额、状态、期间、租户、合同变更会直接影响账务闭环
- 是否改业务逻辑：`POST` 不需要；`PUT` 建议先补业务状态保护
- 是否接入 interceptor：`POST /leasing/receivables` 与 `PUT /leasing/receivables/:id` 均已接入
- 回归验收标准：手工新增应收已满足 same key replay 不重复创建，different payload 返回 `409`

### E2-5B-2：收款修改幂等

- 目标接口：`PUT /leasing/payments/:id` 已完成
- 风险：收款金额和未核销金额直接影响资金记录
- 是否改业务逻辑：可先不改，但需记录已核销收款可编辑字段的残余风险
- 是否接入 interceptor：已接入
- 回归验收标准：未核销收款 update replay 返回同一结果，different payload 返回 `409`

### E2-5B-3：删除 / 作废语义专项设计

- 目标接口：`DELETE /leasing/receivables/:id`、`DELETE /leasing/payments/:id`
- 风险：财务记录删除不应被误解为物理删除，且可能需要冲销 / 作废审计
- 当前状态：E2-5B-3A 已完成删除 / 作废语义保护，E2-5B-3B 已完成 DELETE 幂等接入，详见 [receivable-payment-delete-void-design.md](./receivable-payment-delete-void-design.md)
- 是否改业务逻辑：已补强状态和 application 保护，未改 softDelete 语义
- 是否接入 interceptor：已接入
- 回归验收标准：未核销对象可删除 / 作废；已核销 / 已开票 / 有 application 对象明确拒绝；same key replay 不二次执行，same key + different query 返回 `409`，failed retry 仍失败

### E2-5B-4：批量生成专项设计

- 目标接口：`POST /leasing/receivables/generate-batch`
- 风险：批量部分成功可能导致 replay / retry 语义不一致
- 是否改业务逻辑：可能需要补 batch id 或生成记录
- 是否接入 interceptor：专项设计后决定
- 回归验收标准：same key replay 不新增应收；partial failed retry 语义清晰；different payload 返回 `409`

## 9. Go / No-Go 判断

- 上线前建议必须补：`POST /leasing/receivables`、`PUT /leasing/payments/:id` 已完成。
- 上线前建议在业务状态保护后补：`PUT /leasing/receivables/:id` 已完成。
- 可以风险接受但需明确口径：`DELETE /leasing/receivables/:id`、`DELETE /leasing/payments/:id` 已完成普通 softDelete 幂等，但首发仍不鼓励通过删除修正已发生财务活动的账务，异常账务走人工复核或后续冲销 / 反核销流程。
- 必须明确不对首发开放或需强管控：批量生成应收的重复执行场景、已核销 / 已开票账务对象的删除或大幅修改。
- 需要产品 / 财务业务口径确认：删除是否等价于作废、已核销收款是否允许修改非金额字段、已核销应收是否允许调整备注以外字段。

## 10. 结论

E2-5B-1 的最小安全子集已完成：

1. `POST /leasing/receivables`
2. `PUT /leasing/payments/:id`

`PUT /leasing/receivables/:id` 已完成 E2-5B-2C 真实幂等接入和 replay / conflict 回归。删除类接口已完成 E2-5B-3A 语义保护和 E2-5B-3B 真实幂等接入；批量生成接口继续暂缓专项设计，不把它误标为已完成。

本阶段不需要调整 `first-release-regression runner`。后续实施时扩展现有 `first-release-leasing.mjs` 即可，因为该脚本已经能构造合同、应收、收款和核销链路。
