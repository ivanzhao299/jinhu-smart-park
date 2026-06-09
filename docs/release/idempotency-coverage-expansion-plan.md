# JinHu Smart Park 首发高风险写接口幂等覆盖扩展计划

## 1. 目的

本文用于盘点首发范围内高风险写接口的幂等覆盖现状，区分“仅要求带 `X-Idempotency-Key`”与“已具备真实 replay / conflict / failed retry 语义”的接口，并给出分批扩展建议。

本计划只讨论首发范围内的高风险写接口，不改变当前业务 controller 语义，不直接调整现有幂等实现。

## 2. 当前幂等机制说明

当前仓库已经具备以下幂等基础设施：

- 全局 `IdempotencyKeyGuard`
- 可按接口显式接入的 `IdempotencyInterceptor`
- PostgreSQL-backed `idempotency_request` 记录表
- 幂等清理任务与基础日志
- `replay` / `conflict` / `failed retry` 语义

当前机制特点：

- `IdempotencyKeyGuard` 作为全局 `APP_GUARD` 生效，对所有非公开写请求统一要求带 `X-Idempotency-Key`
- 只有显式加了 `IdempotencyInterceptor` 的接口，才具备真实 replay / conflict / failed retry 复用能力
- 当前 fingerprint 主要基于 `request.path`、`query`、`body` 等 JSON 语义构建，不适合直接等同于 multipart 文件内容幂等
- 当前机制不改变业务 controller 的返回结构和业务语义

## 3. 已覆盖接口

| 接口 | 模块 | 是否 guard | 是否 interceptor | replay 是否验证 | 回归脚本是否覆盖 | 备注 |
|---|---|---|---|---|---|---|
| `POST /work-orders` | work-orders | 是 | 是 | 是 | 是 | `first-release-idempotency.mjs` 已覆盖 missing key / replay / conflict |
| `POST /leasing/contracts` | leasing-contracts | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` 已覆盖 missing key / replay / conflict |
| `POST /leasing/contracts/:contractId/generate-receivables` | leasing-receivables | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` 已覆盖 missing key / replay / conflict |
| `POST /leasing/payments` | leasing-payments | 是 | 是 | 是 | 是 | `first-release-leasing.mjs` 已覆盖 missing key / replay / conflict |
| `POST /users/:id/reset-password` | users | 是 | 是 | 是 | 是 | `first-release-users-assets.mjs` 已覆盖 missing key / replay / conflict |
| `POST /users/:id/roles` | users | 是 | 是 | 是 | 是 | `first-release-users-assets.mjs` 已覆盖 missing key / replay / conflict |
| `POST /users` | users | 是 | 是 | 是 | 是 | `first-release-idempotency.mjs` 已覆盖 missing key / replay / conflict |

应收 / 收款编辑删除类 P0 缺口已进入 E2-5B 专项设计，详见 [receivables-payments-idempotency-design.md](./receivables-payments-idempotency-design.md)。

## 4. 首发写接口盘点

### 4.1 Users

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /users` | 创建用户 | 已接 interceptor | 已覆盖 | 否 | 首批已完成 |
| `PATCH /users/:id` | 修改用户 | 仅 guard | P1 | 是 | 关键业务对象修改，重复提交可能覆盖字段 |
| `DELETE /users/:id` | 删除用户 | 仅 guard | P1 | 暂缓 | 软删除通常可由状态校验和重复删除兜底，收益低于角色变更 |
| `POST /users/:id/reset-password` | 重置密码 | 已接 interceptor | P0 | 已完成本批 | `first-release-users-assets.mjs` 已覆盖 replay / conflict |
| `POST /users/:id/roles` | 分配角色 | 已接 interceptor | P0 | 已完成本批 | `first-release-users-assets.mjs` 已覆盖 replay / conflict |

### 4.2 Files

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /files` | 文件上传 | 仅 guard | P1 | 暂缓专项设计 | multipart 请求不适合直接套用当前 JSON fingerprint |
| `DELETE /files/:id` | 文件软删除 | 仅 guard | P1 | 是 | 删除重复提交风险中等，且与业务附件可见性有关 |

