# JinHu Smart Park workorders.stats numeric 专项模式设计

## 1. 设计目的

本文用于设计 `workorders.stats.numeric` 专项模式。在默认 `workorders.stats` schema snapshot 稳定后，补充统计数值口径保护，避免默认快照继续受写入型 e2e 后的 count 波动影响。

ST-2A 已完成脚本小能力实现：支持显式 numeric stats 模式和独立 numeric baseline path。本阶段仍不新增 numeric baseline、不接入 CI、不修改业务代码。ST-2A 收口复核见 `docs/testing/api-snapshot-workorders-stats-numeric-mode-closure-review.md`。

## 2. 背景

ST-1 已完成：默认 `workorders.stats` 已从 exact numeric payload 转为 schema snapshot。

当前默认快照不再保存 `summary`、`by_status`、`by_priority`、`by_type`、`by_assignee` 中的具体 count 数值。这解决了 `first-release-workorders.mjs` 等写入型 e2e 创建和派单工单后，默认固定编号快照检查因 stats numeric count 变化失败的问题。

但 schema snapshot 只保护响应结构、字段集合和 numeric 字段类型，无法捕捉统计口径不变结构下的数值回归。因此需要设计一个显式、隔离、可控的 numeric 专项模式。

## 3. 当前默认模式

当前 `scripts/e2e/first-release-api-snapshots.mjs` 对 `workorders.stats` 默认输出：

```json
{
  "snapshot_type": "workorders.stats.schema"
}
```

当前 schema snapshot 保留：

- 顶层字段集合。
- `summary` 字段集合。
- `summary` numeric 字段存在性和类型类别。
- `by_assignee`、`by_priority`、`by_status`、`by_type` 的数组类型、item count category、item 字段集合、numeric 字段存在性和类型类别。
- `overdue_top` 的数组类型、item count category 和 item 字段集合。

当前默认快照不保存具体 count，因此写入型 e2e 后默认快照可以继续通过，不再把测试写入造成的统计变化固化进 baseline。

## 4. numeric 专项模式定位

`workorders.stats.numeric` 应定位为专项验证模式：

- 非默认模式。
- 非普通回归必跑项。
- 非共享测试库随手运行项。
- 用于统计口径专项验证。
- 需要固定数据集、独立测试库或可证明的 reset 前置状态。

该模式的目标不是替代默认 schema snapshot，而是在明确数据来源和运行顺序的前提下，补充精确数值对照。

## 5. numeric snapshot 校验范围

建议 numeric snapshot 第一阶段只覆盖核心统计数值。

### summary

- `total_count`
- `pending_count`
- `assigned_count`
- `overdue_count`

### group counts

- `by_status[].count`
- `by_priority[].count`
- `by_type[].count`
- `by_assignee[].count`

`overdue_top` 短期不做 numeric 强对照，先继续只检查 schema。原因是它可能同时受逾期规则、排序、处理人、时间窗口和测试数据状态影响。后续如需保护 `overdue_top` 排序和值，应单独扩展并补充更严格的数据前置条件。

## 6. 运行模式设计

脚本已支持显式模式：

```text
SNAPSHOT_STATS_MODE=schema|numeric
```

默认：

```text
SNAPSHOT_STATS_MODE=schema
```

numeric 显式运行：

```bash
SNAPSHOT_STATS_MODE=numeric ALLOW_STATS_NUMERIC_SNAPSHOT=true node scripts/e2e/first-release-api-snapshots.mjs
```

设计约束：

- `schema` 是默认值，保持当前默认快照稳定性。
- `numeric` 必须显式设置，不能由 `SNAPSHOT_MODE=normalized` 隐式触发。
- `ALLOW_STATS_NUMERIC_SNAPSHOT=true` 用于防止误用，尤其防止误更新 numeric baseline。
- 未设置防误用变量时，不允许 numeric update baseline。
- numeric 模式下脚本会输出当前 stats snapshot mode 和 baseline path。

## 7. baseline 文件设计

脚本已为 numeric 模式使用独立 baseline 文件：

```text
scripts/e2e/snapshots/first-release-api-snapshots.numeric.json
```

### 方案 A：同一 baseline 文件内双结构

优点：

- 文件数量少。
- 复用现有 baseline 路径和更新流程。

缺点：

- schema baseline 和 numeric baseline 容易混用。
- numeric 数值变化可能污染默认稳定快照审查。
- reviewer 难以一眼区分结构变化和数据变化。

