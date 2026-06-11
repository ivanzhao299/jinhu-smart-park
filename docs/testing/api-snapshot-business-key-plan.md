# JinHu Smart Park 接口快照固定业务标识机制设计

## 1. 设计目的

本文用于设计接口快照脚本的固定业务标识机制，减少对列表第一条、本地脏数据和写入型 e2e 的依赖。

本阶段只做设计文档，不修改脚本、不修改 baseline、不新增 seed、不修改业务代码、不接入 CI。

## 2. 背景

当前已有：

- 快照脚本：`scripts/e2e/first-release-api-snapshots.mjs`
- baseline：`scripts/e2e/snapshots/first-release-api-snapshots.json`
- 当前 baseline 共 9 个 snapshot
- 数据稳定性策略：`docs/testing/api-snapshot-data-stability-plan.md`

当前问题：

- 快照脚本仍依赖当前测试库中的列表第一条。
- `first-release-workorders.mjs` 会写入新工单，影响 `workorders.list`、`workorders.detail`、`workorders.logs`、`workorders.stats`。
- 本地手动测试数据、重复执行写入型 e2e、seed / bootstrap 变化都可能导致 baseline 波动。

数据稳定性策略建议短期引入固定业务标识，让快照脚本优先通过稳定业务编号查找样本。

## 3. 当前样本选择方式

当前脚本的样本选择方式：

- 工单列表：请求 `GET /work-orders?page=1&page_size=10`。
- 工单详情：取 `workordersList.items[0].id`，请求 `GET /work-orders/:id`。
- 工单日志：复用同一个工单 ID，请求 `GET /work-orders/:id/logs?page=1&page_size=10`。
- 工单 stats：请求 `GET /work-orders/stats`，不选单条样本。
- 工单 overdue：请求 `GET /work-orders/overdue?page=1&page_size=10`，当前只保留列表结构和 first item。
- 工单 SLA 规则：请求 `GET /work-orders/sla-rules?page=1&page_size=10`，当前保留列表结构和 first item。
- 房源列表：请求 `GET /park-units?page=1&page_size=10`。
- 房源详情：取 `unitsList.items[0].id`，请求 `GET /park-units/:id`。
- 房源 statistics：请求 `GET /park-units/statistics`，不选单条样本。

当前问题：

- 工单详情、日志依赖工单列表第一条。
- 房源详情依赖房源列表第一条。
- 列表第一条受排序、写入型 e2e 和本地脏数据影响。
- stats / statistics 数值受当前测试库整体数据影响。
- 只要写入型 e2e 新增数据排到列表前面，baseline 就可能变化。

## 4. 可用业务标识分析

### 工单

实际可用字段：

- `woCode`
- `code`
- `title`

代码依据：

- `WorkOrderEntity` 中存在 `woCode`，数据库列为 `wo_code`。
- `WorkOrderEntity` 中存在 `code`。
- `WorkOrderEntity` 中存在 `title`。
- `woCode` 在租户 / 园区 / 未删除范围内有唯一索引。
- `WorkOrderQueryService.applyQuery` 的 `keyword` 会匹配 `workOrder.wo_code` 和 `workOrder.title`。

当前 baseline 中也已出现：

- `woCode`
- `code`
- `title`

建议使用优先级：

1. `woCode`
2. `code`
3. `title` 仅作为辅助校验，不建议作为主锚点

原因：`woCode` 是明确业务编号，且有唯一约束；`title` 更像展示字段，可能重复。

### 房源

实际可用字段：

- `unitCode`
- `code`
- `unitName`

代码依据：

- `UnitEntity` 中存在 `unitCode`，数据库列为 `unit_code`。
- `UnitEntity` 中存在 `code`。
- `UnitEntity` 中存在 `unitName`。
- `unitCode` 在租户 / 园区 / 未删除范围内有唯一索引。
- `UnitsQueryService.applyQuery` 的 `keyword` 会匹配 `unit.unit_code`、`unit.unit_name` 和 `unit.code`。

当前 `park-units` baseline 样本中已出现：

- `unitCode`
- `code`
- `unitName`

当前 `park-units` baseline 样本未显示 `unitNo`，因此本设计不把 `unitNo` 作为直连 `/park-units` 的固定业务标识。

建议使用优先级：

1. `unitCode`
2. `code`
3. `unitName` 仅作为辅助校验，不建议作为主锚点

原因：`unitCode` 是明确业务编号，且有唯一约束；`unitName` 可能重复。

