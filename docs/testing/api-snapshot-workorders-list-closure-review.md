# JinHu Smart Park workorders.list 快照降级策略收口复核

## 1. 复核目的

本文用于复核 `workorders.list` 快照降级策略是否稳定，确认其是否满足阶段性收口标准，并判断下一步是否进入 `workorders.stats` 快照拆分策略设计。

本阶段只做文档复核，不修改快照脚本、不修改 bootstrap 脚本、不修改 baseline、不修改业务代码、不修改 seed、不接入 CI。

## 2. 降级前问题

原 `workorders.list` normalized 快照保存默认列表第一页第一条完整归一化样本。

该策略存在明显波动风险：

- `first-release-workorders.mjs` 会创建新工单。
- `first-release-workorders.mjs` 会执行派单流程。
- 新增并派单的工单会影响默认列表排序和第一页首条样本。
- 第一条样本中的工单编号、标题、状态、处理人等业务值会随写入型 e2e 变化。
- 这会导致 `workorders.list` 在写入型 e2e 后产生 baseline mismatch。

因此，原策略适合捕捉首条完整响应变化，但不适合作为写入型 e2e 后的稳定快照。

## 3. 已完成调整

当前 `workorders.list` 已改为稳定结构快照，保留：

- `snapshot_type`
- 顶层字段集合
- data shape
- pagination 结构
- pagination key
- item 字段集合
- `item_count_category`
- `contains_snapshot_workorder`
- `snapshot_workorder_key`

当前不再强依赖：

- `first_item` 完整样本
- 第一条工单业务字段值
- 完整列表顺序
- `pagination.total / total_pages` 具体数值

其中 `contains_snapshot_workorder` 用于确认固定工单样本是否出现在当前列表响应中，`snapshot_workorder_key` 记录使用的固定业务编号，不记录动态 id。

## 4. 行为保持

本轮只调整 `workorders.list` 的快照策略。

未修改：

- 接口实现
- 业务代码
- 后端 controller / service / DTO / entity
- 前端代码
- 全局归一化规则
- `workorders.stats` 策略
- `workorders.detail`
- `workorders.logs`
- `workorders.overdue`
- `workorders.slaRules`
- `units.*`
- bootstrap 脚本
- CI workflow
- `package.json / pnpm-lock.yaml`

因此，本轮变化不影响接口返回结构和业务行为，只影响快照对照粒度。

## 5. baseline 更新复核

baseline 已按新的 `workorders.list` 稳定快照策略更新。

复核结论：

- 主要策略变化集中在 `workorders.list`。
- `workorders.list` 已删除 `first_item` 完整样本。
- `workorders.list` 已新增结构、字段集合和固定工单命中信息。
- `pagination.total / total_pages` 继续归一化，不强校验具体数值。
- `workorders.stats` 仅因当前测试库数据变化同步 numeric 计数值，策略未变化。
- 未发现 token、密码、Bearer、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。

`workorders.stats` 的数值变化不属于本轮策略调整范围，后续应单独治理。

## 6. 写入型 e2e 后验证

上一阶段已执行写入型工单回归：

```bash
node scripts/e2e/first-release-workorders.mjs
```

随后再次使用固定编号运行快照检查：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

验证结果：

- `first-release-workorders.mjs` 通过。
- 写入型 e2e 后 `workorders.list` 未再失败。
- 当前剩余 mismatch 仅为 `workorders.stats`。
- `workorders.stats` mismatch 来自新增并派单工单导致的统计数值变化。

该结果符合本轮目标：降低 `workorders.list` 对默认首条样本、排序和本地测试数据的依赖。

## 7. 当前剩余风险

当前仍存在以下风险：

- `workorders.stats` 仍会随写入型 e2e 变化。
- stats numeric 策略尚未调整。
- 快照仍未接入 CI。
- list 降级后对列表首条具体业务值变化的捕捉能力降低。
- 若未来需要验证固定工单是否出现在列表中，应继续依赖 `contains_snapshot_workorder`，或再设计固定筛选条件。
- 如果固定工单不在默认第一页，`contains_snapshot_workorder` 可能变为 `false`，需要结合排序和筛选策略继续评估。

这些风险不阻塞 `workorders.list` 降级策略阶段性收口，但会影响后续 workflow / CI 接入判断。

## 8. 收口判断

收口判断如下：

- 建议 `workorders.list` 降级策略阶段性收口。
- 不建议立即接入 CI。
- 不建议继续修改 list 策略。
- 不建议因写入型 e2e 后的列表首条变化更新 baseline。
- 下一步建议进入 `workorders.stats` 快照拆分策略设计。

理由：

- 当前 `workorders.list` 已不保存第一条完整样本。
- 当前 `workorders.list` 已保留结构、字段集合、pagination 结构和固定工单命中信息。
- 写入型 e2e 后 `workorders.list` 未再失败。
- 剩余波动已经收敛到 `workorders.stats` numeric 计数。

## 9. 后续建议

下一步建议进入 `workorders.stats` 快照拆分策略设计。

重点评估：

- 将 stats 拆分为 schema snapshot 与 numeric snapshot。
- 默认检查 stats 字段结构、分组字段名和数组 item schema。
- numeric stats 仅在固定数据集、隔离环境或手动专项模式下运行。
- 写入型 e2e 后不要求 full normalized numeric stats 通过。
- stats 策略稳定前继续暂缓 CI / release-smoke label 接入。

## 10. 结论

`workorders.list` 快照降级策略已达到阶段性目标，可以收口。

当前快照体系已经降低了列表首条样本、排序和写入型 e2e 对 `workorders.list` baseline 的影响。后续不应继续围绕 list 做大改，应把治理重点转向 `workorders.stats` 的 schema / numeric 拆分策略。
