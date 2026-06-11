# JinHu Smart Park 接口快照 list / stats 波动治理设计

## 1. 设计目的

本文用于治理 `workorders.list` 和 `workorders.stats` 在写入型 e2e 后的快照波动问题，明确后续是否需要调整快照脚本策略、运行顺序和 baseline 维护规则。

本文先完成治理设计；后续已按该设计先实施 `workorders.list` 降级策略。`workorders.stats` 仍保持原 numeric 快照策略，作为后续单独治理项。

## 2. 背景

当前 baseline 已切换到固定样本：

- `SNAPSHOT-WO-001`
- `SNAPSHOT-UNIT-001`

固定业务标识已经稳定了以下快照锚点：

- `workorders.detail`
- `workorders.logs`
- `units.detail`
- `units.list` 中的固定房源样本

但写入型 e2e 后仍会出现波动：

- `workorders.list`
- `workorders.stats`

继续接入 workflow、release-smoke label 或扩大接口覆盖前，需要先治理这两个 snapshot 的误报风险。

## 3. 当前波动来源

`first-release-workorders.mjs` 会写入工单数据：

- 生成 `WO-${TEST_RUN_ID}` 工单编号。
- 通过 `POST /work-orders` 创建工单。
- 通过 `POST /work-orders/:id/assign` 派单。
- 验证派单 replay / conflict。

这些行为会影响：

- 工单列表排序。
- 工单列表首条样本。
- 工单分页总数。
- `workorders.stats.summary`。
- `workorders.stats.by_status`。
- `workorders.stats.by_priority`。
- `workorders.stats.by_type`。
- `workorders.stats.by_assignee`。

固定业务编号可以稳定详情和日志样本，但不能固定全局列表和全局统计。

## 4. workorders.list 当前问题

当前脚本请求：

```text
GET /work-orders?page=1&page_size=10
```

在 normalized 模式下，`workorders.list` 当前保存：

- pagination 结构。
- `item_count_category`。
- 列表 item 字段集合。
- 第一条完整归一化样本。

当前风险：

- 第一条样本可能不是 `SNAPSHOT-WO-001`。
- 新增工单可能改变列表排序和第一条样本。
- 派单后状态、处理人、日志等字段变化会影响列表首条内容。
- 固定业务编号只用于选择 detail / logs 样本，不会改变 `workorders.list` 的采样方式。

因此，写入型 e2e 后 list 快照变化是预期风险。

## 5. workorders.list 治理方案

### 方案 A：保持当前 list normalized 快照

优点：

- 覆盖能力强。
- 能捕捉列表首条完整响应变化。
- 不需要改脚本。

缺点：

- 易受写入型 e2e 影响。
- 仍依赖列表默认排序。
- 不适合接入 CI 或写入型 e2e 后运行。

### 方案 B：list 降级为 schema / key-fields

优点：

- 稳定性高。
- 减少由测试数据变化造成的误报。
- 仍能检查分页结构和 item 字段集合。

缺点：

- 对具体样本值变化的捕捉能力变弱。
- 如果业务需要验证列表第一条具体内容，需要另设专项检查。

### 方案 C：list 使用固定筛选条件

优点：

- 可验证固定样本是否能通过列表查询查到。
- 比默认列表第一条更稳定。

缺点：

- 需要脚本新增查询参数支持。
- 需要确认 `/work-orders` 的筛选参数、排序规则和返回结构稳定。
- 仍需要处理空结果或固定样本缺失时的失败策略。

建议：

- 短期采用方案 B 的方向，降低默认 list 快照对首条样本的依赖。
- 中期评估方案 C，通过固定筛选验证 `SNAPSHOT-WO-001` 是否可被列表查询命中。
- 不建议继续强依赖默认列表第一条完整样本。

## 6. workorders.stats 当前问题

当前脚本请求：

```text
GET /work-orders/stats
```

当前 `workorders.stats` 保存完整归一化统计结构和数值，包括：

- `summary.total_count`
- `summary.assigned_count`
- `summary.pending_count`
- `summary.overdue_count`
- `by_status`
- `by_priority`
- `by_type`
- `by_assignee`
- `overdue_top`

当前风险：

- 新增工单会改变 `total_count`。
- 派单会改变 `assigned_count` 和 `by_assignee`。
- 状态变化会改变 `by_status`。
- 优先级、类型等固定字段会改变对应分组计数。
- 固定工单样本不能固定全局统计，因为 stats 面向当前数据集整体。

因此，stats 数值适合作为统计口径专项检查，但不适合作为写入型 e2e 后的默认稳定快照。

## 7. workorders.stats 治理方案

### 方案 A：继续保留完整 numeric stats

优点：

- 能捕捉统计口径变化。
- 对统计回归保护最强。

缺点：

- 对测试数据变化高度敏感。
- 写入型 e2e 后容易误报。
- 不适合当前共享本地测试库和默认手动回归链路。

### 方案 B：拆成 schema snapshot 和 numeric snapshot

说明：

- schema snapshot 默认检查字段结构、分组字段名和数组 item schema。
- numeric snapshot 仅在固定数据集、隔离环境或专项模式下检查统计值。

