# JinHu Smart Park 幂等覆盖状态收口与风险复核

## 1. 复核目的

本文用于在 E2-1 / E2-2 完成后，对首发范围真实幂等覆盖状态做一次快照复核，区分“仅要求带 `X-Idempotency-Key`”与“已具备真实 replay / conflict / failed retry 语义”的接口。

## 2. 当前机制边界

当前仍然是两层机制：

- `IdempotencyKeyGuard`：要求非公开写请求携带 `X-Idempotency-Key`
- `IdempotencyInterceptor`：显式接入后才具备 replay / conflict / failed retry

因此，“带 key”不等于“真实幂等”。

## 3. 当前真实幂等覆盖接口

| 接口 | 模块 | 接入批次 | 是否 replay 验证 | 是否 conflict 验证 | 回归脚本 | 备注 |
|---|---|---|---|---|---|---|
| `POST /users` | users | 首批 | 是 | 是 | `first-release-idempotency.mjs` | 已完成 |
| `POST /work-orders` | work-orders | 首批 | 是 | 是 | `first-release-idempotency.mjs` | 已完成 |
| `POST /leasing/contracts` | leasing-contracts | 首批 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /leasing/contracts/:contractId/generate-receivables` | leasing-receivables | 首批 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /leasing/payments` | leasing-payments | 首批 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /leasing/contracts/:contractId/units` | leasing-contracts | E2-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /leasing/contracts/:id/effective` | leasing-contracts | E2-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /work-orders/:id/assign` | work-orders | E2-2 | 是 | 是 | `first-release-workorders.mjs` | 已完成 |
| `POST /leasing/payments/:id/apply` | leasing-payments | E2-2 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /users/:id/reset-password` | users | E2-5A | 是 | 是 | `first-release-users-assets.mjs` | 已完成 |
| `POST /users/:id/roles` | users | E2-5A | 是 | 是 | `first-release-users-assets.mjs` | 已完成 |
| `POST /leasing/receivables` | leasing-receivables | E2-5B-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `PUT /leasing/receivables/:id` | leasing-receivables | E2-5B-2C | 是 | 是 | `first-release-leasing.mjs` | 已完成，字段 / 状态保护仍生效 |
| `PUT /leasing/payments/:id` | leasing-payments | E2-5B-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `DELETE /leasing/receivables/:id` | leasing-receivables | E2-5B-3B | 是 | 是 | `first-release-leasing.mjs` | 已完成，softDelete 语义保护仍生效 |
| `DELETE /leasing/payments/:id` | leasing-payments | E2-5B-3B | 是 | 是 | `first-release-leasing.mjs` | 已完成，softDelete 语义保护仍生效；payment status log 仍待治理 |
| `POST /leasing/receivables/generate-batch` | leasing-receivables | E2-5B-4B | 是 | 是 | `first-release-leasing.mjs` | 已完成，业务级去重仍生效；batch history / result 表仍待治理 |

## 4. 回归覆盖状态

| 脚本 | 已覆盖的 replay / conflict |
|---|---|
| `first-release-idempotency.mjs` | `POST /users`、`POST /work-orders` 的 missing key / first request / replay / conflict |
| `first-release-workorders.mjs` | `POST /work-orders/:id/assign` 的 missing key / first request / replay / conflict |
| `first-release-users-assets.mjs` | `POST /users` 创建、`POST /users/:id/reset-password`、`POST /users/:id/roles` 的 missing key / first request / replay / conflict，同时保留 users list / assets read 回归 |
| `first-release-leasing.mjs` | `POST /leasing/contracts`、`POST /leasing/contracts/:contractId/generate-receivables`、`POST /leasing/payments`、`POST /leasing/contracts/:contractId/units`、`POST /leasing/contracts/:id/effective`、`POST /leasing/payments/:id/apply`、`POST /leasing/receivables`、`PUT /leasing/receivables/:id`、`PUT /leasing/payments/:id`、`DELETE /leasing/receivables/:id`、`DELETE /leasing/payments/:id`、`POST /leasing/receivables/generate-batch` 的 missing key / first request / replay / conflict；DELETE 和 generate-batch 额外覆盖 failed request retry |
| `first-release-regression.mjs` | 串行覆盖上述所有子脚本 |

## 5. 已接入但 replay / conflict 不完整的接口

当前无“已接入但 replay / conflict 不完整”的首发接口。`first-release-leasing.mjs` 已把上述 3 个接口的 replay / conflict 补齐。

## 6. 剩余 P0 缺口

### Users

用户权限 P0 缺口已在 E2-5A 完成：

- `POST /users/:id/reset-password`
- `POST /users/:id/roles`

### Leasing / Finance

应收 / 收款编辑删除类 P0 缺口已进入专项设计，详见 [receivables-payments-idempotency-design.md](./receivables-payments-idempotency-design.md)。其中 `PUT /leasing/receivables/:id` 已完成业务状态保护和真实幂等接入，详见 [receivable-update-state-protection-design.md](./receivable-update-state-protection-design.md)。删除类接口已完成 E2-5B-3A 语义保护和 E2-5B-3B 真实幂等接入，详见 [receivable-payment-delete-void-design.md](./receivable-payment-delete-void-design.md)。`POST /leasing/receivables/generate-batch` 已完成 E2-5B-4A 业务去重 / 事务语义保护和 E2-5B-4B 真实幂等接入，详见 [receivable-batch-generation-idempotency-design.md](./receivable-batch-generation-idempotency-design.md)。

