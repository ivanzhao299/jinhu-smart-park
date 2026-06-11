# JinHu Smart Park 接口快照固定样本 Baseline 更新审查

## 1. 审查目的

本文用于记录接口快照 baseline 从旧样本切换到固定样本的审查过程，确认 `SNAPSHOT-WO-001 / SNAPSHOT-UNIT-001` 能作为当前快照详情、日志和房源样本的稳定锚点。

本阶段允许更新快照 baseline 和必要文档，不修改业务代码、不修改快照脚本、不修改 bootstrap 脚本、不修改 seed / migration、不接入 CI。

## 2. 更新背景

前置工作已完成：

- `scripts/e2e/first-release-api-snapshots.mjs` 已支持固定业务编号。
- `scripts/e2e/bootstrap-api-snapshot-data.mjs` 已可幂等准备固定样本。
- bootstrap 已可识别或创建 `SNAPSHOT-WO-001`。
- bootstrap 已可识别或创建 `SNAPSHOT-UNIT-001`。

更新前问题：

- 当前 baseline 仍指向旧工单样本、旧房源样本和旧统计数据。
- 固定编号快照可以定位固定样本，但对照会失败。
- 需要单独更新 baseline，并审查 diff 是否可解释、无敏感信息、无动态原值。

## 3. 本次更新范围

本次更新 baseline 文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.json
```

本次使用固定样本：

- `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001`
- `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001`

当前 baseline 仍包含 9 个 snapshot：

- `workorders.list`
- `workorders.detail`
- `workorders.logs`
- `workorders.stats`
- `workorders.overdue`
- `workorders.slaRules`
- `units.list`
- `units.detail`
- `units.statistics`

## 4. 执行命令

已执行 bootstrap 幂等检查：

```bash
node scripts/e2e/bootstrap-api-snapshot-data.mjs
```

结果：

- 识别已有 `SNAPSHOT-UNIT-001`。
- 识别已有 `SNAPSHOT-WO-001`。
- 未重复创建固定样本。

更新前固定编号普通检查：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 node scripts/e2e/first-release-api-snapshots.mjs
```

结果：

- 登录成功。
- 固定工单定位成功。
- 固定房源定位成功。
- 接口请求成功。
- 快照对照失败，失败原因是 baseline 仍指向旧样本和旧统计数据。

更新 baseline：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
```

更新后普通检查：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 node scripts/e2e/first-release-api-snapshots.mjs
```

结果：

- 固定编号快照匹配 baseline。

## 5. baseline diff 审查

本次 baseline diff 主要变化：

- `workorders.detail` 切换为 `SNAPSHOT-WO-001`。
- `workorders.detail` 中关联房源切换为 `SNAPSHOT-UNIT-001`。
- `workorders.logs` 切换为固定工单创建日志。
- `units.detail` 切换为 `SNAPSHOT-UNIT-001`。
- `units.list` 的首条样本切换为 `SNAPSHOT-UNIT-001`。
- `units.statistics` 因新增固定空置房源产生统计变化。
- `workorders.stats` 因固定工单和既有写入型回归数据产生计数变化。
- `workorders.list` 的首条样本仍受当前测试库排序和写入型 e2e 影响。

可解释变化：

- 工单详情从 `WO-*` 回归工单切换到 `SNAPSHOT-WO-001`。
- 工单日志从派单日志切换到固定工单的创建日志。
- 房源详情从 `BUNIT-*` 回归房源切换到 `SNAPSHOT-UNIT-001`。
- 房源统计新增 `rentalStatus=10` 空置样本，`totalUnits`、`totalArea`、`vacantUnits` 和 `occupancyRate` 随之变化。
- 工单统计中的 `total_count`、`assigned_count`、`pending_count`、`by_status`、`by_priority`、`by_type`、`by_assignee` 随测试库当前工单数据变化。

未发现无关 snapshot 结构变化。

## 6. 敏感信息检查

已检查 baseline 文件，未发现：

- token / access token / refresh token
- password
- Bearer
- request id
- trace id
- 原始 UUID
- ISO 时间戳原值
- 文件 URL
- signed URL

动态字段仍按现有归一化规则保留为：

```text
<normalized>
<normalized-number>
```

## 7. 回归验证

已执行：

- `node scripts/e2e/bootstrap-api-snapshot-data.mjs`：通过，识别已有固定样本。
- 固定编号普通快照检查：更新前按预期失败，失败原因是旧 baseline。
- 固定编号 `UPDATE_SNAPSHOTS=true`：通过，baseline 已更新。
- 固定编号普通快照检查：通过。
- `node scripts/e2e/first-release-workorders.mjs`：通过。
- `node scripts/e2e/first-release-users-assets.mjs`：通过。

写入型 e2e 后再次执行固定编号普通快照检查：

```bash
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 node scripts/e2e/first-release-api-snapshots.mjs
```

结果：

- 固定工单和固定房源仍可定位。
- `workorders.detail`、`workorders.logs` 和 `units.*` 未作为失败项出现。
- 失败项为 `workorders.list` 和 `workorders.stats`。
- 原因是 `first-release-workorders.mjs` 写入并派单了新工单，影响列表首条样本和统计计数。

该失败来源可解释，但说明列表首条和 stats 数值仍不适合在写入型 e2e 之后作为稳定断言。后续需要继续优化列表快照粒度或运行顺序。

## 8. 剩余风险

剩余风险：

- `workorders.list` 仍保留首条样本，容易受写入型 e2e 和排序影响。
- `workorders.stats` 数值仍会受新增工单影响。
- 固定 baseline 依赖 `SNAPSHOT-WO-001 / SNAPSHOT-UNIT-001` 持续存在。
- 不应使用 `ALLOW_SNAPSHOT_FALLBACK=true` 更新或提交 baseline。
- 当前未接入 CI。
- 当前未建立独立测试库隔离或清理策略。

## 9. 审查结论

本次 baseline 更新可接受，建议提交。

接受理由：

- baseline 已切换到固定详情样本 `SNAPSHOT-WO-001 / SNAPSHOT-UNIT-001`。
- 更新后固定编号普通快照检查通过。
- baseline diff 中的字段和统计变化可解释。
- 未发现敏感信息或动态原值。
- 未修改脚本、业务代码、seed、CI 或 package 配置。

注意：

- 写入型工单 e2e 后 `workorders.list/stats` 仍会波动。
- 该问题不阻塞本次固定样本 baseline 更新，但应进入后续收口复核或列表 / stats 稳定性优化。

## 10. 后续建议

建议下一阶段进入固定样本 baseline 收口复核：

- 复核本次 baseline 是否稳定。
- 明确快照运行顺序仍应放在写入型 e2e 之前。
- 评估是否需要调整 `workorders.list`，减少对第一条样本的依赖。
- 评估是否需要将 `workorders.stats` 的数值快照降级为结构或 key fields 校验。
- 暂不接入 CI。
- 暂不继续扩更多接口。

后续同步：固定样本 baseline 收口复核见 `docs/testing/api-snapshot-fixed-baseline-closure-review.md`。`workorders.list / workorders.stats` 波动已作为后续治理项。
