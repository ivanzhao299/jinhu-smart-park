# JinHu Smart Park 首发幂等与账务风险收口复核

## 1. 复核目的

本文用于在多轮幂等和账务保护实施后，对首发范围内高风险写接口、账务副作用接口和回归覆盖状态做最终阶段性复核。

本复核只判断“首发幂等与账务风险治理是否可以阶段性收口”，不代表所有写接口都已经接入真实幂等，也不替代后续产品 / 财务口径确认。

## 2. 当前机制边界

当前机制仍分为两层：

- 全局 `IdempotencyKeyGuard`：要求非公开写请求携带 `X-Idempotency-Key`。
- 显式 `IdempotencyInterceptor`：提供真实 replay / conflict / failed retry 语义。

因此，“带 key”不等于“真实幂等”。只有 controller method 显式接入 `IdempotencyInterceptor` 的接口，才可以视为具备统一幂等能力。

账务接口不能只依赖幂等。应收、收款、核销、删除 / 作废和批量生成还必须具备业务状态保护、字段保护、业务级去重或事务语义保护。

## 3. 已接入真实幂等接口清单

| 接口 | 模块 | 业务动作 | 是否已接入真实幂等 | 是否已验证 replay | 是否已验证 conflict | 是否已验证 failed retry | 回归脚本 | 备注 |
|---|---|---|---|---|---|---|---|---|
| `POST /users` | users | 创建用户 | 是 | 是 | 是 | 否 | `first-release-idempotency.mjs` | 首批覆盖 |
| `POST /users/:id/reset-password` | users | 重置密码 | 是 | 是 | 是 | 否 | `first-release-users-assets.mjs` | P0 用户权限接口 |
| `POST /users/:id/roles` | users | 分配角色 | 是 | 是 | 是 | 否 | `first-release-users-assets.mjs` | P0 用户权限接口 |
| `POST /work-orders` | work-orders | 创建工单 | 是 | 是 | 是 | 否 | `first-release-idempotency.mjs` | 首批覆盖 |
| `POST /work-orders/:id/assign` | work-orders | 派单 | 是 | 是 | 是 | 否 | `first-release-workorders.mjs` | 状态推进已覆盖 |
| `POST /leasing/contracts` | leasing-contracts | 创建合同 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 租赁主链 |
| `POST /leasing/contracts/:contractId/units` | leasing-contracts | 合同房源关联 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 资源绑定 |
| `POST /leasing/contracts/:id/effective` | leasing-contracts | 合同生效 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 状态推进 |
| `POST /leasing/contracts/:contractId/generate-receivables` | leasing-receivables | 按合同生成应收 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 单合同生成 |
| `POST /leasing/receivables/generate-batch` | leasing-receivables | 批量生成应收 | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` | 业务级去重仍生效 |
| `POST /leasing/receivables` | leasing-receivables | 手工创建应收 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 账务对象创建 |
| `PUT /leasing/receivables/:id` | leasing-receivables | 修改应收 | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` | 字段 / 状态保护仍生效 |
| `DELETE /leasing/receivables/:id` | leasing-receivables | 应收 softDelete + void | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` | 不代表冲销流程 |
| `POST /leasing/payments` | leasing-payments | 创建收款 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 资金记录创建 |
| `PUT /leasing/payments/:id` | leasing-payments | 修改收款 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 使用未核销收款回归 |
| `DELETE /leasing/payments/:id` | leasing-payments | 收款 softDelete + void | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` | payment status log 仍待治理 |
| `POST /leasing/payments/:id/apply` | leasing-payments | 收款核销 | 是 | 是 | 是 | 否 | `first-release-leasing.mjs` | 资金核销 |

## 4. 账务业务保护完成情况

| 范围 | 完成情况 | 保护内容 | 备注 |
|---|---|---|---|
| 应收创建 | 已完成 | 接入真实幂等，覆盖 replay / conflict，避免重复创建账务对象 | `POST /leasing/receivables` |
| 应收修改 | 已完成 | DTO 收窄为 `remark` / `due_date`，service denylist 拒绝敏感字段，已收 / 已减免 / 已开票 / 已作废 / 部分或已核销状态禁止普通 update，已接真实幂等 | `PUT /leasing/receivables/:id` |
| 应收删除 / 作废 | 已完成 | 保持 softDelete + `status=void`，只允许未发生财务活动记录，拒绝已收款、已减免、已开票、已作废和有 application 的应收，已接真实幂等 | 不代表冲销 / 反核销 |
| 收款创建 | 已完成 | 接入真实幂等，覆盖 replay / conflict，避免重复创建资金记录 | `POST /leasing/payments` |
| 收款修改 | 已完成 | 接入真实幂等，回归使用未核销收款，避免重复更新 | `PUT /leasing/payments/:id` |
| 收款删除 / 作废 | 已完成 | 保持 softDelete + `status=void`，只允许未核销 / 无 application 收款，已接真实幂等 | payment status log 仍是后续治理项 |
| 收款核销 | 已完成 | 接入真实幂等，覆盖 replay / conflict，回归确认不会重复 application | `POST /leasing/payments/:id/apply` |
| 批量生成应收 | 已完成阶段性治理 | 业务级去重、逐合同处理、单合同事务一致、created / skipped / failed 汇总、同键 replay、同键不同内容 conflict、不同键同内容业务跳过 | batch history / result 表仍待后续设计 |