### 方案 B：独立 numeric baseline 文件

优点：

- 默认 schema baseline 与 numeric baseline 边界清楚。
- numeric baseline 对数据集的强依赖更容易审查。
- 可单独制定更新规则和 PR 说明。
- 避免污染默认稳定快照。

缺点：

- 需要脚本支持额外 baseline path。
- 需要额外文档说明和维护入口。

ST-2A 已选择并实现方案 B。本轮未提交 `first-release-api-snapshots.numeric.json`。

## 8. 运行前置条件

numeric snapshot 运行必须满足至少一个明确条件，并在更新 baseline 时写入 PR 说明：

- 使用独立测试库。
- 使用固定数据集。
- 执行前完成数据库 reset。
- 明确未运行写入型 e2e。
- 运行顺序可证明。
- bootstrap 数据一致。

禁止：

- 在执行 `first-release-workorders.mjs` 后直接更新 numeric baseline。
- 在共享污染测试库中更新 numeric baseline。
- 不说明数据来源就提交 numeric baseline。
- 使用本地手动脏数据生成 numeric baseline。
- 将 numeric baseline diff 与 schema 策略调整混在同一 PR 中审查。

## 9. baseline 更新规则

numeric baseline 更新必须遵循更严格规则：

- numeric baseline 更新必须单独 PR，或至少有单独、清晰的审查段落。
- PR 必须说明数据来源、运行顺序、是否 reset、是否独立库。
- PR 必须说明是否运行过写入型 e2e。
- numeric baseline diff 必须逐项解释，尤其是 `summary` 和各 group count。
- 不允许和 schema 策略调整混在同一 PR。
- 不允许由写入型 e2e 后数据直接 `UPDATE_SNAPSHOTS=true`。
- 不允许使用 `ALLOW_SNAPSHOT_FALLBACK=true` 生成 numeric baseline。

如果 numeric diff 无法解释，默认视为疑似统计口径回归或数据污染，不应更新 baseline。

## 10. CI 接入判断

短期建议：

- numeric snapshot 不进入常规 CI。
- 默认 CI 如后续接入接口快照，只应运行 schema snapshot。
- numeric snapshot 可作为手动 workflow 或 release candidate 前专项检查。
- 接入前必须具备独立测试库、稳定 reset 能力或可证明的固定数据集。

在没有隔离数据和 reset 能力前，将 numeric snapshot 放入常规 PR CI 会引入高概率误报，并可能诱导开发者把污染数据更新进 baseline。

## 11. 后续实施拆分

建议后续分为三个小 PR。

### ST-2A：numeric 模式脚本设计 / 小实现

- 已增加 `SNAPSHOT_STATS_MODE=schema|numeric`。
- 已增加 `ALLOW_STATS_NUMERIC_SNAPSHOT` 防误用变量。
- 已增加 numeric baseline path 支持。
- 默认仍为 schema。
- 未接入 CI。
- 未提交 numeric baseline。
- 已进入收口复核，复核文档见 `docs/testing/api-snapshot-workorders-stats-numeric-mode-closure-review.md`。

### ST-2B：numeric baseline 建立

- 在隔离数据集下生成 numeric baseline。
- 单独审查 numeric diff。
- PR 说明数据来源、运行顺序、是否 reset、是否独立库。

### ST-2C：manual workflow 评估

- 评估是否接入手动 workflow。
- 评估是否作为 release candidate 前专项检查。
- 明确 workflow 使用的测试库、reset 方式和 baseline 更新权限。

## 12. 暂缓范围

本阶段继续暂缓：

- 直接新增 numeric baseline。
- 更新现有 baseline。
- 接入 CI。
- 修改业务代码。
- 修改 seed / migration。
- 扩展更多接口。
- 将 numeric stats 纳入默认回归。

## 13. 结论

建议保留 `workorders.stats` numeric 专项模式，但必须保持显式、隔离、可控。

推荐方案：

- 默认继续使用 `workorders.stats.schema`。
- numeric 专项模式使用独立 baseline 文件。
- numeric 模式通过 `SNAPSHOT_STATS_MODE=numeric` 显式启用。
- baseline 更新必须额外设置 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。
- numeric snapshot 暂不进入常规 CI。
- ST-2A 已完成最小脚本能力；下一步进入 ST-2B：在隔离数据集下建立 numeric baseline。
- numeric baseline 尚未建立，必须留到 ST-2B 在隔离固定数据集下单独完成。
