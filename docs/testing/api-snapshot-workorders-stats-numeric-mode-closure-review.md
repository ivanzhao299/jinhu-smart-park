# JinHu Smart Park workorders.stats numeric 模式脚本能力收口复核

## 1. 复核目的

本文用于复核 ST-2A：`workorders.stats numeric` 模式脚本小实现是否达到阶段性收口标准，重点确认显式开关、防误用、独立 baseline path、默认 schema 行为和未提交 numeric baseline 文件等边界是否清楚。

## 2. ST-2A 实施背景

ST-1 已将默认 `workorders.stats` 转为 schema snapshot。默认快照不再保存具体 numeric count，已解决写入型 e2e 后 stats summary 和分组 count 波动导致默认快照失败的问题。

ST-2 设计要求保留统计口径专项验证能力，但必须保持显式、隔离、可控。ST-2A 的目标是先实现脚本小能力：显式模式、防误用和独立 baseline path；不建立 numeric baseline，不接入 CI，不扩大接口覆盖。

## 3. 已完成能力

ST-2A 已完成以下脚本能力：

- 支持 `SNAPSHOT_STATS_MODE=schema|numeric`。
- 默认 `SNAPSHOT_STATS_MODE=schema`。
- 非法 `SNAPSHOT_STATS_MODE` 会 fail。
- `SNAPSHOT_STATS_MODE=numeric` 时必须设置 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。
- schema baseline path 为 `scripts/e2e/snapshots/first-release-api-snapshots.json`。
- numeric baseline path 为 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- numeric 模式下 `workorders.stats` 输出 `snapshot_type: "workorders.stats.numeric"`。

## 4. 默认 schema 行为保持

未设置 `SNAPSHOT_STATS_MODE` 时，脚本仍使用 schema 模式。默认模式继续读取现有 baseline：

```text
scripts/e2e/snapshots/first-release-api-snapshots.json
```

本阶段未修改默认 baseline。上一阶段验证显示，固定编号默认 schema 快照检查通过，执行 `first-release-workorders.mjs` 后再次运行默认 schema 快照检查仍通过。

默认 schema 模式不需要 numeric baseline 文件，也不依赖 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。

## 5. numeric 模式行为

numeric 模式是显式专项模式，不属于普通回归默认路径。

如果设置：

```text
SNAPSHOT_STATS_MODE=numeric
```

但未设置：

```text
ALLOW_STATS_NUMERIC_SNAPSHOT=true
```

脚本会在请求 API 前 fail，并提示：

```text
SNAPSHOT_STATS_MODE=numeric requires ALLOW_STATS_NUMERIC_SNAPSHOT=true
```

设置防误用变量后，numeric 模式会使用独立 baseline path。如果 `first-release-api-snapshots.numeric.json` 不存在，普通检查会明确失败，并提示只能在隔离固定数据集下建立 numeric baseline。

本阶段未提交 numeric baseline 文件。

## 6. numeric 输出内容

numeric 模式下 `workorders.stats` 输出：

- `snapshot_type: "workorders.stats.numeric"`。
- `summary`。
- `by_status`。
- `by_priority`。
- `by_type`。
- `by_assignee`。

numeric 模式继续使用现有 `normalizeValue` 归一化动态字段，例如 id、时间戳、token、request id、trace id 和文件 URL 等。

## 7. 验证复核

上一阶段已完成验证：

- `node --check scripts/e2e/first-release-api-snapshots.mjs` 通过。
- 默认 schema 快照检查通过。
- `node scripts/e2e/first-release-workorders.mjs` 通过。
- 写入型 e2e 后默认 schema 快照检查通过。
- numeric 防误用验证按预期失败，输出包含 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。
- numeric baseline 缺失验证按预期失败，使用 `.numeric.json` path，并提示需要在隔离固定数据集下建立 numeric baseline。
- `git diff --check` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。

这些验证覆盖了 ST-2A 的核心风险：默认 schema 行为保持、写入型 e2e 后默认快照稳定、numeric 模式不会误用默认 baseline、numeric baseline 缺失时不会静默通过。

## 8. 当前未做事项

本阶段未做：

- 未新增 numeric baseline 文件。
- 未修改默认 baseline。
- 未接入 CI。
- 未修改业务代码。
- 未修改 seed / migration。
- 未修改 package.json / pnpm-lock.yaml。
- 未新增依赖。
- 未扩展新接口。

## 9. 剩余风险

当前剩余风险：

- numeric baseline 尚未建立。
- numeric 模式尚未在隔离数据集下验证具体数值 diff。
- numeric baseline 更新规则还需在 ST-2B 执行中落地。
- manual workflow 尚未评估。
- numeric 模式不应进入普通 CI。

## 10. 收口判断

建议判断：

- ST-2A 可阶段性收口。
- 不建议立即接入 CI。
- 不建议在本阶段建立 numeric baseline。
- 不建议继续扩大脚本功能。
- 下一步进入 ST-2B：隔离数据集下建立 numeric baseline。

理由：

- 默认 schema 模式保持稳定，且仍使用默认 baseline。
- numeric 模式必须显式启用并设置防误用变量。
- numeric 模式已使用独立 baseline path。
- numeric baseline 缺失行为清楚，不会误读默认 baseline。
- 本阶段没有提交 numeric baseline，避免把当前本地数据状态固化为基线。

## 11. 后续建议

ST-2B 建议在隔离数据集下建立 numeric baseline：

- 明确数据来源。
- 明确是否执行数据库 reset。
- 明确是否运行过写入型 e2e。
- 单独审查 numeric diff。
- numeric baseline 单独 PR，不与 schema 策略或普通修复混在一起。
- 暂不接入常规 CI。

后续 ST-2C 再评估是否需要 manual workflow 或 release candidate 前专项检查。

## 12. 结论

ST-2A 已达到阶段性收口标准。

当前建议收口 ST-2A，保持默认 `workorders.stats.schema` 作为普通快照路径，继续将 `workorders.stats.numeric` 作为显式专项模式。下一步进入 ST-2B：在隔离固定数据集下建立 numeric baseline，并单独审查 numeric diff。
