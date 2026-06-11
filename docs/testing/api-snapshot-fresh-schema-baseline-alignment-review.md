# JinHu Smart Park fresh schema baseline 对齐审查

## 1. 审查目的

本文用于记录 SB-3 默认 schema baseline 对齐到新版 snapshot 固定关联模型的执行环境、命令、diff 审查和结论。

本阶段允许更新默认 baseline `scripts/e2e/snapshots/first-release-api-snapshots.json`，但不修改快照脚本，不生成 numeric baseline，不修改业务代码，不接入 CI。

## 2. 执行前提

本次使用 fresh 隔离库：

```text
jinhu_smart_park_snapshot_assoc
```

API base URL：

```text
http://localhost:3002/api/v1
```

执行前只读门禁结果：

- `current_database = jinhu_smart_park_snapshot_assoc`
- `SNAPSHOT-BLD-001 = 1`
- `SNAPSHOT-FLR-001 = 1`
- `SNAPSHOT-UNIT-001 = 1`
- `SNAPSHOT-WO-001 = 1`
- `WO-% 回归工单 = 0`
- `SNAPSHOT-FLR-001` 关联 `SNAPSHOT-BLD-001`
- `SNAPSHOT-UNIT-001` 关联 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`
- `SNAPSHOT-WO-001` 关联 `SNAPSHOT-UNIT-001`

本阶段未运行 `node scripts/e2e/first-release-workorders.mjs`，未生成 numeric baseline。

## 3. 执行命令

更新前默认 schema 普通检查：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

结果：按预期失败，失败范围为固定关联模型和 fresh 数据集差异。

更新默认 schema baseline：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
UPDATE_SNAPSHOTS=true \
node scripts/e2e/first-release-api-snapshots.mjs
```

更新后默认 schema 复查：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

结果：通过。

## 4. baseline 更新摘要

更新文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.json
```

baseline 对齐目标：

```text
SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001
```

更新涉及 snapshot：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`
- `workorders.logs`
- `workorders.stats`

更新后关键形态：

- `units.detail` 对齐到 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- `units.list` 的 first item 对齐到 `SNAPSHOT-UNIT-001` 固定关联模型。
- `units.statistics` 对齐 fresh 隔离库固定数据集：`SNAPSHOT-BLD-001`、`JH-B01`、`JH-B02`。
- `workorders.detail` 关联 `SNAPSHOT-UNIT-001`，并通过 unit 关联 snapshot building / floor。
- `workorders.list` 仍为 `snapshot_type: "workorders.list.stable"`。
- `workorders.stats` 仍为 `snapshot_type: "workorders.stats.schema"`。

## 5. diff 审查

diff 审查结论：

- diff 主要集中于 fixed unit / workorder / building / floor 关联形态。
- `units.detail` 已对齐 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- `units.list` 已对齐新版固定样本。
- `units.statistics` 可由 fresh 隔离库固定数据集解释。
- `workorders.detail` 已关联 `SNAPSHOT-UNIT-001`。
- `workorders.list` 仍为稳定结构快照。
- `workorders.logs` 保留业务日志编号 `WOL-202606-000001`，该编号来自 fresh 隔离库工单创建日志；ID 和时间字段仍为 `<normalized>`。
- `workorders.stats` 仍为 schema snapshot，未保存具体 numeric count。
- 未发现 token / password / Bearer。
- 未发现 request id / trace id。
- 未发现原始 UUID。
- 未发现 ISO 时间戳。
- 未发现文件 URL / signed URL。
- 未生成或修改 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- 未修改快照脚本。

## 6. 验证结果

已执行：

- 更新前默认 schema 普通检查：按预期失败。
- 默认 schema `UPDATE_SNAPSHOTS=true`：更新成功。
- 更新后默认 schema 复查：通过，输出 `First-release API snapshots match baseline`。
- `git diff --check`：通过。

建议检查 `pnpm lint` 与 `pnpm typecheck`。本次只更新 JSON baseline 和文档，不执行 build。

## 7. 当前未做事项

本阶段未做：

- 未修改 `scripts/e2e/first-release-api-snapshots.mjs`。
- 未修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 未生成 numeric baseline。
- 未接入 CI。
- 未修改业务代码。
- 未修改 seed / migration。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。

## 8. 结论

默认 schema baseline 已对齐新版 snapshot 固定关联模型。

建议进入 SB-3 收口复核。numeric baseline 生成仍应暂停，待 SB-3 收口后再进入 ST-2B-1C。
