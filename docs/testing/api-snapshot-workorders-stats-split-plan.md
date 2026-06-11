# JinHu Smart Park workorders.stats 快照拆分策略设计

## 1. 设计目的

本文用于治理 `workorders.stats` numeric 计数在写入型 e2e 后的波动问题，明确后续是否将 stats 快照拆分为 schema snapshot 与 numeric snapshot。

本文先用于设计；后续 ST-1 已按本文方向实施默认 stats schema snapshot。当前仍不实现 numeric 专项模式，不接入 CI。

## 2. 背景

`workorders.list` 已完成降级并收口，当前不再依赖默认列表第一页第一条完整样本。

当前剩余 mismatch 集中在 `workorders.stats`。`first-release-workorders.mjs` 会通过 `POST /work-orders` 创建新工单，并通过 `POST /work-orders/:id/assign` 派单。新增和派单会影响 stats summary 和分组统计。

实施前，`workorders.stats` 仍为 exact numeric baseline。`compareSnapshots` 会对 baseline 与实际响应做 `JSON.stringify(..., null, 2)` 后的精确比较，因此写入型 e2e 后的计数变化会直接导致 mismatch。

ST-1 实施后，默认 `workorders.stats` 已转为 schema snapshot，不再保存 numeric count 具体值。

## 3. 当前 workorders.stats 快照内容

当前脚本请求：

```text
GET /work-orders/stats
```

ST-1 实施前，在 normalized 模式下，脚本通过 `normalizeValue(data, { preserveArrays: true })` 保存完整归一化统计结构和数组内容。

当前 baseline 覆盖：

- `summary`
- `by_status`
- `by_priority`
- `by_type`
- `by_assignee`
- `overdue_top`

旧 numeric baseline 中包含具体 numeric count，例如：

- `summary.total_count`
- `summary.assigned_count`
- `summary.pending_count`
- `summary.overdue_count`
- `by_status[].count`
- `by_priority[].count`
- `by_type[].count`
- `by_assignee[].count`
- `by_assignee[].done_count`
- `by_assignee[].overdue_count`
- `by_assignee[].avg_finish_minutes`

## 4. 波动来源

`first-release-workorders.mjs` 会写入和流转工单：

- 生成 `WO-${TEST_RUN_ID}` 工单编号。
- 创建 `wo_type=repair`、`priority=medium`、`source_type=manual` 的工单。
- 使用当前登录用户执行派单。
- 验证派单幂等 replay 和 conflict。

这些行为会影响：

- `summary.total_count`
- `summary.assigned_count`
- `summary.pending_count`
- `by_status.*.count`
- `by_priority.*.count`
- `by_type.*.count`
- `by_assignee.*.count`

如果后续 e2e 增加关闭、完成、逾期或满意度相关动作，还可能继续影响 `closed_count`、`done_count`、`overdue_count`、`avg_dispatch_minutes`、`avg_finish_minutes`、`avg_satisfaction` 等字段。

## 5. 当前策略问题

固定工单样本可以稳定 `workorders.detail` 和 `workorders.logs`，但不能固定全局统计。

`workorders.stats` 是当前测试库、当前租户 / 园区上下文下的全局聚合结果。任意新增、派单、状态变化、测试数据重置或本地手动数据都可能改变 numeric count。

因此，exact numeric baseline 适合固定数据集或隔离测试库，不适合在运行写入型 e2e 后直接作为默认稳定快照。将写入型 e2e 后的 stats 数值固化进 baseline，会让原本匹配干净 baseline 的环境失败，也会掩盖真实的数据污染来源。

## 6. 拆分方案

建议后续将 `workorders.stats` 拆成 schema snapshot 与 numeric snapshot。

### 6.1 workorders.stats.schema

默认运行。

建议检查：

- 顶层字段集合。
- `summary` 字段集合。
- 分组字段集合，例如 `by_status`、`by_priority`、`by_type`、`by_assignee`、`overdue_top`。
- 分组数组 item 字段集合。
- numeric 字段是否存在。
- numeric 字段类型类别，例如 `number`。
- 分组 item count category，例如 `empty / one / many`。

不检查具体 numeric 值。

适合发现：

