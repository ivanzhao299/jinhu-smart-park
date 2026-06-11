# JinHu Smart Park fresh 隔离库默认 schema baseline mismatch 分析

## 1. 分析目的

本文用于分析 fresh 隔离库通过固定样本 bootstrap 后，默认 schema 快照仍不通过的原因。

本阶段只做 mismatch 分析，不修改快照脚本、不修改默认 baseline、不生成 `first-release-api-snapshots.numeric.json`、不执行 `UPDATE_SNAPSHOTS=true`、不运行写入型 e2e。

## 2. 当前执行背景

ST-2B-1B 已完成隔离库初始化与固定样本 bootstrap：

- 独立库：`jinhu_smart_park_snapshot_numeric`
- migration 已成功执行。
- dev seed 已成功执行。
- API 已指向隔离库执行 bootstrap。
- `bootstrap-api-snapshot-data.mjs` 已执行且幂等。
- `active_workorders = 1`
- `regression_workorders = 0`
- `snapshot_workorders = 1`
- `snapshot_units = 1`
- 唯一 active 工单为 `SNAPSHOT-WO-001`。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。
- 未生成 numeric baseline。
- 未修改默认 baseline。

默认 schema 快照检查命令：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

结果：未通过。

## 3. 默认 schema 快照失败摘要

