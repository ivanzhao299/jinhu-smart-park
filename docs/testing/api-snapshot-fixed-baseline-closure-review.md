# JinHu Smart Park 接口快照固定样本 Baseline 收口复核

## 1. 复核目的

本文用于复核接口快照 baseline 切换到固定样本后的状态，判断固定样本 baseline 是否可以阶段性收口，并评估 `workorders.list / workorders.stats` 在写入型 e2e 后的波动是否阻塞当前阶段。

本阶段只做文档复核，不修改快照脚本、不修改 bootstrap 脚本、不修改 baseline、不修改 seed / migration、不修改业务代码、不接入 CI。

## 2. baseline 当前状态

当前 baseline 已切换到固定样本：

- 固定工单：`SNAPSHOT-WO-001`
- 固定房源：`SNAPSHOT-UNIT-001`

baseline 仍保持 9 个 snapshot：

- `workorders.list`
- `workorders.detail`
- `workorders.logs`
- `workorders.stats`
- `workorders.overdue`
- `workorders.slaRules`
- `units.list`
- `units.detail`
- `units.statistics`

只读检查确认：

- `workorders.detail.code` / `workorders.detail.woCode` 为 `SNAPSHOT-WO-001`。
- `workorders.logs.first_item.payload.woCode` 为 `SNAPSHOT-WO-001`。
- `units.detail.code` / `units.detail.unitCode` 为 `SNAPSHOT-UNIT-001`。
- `units.list.first_item.code` / `units.list.first_item.unitCode` 为 `SNAPSHOT-UNIT-001`。

## 3. 固定样本覆盖情况

### 工单

- `workorders.detail` 已切换到固定工单。
- `workorders.logs` 已切换到固定工单。
- `workorders.overdue` 仍保持逾期列表结构快照。
- `workorders.slaRules` 仍保持 SLA 规则结构快照。
- `workorders.list` 仍受列表排序和新增工单影响。
- `workorders.stats` 仍受写入型 e2e 影响。

### 房源

- `units.detail` 已切换到固定房源。
- `units.list` 已包含固定房源样本。
- `units.statistics` 随当前测试库数据保持统计快照。

固定样本已经覆盖详情和日志锚点，解决了旧 baseline 依赖临时回归样本的问题。

## 4. baseline 更新审查回顾

上一阶段固定样本 baseline 更新审查结论：

- baseline 更新使用固定编号完成：
  - `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001`
  - `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`
- 更新前普通检查因旧 baseline 失败，符合预期。
- `UPDATE_SNAPSHOTS=true` 更新 baseline 通过。
- 更新后固定编号普通快照检查通过。
- diff 范围可解释，主要来自固定样本切换和统计数据变化。
- 未发现 token、password、Bearer、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。

因此，固定样本 baseline 的切换本身可接受。

## 5. 写入型 e2e 后波动复核

上一阶段在 baseline 更新后执行：

```bash
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
```

其中 `first-release-workorders.mjs` 会创建并派单新工单。该写入行为会影响：

- `workorders.list`
- `workorders.stats`

再次执行固定编号快照检查时，失败项为：

- `workorders.list`
- `workorders.stats`

原因：

- `workorders.list` 当前仍保存列表首条归一化样本，首条会受新增工单、排序和当前测试库数据影响。
- `workorders.stats` 当前保留统计数值，新增并派单工单会改变 `total_count`、`assigned_count`、`by_status`、`by_priority`、`by_type` 和 `by_assignee` 等统计值。

该波动属于当前快照体系的已知限制，不影响固定样本 baseline 的初步收口，但会影响后续 CI / workflow 接入。

## 6. 是否需要调整 list 快照策略

### 方案 A：保持现状

优点：

- 当前已可用。
- 能捕捉列表首条样本的实际响应变化。

缺点：

- 写入型 e2e 后容易波动。
- 仍依赖当前排序和测试库数据。

### 方案 B：list 快照只保留 schema / 字段集合

优点：

- 明显减少数据波动。
- 更适合作为写入型 e2e 后仍可运行的低误报检查。

缺点：

- 降低对列表样本关键字段变化的捕捉能力。

### 方案 C：list 快照增加固定筛选条件

优点：

- 可以让列表样本更稳定。
- 可继续保留部分 key fields 校验。

缺点：

- 需要调整脚本。
- 需要确认接口筛选参数和排序规则稳定。

当前建议：

- 本轮先不修改脚本或 baseline。
- 后续单独设计 list 快照波动治理。
- 优先评估固定筛选条件与 schema / key-fields 分层方案。

## 7. 是否需要调整 stats 快照策略

### 方案 A：继续保留 stats 数值

优点：

- 能捕捉统计口径和数量变化。

缺点：

- 写入型 e2e 后容易变化。
- 对测试数据隔离要求高。

### 方案 B：stats 只保留字段名和结构

优点：

- 稳定性更高。
- 更适合当前共享本地测试库。

缺点：

- 无法捕捉统计数值回归。

### 方案 C：固定数据集下保留 stats 数值

优点：

- 兼顾稳定性与统计口径检查。

缺点：

- 需要更强的数据隔离、运行顺序或专用测试库。

当前建议：

- 本轮先记录风险，不修改脚本或 baseline。
- 后续单独设计 stats 快照策略。
- 优先考虑将 stats 拆成 schema snapshot 与 numeric snapshot，numeric snapshot 只在固定数据集或隔离环境下使用。

## 8. 收口判断

建议判断：

- 固定样本 baseline 可阶段性收口。
- `workorders.list / workorders.stats` 波动不阻塞当前收口。
- 不建议立即接入 CI。
- 不建议在本轮修改脚本。
- 不建议在本轮修改 baseline。

理由：

- 固定样本已经覆盖核心详情和日志锚点。
- 旧临时样本依赖已经被移除。
- baseline 更新审查已确认 diff 可解释且无敏感信息。
- 写入型 e2e 后的波动来源明确，属于 list / stats 快照策略问题，应单独治理。

## 9. 后续建议

建议下一步进入：

```text
list / stats 快照波动治理设计
```

重点评估：

- `workorders.list` 是否降级为 schema / key-fields。
- `workorders.list` 是否增加固定筛选条件。
- `workorders.stats` 是否拆成 schema snapshot 与 numeric snapshot。
- stats 数值是否只在固定数据集或隔离环境下保留。
- 快照是否应明确要求运行在写入型 e2e 之前。
- 是否需要进一步设计手动 workflow / release-smoke label。

在治理完成前，不建议接入常规 CI，也不建议继续扩大接口覆盖范围。

## 10. 结论

接口快照固定样本 baseline 已完成阶段性切换，可以阶段性收口。

`workorders.detail / workorders.logs` 已指向固定工单，`units.detail / units.list` 已指向固定房源。`workorders.list / workorders.stats` 在写入型 e2e 后的波动来源明确，不阻塞当前固定样本 baseline 收口，但应作为下一阶段风险治理重点。下一步建议单独设计 list / stats 快照波动治理策略，暂不接入 CI，暂不修改脚本或 baseline。
