# JinHu Smart Park 批量生成应收幂等专项设计

## 1. 目的

本文用于确认 `POST /leasing/receivables/generate-batch` 的批量生成语义、风险边界和后续幂等治理策略。

本阶段只做只读盘点和设计，不修改业务代码，不接入新的 `IdempotencyInterceptor`，不修改测试脚本。

## 2. 当前接口现状

| 项目 | 当前情况 |
|---|---|
| 接口 | `POST /leasing/receivables/generate-batch` |
| controller method | `LeasingReceivablesController.generateBatch` |
| service method | `LeasingReceivablesService.generateBatch` |
| 当前是否 guard | 是，全局 `IdempotencyKeyGuard` 要求非公开写请求携带 `X-Idempotency-Key` |
| 当前是否 interceptor | 否，未接入 `IdempotencyInterceptor` |
| 请求字段 | `contract_ids: uuid[]`、`billing_month: YYYY-MM` |
| 响应结构 | `generated_count`、`skipped_count`、`failed_count`、`rows[]` |
| 当前事务语义 | 单个合同内部由 `generateForContract()` 事务包裹；批量层逐合同 try/catch，允许部分成功 |
| 当前去重机制 | service 按 `contract_id + fee_type + period_start + period_end + is_deleted=false` 查重；数据库有相同维度唯一索引 |
| 当前风险 | 部分成功、并发重复、失败行重试、batch 结果追溯和同 payload 不同 key 的语义仍未完整治理 |

## 3. 当前生成逻辑分析

`LeasingReceivablesController.generateBatch` 接收 `GenerateReceivablesBatchDto`，转交 `LeasingReceivablesService.generateBatch`。

DTO 当前只有两个字段：

- `contract_ids`：非空 UUID 数组。
- `billing_month`：`YYYY-MM` 格式。

service 当前逻辑如下：

- 遍历 `contract_ids`。
- 对每个合同调用 `generateForContract()`。
- `generateForContract()` 固定启用 `include_rent`、`include_deposit`、`include_property_fee`，并设置 `force_regenerate=false`。
- `billing_month` 会解析为月初到月末区间，用于筛选合同应收周期。
- 单合同生成前会校验合同存在、数据权限、合同状态为 effective、已绑定房源、合同租户、租期和付款周期完整。
- 单合同内部在事务中逐条保存应收。
- 批量层 catch 单合同错误，并把该合同追加为 `failed` 行，不回滚其它合同已生成结果。

生成维度当前包括：

- 合同：`contract_id`
- 租户企业：`park_tenant_id`
- 费用项：租金 `10`、押金 `20`、物业费 `30`
- 账期：`period_start`、`period_end`
- 到期日：`due_date`
- 金额：`amount_due`
- 来源：`source_type=contract`、`source_id=contract.id`

当前 `generate_batch_no` 字段存在于 `biz_leasing_receivable`，但批量生成路径实际创建应收时设置为 `null`，没有形成 batch id 或 batch history。

当前去重机制：

- service 在保存前查询同一 `tenant_id / park_id / contract_id / fee_type / period_start / period_end / is_deleted=false` 的应收。
- 如果已存在且 `force_regenerate=false`，返回 `skipped`。
- 数据库存在唯一索引 `uk_biz_leasing_receivable_contract_period_active`，覆盖 `tenant_id, park_id, contract_id, fee_type, period_start, period_end`，并且只约束未删除且 `contract_id IS NOT NULL` 的记录。

当前响应能表达：

- `generated`：新生成。
- `regenerated`：重新生成，当前批量入口不会触发，因为 `force_regenerate=false`。
- `skipped`：已有应收或已有财务活动无法重新生成。
- `failed`：单合同处理失败。

## 4. 重复生成风险

### same key 重试风险

当前接口只有 guard，没有 interceptor。same key 重试会再次进入 service。

由于 service 有业务查重，通常不会重复创建同一合同同一费用项同一期间的应收，而是返回 `skipped`。这能避免大部分重复账务，但第二次响应不等于第一次响应：第一次可能是 `generated`，第二次会变成 `skipped`。