## 5. 建议环境变量

后续脚本可支持：

```text
SNAPSHOT_WORKORDER_NO
SNAPSHOT_UNIT_NO
ALLOW_SNAPSHOT_FALLBACK=true
```

说明：

- `SNAPSHOT_WORKORDER_NO` 用于指定工单快照锚点，建议匹配 `woCode` / `code`。
- `SNAPSHOT_UNIT_NO` 用于指定房源快照锚点，建议匹配 `unitCode` / `code`。
- `ALLOW_SNAPSHOT_FALLBACK=true` 仅在本地临时调试时允许 fallback 到列表第一条。

命名说明：

- 环境变量使用 `NO` 是为了表达业务编号，不代表数据库 ID。
- 不建议使用 UUID 作为配置项。
- 不建议把 `id`、`unitId`、`workOrderId` 作为快照锚点配置。

## 6. 查找逻辑设计

### 工单查找

建议逻辑：

1. 如果设置了 `SNAPSHOT_WORKORDER_NO`，调用 `GET /work-orders?page=1&page_size=10&keyword=<SNAPSHOT_WORKORDER_NO>`。
2. 在返回的 `items` 中精确匹配 `woCode` 或 `code`。
3. 找到后使用归一化前的 `id` 调用 `GET /work-orders/:id`。
4. 复用同一个 `id` 调用 `GET /work-orders/:id/logs`。
5. 找不到时默认 FAIL。
6. 不应静默使用第一条替代。

辅助规则：

- 如果 `keyword` 返回多条，只接受 `woCode === SNAPSHOT_WORKORDER_NO` 或 `code === SNAPSHOT_WORKORDER_NO` 的精确匹配。
- `title` 只用于输出诊断，不作为默认精确匹配条件。
- 如果未设置 `SNAPSHOT_WORKORDER_NO`，短期可保持当前列表第一条策略；后续进入 workflow 前应改为要求显式业务编号。

### 房源查找

建议逻辑：

1. 如果设置了 `SNAPSHOT_UNIT_NO`，调用 `GET /park-units?page=1&page_size=10&keyword=<SNAPSHOT_UNIT_NO>`。
2. 在返回的 `items` 中精确匹配 `unitCode` 或 `code`。
3. 找到后使用归一化前的 `id` 调用 `GET /park-units/:id`。
4. 找不到时默认 FAIL。
5. 不应静默使用第一条替代。

辅助规则：

- 如果 `keyword` 返回多条，只接受 `unitCode === SNAPSHOT_UNIT_NO` 或 `code === SNAPSHOT_UNIT_NO` 的精确匹配。
- `unitName` 只用于输出诊断，不作为默认精确匹配条件。
- 如果未设置 `SNAPSHOT_UNIT_NO`，短期可保持当前列表第一条策略；后续进入 workflow 前应改为要求显式业务编号。

## 7. fallback 策略

默认禁止 fallback。

建议规则：

- 找不到固定业务标识时默认 FAIL。
- 只有设置 `ALLOW_SNAPSHOT_FALLBACK=true` 时，才允许 fallback 到列表第一条。
- fallback 时必须输出明显 warning。
- warning 中应输出当前使用的 fallback 样本业务编号。
- 不建议提交 fallback 生成的 baseline。
- CI、release-smoke、manual workflow 中不得启用 fallback。

建议输出示例：

```text
[WARN] SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 not found; ALLOW_SNAPSHOT_FALLBACK=true, falling back to first work order WO-...
```

设计判断：

- 默认 FAIL 能避免把错误数据静默固化到 baseline。
- 显式 fallback 保留本地调试便利性。
- fallback 生成的 baseline 不应进入 PR。

## 8. 固定业务标识来源

### 方案 A：复用现有 first-release 数据

说明：

- 复用现有 e2e 生成的数据。
- 例如 `first-release-workorders.mjs` 生成的 `WO-${TEST_RUN_ID}`。

优点：

- 无需新增 seed。
- 无需新增脚本。

缺点：

- 默认 `TEST_RUN_ID` 带时间和随机后缀，每次运行不同。
- 数据会随写入型 e2e 变化。
- 不适合作为长期稳定 baseline 锚点。

适用性：仅适合临时调试，不建议作为默认策略。

### 方案 B：新增 snapshot 专用 bootstrap 数据

说明：

- 后续准备固定工单和固定房源。
- 例如 `SNAPSHOT-WO-001`、`SNAPSHOT-UNIT-001`。