### 4.3 Work Orders

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /work-orders` | 创建工单 | 已接 interceptor | 已覆盖 | 否 | 首批已完成 |
| `POST /work-orders/:id/assign` | 派单 | 已接 interceptor | P1 | 已完成本批 | 已具备真实 replay / conflict 语义 |
| `POST /work-orders/:id/reassign` | 改派 | 仅 guard | P1 | 是 | 重复改派会造成处理人抖动 |
| `POST /work-orders/:id/accept` | 接单 | 仅 guard | P1 | 是 | 状态流转接口，重复提交收益高 |
| `POST /work-orders/:id/start` | 开始处理 | 仅 guard | P1 | 是 | 状态推进 |
| `POST /work-orders/:id/wait-material` | 待物料 | 仅 guard | P1 | 是 | 状态推进，且带原因/补充信息 |
| `POST /work-orders/:id/finish` | 完成处理 | 仅 guard | P1 | 是 | 关键状态推进 |
| `POST /work-orders/:id/confirm` | 确认完成 | 仅 guard | P1 | 是 | 关键状态推进 |
| `POST /work-orders/:id/evaluate` | 评价 | 仅 guard | P2 | 暂缓 | 业务影响小于状态流转主链 |
| `POST /work-orders/:id/close` | 关闭工单 | 仅 guard | P1 | 是 | 重复关闭可能产生重复关闭日志 |
| `POST /work-orders/:id/cancel` | 取消工单 | 仅 guard | P1 | 是 | 状态推进 |
| `POST /work-orders/:id/return` | 退回工单 | 仅 guard | P1 | 是 | 状态推进 |
| `POST /work-orders/:id/reject` | 驳回工单 | 仅 guard | P1 | 是 | 状态推进 |
| `POST /work-orders/:id/logs` | 新增处理日志 | 仅 guard | P2 | 暂缓 | 容易重复写日志，但优先级低于状态流转 |
| `POST /work-orders/sla-rules` | 新增 SLA 规则 | 仅 guard | P2 | 暂缓 | 配置类接口，首发频率低 |
| `PUT /work-orders/:id` | 修改工单 | 仅 guard | P2 | 暂缓 | 收益低于状态接口 |

### 4.4 Assets

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /assets/parks` | 新增园区 | 仅 guard | P2 | 暂缓 | 首发运营频率较低，部分可由编码唯一约束兜底 |
| `PATCH /assets/parks/:id` | 修改园区 | 仅 guard | P2 | 暂缓 | 收益一般 |
| `DELETE /assets/parks/:id` | 删除园区 | 仅 guard | P2 | 暂缓 | 低频操作 |
| `POST /assets/buildings` | 新增楼栋 | 仅 guard | P2 | 暂缓 | 首发低频配置类 |
| `PATCH /assets/buildings/:id` | 修改楼栋 | 仅 guard | P2 | 暂缓 | 同上 |
| `DELETE /assets/buildings/:id` | 删除楼栋 | 仅 guard | P2 | 暂缓 | 同上 |
| `POST /assets/floors` | 新增楼层 | 仅 guard | P2 | 暂缓 | 同上 |
| `PATCH /assets/floors/:id` | 修改楼层 | 仅 guard | P2 | 暂缓 | 同上 |
| `DELETE /assets/floors/:id` | 删除楼层 | 仅 guard | P2 | 暂缓 | 同上 |
| `POST /assets/units` | 新增房源 | 仅 guard | P1 | 暂缓 | 关键对象创建，但当前首发主链优先级低于工单/合同状态 |
| `PATCH /assets/units/:id` | 修改房源 | 仅 guard | P2 | 暂缓 | 收益一般 |
| `DELETE /assets/units/:id` | 删除房源 | 仅 guard | P2 | 暂缓 | 收益一般 |
| `POST /park-units/:id/change-status` | 房源状态流转 | 仅 guard | P1 | 是 | 会造成重复资源状态推进 |
| `POST /park-units/:id/photos` | 上传房源照片 | 仅 guard | P2 | 暂缓专项设计 | multipart |
| `POST /park-units/:id/floorplan` | 上传平面图 | 仅 guard | P2 | 暂缓专项设计 | multipart |
| `POST /floors/:id/layout` | 上传楼层图 | 仅 guard | P2 | 暂缓专项设计 | multipart |
| `POST /park-units/import` | 批量导入 | 仅 guard | P2 | 暂缓专项设计 | 批量 + multipart，不适合第一批 |

