# JinHu Smart Park workorders.stats numeric baseline 建立门禁

## 1. 文档目的

本文用于定义建立 `workorders.stats.numeric` baseline 的前置条件、运行顺序、禁止事项和审查规则。

ST-2B-0 阶段只做门禁确认和隔离数据集准备设计，不生成、不提交 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。ST-2B-1C 后，numeric baseline 已在 fresh 隔离固定数据集下建立；后续更新仍必须满足本文门禁。

## 2. 背景

默认 `workorders.stats` schema snapshot 已稳定。默认快照不保存具体 numeric count，可避免写入型 e2e 后 stats 计数波动导致普通快照失败。

numeric 模式脚本能力已存在，并已具备防误用保护。numeric 模式可以显式启用，使用独立 baseline path。ST-2B-1C 已建立 numeric baseline，但该 baseline 仍对测试库数据集强依赖。

`workorders.stats.numeric` 对测试库数据集强依赖。任意新增、派单、关闭、删除工单，或本地手动数据污染，都可能改变 `summary` 和各 group count。因此 numeric baseline 不能在共享污染库中随意生成。

## 3. 当前 numeric 能力状态

当前脚本能力：

- 通过 `SNAPSHOT_STATS_MODE=numeric` 启用 numeric stats 模式。
- numeric 模式必须设置 `ALLOW_STATS_NUMERIC_SNAPSHOT=true`。
- numeric baseline path 为 `scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- `workorders.stats` numeric handler 已优先于全局 `SNAPSHOT_MODE`。
- numeric 模式保留 `summary / by_status / by_priority / by_type / by_assignee`。
- numeric 模式保留 `overdue_top` schema-only shape。
- ST-2B-1C 已提交 numeric baseline 文件。
- 当前未接入 CI。

## 4. 建立 baseline 的必要前置条件

建立 numeric baseline 前必须满足：

- 使用独立测试库，或明确 reset 后的本地测试库。
- 已执行 migration / seed。
- 已执行 `node scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 固定样本存在：
  - `SNAPSHOT-BLD-001`。
  - `SNAPSHOT-FLR-001`。
  - `SNAPSHOT-WO-001`。
  - `SNAPSHOT-UNIT-001`。
- 固定样本关联必须一致：
  - `SNAPSHOT-FLR-001` belongs to `SNAPSHOT-BLD-001`。
  - `SNAPSHOT-UNIT-001` belongs to `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
  - `SNAPSHOT-WO-001` references `SNAPSHOT-UNIT-001`。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。
- 未运行其它会创建、派单、关闭、删除工单的写入型 e2e。
- 数据来源、运行顺序、reset 状态可记录。
- numeric diff 可逐项解释。

## 5. 明确禁止事项

禁止：

- 在共享污染库中建立 numeric baseline。
- 在执行 `first-release-workorders.mjs` 后建立 numeric baseline。
- 将 numeric baseline 和普通 schema baseline 混在同一普通修复 PR 中随意更新。
- 不说明数据来源就提交 numeric baseline。
- 将 numeric baseline 接入普通 CI。
- 用 `UPDATE_SNAPSHOTS=true` 迎合已污染本地库状态。

## 6. 推荐执行顺序

建议命令顺序：

```bash
# 1. 准备独立或 reset 后测试库
# 2. 执行 migration / seed
# 3. 启动 API

node scripts/e2e/bootstrap-api-snapshot-data.mjs

SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs

SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
UPDATE_SNAPSHOTS=true \
node scripts/e2e/first-release-api-snapshots.mjs

SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

SB-1 后，bootstrap 会创建或复用 snapshot building / floor / unit / workorder。若固定样本已存在但关联不一致，bootstrap 默认应 fail，不自动 repair；此时不得继续生成 numeric baseline。

注意：

- 不要在生成 numeric baseline 前运行 `first-release-workorders.mjs`。
- numeric baseline 生成后，可以再运行写入型 e2e 验证其会 fail，但不能据此更新 baseline。

## 7. diff 审查规则

numeric baseline diff 必须检查：

- 是否只新增 `first-release-api-snapshots.numeric.json`。
- 是否包含 `workorders.stats.numeric`。
- 是否包含预期的 `summary`。
- 是否包含预期的 `by_status / by_priority / by_type / by_assignee`。
- 是否包含 `overdue_top` schema-only shape。
- 是否无 token / password / Bearer。
- 是否无 request id / trace id。
- 是否无原始 UUID。
- 是否无 ISO 时间戳。
- 是否无文件 URL / signed URL。
- 每个 numeric count 是否能用固定数据集解释。

建立 numeric baseline 前还必须检查：

- `SNAPSHOT-BLD-001` 是否唯一。
- `SNAPSHOT-FLR-001` 是否唯一。
- `SNAPSHOT-UNIT-001` 是否唯一。
- `SNAPSHOT-WO-001` 是否唯一。
- snapshot floor / unit / workorder 关联链是否一致。

## 8. ST-2B-1 进入条件

只有满足以下条件，才进入 ST-2B-1：

- 已确认可使用隔离库或 reset 后测试库。
- 已确认 bootstrap 可重复生成固定样本。
- 已确认不会先运行写入型 e2e。
- 已确认 numeric baseline diff 审查责任。
- 已确认 numeric baseline 单独 PR 提交。
- 已确认不接入普通 CI。

## 9. CI 判断

当前不建议接入 CI。

后续只能考虑：

- manual workflow。
- release candidate 前专项检查。
- 独立测试库或 reset 能力具备后的专项 gate。

## 10. 结论

ST-2B-0 已完成门禁确认。ST-2B-1C 已在 fresh 隔离固定数据集下建立 numeric baseline。

后续更新 numeric baseline 时，仍必须在隔离固定数据集下执行，并按本文规则单独审查、单独提交。

如后续实现 `workorders.stats.numeric` manual workflow，workflow 仍必须满足本文门禁：使用 fresh / reset 后固定数据集，确认固定样本唯一和关联链路成立，确认 `WO-% = 0`，且不得执行 `UPDATE_SNAPSHOTS=true`。
