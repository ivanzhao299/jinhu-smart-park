# JinHu Smart Park workorders.stats schema snapshot 收口复核

## 1. 复核目的

本文用于复核 ST-1：`workorders.stats` 默认 schema snapshot 实施是否达到阶段性收口标准，并明确后续是否进入 ST-2：stats numeric 专项模式设计。

## 2. ST-1 实施背景

`workorders.list` 已完成降级和收口，不再依赖默认列表第一页第一条完整样本。

ST-1 前，剩余不稳定点集中在 `workorders.stats` numeric count。`first-release-workorders.mjs` 会创建并派单工单，导致 stats summary 和分组统计变化。

在 exact numeric baseline 策略下，写入型 e2e 后默认快照会因为 numeric count 变化失败。

## 3. 已完成调整

ST-1 已完成以下调整：

- 新增 `normalizeWorkorderStatsSchema(stats)`。
- 默认 `workorders.stats` 输出 `snapshot_type: "workorders.stats.schema"`。
- baseline 已从 numeric payload 转为 schema payload。
- numeric 专项模式未实现。

本轮未修改业务代码、bootstrap 脚本、CI、package.json / pnpm-lock.yaml。

## 4. 当前保留内容

当前 `workorders.stats` schema snapshot 保留：

- 顶层字段集合 `top_level_keys`。
- `summary.keys`。
- `summary.numeric_fields`。
- `summary.numeric_field_types`。
- `groups.by_assignee`。
- `groups.by_priority`。
- `groups.by_status`。
- `groups.by_type`。
- 各 group 的 `item_count_category`。
- 各 group 的 `item_fields`。
- 各 group 的 `numeric_fields`。
- 各 group 的 `numeric_field_types`。
- `overdue_top` array shape。

## 5. 已弱化内容

默认快照不再强校验：

- `summary.total_count`。
- `summary.assigned_count`。
- `summary.pending_count`。
- `summary.overdue_count`。
- `by_status[].count`。
- `by_priority[].count`。
- `by_type[].count`。
- `by_assignee[].count`。

这些 numeric count 后续如需保护，应进入 ST-2 的 numeric 专项模式设计。

## 6. baseline 更新复核

baseline 更新复核结论：

- baseline 主要变化集中在 `workorders.stats`。
- `workorders.stats` 已转为 schema payload。
- `workorders.list / detail / logs / overdue / slaRules` 未发生无关策略变化。
- `units.*` 未发生无关策略变化。
- 未发现 token、密码、Bearer、request id、trace id、原始 UUID、ISO 时间戳、文件 URL、signed URL。

该 baseline 更新符合 ST-1 目标。

## 7. 写入型 e2e 后验证

上一阶段已执行：

- `node scripts/e2e/first-release-workorders.mjs`
- 固定编号快照检查

验证结论：

- `first-release-workorders.mjs` 通过。
- 写入型 e2e 后固定编号快照检查通过。
- `workorders.stats` 不再因 numeric count 变化失败。
- 该结果符合 ST-1 目标。

## 8. 当前剩余风险

当前剩余风险：

- numeric 专项模式尚未实现。
- 默认 schema snapshot 不再覆盖具体统计数值回归。
- 如需校验统计口径，仍需后续 ST-2。
- 快照仍未接入 CI。

## 9. 收口判断

建议判断：

- ST-1 可阶段性收口。
- 不建议立即接入 CI。
- 不建议继续修改 stats schema 策略。
- 下一步进入 ST-2：stats numeric 专项模式设计。

理由：

- 默认快照已经避开写入型 e2e 后的 stats numeric 波动。
- baseline 已切换为结构稳定的 schema payload。
- 写入型 e2e 后验证已覆盖本轮核心风险。
- numeric count 的统计口径保护需要单独设计运行方式、baseline 形态和数据前置条件。

## 10. 后续建议

下一步建议进入 ST-2：stats numeric 专项模式设计，重点明确：

- numeric baseline 是否保留。
- numeric snapshot 如何显式运行。
- 是否需要独立 baseline 文件。
- 是否需要固定数据集或隔离环境。
- numeric baseline 更新如何审查。

## 11. 结论

`workorders.stats` schema snapshot 已达到阶段性收口标准。

当前建议收口 ST-1，继续暂缓 CI，下一阶段进入 ST-2：stats numeric 专项模式设计。