### 4.5 Leasing Contracts

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /leasing/contracts` | 创建合同 | 已接 interceptor | 已覆盖 | 否 | 首批已完成 |
| `POST /leasing/contracts/:contractId/units` | 合同房源关联 | 已接 interceptor | P0 | 已完成本批 | 已具备真实 replay / conflict 语义 |
| `PUT /leasing/contracts/:contractId/units/:relId` | 修改合同房源关联 | 仅 guard | P1 | 是 | 关联参数重复提交风险较高 |
| `DELETE /leasing/contracts/:contractId/units/:relId` | 删除合同房源关联 | 仅 guard | P1 | 是 | 关系型资源变更 |
| `POST /leasing/contracts/:contractId/recalculate` | 金额重算 | 仅 guard | P1 | 是 | 可能触发重复账务计算 |
| `POST /leasing/contracts/:id/submit` | 提交审批 | 仅 guard | P1 | 是 | 业务状态流转 |
| `POST /leasing/contracts/:id/approve` | 审批通过 | 仅 guard | P1 | 是 | 业务状态流转 |
| `POST /leasing/contracts/:id/reject` | 审批驳回 | 仅 guard | P1 | 是 | 业务状态流转 |
| `POST /leasing/contracts/:id/void` | 合同作废 | 仅 guard | P1 | 是 | 状态推进且影响后续账务 |
| `POST /leasing/contracts/:id/archive` | 签章归档 | 仅 guard | P1 | 是 | 带文件绑定和状态推进 |
| `POST /leasing/contracts/:id/effective` | 合同生效 | 已接 interceptor | P0 | 已完成本批 | 已具备真实 replay / conflict 语义 |
| `POST /leasing/contracts/:id/renew-draft` | 生成续租草稿 | 仅 guard | P1 | 暂缓 | 数据依赖较重，优先级次于主合同状态链 |
| `PUT /leasing/contracts/:id` | 修改合同 | 仅 guard | P1 | 暂缓 | 收益低于状态/关联/账务链 |
| `DELETE /leasing/contracts/:id` | 删除合同 | 仅 guard | P2 | 暂缓 | 一般由状态和软删除兜底 |

### 4.6 Leasing Receivables

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /leasing/contracts/:contractId/generate-receivables` | 按合同生成应收 | 已接 interceptor | 已覆盖 | 否 | 首批已完成 |
| `POST /leasing/receivables/generate-batch` | 批量生成应收 | 仅 guard | P0 | 是 | 重复生成可能造成重复账务 |
| `POST /leasing/receivables/recalculate-overdue` | 重算逾期 | 仅 guard | P1 | 暂缓 | 风险次于生成与核销 |
| `POST /leasing/receivables` | 手工新增应收 | 已接 interceptor | 已覆盖 | 否 | E2-5B-1 已完成 |
| `PUT /leasing/receivables/:id` | 修改应收 | 仅 guard | P0 | 是 | 直接修改账务对象 |
| `DELETE /leasing/receivables/:id` | 删除应收 | 仅 guard | P0 | 是 | 直接影响账务 |

### 4.7 Leasing Payments

| 接口 | 业务动作 | 当前幂等状态 | 风险等级 | 是否建议补齐 | 原因 |
|---|---|---|---|---|---|
| `POST /leasing/payments` | 新增收款 | 已接 interceptor | 已覆盖 | 否 | 首批已完成 |
| `POST /leasing/payments/:id/apply` | 收款核销 | 已接 interceptor | P0 | 已完成本批 | 资金与应收核销相关，已具备真实 replay / conflict 语义 |
| `PUT /leasing/payments/:id` | 修改收款 | 已接 interceptor | 已覆盖 | 否 | E2-5B-1 已完成 |
| `DELETE /leasing/payments/:id` | 删除收款 | 仅 guard | P0 | 是 | 直接影响资金记录 |

> E2-5B-1 实施结论：`POST /leasing/receivables` 与 `PUT /leasing/payments/:id` 已接入真实幂等并完成 replay / conflict 回归；`PUT /leasing/receivables/:id` 建议先补业务状态保护；删除类和批量生成接口暂缓专项设计。

## 5. 第一批建议补齐范围

第一批建议只补 4 个接口，优先覆盖“状态推进 + 资源绑定 + 资金核销”三类高风险动作：

| 接口 | 为什么优先 | 数据依赖 | 是否适合当前 interceptor | 回归方式 |
|---|---|---|---|---|
| `POST /work-orders/:id/assign` | 已在本批接入；后续转入稳定性观察 | 需要已存在工单与处理人 | 是 | `first-release-workorders.mjs` 已补 replay / conflict |
| `POST /leasing/contracts/:id/effective` | 已在本批接入；后续转入稳定性观察 | 需要合同已完成 submit / approve / archive | 是 | `first-release-leasing.mjs` 已补 replay / conflict |
| `POST /leasing/contracts/:contractId/units` | 已在本批接入；后续转入稳定性观察 | 需要合同和房源已存在 | 是 | `first-release-leasing.mjs` 已补 replay / conflict |
| `POST /leasing/payments/:id/apply` | 已在本批接入；后续转入稳定性观察 | 需要已存在收款与可核销应收 | 是，但数据依赖更重 | `first-release-leasing.mjs` 已补 replay / conflict |

