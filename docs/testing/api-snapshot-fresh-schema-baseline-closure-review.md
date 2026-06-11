# JinHu Smart Park fresh schema baseline 对齐收口复核

## 1. 复核目的

本文用于复核 SB-3：默认 schema baseline 对齐新版 snapshot 固定关联模型是否达到阶段性收口标准，并明确是否可以重新进入 ST-2B-1C：生成 `workorders.stats.numeric` baseline。

本阶段只做文档复核，不修改快照脚本，不修改默认 baseline，不生成 numeric baseline，不修改业务代码，不接入 CI。

## 2. 实施背景

SB-1 已实现 `scripts/e2e/bootstrap-api-snapshot-data.mjs` 固定 building / floor，fixed sample 不再依赖 seed 中第一个可用 building / floor。

SB-2 已确认 fresh 隔离库默认 schema 快照失败的主要原因是默认 baseline 仍保留历史 `BLD-* / FLR-*` 样本形态，而新版 bootstrap 已稳定生成 snapshot 固定关联模型。

SB-3 已将默认 baseline 对齐到新版固定关联模型。numeric baseline 仍未生成。

## 3. 对齐目标

SB-3 对齐目标为：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

当前默认 baseline 中：

- `units.detail` 已对齐 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- `units.list` 的 first item 已对齐 snapshot building / floor。
- `workorders.detail` 已关联 `SNAPSHOT-UNIT-001`，并通过 unit 关联 snapshot building / floor。

## 4. baseline 更新范围

SB-3 baseline 更新涉及以下 snapshot：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`
- `workorders.logs`
- `workorders.stats`

实际范围以 `docs/testing/api-snapshot-fresh-schema-baseline-alignment-review.md` 为准。

## 5. baseline diff 复核

diff 复核结论：

- diff 主要集中在 fixed building / floor / unit / workorder 关联形态。
- `units.detail` / `units.list` 已对齐 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- `units.statistics` 已对齐 fresh 隔离库固定数据集。
- `workorders.detail` 已关联 `SNAPSHOT-UNIT-001`。
- `workorders.list` 仍为 `snapshot_type: "workorders.list.stable"`。
- `workorders.stats` 仍为 `snapshot_type: "workorders.stats.schema"`。
- 未发现 token / password / Bearer。
- 未发现 request id / trace id。
- 未发现原始 UUID。
- 未发现 ISO 时间戳。
- 未发现文件 URL / signed URL。
- `WOL-202606-000001` 为 fresh 隔离库业务日志编号，ID 和时间字段仍为 `<normalized>`。

## 6. 验证结果

SB-3 已完成以下验证：

- 更新前默认 schema 普通检查按预期失败。
- 使用 `UPDATE_SNAPSHOTS=true` 更新默认 baseline。
- 更新后默认 schema 普通检查通过，输出 `First-release API snapshots match baseline`。
- `git diff --check` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。

## 7. 当前未做事项

本阶段未做：

- 未修改 `scripts/e2e/first-release-api-snapshots.mjs`。
- 未修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 未生成或修改 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- 未接入 CI。
- 未修改业务代码。
- 未修改 seed / migration。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。

## 8. 剩余风险

当前剩余风险：

- numeric baseline 尚未建立。
- numeric baseline 仍需在 ST-2B-1C 单独生成和审查。
- fresh 隔离库作为 baseline 前置数据集时，需要继续保持 `WO-% = 0`。
- 如果后续 seed / bootstrap 改变，默认 schema baseline 需要重新审查。
- `workorders.logs` 仍保留业务日志编号，后续如需进一步降低序列依赖，应单独设计。

## 9. 收口判断

建议判断：

- SB-3 可阶段性收口。
- 不建议在本阶段接入 CI。
- 不建议在本阶段生成 numeric baseline。
- 可以进入 ST-2B-1C：生成 `workorders.stats.numeric` baseline。

## 10. 后续建议

建议下一步进入 ST-2B-1C：生成 `workorders.stats.numeric` baseline。

进入 ST-2B-1C 前仍需确认：

- 使用 fresh 隔离库。
- 固定关联链路存在且唯一。
- `WO-% = 0`。
- 默认 schema 快照通过。
- 不运行写入型 e2e。
- numeric baseline 单独 PR 或单独审查。