优点：

- 最稳定。
- baseline diff 更容易解释。
- 有利于后续 workflow。

缺点：

- 需要新增脚本或 seed。
- 需要维护数据生命周期。
- 需要避免污染 production-safe seed。

适用性：适合中期设计，不在本阶段实现。

### 方案 C：由快照脚本只读查找已存在固定编码

说明：

- 快照脚本不创建数据。
- 只根据 `SNAPSHOT_WORKORDER_NO` / `SNAPSHOT_UNIT_NO` 查找当前环境中已存在记录。

优点：

- 改动较小。
- 不新增 seed。
- 符合只读快照脚本定位。

缺点：

- 依赖环境中存在该记录。
- 固定记录缺失时需要明确 FAIL。

适用性：推荐作为下一步脚本改造的第一阶段。

## 9. 是否需要 snapshot 专用账号

当前不立即引入 snapshot 专用账号。

分析：

- 当前管理员账号数据范围大，返回结果更容易受测试库整体数据变化影响。
- 专用只读账号可以固定权限和数据范围。
- 专用账号需要初始化、授权、密码管理和文档维护。
- 在固定业务标识机制落地前，先引入账号会增加变量。

建议：

- 短期继续使用当前管理员账号。
- 中期先完成固定业务标识机制。
- 长期在考虑 workflow 或 release-smoke label 前，再评估只读快照账号。

## 10. baseline 维护影响

引入固定业务标识后，baseline 维护规则需要补充：

- baseline 更新前必须确认目标业务编号存在。
- baseline PR 必须说明使用的业务编号。
- 如果 `SNAPSHOT_WORKORDER_NO` 或 `SNAPSHOT_UNIT_NO` 不存在，不应 update baseline。
- 如果使用 fallback 生成 baseline，不应提交。
- 如果目标业务编号对应数据被修改，应说明修改来源。
- 如果目标业务编号从环境中消失，应先恢复固定数据或调整策略，而不是把空结果固化为 baseline。

建议 PR 说明增加：

```text
快照业务锚点：
- SNAPSHOT_WORKORDER_NO=
- SNAPSHOT_UNIT_NO=
- ALLOW_SNAPSHOT_FALLBACK=false
```

## 11. 后续实施建议

建议分批实施。

### B1：脚本支持固定业务标识

目标：

- 支持 `SNAPSHOT_WORKORDER_NO`。
- 支持 `SNAPSHOT_UNIT_NO`。
- 找不到目标默认 FAIL。
- 支持显式 `ALLOW_SNAPSHOT_FALLBACK=true`。
- fallback 时输出 warning。
- 不改变已有 `SNAPSHOT_MODE` 和 `UPDATE_SNAPSHOTS=true` 语义。

范围：

- 只修改 `scripts/e2e/first-release-api-snapshots.mjs`。
- 不改 baseline，除非后续实际运行需要更新。
- 不新增 seed。
- 不接入 CI。

### B2：设计或准备固定测试数据

目标：

- 明确推荐业务编号。
- 评估是否需要 snapshot bootstrap。
- 评估是否需要固定工单日志数据。
- 评估是否需要固定房源状态数据。

建议候选：

- `SNAPSHOT-WO-001`
- `SNAPSHOT-UNIT-001`

本阶段只做设计，不新增数据。

### B3：再评估接入 workflow

前置条件：

- 固定业务标识已稳定。
- baseline 维护规则已更新。
- fallback 禁用策略明确。
- 测试数据来源清楚。

策略：

- 先评估手动 workflow。
- 再评估 release-smoke label。
- 不直接进入常规 CI。

## 12. 不建议事项

当前不建议：

- 静默 fallback 到第一条。
- 使用数据库 ID / UUID 作为配置项。
- 自动创建大量业务数据。
- 在没有固定业务标识时更新 baseline。
- 提交 fallback 生成的 baseline。
- 立即新增 seed。
- 立即新增 snapshot 专用账号。
- 立即接入 CI。
- 将写入接口纳入快照。

## 13. 结论

建议引入固定业务标识机制，但分阶段实施。

下一步优先设计并实现脚本对 `SNAPSHOT_WORKORDER_NO`、`SNAPSHOT_UNIT_NO` 和显式 fallback 的支持。默认策略应为找不到固定业务标识即 FAIL，不静默回退到列表第一条。

本阶段不修改脚本、不修改 baseline、不新增 seed、不新增账号、不接入 CI。
