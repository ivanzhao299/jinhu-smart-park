# JinHu Smart Park snapshot bootstrap 固定关联实施收口复核

## 1. 复核目的

本文用于复核 SB-1：bootstrap 固定 building / floor 创建实施是否达到阶段性收口标准，并明确是否可以进入后续 SB-2：fresh 隔离库默认 schema 快照复测 / baseline 对齐设计。

本阶段只做文档复核，不修改 `scripts/e2e/bootstrap-api-snapshot-data.mjs`，不修改默认 baseline，不生成 numeric baseline，不修改业务代码，不接入 CI。

## 2. 实施背景

ST-2B-1B 在 fresh 隔离库完成 migration、dev seed 和 snapshot bootstrap 后，默认 schema 快照仍未通过。失败范围集中在：

- `units.detail`
- `units.list`
- `units.statistics`
- `workorders.detail`
- `workorders.list`

此前 mismatch 分析认为：fixed sample 只固定了 `unitCode / woCode`，但 `SNAPSHOT-UNIT-001` 仍依赖 seed 当前形态中的 building / floor。fresh dev seed 返回 `JH-B01 / JH-B01-F01`，而默认 baseline 仍保留历史 `BLD-* / FLR-*` 样本形态。

SB-1 的目标是让 bootstrap 自己创建或复用 snapshot 专用 building / floor，并让 unit / workorder 挂在固定关联链路上。

## 3. 已完成能力

SB-1 已在 `scripts/e2e/bootstrap-api-snapshot-data.mjs` 中完成以下能力：

- 支持 `SNAPSHOT_BUILDING_NO`，默认 `SNAPSHOT-BLD-001`。
- 支持 `SNAPSHOT_FLOOR_NO`，默认 `SNAPSHOT-FLR-001`。
- 支持 `ALLOW_SNAPSHOT_REPAIR`，默认 `false`。
- 保留 `SNAPSHOT_UNIT_NO`，默认 `SNAPSHOT-UNIT-001`。
- 保留 `SNAPSHOT_WORKORDER_NO`，默认 `SNAPSHOT-WO-001`。
- 通过 `/buildings` 查找并创建 / 复用 snapshot building。
- 通过 `/floors` 在 snapshot building 下查找并创建 / 复用 snapshot floor。
- 创建 unit 时固定关联 snapshot building / floor。
- unit 已存在时拉取详情并校验 `buildingId / floorId`。
- workorder 已存在时，如响应暴露 `unitId` 或嵌套 unit code，则校验其关联 `SNAPSHOT-UNIT-001`。

当前未实现自动 repair。关联不一致时默认 fail，并提示 `ALLOW_SNAPSHOT_REPAIR` 仅为后续 repair 模式预留。

## 4. 固定关联链路

SB-1 后，bootstrap 目标固定链路为：

```text
SNAPSHOT-BLD-001
└── SNAPSHOT-FLR-001
    └── SNAPSHOT-UNIT-001
        └── SNAPSHOT-WO-001
```

这意味着 fixed sample 不再依赖 `/buildings` 返回的第一个可用 building，也不再依赖该 building 下的第一个 floor。

## 5. 幂等性验证

上一阶段使用新验证库 `jinhu_smart_park_snapshot_assoc` 进行验证：

- 第一次 bootstrap 创建 `SNAPSHOT-BLD-001`。
- 第一次 bootstrap 创建 `SNAPSHOT-FLR-001`。
- 第一次 bootstrap 创建 `SNAPSHOT-UNIT-001`。
- 第一次 bootstrap 创建 `SNAPSHOT-WO-001`。
- 第二次 bootstrap 全部复用，未重复创建。

因此，SB-1 的 building / floor / unit / workorder 全链路幂等性验证通过。

## 6. 门禁验证

上一阶段 SQL / API 门禁结果：

- `SNAPSHOT-BLD-001 = 1`
- `SNAPSHOT-FLR-001 = 1`
- `SNAPSHOT-UNIT-001 = 1`
- `SNAPSHOT-WO-001 = 1`
- `WO-% 回归工单 = 0`
- `关联链路 = true`

其中关联链路确认：

- `SNAPSHOT-FLR-001` 关联 `SNAPSHOT-BLD-001`。
- `SNAPSHOT-UNIT-001` 关联 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- `SNAPSHOT-WO-001` 关联 `SNAPSHOT-UNIT-001`。

## 7. 默认 schema 快照结果

上一阶段默认 schema 快照检查仍失败。该结果符合预期：

- 默认 baseline 仍是历史 `BLD-* / FLR-*` 样本形态。
- 新版 bootstrap 稳定生成 `SNAPSHOT-BLD-001 / SNAPSHOT-FLR-001`。
- 本阶段不更新默认 baseline。

因此，默认 schema mismatch 不否定 SB-1 的固定关联能力；它说明后续需要单独进入 SB-2，复测 fresh 隔离库默认 schema 快照并评估 baseline 对齐。

## 8. 当前未做事项

本阶段和上一阶段均未做以下事项：

- 未修改默认 baseline。
- 未生成 numeric baseline。
- 未修改快照脚本 `scripts/e2e/first-release-api-snapshots.mjs`。
- 未修改业务代码。
- 未修改 seed / migration。
- 未接入 CI。
- 未运行 `node scripts/e2e/first-release-workorders.mjs`。
- 未实现自动 repair。

## 9. 剩余风险

当前剩余风险：

- 默认 schema baseline 尚未对齐新版 snapshot 固定关联模型。
- 在默认 schema baseline 对齐或确认通过前，numeric baseline 仍不能生成。
- repair 模式尚未实现。
- 如果旧环境已存在脏关联，bootstrap 会默认 fail，需要人工处理或后续单独设计 repair 模式。
- 后续 baseline 更新仍需单独 PR 审查，不能与 numeric baseline 建立混在一起。

## 10. 收口判断

建议判断：

- SB-1 可阶段性收口。
- 不建议在本阶段立即更新默认 baseline。
- 不建议在本阶段立即生成 numeric baseline。
- 不建议在本阶段接入 CI。
- 不建议继续扩大 bootstrap 自动 repair 能力。

下一步建议进入 SB-2：fresh 隔离库默认 schema 快照复测 / baseline 对齐设计。

## 11. 后续建议

后续建议：

- 在新版 bootstrap 固定关联模型下重新准备 fresh 隔离库。
- 重新执行默认 schema 快照检查。
- 如果仍与历史 baseline 不一致，单独设计并审查默认 schema baseline 对齐。
- 默认 schema 通过或完成对齐后，再进入 ST-2B-1C 生成 `workorders.stats.numeric` baseline。
- numeric baseline 仍应保持显式启用、独立 baseline、非普通 CI 路径。