| 接口 | 风险 | 是否建议上线前补齐 | 是否适合当前 JSON fingerprint | 数据依赖 | 建议批次 |
|---|---|---|---|---|---|
| `POST /leasing/receivables/generate-batch` | 批量生成可能造成重复账务 | 已完成 | E2-5B-4A 已完成业务去重 / 事务语义保护；E2-5B-4B 已完成 interceptor 接入和 replay / conflict 回归 | 中 | E2-5B-4B |
| `POST /leasing/receivables` | 手工新增应收会直接形成账务对象 | 已完成 | 是 | 低 | E2-5B-1 |
| `PUT /leasing/receivables/:id` | 修改应收会直接改变账务金额/状态 | 已完成 | 是 | 低 | E2-5B-2C |
| `DELETE /leasing/receivables/:id` | 删除应收会直接影响账务闭环 | 已完成，E2-5B-3A 语义保护 + E2-5B-3B 真实幂等 | 是 | 低 | E2-5B-3B |
| `PUT /leasing/payments/:id` | 修改收款会直接影响资金记录 | 已完成 | 是 | 低 | E2-5B-1 |
| `DELETE /leasing/payments/:id` | 删除收款会直接影响资金记录 | 已完成，E2-5B-3A 语义保护 + E2-5B-3B 真实幂等 | 是，payment status log 仍是缺口 | 低 | E2-5B-3B |

## 7. 剩余 P1 缺口

### Work Orders

| 接口 | 风险 | 是否建议继续小批量补齐 | 暂缓原因或建议批次 |
|---|---|---|---|
| `POST /work-orders/:id/reassign` | 重复改派会造成处理人抖动 | 是 | 下一批 |
| `POST /work-orders/:id/accept` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/start` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/wait-material` | 状态流转且带原因 | 是 | 下一批 |
| `POST /work-orders/:id/finish` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/confirm` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/close` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/cancel` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/return` | 状态流转 | 是 | 下一批 |
| `POST /work-orders/:id/reject` | 状态流转 | 是 | 下一批 |

### Leasing Contracts / Assets / Files

| 接口 | 风险 | 是否建议继续小批量补齐 | 暂缓原因或建议批次 |
|---|---|---|---|
| `POST /leasing/contracts/:id/submit` | 合同状态推进 | 是 | 下一批 |
| `POST /leasing/contracts/:id/approve` | 合同状态推进 | 是 | 下一批 |
| `POST /leasing/contracts/:id/reject` | 合同状态推进 | 是 | 下一批 |
| `POST /leasing/contracts/:id/void` | 合同状态推进且影响后续账务 | 是 | 下一批 |
| `POST /leasing/contracts/:id/archive` | 文件绑定 + 状态推进 | 是 | 下一批 |
| `POST /leasing/contracts/:contractId/recalculate` | 可能触发重复账务计算 | 是 | 下一批 |
| `POST /park-units/:id/change-status` | 资源状态推进 | 是 | 下一批 |
| `DELETE /files/:id` | 文件可见性变化 | 是 | 下一批 |

## 8. 不建议直接接入的范围

- multipart 文件上传
- 批量导入
- 部分成功语义接口
- 非首发模块
- 复杂退款 / 发票 / 豁免链路

这些范围更适合单独设计 fingerprint 和状态语义，不建议直接套用当前 JSON 请求幂等机制。

## 9. 下一步建议

推荐顺序如下：

1. 继续按 `idempotency-coverage-expansion-plan.md` 的后续批次处理剩余 P0 写接口；应收 / 收款创建、修改、普通 softDelete 已完成真实幂等接入。
2. 再补 P1 状态流转和文件删除等接口。
3. multipart 文件和批量接口保持单独设计。

如果当前只看“幂等覆盖是否可交付首发”，普通高风险写接口和批量生成请求级 replay 已基本收口。剩余风险主要集中在 batch history / result 表、partial failed 行级追踪以及更复杂账务专项流程。

## 10. Go / No-Go 判断

- 是否阻塞首发上线：从普通单条高风险写接口和批量生成请求级幂等角度看，主要 P0 已基本收口；batch history / result 表仍可作为后续治理。
- 必须在上线前修的风险：删除类接口已按 [receivable-payment-delete-void-design.md](./receivable-payment-delete-void-design.md) 完成语义保护和真实幂等接入；批量生成接口已按 [receivable-batch-generation-idempotency-design.md](./receivable-batch-generation-idempotency-design.md) 完成 E2-5B-4A 业务去重 / 事务语义保护和 E2-5B-4B 统一幂等接入。用户权限变更、应收创建、应收修改、收款修改已完成。
- 可作为上线后治理的风险：P1 状态流转、文件删除、低频配置类接口。
- 风险接受口径：已完成的 9 个真实幂等接口可以视为首发基础面，但不能把“已有 guard”误判成“全链路已幂等”。