### different key 同 payload 重试风险

不同 key、相同 body 也会再次进入 service。当前业务查重会阻止重复创建，但响应仍会从 `generated` 变成 `skipped`。

这说明当前已经具备一定业务级防重，但不具备“响应级幂等 replay”。

### 周期重复风险

周期维度由 `period_start`、`period_end` 和 `billing_month` 共同影响。只要生成出来的 spec 期间一致，唯一索引会兜底。但如果未来扩展计费周期、拆分规则或跨月 prorate 规则，必须重新确认唯一维度是否仍充分。

### 费用项重复风险

当前唯一维度包含 `fee_type`。租金、押金、物业费可在同一合同同一期间共存；同一费用项同一期间不可重复。

### 部分成功后重试风险

当前批量层允许部分成功：

- 合同 A 成功生成。
- 合同 B 失败。
- 接口仍返回包含 `failed_count` 的结果。

如果直接接入 interceptor，这个包含失败行的 2xx 响应可能被缓存为 succeeded。same key replay 会稳定返回第一次结果，但无法帮助“只重试失败合同”。如果不同 key 重试同一 payload，已成功合同会变成 skipped，失败合同会重新尝试。

### 并发执行风险

并发同 payload 执行时，两个请求可能同时在 service 查重阶段看到不存在。数据库唯一索引会阻止最终重复插入，但当前代码没有专门把唯一冲突转译成 `skipped`。并发下可能出现某个合同行进入 failed 或整个单合同事务失败的情况。

## 5. 幂等策略选型

| 策略 | 适配性 | 优点 | 风险 |
|---|---|---|---|
| 策略 A：直接接入 `IdempotencyInterceptor` | 不推荐作为第一步 | 改动小，可保证 same key replay | 会缓存包含 failed 行的 2xx 结果，不能解决部分成功重试和不同 key 重复执行口径 |
| 策略 B：业务级去重 + interceptor | 推荐短期优先 | 当前已有唯一维度和 skipped 语义，可在补强并发冲突处理后接入 | 仍缺少 batch 级历史和失败行追踪 |
| 策略 C：batch history / result 表 | 推荐中长期 | 可追踪 created / skipped / failed，支持失败行重试和审计 | 需要新增表、迁移、查询接口和回归设计 |
| 策略 D：首发暂缓或禁用 | 可作为风险接受 | 避免上线前引入复杂账务批量行为 | 需要明确发布口径，避免运营误用批量生成 |

推荐采用“B -> C”的顺序：

1. 短期先补强业务级去重、并发唯一冲突转译、批量结果语义。
2. 语义稳定后再接入 `IdempotencyInterceptor`。
3. 如果需要正式运营批量任务追溯，再引入 batch history / result 表。

## 6. 推荐实施方案

### 短期：业务去重和事务语义保护

建议先确认并固化业务唯一维度：

- `tenant_id`
- `park_id`
- `contract_id`
- `fee_type`
- `period_start`
- `period_end`
- `is_deleted=false`

当前数据库唯一索引已经覆盖上述核心维度，短期重点不是新增唯一索引，而是补齐服务层语义：

- 并发唯一冲突应转译为 `skipped` 或明确业务错误，不应暴露底层数据库错误。
- `generateBatch()` 返回 2xx 但 `failed_count > 0` 的语义应明确：它是“批量任务完成但部分合同失败”，不是全成功。
- 是否允许 `failed_count > 0` 时被 idempotency 记录为 succeeded，需要在接入 interceptor 前定稿。

### 中期：接入 interceptor

在短期语义补强后，可以接入 `IdempotencyInterceptor`，但必须明确：

- same key + same body replay 返回第一次完整结果。
- same key + different `contract_ids` 或 `billing_month` 返回 `409`。
- same payload + different key 不应重复生成同一账期应收，应依靠业务去重返回 skipped 或明确结果。
- failed request retry 的定义不能只依赖 HTTP 状态；如果 `failed_count > 0` 仍返回 2xx，它会被当前 interceptor 视为 succeeded。

### 长期：batch history / result 表