补充判断：

- 这 4 个接口都属于 JSON body 驱动，适合直接套用当前 `IdempotencyInterceptor`
- 其中 `POST /leasing/payments/:id/apply` 数据依赖最重，但业务风险也最高，值得列入第一批末位

## 6. 暂缓范围

以下范围建议暂缓：

- 文件上传类接口：
  - `POST /files`
  - `POST /park-units/:id/photos`
  - `POST /park-units/:id/floorplan`
  - `POST /floors/:id/layout`
- 批量接口：
  - `POST /park-units/import`
  - `POST /leasing/receivables/generate-batch`
- 非首发模块
- 复杂退款 / 发票 / 豁免 / 更深审批流
- 已由唯一约束、状态保护或低频配置特征部分兜底的低收益接口

暂缓原因：

- multipart 请求需要单独定义文件内容或业务语义的 fingerprint 规则
- 批量接口的 replay 语义、部分成功语义和冲突语义需要先设计
- 复杂账务链路应单独做专项回归，而不是一批混入太多接口

## 7. 实施原则

- 小批量接入，每批 2～4 个接口
- 优先补状态推进、资源绑定、资金核销类接口
- 不改变原有业务语义和返回结构
- 写接口继续统一要求带 `X-Idempotency-Key`
- 接入后必须补回归脚本
- 不把文件上传简单套用当前 JSON 请求 fingerprint

## 8. 回归测试计划

建议的回归同步方式：

- 扩展 `scripts/e2e/first-release-workorders.mjs`
  - 已增加 `assign` 的 replay / conflict 断言
- 扩展 `scripts/e2e/first-release-leasing.mjs`
  - 已补齐 `POST /leasing/contracts`、`POST /leasing/contracts/:contractId/generate-receivables`、`POST /leasing/payments` 的 replay / conflict
  - 已增加合同房源关联 `POST /leasing/contracts/:contractId/units` 的 replay / conflict
  - 已增加 `POST /leasing/contracts/:id/effective` 的 replay / conflict
  - 已增加 `POST /leasing/payments/:id/apply` 的 replay / conflict
- 保持 `scripts/e2e/first-release-regression.mjs` 继续串行调用现有脚本

回归断言原则：

- same key + same payload：返回成功，关键业务 id 一致
- same key + different payload：返回 `409 conflict`
- missing key：继续由全局 guard 返回 `400`

当前不建议因为扩展幂等而新增新的统一 runner；优先复用现有首发脚本。

## 9. 建议实施顺序

### E2-1：工单状态流转幂等

- 目标：已完成 `assign`，后续补 `accept`、`start` 等工单主状态动作
- 建议文件：
  - `apps/api/src/modules/work-orders/work-orders.controller.ts`
  - `scripts/e2e/first-release-workorders.mjs`
- 风险：状态机动作多，当前已验证 `assign`，后续接口仍需分批推进
- 验收标准：`assign` 已满足 same key replay 不重复推进，different payload 返回 `409`

### E2-2：合同状态流转幂等

- 目标：补 `submit`、`approve`、`archive`、`effective`
- 建议文件：
  - `apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts`
  - `scripts/e2e/first-release-leasing.mjs`
- 风险：依赖合同当前状态和文件归档前置条件
- 验收标准：重复状态推进不重复生效，冲突请求返回 `409`

### E2-3：合同单位/房源关联幂等

- 目标：补 `POST /leasing/contracts/:contractId/units`
- 建议文件：
  - `apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts`
  - `scripts/e2e/first-release-leasing.mjs`
- 风险：需要确认 replay 返回的是同一关联记录，而不是再次插入
- 验收标准：same key replay 返回同一 relation id

### E2-4：收款 / 应收补充幂等

- 目标：已完成 `POST /leasing/payments/:id/apply`；应收 / 收款编辑删除类 P0 缺口已进入 E2-5B 专项设计
- 建议文件：
  - `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts`
  - leasing 回归脚本
- 风险：数据依赖最重，当前已通过 leasing 回归脚本补最小闭环验证；剩余编辑 / 删除接口需要先区分普通 JSON 更新、财务状态保护、删除 / 作废语义和批量部分成功语义
- 验收标准：`apply` 已满足重复核销不重复生成核销关系或重复扣减应收；下一批按 [receivables-payments-idempotency-design.md](./receivables-payments-idempotency-design.md) 分批实施