- stats 响应结构变化。
- 统计字段被删除或改名。
- 分组数组结构变化。
- numeric 字段类型异常。

不适合发现：

- 具体统计数值错误。
- 统计口径偏差但结构不变的回归。

### 6.2 workorders.stats.numeric

手动专项运行。

建议检查：

- `summary` 具体数值。
- `by_status` 具体数值。
- `by_priority` 具体数值。
- `by_type` 具体数值。
- `by_assignee` 具体数值。
- 必要时检查 `overdue_top` 的具体排序和值。

仅建议在以下条件运行：

- 固定数据集。
- 独立测试库。
- 未执行写入型 e2e。
- 或执行前已完成数据 reset。
- 或有明确的 snapshot bootstrap / seed 前置状态说明。

numeric baseline 更新必须单独审查，不应与 list 稳定性、接口范围扩展或普通文档更新混在一起。

## 7. 运行模式建议

后续实现可考虑支持独立模式：

```text
SNAPSHOT_STATS_MODE=schema|numeric
```

或统一稳定性模式：

```text
SNAPSHOT_STABILITY_MODE=stable|full
```

短期建议：

- 默认运行 `schema`。
- `numeric` 需要显式启用。
- 写入型 e2e 后只允许 schema 检查。
- full numeric 检查必须说明数据前置状态。

本阶段不实现环境变量和脚本逻辑。

## 8. baseline 维护规则

baseline 维护建议：

- 写入型 e2e 后出现 stats numeric mismatch，不应直接 `UPDATE_SNAPSHOTS=true`。
- stats schema 变化可以在确认接口结构预期变化后更新 schema baseline。
- stats numeric baseline 只能在固定数据集或隔离环境下更新。
- stats numeric baseline 更新必须单独 PR 或单独审查段落。
- PR 中必须说明数据来源、运行顺序、是否执行过写入型 e2e、是否使用固定样本。
- 如果只是 `first-release-workorders.mjs` 新增 / 派单工单导致计数变化，不应提交 numeric baseline 更新。

## 9. CI 接入判断

当前不建议 full numeric stats 进入 CI。

后续可考虑：

- 只让 stats schema snapshot 进入 manual workflow。
- 在 release-smoke label 下运行 schema 模式。
- numeric stats 保留为手动专项或隔离环境检查。

在固定数据集、baseline 更新审批和误报治理稳定前，不建议把 stats numeric 检查接入常规 PR CI。

## 10. 后续实施建议

建议后续拆成两个小 PR。

### ST-1：stats schema snapshot 实施

- 将默认 `workorders.stats` 从 exact numeric 降级为 schema snapshot。
- 更新 baseline。
- 验证写入型 e2e 后不再因 stats numeric 波动失败。
- 不引入 CI。
- 不修改业务代码。

实施状态：

- 已实施。
- 默认 `workorders.stats` 输出 `snapshot_type=workorders.stats.schema`。
- 当前保留顶层字段集合、summary 字段集合、summary numeric 字段名与类型、各分组 item 字段集合、各分组 numeric 字段名与类型、分组 item count category、`overdue_top` shape。
- 当前不保存 `summary.total_count`、`summary.assigned_count`、`by_status[].count`、`by_priority[].count`、`by_type[].count`、`by_assignee[].count` 等具体数值。
- 写入型 e2e 后默认快照检查不再因 stats numeric count 变化失败。

### ST-2：stats numeric 专项模式设计 / 实施

- 决定是否保留 numeric baseline。
- 决定 numeric baseline 是否使用独立文件或独立 snapshot name。
- 设计显式运行方式。
- 明确固定数据集前置检查。
- 明确 numeric baseline 更新审查要求。

## 11. 暂缓范围

继续暂缓：

- 直接修改脚本。
- 直接更新 stats baseline。
- 接入 CI。
- 扩展更多接口。
- 写入接口快照。
- 状态流转接口快照。
- 将 stats numeric 检查纳入默认回归。

## 12. 结论

建议拆分 `workorders.stats` schema / numeric。

默认快照已转向 schema 检查，降低写入型 e2e 后的误报。numeric stats 保留为后续手动专项，仅在固定数据集或隔离环境中运行。

下一步建议进入 ST-2：stats numeric 专项模式设计 / 实施。