失败输出明确展示的 mismatch：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`

脚本输出末尾提示：

```text
Snapshot mismatch output truncated; 2 additional snapshot(s) differed
```

因此当前可确认的失败列表为以上 5 项；另有 2 项因输出截断未在本阶段完整展开。本文不臆造被截断的 snapshot 名称。

## 4. mismatch 字段分类

### 4.1 楼栋 / 楼层关联差异

默认 baseline 中，`SNAPSHOT-UNIT-001` 与 `SNAPSHOT-WO-001` 关联到历史 first-release leasing 样本：

```text
buildingCode = BLD-20260610T095948539Z-8ECBF6C1-2F6880F3
buildingName = First release building 20260610T095948539Z-8ECBF6C1
buildArea    = 1000.00
floorCount   = 1
floorCode    = FLR-20260610T095948539Z-8ECBF6C1-07525F5E
floorName    = First release floor 20260610T095948539Z-8ECBF6C1
floorArea    = 1000.00
```

fresh 隔离库中，bootstrap 固定样本关联到 dev seed 的第一个可用楼栋 / 楼层：

```text
buildingCode = JH-B01
buildingName = 1号楼
buildArea    = 32000.00
floorCount   = 12
floorCode    = JH-B01-F01
floorName    = 1号楼1层
floorArea    = 2600.00
```

差异集中在：

- `building.buildingCode`
- `building.buildingName`
- `building.buildArea`
- `building.floorCount`
- `building.remark`
- `floor.floorCode`
- `floor.floorName`
- `floor.floorArea`
- `floor.remark`

### 4.2 房源详情差异

`units.detail` 中固定业务编号仍一致：

```text
unitCode = SNAPSHOT-UNIT-001
unitName = Snapshot Unit 001
unitArea = 100.00
useArea  = 90.00
```

但嵌套 `building` / `floor` 对象来自不同数据集，因此 normalized snapshot 仍发生 mismatch。

### 4.3 房源列表差异

`units.list` 的字段集合基本稳定，但默认 baseline 和 fresh 隔离库的首项内容不同。

默认 baseline：

```text
item_count_category = many
first_item.buildingCode = BLD-...
first_item.floorCode    = FLR-...
```

fresh 隔离库：

```text
item_count_category = many
first_item.buildingCode = JH-B01
first_item.floorCode    = JH-B01-F01
```

该 mismatch 说明列表 snapshot 仍保留了首项的 normalized 内容，而首项依赖当前数据集排序和样本形态。

### 4.4 房源统计差异

`units.statistics` 是 numeric exact style 内容，不是 schema-only shape。

默认 baseline 中可见：

```text
totalUnits    = 16
rentedUnits   = 15
vacantUnits   = 1
totalArea     = 1600
useArea       = 1440
occupancyRate = 93.75
byBuilding    = 多个 BLD-* 历史样本
```

fresh 隔离库检查输出中可见：

```text
totalUnits    = 6
rentedUnits   = 1
vacantUnits   = 4
totalArea     = 1444
useArea       = 1308
occupancyRate = 16.67
byBuilding    = JH-B01 / JH-B02
```

这类差异来自 dev seed 房源集合和历史开发库样本集合不同。

### 4.5 工单详情差异

`workorders.detail` 中固定业务编号和核心工单字段仍一致：

```text
woCode   = SNAPSHOT-WO-001
title    = Snapshot work order 001
status   = 10
priority = medium
woType   = repair
```

但工单通过 `unit_id` 关联到 `SNAPSHOT-UNIT-001`，并进一步带出不同的楼栋 / 楼层嵌套对象：

```text
fresh buildingCode = JH-B01
fresh floorCode    = JH-B01-F01
```

默认 baseline 则保留历史：

```text
baseline buildingCode = BLD-...
baseline floorCode    = FLR-...
```

因此 mismatch 主要来自关联对象，而不是固定工单编号本身。

### 4.6 工单列表差异

`workorders.list` 已降级为 `workorders.list.stable`，但仍包含：

- `item_count_category`
- `item_fields`
- `contains_snapshot_workorder`
- `snapshot_workorder_key`

默认 baseline 中：

```text
item_count_category = many
contains_snapshot_workorder = true
snapshot_workorder_key = SNAPSHOT-WO-001
```

fresh 隔离库中 active workorder 只有 `SNAPSHOT-WO-001` 一条，因此检查输出中：

```text
item_count_category = one
```

这说明 fresh 隔离库虽然满足 numeric baseline 门禁，但与默认 baseline 期待的列表规模不同。

## 5. bootstrap 行为确认

`bootstrap-api-snapshot-data.mjs` 创建固定房源时会：

1. 调用 `/buildings?page=1&page_size=20`。
2. 选择 `firstUsableItem(buildings)`。
3. 调用 `/floors?page=1&page_size=20&building_id=<building.id>`。
4. 选择该 building 下第一个可用 floor。
5. 创建 `SNAPSHOT-UNIT-001`。
6. 用该 unit 创建 `SNAPSHOT-WO-001`。

fresh dev seed 中第一个可用 building / floor 为：

```text
JH-B01
JH-B01-F01
```

因此 fixed sample 固定了 `unitCode` 和 `woCode`，但没有固定楼栋 / 楼层业务编号与完整关联形态。

## 6. 根因判断

根因判断：

- 默认 baseline 很可能来自历史开发库状态。
- 历史开发库中存在 first-release leasing 风格的 `BLD-*` / `FLR-*` 样本。
- fresh 隔离库只包含 dev seed 的 `JH-B01` / `JH-B01-F01` 等基础样本。
- bootstrap 固定了业务编号，但依赖当前数据集中的第一个可用楼栋 / 楼层。
- 因此 fixed sample 不是完全独立于 seed 形态的稳定样本。

差异集中在：

- 楼栋
- 楼层
- 房源关联对象
- 工单关联对象
- 房源统计数量与分组
- 工单列表数量类别

## 7. 是否影响 numeric baseline

会影响。

numeric baseline 建立前，默认 schema 快照应先通过，作为“隔离数据集与默认回归基线对齐”的最低门禁。

当前默认 schema 未通过，说明 fresh 隔离库与默认 baseline 尚未对齐。此时直接生成 `workorders.stats.numeric` baseline 会把一个与默认 baseline 割裂的数据集固化下来，后续审查很难判断 numeric count 是统计口径变化，还是数据集前提变化。

因此不建议进入 ST-2B-1C。

## 8. 候选处理路径

### 方案 A：默认 schema baseline 对齐 fresh 隔离库

优点：

- 默认 baseline 与隔离库固定数据集一致。
- 后续 numeric baseline 有稳定前提。
- 能消除历史开发库状态对默认 baseline 的影响。

缺点：

- 会修改默认 baseline。
- 需要单独审查 `units.*`、`workorders.*` 等差异是否全部符合 fresh 隔离库预期。

### 方案 B：补强 bootstrap，使固定样本完全固定楼栋 / 楼层 / 房源关联

优点：

- 固定样本更稳定。
- 减少 seed 排序和历史样本形态依赖。
- 可以让 `SNAPSHOT-UNIT-001` / `SNAPSHOT-WO-001` 的关联对象更可控。

缺点：

- 需要修改 `bootstrap-api-snapshot-data.mjs`。
- 需要额外验证幂等性。
- 仍需决定是否更新默认 baseline。

### 方案 C：为 numeric baseline 使用独立数据集，不要求默认 schema baseline 通过

优点：

- 可以较快生成 numeric baseline。

缺点：

- 默认 baseline 与 numeric baseline 数据集割裂。
- 容易把数据集差异误当成统计口径基线。
- 后续维护成本高。

不推荐方案 C。

## 9. 推荐结论

建议暂停 ST-2B-1C。

下一步优先进入以下二选一设计：

1. fresh 隔离库默认 schema baseline 对齐设计。
2. snapshot bootstrap 固定关联补强设计。

不建议跳过默认 schema mismatch 直接建立 numeric baseline。

## 10. 本阶段未做事项

- 未修改 `scripts/e2e/first-release-api-snapshots.mjs`。
- 未修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`。
- 未修改默认 baseline。
- 未生成 numeric baseline。
- 未执行 `UPDATE_SNAPSHOTS=true`。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。
- 未修改 seed / migration。
- 未修改业务代码。
- 未接入 CI。
- 未修改 `package.json` / `pnpm-lock.yaml`。
