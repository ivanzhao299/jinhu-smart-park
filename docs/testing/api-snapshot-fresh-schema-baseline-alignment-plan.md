# JinHu Smart Park fresh 隔离库默认 schema baseline 对齐设计

## 1. 设计目的

本文用于记录新版 snapshot bootstrap 固定关联模型下，fresh 隔离库默认 schema 快照复测结果，并设计是否需要单独对齐默认 baseline。

本阶段只做复测和文档设计，不执行 `UPDATE_SNAPSHOTS=true`，不修改快照脚本，不修改默认 baseline，不生成 numeric baseline，不修改业务代码，不接入 CI。

## 2. 当前背景

SB-1 已完成 `scripts/e2e/bootstrap-api-snapshot-data.mjs` 的固定关联补强。bootstrap 当前会创建或复用 snapshot 专用 building / floor，并形成稳定链路：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

这使 fixed sample 不再依赖 `/buildings` 返回的第一个 seed building，也不再依赖该 building 下的第一个 floor。

当前默认 baseline 仍保留历史开发库样本形态，例如 `BLD-* / FLR-*`。`workorders.stats.numeric` baseline 仍暂停，等待默认 schema baseline 与 fresh 固定数据集完成对齐。

## 3. 复测前门禁

本次复测使用隔离库：

```text
jinhu_smart_park_snapshot_assoc
```

复测前只读门禁结果：

- `current_database = jinhu_smart_park_snapshot_assoc`
- `SNAPSHOT-BLD-001 = 1`
- `SNAPSHOT-FLR-001 = 1`
- `SNAPSHOT-UNIT-001 = 1`
- `SNAPSHOT-WO-001 = 1`
- `WO-% 回归工单 = 0`
- `SNAPSHOT-FLR-001` 关联 `SNAPSHOT-BLD-001`
- `SNAPSHOT-UNIT-001` 关联 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`
- `SNAPSHOT-WO-001` 关联 `SNAPSHOT-UNIT-001`

本阶段未运行 `node scripts/e2e/first-release-workorders.mjs`。

## 4. 默认 schema 快照复测结果

复测命令：

```bash
API_BASE_URL=http://localhost:3002/api/v1 \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

复测结果：未通过。

脚本直接输出的失败 snapshot：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`

脚本输出还提示另有 2 个 snapshot mismatch。结合只读 API 摘要和 baseline 对比，额外差异为：

- `workorders.logs`
- `workorders.stats`

因此，本次复测失败 snapshot 列表为：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`
- `workorders.logs`
- `workorders.stats`

## 5. mismatch 分类

### 5.1 固定 building / floor 形态差异

`units.detail`、`units.list`、`workorders.detail` 中的 building / floor 嵌套对象从历史 baseline 的 `BLD-* / FLR-*` 变为新版固定模型：

```text
SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001
```

字段差异集中在：

- `building.buildingCode`
- `building.buildingName`
- `building.remark`
- `floor.floorCode`
- `floor.floorName`
- `floor.remark`

ID、时间、tenant / park 等动态字段仍被归一化。

### 5.2 fixed unit 关联形态差异

`SNAPSHOT-UNIT-001` 当前稳定关联 snapshot building / floor。默认 baseline 仍记录历史 building / floor 关联形态，因此：

- `units.detail` 的完整 unit 响应不一致。
- `units.list` 的 `first_item` 嵌套 building / floor 不一致。

该差异是 SB-1 固定关联模型带来的预期变化。

### 5.3 fixed workorder 关联形态差异

`SNAPSHOT-WO-001` 当前稳定关联 `SNAPSHOT-UNIT-001`。由于 unit 关联的 building / floor 已固定，工单详情和列表中的嵌套关联对象也随之变化：

- `workorders.detail` 的 building / floor 嵌套对象不一致。
- `workorders.list` 保持 `snapshot_type: "workorders.list.stable"`，但 fresh 库只有 1 条 active 工单，因此 `item_count_category` 从历史 `many` 变为 `one`。

该差异与 fresh 隔离库数据集和新版固定关联模型一致。

### 5.4 统计类差异

`units.statistics` 与历史 baseline 不一致。fresh 库中 unit 数据来自 dev seed 加 snapshot unit，统计结果包含：

- `SNAPSHOT-BLD-001`
- `JH-B01`
- `JH-B02`

而历史 baseline 包含多组 first-release 历史 building。