如果批量生成要成为生产运营常用能力，建议设计独立 batch 记录：

- batch id / batch no
- request fingerprint
- idempotency key
- operator
- status：running / succeeded / partial_failed / failed
- result rows：contract id、fee type、period、created / skipped / failed、receivable id、错误摘要

届时 `generate_batch_no` 字段可以真正用于关联应收和批量任务。

## 7. 回归测试设计

后续实施优先扩展 `scripts/e2e/first-release-leasing.mjs`，不新增 runner。

建议覆盖：

- missing key：不带 `X-Idempotency-Key` 返回 `400`。
- first batch generation：选择 1 至 2 个测试合同和一个未生成过的 `billing_month`。
- same key replay：返回第一次结果，`generated_count / skipped_count / failed_count / rows` 一致。
- same key different body conflict：修改 `billing_month` 或 `contract_ids`，返回 `409`。
- same payload different key：不重复生成同一合同同一账期应收，应返回 skipped 或等价业务结果。
- duplicate side-effect check：通过列表确认同一 `contract + fee_type + period` 不重复。
- partial failed：如果包含一个无效合同或未满足条件合同，应明确 failed 行语义。
- failed retry：如当前保持 `failed_count > 0` 但 HTTP 2xx，需要额外验证该响应是否应被缓存；否则应调整为可区分的 batch status。

## 8. 后续实施拆分

### E2-5B-4A：批量生成业务去重 / 事务语义保护

目标：

- 明确 `failed_count > 0` 时的 HTTP 与业务状态语义。
- 对并发唯一冲突做业务转译。
- 确认 `generate_batch_no` 是否继续为空，还是先生成可追踪 batch no。

是否接入 interceptor：否。

验收标准：

- 重复执行不会创建重复账务。
- 并发或唯一冲突不会泄露底层数据库错误。
- 部分成功结果语义清晰。

### E2-5B-4B：批量生成幂等接入 + 回归

目标：

- 在 `LeasingReceivablesController.generateBatch` 接入 `IdempotencyInterceptor`。
- 扩展 `first-release-leasing.mjs` 覆盖 missing key / first / replay / conflict / duplicate side-effect。

前置条件：

- E2-5B-4A 完成。
- 明确 partial failed 是否可被缓存为 succeeded。

验收标准：

- same key replay 返回第一次结果。
- same key different body 返回 `409`。
- same payload different key 不重复生成账务。

### E2-5B-4C：batch history / result 表设计

目标：

- 设计 batch history 和 batch result 明细。
- 支持批量结果追溯、失败行重试和运营排障。
- 明确 `generate_batch_no` 与批次表关系。

是否本阶段必须：否。除非产品 / 财务要求首发开放批量运营能力并可审计追溯。

## 9. Go / No-Go 判断

- 是否可以直接接入 interceptor：不建议直接接入。虽然请求 body 稳定，但当前存在部分成功和 failed 行 2xx 语义。
- 是否必须先补业务去重：已有核心唯一索引和 service 查重，但建议先补并发唯一冲突转译和批量结果语义。
- 是否需要 batch history：如果首发需要正式开放批量生成能力，建议需要；如果只作为低频运维能力，可先文档化风险并暂缓。
- 是否建议首发暂缓：建议首发暂缓自动化开放，或仅由发布 / 运维负责人受控执行。
- 是否需要产品 / 财务确认：需要。尤其是部分成功、失败行重试、重复生成 skipped 口径和 batch 追溯要求。

## 10. 结论

`POST /leasing/receivables/generate-batch` 当前不适合直接接入 `IdempotencyInterceptor`。

当前代码已有重要防重基础：service 会跳过已存在的 `contract + fee_type + period` 应收，数据库也有同维度唯一索引。但它仍缺少批量级执行历史、batch no 使用、部分成功状态管理和并发唯一冲突转译。

推荐下一步：

1. 先实施 E2-5B-4A，补齐业务去重 / 事务语义保护。
2. 再实施 E2-5B-4B，接入 interceptor 并补回归。
3. 如首发需要正式开放批量运营能力，再推进 E2-5B-4C batch history / result 表设计。