优点：

- 兼顾稳定性与统计口径保护。
- 默认模式减少误报。
- 专项模式仍保留统计数值对照能力。

缺点：

- 脚本需要支持更细粒度策略。
- baseline 维护规则需要区分 schema 与 numeric。

### 方案 C：stats 只保留字段结构

优点：

- 最稳定。
- 最适合写入型 e2e 后运行。

缺点：

- 无法发现统计数值错误。
- 对 stats 口径变更的保护不足。

建议：

- 短期采用方案 B 的方向。
- 默认运行 stats schema / key-fields 检查。
- numeric stats 对照作为手动专项检查。
- 在有固定数据集或隔离环境前，不建议把 numeric stats 接入 CI。

## 8. 运行顺序策略

建议当前运行顺序：

```bash
node scripts/e2e/bootstrap-api-snapshot-data.mjs
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
```

规则：

- 快照检查优先在写入型 e2e 前运行。
- 如果先运行了写入型 e2e，不应直接 update baseline。
- 写入型 e2e 后若必须跑快照，应优先运行 schema / key-fields 模式。
- normalized / numeric 模式应在固定数据集、隔离环境或明确可解释的数据状态下运行。
- 当前不建议在写入型 e2e 后继续要求 full normalized snapshot 通过。

## 9. 后续脚本调整建议

建议后续小步实现。

### LS-1：list 快照降级策略

- list 默认只保留 schema / key-fields。
- 不再强依赖第一条完整样本。
- 保留 pagination 字段结构、item 字段集合和关键字段存在性。

实施状态：

- 已实施 `workorders.list` 稳定快照策略。
- `workorders.list` 不再保存默认第一页第一条完整归一化样本。
- 当前保留 `snapshot_type`、顶层字段集合、data shape、pagination 结构、pagination 字段集合、item 字段集合、`item_count_category`、固定工单是否出现在列表中以及固定工单业务编号。
- `pagination.total / total_pages` 继续归一化，不强校验具体数值。
- `contains_snapshot_workorder` 已改为通过 `/work-orders?keyword=<SNAPSHOT_WORKORDER_NO>` 分页查询固定工单，并在每页结果中按 `woCode / code` 精确匹配，不再依赖默认列表第一页 items。
- 本次未修改 `workorders.stats` 策略，也不调整 `workorders.stats` numeric baseline；stats 拆分留到后续单独治理。
- `workorders.list` 降级策略已进入收口复核，复核文档见 `docs/testing/api-snapshot-workorders-list-closure-review.md`。

### LS-2：stats 拆分策略

- stats schema snapshot 默认运行。
- stats numeric snapshot 仅手动专项运行。
- baseline 文件或脚本输出需要明确区分 schema 与 numeric。

设计状态：

- `workorders.stats` 快照拆分策略已独立成文，见 `docs/testing/api-snapshot-workorders-stats-split-plan.md`。
- 建议下一步进入 ST-1，将默认 `workorders.stats` 转为 schema snapshot。
- `workorders.stats` numeric baseline 仍不应由写入型 e2e 后的数据直接更新。

### LS-3：运行模式扩展

可考虑支持：

```text
SNAPSHOT_STABILITY_MODE=stable|full
```

或按 snapshot 配置策略：

- `workorders.list`: stable schema / key-fields
- `workorders.stats`: stable schema + optional numeric
- `workorders.detail`: fixed business key normalized
- `workorders.logs`: fixed business key normalized

本阶段不实现。

## 10. baseline 维护规则补充

baseline 维护建议：

- 写入型 e2e 后导致 `workorders.list` 或 `workorders.stats` 变化，不应直接 update baseline。
- 应先判断是否属于数据波动。
- 如果只是统计数值变化，应避免提交 baseline 更新。
- 如果只是列表首条变化，应避免提交 baseline 更新。
- 如果接口结构变化，才考虑更新 schema baseline。
- 如果确需更新 numeric baseline，必须说明固定数据集、运行顺序和数据来源。

## 11. 是否接入 CI

当前不建议接入 CI。

原因：

- `workorders.stats` 仍受写入型 e2e 和当前测试库数据影响。
- `workorders.list` 已降低对首条样本和排序的依赖，固定工单命中检查应通过 keyword 分页查询后再做 `woCode / code` 精确匹配。
- stats 策略治理完成前，full normalized snapshot 误报风险仍较高。

后续可考虑：

- 先接入 schema 模式的 manual workflow。
- 再评估 release-smoke label。
- 暂不进入常规 PR CI。

## 12. 暂缓范围

继续暂缓：

- 接入 CI。
- 增加更多接口。
- 写入接口快照。
- 状态流转接口快照。
- stats numeric 快照进入默认流程。

## 13. 结论

建议先收口本文设计。

下一步优先做 `workorders.stats` schema snapshot 实施。当前固定样本 baseline 可以继续作为详情和日志快照锚点，但 `workorders.stats` 不应继续以 full normalized 数值对照作为写入型 e2e 后的稳定要求。