`workorders.stats` 仍为 schema snapshot，但 group array 的 `item_count_category` 随 fresh 数据集变化：

- `by_assignee`: 历史 `many`，fresh 为 `one`
- `by_priority`: 历史 `many`，fresh 为 `one`
- `by_status`: 历史 `many`，fresh 为 `one`
- `by_type`: 仍为 `one`
- `overdue_top`: 仍为 `empty`

字段集合和 numeric field type 仍保持 schema 层面稳定。

### 5.5 workorders.logs 差异

`workorders.logs` 的结构仍为一条 create log，但 fresh 隔离库中的业务日志编号与操作人显示值不同：

- baseline: `WOL-202606-000032`
- fresh: `WOL-202606-000001`
- baseline operator: `Local Admin`
- fresh operator: `系统管理员`

该差异来自 fresh 库 sequence / dev seed 用户显示名，与动态 UUID、token、ISO 时间戳无关。SB-3 若更新 baseline，需要把该 diff 作为可解释的 fresh 数据集差异单独审查。

### 5.6 非预期差异

本次未发现 token、password、Bearer、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL 进入失败输出。

除 `workorders.logs` 中保留业务日志编号外，当前差异主要集中在 fresh 固定数据集与历史 baseline 之间。该业务编号不是安全敏感数据，但属于 baseline 对齐时必须显式审查的稳定性边界。

## 6. baseline 对齐候选方案

### 方案 A：单独更新默认 schema baseline 到新版固定关联模型

优点：

- 默认 baseline 与新版 bootstrap 一致。
- fresh 隔离库可作为后续 numeric baseline 前置数据集。
- 消除历史 seed 形态依赖。
- 让 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001` 成为固定样本的正式默认形态。

缺点：

- 需要单独审查默认 baseline diff。
- 会影响现有污染库上的默认快照结果。
- `workorders.logs` 的业务编号和操作人显示值需要明确接受或继续降级设计。

### 方案 B：继续保留历史 baseline，不继续 ST-2B numeric baseline

优点：

- 不触碰默认 baseline。

缺点：

- fresh 隔离库和默认 baseline 持续不一致。
- ST-2B numeric baseline 无法推进。
- 已实施的 bootstrap 固定关联模型无法成为可复现默认数据集。

### 方案 C：跳过默认 schema 对齐直接生成 numeric baseline

不推荐。

该方案会在默认 schema 仍不通过的前提下固化 numeric baseline，使默认 baseline 与 numeric baseline 数据集割裂，后续难以解释统计数值来源。

## 7. 推荐结论

建议：

- 不直接生成 numeric baseline。
- 不在本阶段更新 baseline。
- 下一阶段进入 SB-3：默认 schema baseline 对齐实施。
- SB-3 应单独 PR，只更新默认 baseline 与必要审查文档。
- SB-3 不改脚本、不生成 numeric baseline、不接 CI。

## 8. SB-3 baseline 更新审查要求

SB-3 若执行默认 baseline 对齐，必须审查：

- baseline diff 是否主要集中于 fixed unit / workorder / building / floor 关联形态。
- `workorders.stats` 是否仍保持 `snapshot_type: "workorders.stats.schema"`。
- `workorders.list` 是否仍保持 `snapshot_type: "workorders.list.stable"`。
- list / stats 策略是否未发生脚本层变化。
- 是否无 token / password / Bearer。
- 是否无 request id / trace id。
- 是否无原始 UUID。
- 是否无 ISO 时间戳。
- 是否无文件 URL / signed URL。
- `workorders.logs` 的业务日志编号和操作人显示值是否可解释。
- 默认 schema baseline 更新后，fresh 隔离库检查是否通过。

## 9. 对 ST-2B-1C 的影响

默认 schema baseline 对齐前，`workorders.stats.numeric` baseline 继续暂停。

只有在默认 schema 快照通过，或默认 schema baseline 已按 SB-3 单独对齐并复核通过后，才建议重新进入 ST-2B-1C 生成 numeric baseline。

## 10. 结论

本次复测确认：新版 bootstrap 已让 fixed sample 关联链路稳定，但默认 baseline 仍保留历史开发库样本形态，因此 fresh 隔离库默认 schema 快照仍不通过。

推荐进入 SB-3：默认 schema baseline 对齐实施。暂不进入 ST-2B-1C，不生成 numeric baseline。
