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
| `POST /leasing/contracts` | leasing-contracts | 首批 | 否 | 否 | `first-release-leasing.mjs` | 仅成功链路 |
| `POST /leasing/contracts/:contractId/generate-receivables` | leasing-receivables | 首批 | 否 | 否 | `first-release-leasing.mjs` | 仅成功链路 |
| `POST /leasing/payments` | leasing-payments | 首批 | 否 | 否 | `first-release-leasing.mjs` | 仅成功链路 |
| `POST /leasing/contracts/:contractId/units` | leasing-contracts | E2-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /leasing/contracts/:id/effective` | leasing-contracts | E2-1 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |
| `POST /work-orders/:id/assign` | work-orders | E2-2 | 是 | 是 | `first-release-workorders.mjs` | 已完成 |
| `POST /leasing/payments/:id/apply` | leasing-payments | E2-2 | 是 | 是 | `first-release-leasing.mjs` | 已完成 |

## 4. 回归覆盖状态

| 脚本 | 已覆盖的 replay / conflict |
|---|---|
| `first-release-idempotency.mjs` | `POST /users`、`POST /work-orders` 的 missing key / first request / replay / conflict |
| `first-release-workorders.mjs` | `POST /work-orders/:id/assign` 的 missing key / first request / replay / conflict |
| `first-release-leasing.mjs` | `POST /leasing/contracts/:contractId/units`、`POST /leasing/contracts/:id/effective`、`POST /leasing/payments/:id/apply` 的 missing key / first request / replay / conflict；其余写接口仍仅做成功链路 |
| `first-release-regression.mjs` | 串行覆盖上述所有子脚本 |

## 5. 已接入但 replay / conflict 不完整的接口

以下接口已经挂了 `IdempotencyInterceptor`，但现有回归脚本仍只验证成功链路：

- `POST /leasing/contracts`
- `POST /leasing/contracts/:contractId/generate-receivables`
- `POST /leasing/payments`

这三类接口属于“已接入，但回归未补齐 replay / conflict”。

## 6. 剩余 P0 缺口

### Users

| 接口 | 风险 | 是否建议上线前补齐 | 是否适合当前 JSON fingerprint | 数据依赖 | 建议批次 |
|---|---|---|---|---|---|
| `POST /users/:id/reset-password` | 重复改密会造成账号状态和审计混乱 | 是 | 是 | 低 | 下一批 |
| `POST /users/:id/roles` | 重复权限变更会影响可见范围和操作权限 | 是 | 是 | 低 | 下一批 |

### Leasing / Finance

| 接口 | 风险 | 是否建议上线前补齐 | 是否适合当前 JSON fingerprint | 数据依赖 | 建议批次 |
|---|---|---|---|---|---|
| `POST /leasing/receivables/generate-batch` | 批量生成可能造成重复账务 | 是 | 是 | 中 | 下一批 |
| `POST /leasing/receivables` | 手工新增应收会直接形成账务对象 | 是 | 是 | 低 | 下一批 |
| `PUT /leasing/receivables/:id` | 修改应收会直接改变账务金额/状态 | 是 | 是 | 低 | 下一批 |
| `DELETE /leasing/receivables/:id` | 删除应收会直接影响账务闭环 | 是 | 是 | 低 | 下一批 |
| `PUT /leasing/payments/:id` | 修改收款会直接影响资金记录 | 是 | 是 | 低 | 下一批 |
| `DELETE /leasing/payments/:id` | 删除收款会直接影响资金记录 | 是 | 是 | 低 | 下一批 |

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

1. 先补齐已接入接口的回归缺口，尤其是 `POST /leasing/contracts`、`POST /leasing/contracts/:contractId/generate-receivables`、`POST /leasing/payments` 的 replay / conflict 断言。
2. 再补 P0 缺口，优先用户权限和收款 / 应收写接口。
3. 最后再进入 P1 状态流转和文件删除等接口。

如果当前只看“幂等覆盖是否可交付首发”，建议仍然把 P0 缺口视为上线前必须处理项。

## 10. Go / No-Go 判断

- 是否阻塞首发上线：是，至少在幂等维度上仍有 P0 缺口。
- 必须在上线前修的风险：用户权限变更、收款 / 应收写接口。
- 可作为上线后治理的风险：P1 状态流转、文件删除、低频配置类接口。
- 风险接受口径：已完成的 9 个真实幂等接口可以视为首发基础面，但不能把“已有 guard”误判成“全链路已幂等”。
