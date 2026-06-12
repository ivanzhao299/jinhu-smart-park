# JinHu Smart Park workorders.stats numeric baseline 建立审查

## 1. 审查目的

本文用于记录 ST-2B-1C 隔离固定数据集下建立 `workorders.stats.numeric` baseline 的执行环境、命令、diff 审查和结论。

本阶段只新增 numeric baseline 文件和审查文档，不修改快照脚本，不修改默认 baseline，不修改业务代码，不接入 CI。

## 2. 执行前提

本次使用 fresh 隔离库：

```text
jinhu_smart_park_snapshot_assoc
```

API base URL：

```text
http://localhost:3002/api/v1
```

执行前门禁：

- 默认 schema baseline 已通过。
- `SNAPSHOT-BLD-001 = 1`
- `SNAPSHOT-FLR-001 = 1`
- `SNAPSHOT-UNIT-001 = 1`
- `SNAPSHOT-WO-001 = 1`
- `WO-% = 0`
- 固定关联链路成立：
  - `SNAPSHOT-FLR-001` 关联 `SNAPSHOT-BLD-001`
  - `SNAPSHOT-UNIT-001` 关联 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`
  - `SNAPSHOT-WO-001` 关联 `SNAPSHOT-UNIT-001`

本阶段未运行 `node scripts/e2e/first-release-workorders.mjs`，未运行其它写入型工单 e2e，未修改脚本，未接入 CI。

## 3. 执行命令

默认 schema 快照检查：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

numeric baseline 生成：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
UPDATE_SNAPSHOTS=true \
node scripts/e2e/first-release-api-snapshots.mjs
```

numeric 普通检查：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

默认 schema 复查：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

## 4. 新增 baseline 文件

新增文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.numeric.json
```

该文件用途是 `workorders.stats` numeric 专项检查。它不是默认 baseline，不进入普通 CI，不替代默认 schema baseline。

## 5. numeric baseline 内容

新增 baseline 中 `workorders.stats` 输出：

```text
snapshot_type: "workorders.stats.numeric"
```

包含：

- `summary`
- `by_status`
- `by_priority`
- `by_type`
- `by_assignee`
- `overdue_top`

`overdue_top` 为 schema-only shape：

```text
type = array
item_count_category = empty
item_fields = []
```

`overdue_top` 不做 numeric 强校验，仅保留 shape 检查。

numeric baseline 同时保留 `workorders.logs` 的列表结构，但 numeric 路径会将按月份生成的工单日志业务编号归一化：

```text
WOL-YYYYMM-*
```

归一化为：

```text
<normalized-workorder-log-code>
```

该归一化仅用于 numeric snapshot 路径，避免 numeric 专项检查因日志月份流水号变化失败。

## 6. numeric count 审查

fresh 固定数据集中 active 工单数为 1，且唯一 active 工单为：

```text
SNAPSHOT-WO-001
```

数据库只读审查结果：

- `active_workorders = 1`
- `snapshot_workorders = 1`
- `status_10 = 1`
- `priority_medium = 1`
- `type_repair = 1`
- `unassigned = 1`

numeric baseline 中对应：

- `summary.total_count = 1`
- `summary.pending_count = 1`
- `summary.assigned_count = 0`
- `summary.in_progress_count = 0`
- `summary.done_count = 0`
- `summary.overdue_count = 0`
- `summary.closed_count = 0`
- `by_status = [{ key: "10", count: 1 }]`
- `by_priority = [{ key: "medium", count: 1 }]`
- `by_type = [{ key: "repair", count: 1 }]`
- `by_assignee = [{ assignee_name: "未派单", count: 1, done_count: 0, overdue_count: 0 }]`

因此，各 numeric count 可由 fresh 固定数据集解释。

## 7. diff 审查

diff 审查结论：

- 更新 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- 未修改默认 baseline `scripts/e2e/snapshots/first-release-api-snapshots.json`。
- 包含 `workorders.stats.numeric`。
- 包含 `summary / by_status / by_priority / by_type / by_assignee / overdue_top`。
- `overdue_top` 为 schema-only shape。
- `workorders.logs.code` / `workorders.logs.logCode` 使用 `<normalized-workorder-log-code>`，不再冻结具体 `WOL-YYYYMM-*`。
- 未发现 token / password / Bearer。
- 未发现 request id / trace id。
- 未发现原始 UUID。
- 未发现 ISO 时间戳。
- 未发现文件 URL / signed URL。
- 快照脚本仅做 numeric snapshot 路径下的 `workorders.logs` 日志编号归一化。
- 未生成其它 baseline 文件。

## 8. 当前未做事项

本阶段未做：

- 未修改默认 baseline。
- 未修改业务接口脚本以外的 e2e 脚本。
- 未修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 未修改业务代码。
- 未运行写入型 e2e。
- 未接入 CI。

## 9. 当前风险

当前风险：

- numeric baseline 对 fresh 固定数据集强依赖。
- 如果 seed / bootstrap / fixed sample 变化，需要单独审查并更新 numeric baseline。
- numeric baseline 不应在污染库中更新。
- numeric baseline 不应进入普通 CI。

## 10. 结论

`workorders.stats.numeric` baseline 可接受。

建议 ST-2B-1C 阶段性收口，并进入 ST-2B-1C 收口复核。numeric baseline 后续更新必须继续使用隔离固定数据集，并单独审查 diff。