## 5. 回归覆盖情况

| 脚本 | 覆盖范围 | 备注 |
|---|---|---|
| `first-release-leasing.mjs` | 租赁合同、合同房源、合同生效、应收生成、批量生成应收、应收创建 / 修改 / 删除、收款创建 / 修改 / 删除、收款核销的 missing key / first request / replay / conflict；DELETE 和 batch generation 覆盖 failed request retry | 账务幂等主链核心脚本 |
| `first-release-users-assets.mjs` | 用户创建、重置密码、角色分配 replay / conflict；资产 read-only | 用户权限 P0 已覆盖 |
| `first-release-workorders.mjs` | 工单创建 / 列表 / 详情，派单 replay / conflict | 其它工单状态流转仍后续治理 |
| `first-release-idempotency.mjs` | `POST /users`、`POST /work-orders` 的基础幂等 replay / conflict | 轻量基础脚本 |
| `first-release-regression.mjs` | 串行执行首发回归脚本 | 需在 production-like 环境执行 |

统一回归入口应作为正式发布前口径，但需要 production-like 配置：API 已启动、DB 已完成 migration、production seed、bootstrap-admin，且生产态 mock 禁用口径一致。development/mock 认证配置导致 SMS / WeChat mock 断言失败时，不应直接判定账务幂等回归失败，应先校验认证环境变量口径。

## 6. 剩余缺口

| 缺口 | 是否首发开放 | 是否阻塞上线 | 建议后续阶段 |
|---|---|---|---|
| 其它工单状态流转：`reassign`、`accept`、`start`、`wait-material`、`finish`、`confirm`、`close`、`cancel`、`return`、`reject` | 可能属于首发工单能力 | 非账务 P0，不阻塞本轮账务收口 | 后续小批量幂等扩展 |
| 其它合同状态流转：`submit`、`approve`、`reject`、`void`、`archive`、`recalculate`、`renew-draft` | 可能属于租赁业务能力 | 已覆盖关键生效动作，不阻塞本轮账务收口 | 后续状态流转专项 |
| 合同房源关联修改 / 删除 | 可能属于首发合同管理 | 新增关联已覆盖，修改 / 删除可后续治理 | 后续资源绑定专项 |
| `POST /leasing/receivables/recalculate-overdue` | 可能用于运营维护 | 不阻塞首发主链 | 后续重算任务专项 |
| payment status log | 是，属于审计增强 | 不阻塞主链幂等，但应治理 | 另起审计日志专项 |
| batch history / result 表 | 是，属于批量追溯增强 | 不阻塞请求级幂等和业务去重 | 后续批量任务治理 |
| 文件上传 / 删除幂等策略 | 文件模块属于首发 | 上传为 multipart，不适合直接套 JSON fingerprint；删除可后续治理 | 文件幂等与审计专项 |
| 作废、冲销、反核销、退款、发票、豁免 | 需产品 / 财务确认 | 不应默认作为首发开放主链 | 财务专项设计 |
| 非首发或隐藏菜单模块 | 否或待确认 | 不阻塞 | 白名单确认后再治理 |

## 7. Go / No-Go 判断

从“首发幂等与账务风险”维度，当前可以阶段性收口。

Go 条件：

- production-like 环境下 `first-release-leasing.mjs` 通过。
- production-like 环境下 `first-release-regression.mjs` 通过，或认证 mock 相关失败已被确认为环境配置口径问题且账务脚本单独通过。
- 生产发布仍执行 migration / seed / bootstrap-admin / release-smoke / Final Go 等既有门禁。
- 首发开放面继续受菜单白名单和发布口径约束。

No-Go 条件：

- 账务主链回归中出现重复应收、重复收款、重复核销或 softDelete 保护失效。
- batch generation 同键 replay 返回业务重算结果，而不是首次响应。
- same key + different payload 未返回 conflict。
- production-like 环境中认证、权限或租户隔离导致核心脚本无法完成。

当前未发现新的幂等 / 账务维度上线阻断项。剩余问题主要是后续治理项，而不是本轮专项继续扩接口的理由。

## 8. 后续建议

1. 结束本轮幂等专项，不再继续扩大本阶段接口范围。
2. 后续进入大页面 / 大服务拆分设计，避免继续在同一阶段滚动扩大 scope。
3. 另起专项治理 payment status log、文件审计日志字段长度、batch history / result 表。
4. 对非首发开放接口做白名单确认，确认后再按小批量策略补幂等。
5. 对作废、冲销、反核销、退款、发票、豁免等财务语义单独做产品 / 财务确认。

## 9. 结论

首发高风险幂等与账务主链已经完成阶段性治理：用户权限、工单创建 / 派单、租赁合同创建 / 生效 / 房源关联、应收创建 / 修改 / 删除、收款创建 / 修改 / 删除 / 核销、单合同应收生成和批量应收生成均已具备真实幂等或业务级去重保护，并由首发回归脚本覆盖。

本轮专项建议收口。剩余缺口不应在本阶段继续滚动扩大，而应进入后续专项或上线后治理计划。