### E2-5：应收 / 收款编辑删除专项设计

- 目标：`POST /leasing/receivables` 与 `PUT /leasing/payments/:id` 已完成；后续分批补齐 `PUT /leasing/receivables/:id`、删除类接口和批量生成接口
- 建议文件：
  - `apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts`
  - `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
  - `scripts/e2e/first-release-leasing.mjs`
- 风险：资金账务接口不能只看 JSON fingerprint，还需要确认已核销 / 已开票 / 作废状态保护
- 验收标准：`POST /leasing/receivables` 与 `PUT /leasing/payments/:id` 已由 `first-release-leasing.mjs` 覆盖 replay / conflict；剩余项详见 [receivables-payments-idempotency-design.md](./receivables-payments-idempotency-design.md)

### E2-6：文件写接口专项设计

- 目标：单独设计 multipart 文件写接口幂等策略
- 建议文件：
  - `apps/api/src/modules/files/files.controller.ts`
  - `apps/api/src/modules/units/units.controller.ts`
  - `apps/api/src/modules/floors/floors.controller.ts`
- 风险：当前 JSON fingerprint 无法表达文件字节内容
- 验收标准：明确是否基于文件摘要、业务绑定键或外部 upload token 做幂等

## 10. 建议 Issue 列表

### Issue 1

- 标题：`add idempotency to work order state transitions`
- 优先级：P1
- 背景：工单状态流转接口当前只有 guard，没有真实 replay / conflict
- 任务：
  - `assign` 已完成，后续补 `accept`、`start`、`finish`
  - 更新 `first-release-workorders.mjs`
- 验收标准：
  - replay 不重复推进状态
  - conflict 返回 `409`

### Issue 2

- 标题：`add idempotency to leasing contract state actions`
- 优先级：P1
- 背景：合同状态推进会影响合同与房源状态
- 任务：
  - 补 `submit`
  - 补 `approve`
  - 补 `archive`
  - `effective` 已完成，后续补 `submit`、`approve`、`archive`
- 验收标准：
  - 关键状态动作支持 replay / conflict
  - 回归脚本补齐断言

### Issue 3

- 标题：`add idempotency to contract unit binding`
- 优先级：P0
- 背景：重复房源绑定会导致资源关系异常
- 任务：
  - `POST /leasing/contracts/:contractId/units` 已接入 interceptor
  - leasing 回归 replay / conflict 已补齐
- 验收标准：
  - same key replay 返回同一绑定记录
  - different payload 返回 `409`

### Issue 4

- 标题：`add idempotency to payment apply and receivable write actions`
- 优先级：P0
- 背景：资金与账务类接口属于最高风险写接口
- 任务：
  - `POST /leasing/payments/:id/apply` 已完成
  - `POST /leasing/receivables` 已完成
  - `PUT /leasing/payments/:id` 已完成
  - `PUT /leasing/receivables/:id` 需先补业务状态保护，再接入 interceptor
  - 删除类和批量生成接口按专项设计推进
- 验收标准：
  - 重复核销、重复新增应收、重复修改收款均已被拦截或复用
  - 已核销 / 已开票 / 作废场景有明确业务状态保护

### Issue 5

- 标题：`design multipart idempotency strategy for file writes`
- 优先级：P2
- 背景：文件上传和附件绑定不适合直接套当前 JSON fingerprint
- 任务：
  - 盘点文件上传和业务附件绑定接口
  - 设计 multipart 幂等规则
  - 决定是否引入文件摘要或 upload token
- 验收标准：
  - 形成专项设计，不误用现有幂等机制

## 11. 最终建议

当前状态快照与剩余缺口请以 [idempotency-coverage-review.md](./idempotency-coverage-review.md) 为准。

1. 下一批最该补的接口是：
   - `PUT /leasing/receivables/:id`，但需先补业务状态保护
2. 不要马上补的接口是：
   - 文件上传类 multipart 接口
   - 批量导入 / 批量生成接口
   - 财务删除 / 作废接口，直到删除语义和状态保护确认
   - 非首发模块接口
3. 当前不需要先改幂等底层机制，现有 `IdempotencyInterceptor` 足以覆盖下一批稳定 JSON 写接口；真正需要单独设计的是 multipart、批量接口和财务删除 / 作废语义
4. 当前不需要修改 `first-release regression runner`，优先扩展已有 `workorders` 和 `leasing` 子脚本即可
