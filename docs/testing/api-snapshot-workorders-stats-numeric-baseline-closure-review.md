# JinHu Smart Park workorders.stats numeric baseline 收口复核

## 1. 复核目的

本文用于复核 ST-2B-1C：`workorders.stats` numeric baseline 建立是否达到阶段性收口标准。

本阶段只做文档收口复核，不修改脚本，不修改默认 baseline，不重新生成 numeric baseline，不修改业务代码，不接入 CI。

## 2. 建立背景

ST-2A 已完成 numeric 模式脚本能力，默认 `workorders.stats` 仍使用 schema snapshot，numeric 模式必须通过 `SNAPSHOT_STATS_MODE=numeric` 和 `ALLOW_STATS_NUMERIC_SNAPSHOT=true` 显式启用。

SB-3 已将默认 schema baseline 对齐到新版 fixed association 模型：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

ST-2B-1C 在 fresh 隔离固定数据集下生成了 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`，用于 `workorders.stats` numeric 专项检查。

## 3. 执行前门禁复核

ST-2B-1C baseline 建立前门禁已满足：

- fresh 隔离库：`jinhu_smart_park_snapshot_assoc`。
- `SNAPSHOT-BLD-001 = 1`。
- `SNAPSHOT-FLR-001 = 1`。
- `SNAPSHOT-UNIT-001 = 1`。
- `SNAPSHOT-WO-001 = 1`。
- `WO-% = 0`。
- 固定关联链路成立。
- 默认 schema baseline 已通过。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。
- 未运行其它写入型工单 e2e。

## 4. numeric baseline 内容复核

numeric baseline 已存在：

```text
scripts/e2e/snapshots/first-release-api-snapshots.numeric.json
```

`workorders.stats` 输出类型为：

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

`overdue_top` 不做具体 numeric 强校验。

numeric baseline 同时保留 `workorders.logs` 列表结构。numeric snapshot 路径会将按月份生成的工单日志业务编号 `WOL-YYYYMM-*` 归一化为 `<normalized-workorder-log-code>`，避免 numeric 专项检查因日志月份流水号变化失败。

## 5. numeric count 复核

fresh 固定数据集中 active 工单数为 1，且唯一 active 工单为：

```text
SNAPSHOT-WO-001
```

numeric baseline 中的 count 可解释为：

- `summary.total_count = 1`。
- `summary.pending_count = 1`。
- `summary.assigned_count = 0`。
- `summary.in_progress_count = 0`。
- `summary.done_count = 0`。
- `summary.overdue_count = 0`。
- `summary.closed_count = 0`。
- `by_status = [{ key: "10", count: 1 }]`。
- `by_priority = [{ key: "medium", count: 1 }]`。
- `by_type = [{ key: "repair", count: 1 }]`。
- `by_assignee = [{ assignee_name: "未派单", count: 1, done_count: 0, overdue_count: 0 }]`。

因此，各 numeric count 均可由 fresh 固定数据集解释。

## 6. diff 复核

ST-2B-1C baseline 建立阶段的 diff 复核结论：

- 新增 numeric baseline 和审查文档。
- 未修改默认 baseline `scripts/e2e/snapshots/first-release-api-snapshots.json`。
- 未接入 CI。
- 未修改业务代码。
- numeric baseline 包含 `workorders.stats.numeric`。
- numeric baseline 包含 `summary / by_status / by_priority / by_type / by_assignee / overdue_top`。
- `overdue_top` 为 schema-only shape。
- `workorders.logs.code` / `workorders.logs.logCode` 已归一化为 `<normalized-workorder-log-code>`。
- 未发现 token / password / Bearer。
- 未发现 request id / trace id。
- 未发现原始 UUID。
- 未发现 ISO 时间戳。
- 未发现文件 URL / signed URL。

## 7. 验证结果复核

ST-2B-1C baseline 建立阶段已验证：

- 默认 schema 快照检查通过。
- numeric baseline 生成通过。
- numeric 普通检查通过。
- 默认 schema 复查通过。
- `git diff --check` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。

本收口复核阶段只执行文档 diff 校验，不重新执行 `pnpm lint` / `pnpm typecheck` / `pnpm build`。上述 lint / typecheck 结果引用自 ST-2B-1C baseline 建立阶段，避免扩大本阶段验证表述。

## 8. 当前未做事项

当前未做：

- 未接入 CI。
- 未运行写入型 e2e。
- 未修改脚本。
- 未修改业务代码。
- 未修改 seed / migration。
- 未修改默认 baseline。
- 未重新生成 numeric baseline。

## 9. 剩余风险

剩余风险：

- numeric baseline 对 fresh 固定数据集强依赖。
- 如果 seed / bootstrap / fixed sample 变化，numeric baseline 需单独审查更新。
- 不应在污染库中更新 numeric baseline。
- 不应进入普通 CI。
- 后续如果启用 manual workflow，仍需保证独立库或 reset 后固定数据集。

## 10. 收口判断

ST-2B-1C 可阶段性收口。

不建议直接接入 CI。numeric baseline 当前适合作为显式专项检查资产，而不是普通回归默认路径。

下一步建议进入 ST-2C：manual workflow 评估。

## 11. 后续建议

ST-2C 建议只评估 manual workflow，不直接接入 CI。

评估重点：

- 是否需要 release candidate 前手动触发的 stats numeric 专项检查。
- manual workflow 是否具备独立库或 reset 能力。
- 是否复用 `SNAPSHOT_STATS_MODE=numeric` 和 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。
- 是否保持 numeric baseline 更新单独审查。

ST-2C manual workflow 评估见 `docs/testing/api-snapshot-workorders-stats-numeric-manual-workflow-plan.md`。
