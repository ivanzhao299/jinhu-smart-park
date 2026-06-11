# JinHu Smart Park 接口快照数据稳定性策略设计

## 1. 设计目的

本文用于设计接口快照测试的数据稳定性策略，降低 baseline 因测试数据写入、排序变化、动态字段或本地脏数据导致的波动。

本阶段只做文档设计，不修改脚本、不修改 baseline、不修改业务代码、不修改 CI、不修改 `package.json` / `pnpm-lock.yaml`。

## 2. 背景

当前已有接口快照脚本和 baseline：

- 脚本：`scripts/e2e/first-release-api-snapshots.mjs`
- baseline：`scripts/e2e/snapshots/first-release-api-snapshots.json`

当前 baseline 已扩展到 9 个 snapshot：

- `workorders.list`
- `workorders.detail`
- `workorders.logs`
- `workorders.stats`
- `workorders.overdue`
- `workorders.slaRules`
- `units.list`
- `units.detail`
- `units.statistics`

已暴露的问题：

- `first-release-workorders.mjs` 会创建新工单并派单。
- 新工单会影响 `workorders.list` 第一条样本、`workorders.detail` 详情样本、`workorders.logs` 日志样本和 `workorders.stats` 统计数值。
- 变化来源可解释，但说明当前快照 baseline 仍受测试数据变化影响。

继续扩展快照前，应先明确数据稳定性策略。

## 3. 当前数据依赖分析

当前快照脚本依赖：

- 现有管理员账号。
- 当前测试库中的工单数据。
- 当前测试库中的工单日志数据。
- 当前测试库中的工单 stats 统计结果。
- 当前测试库中的 SLA 规则数据。
- 当前测试库中的房源数据。
- 当前测试库中的房源 statistics 统计结果。

当前快照脚本读取方式：

- `GET /work-orders?page=1&page_size=10`
- 从工单列表第一条取得 ID。
- `GET /work-orders/:id`
- `GET /work-orders/:id/logs?page=1&page_size=10`
- `GET /work-orders/stats`
- `GET /work-orders/overdue?page=1&page_size=10`
- `GET /work-orders/sla-rules?page=1&page_size=10`
- `GET /park-units?page=1&page_size=10`
- 从房源列表第一条取得 ID。
- `GET /park-units/:id`
- `GET /park-units/statistics`

### 稳定结构

相对稳定的内容包括：

- 顶层响应结构。
- `items` / `pagination` 形态。
- 字段集合。
- `stats` 字段名。
- `statistics` 字段名。
- `item_count_category`。
- `total` / `total_pages` 已归一化后的字段存在性。
- 动态 ID、时间、创建人、更新人字段的归一化结果。

### 易变数据

容易受数据变化影响的内容包括：

- 工单列表第一条。
- 工单详情样本。
- 工单日志第一条。
- 工单统计数值。
- 工单 `pagination total` 的真实值。
- SLA 规则第一条样本。
- 房源列表第一条。
- 房源详情样本。
- 房源 statistics 数值。
- 运行写入型 e2e 后新增的数据。
- 本地手动测试数据。

## 4. 当前污染来源

当前已确认的写入来源：

- `first-release-workorders.mjs`
  - 创建新工单：`POST /work-orders`
  - 派单：`POST /work-orders/:id/assign`
  - 派单 replay / conflict 验证
  - 影响工单列表、详情、日志和 stats。
- `first-release-users-assets.mjs`
  - 创建用户：`POST /users`
  - 重置密码：`POST /users/:id/reset-password`
  - 分配角色：`POST /users/:id/roles`
  - 资产部分读取 `/assets/parks`、`/assets/buildings`、`/assets/floors`、`/assets/units`，不写资产数据。

其他潜在污染来源：

- 本地手动创建或修改工单。
- 本地手动创建或修改房源。
- 手动调整 SLA 规则。
- 手动执行 seed 或 bootstrap。
- 重复执行会写数据的 e2e。
- 使用不同租户 / 园区 / 管理员上下文运行快照。

如果没有数据稳定规则，这类变化容易导致频繁 update baseline，降低快照测试的信噪比。

## 5. 稳定性策略候选

### 方案 A：固定查询条件

快照脚本只查询固定条件下的数据。

可选方向：

- 列表接口加稳定筛选。
- 列表接口加稳定排序。
- 工单列表只查询固定工单编号或固定标题。
- 房源列表只查询固定房源编码。

优点：

- 成本低。
- 不需要立即新增 seed。
- 可以显著减少“列表第一条漂移”。

缺点：

- 需要确保固定记录存在。
- 如果固定记录被改动或删除，快照仍会波动。
- 需要后续脚本支持固定业务标识。

### 方案 B：固定业务标识

使用稳定业务编码作为快照锚点。

示例：

- `SNAPSHOT-WO-001`
- `SNAPSHOT-UNIT-001`

建议方式：

- 快照脚本先通过业务编码查询列表。
- 从查询结果中取得 ID。
- 详情、日志等接口继续使用 ID。

优点：

- 比直接依赖列表第一条稳定。
- baseline diff 更容易解释。
- 适合工单和房源详情类快照。

缺点：

- 需要准备固定数据。
- 需要约定固定业务编码不可被普通 e2e 覆盖。
- 需要补充缺失数据时的处理策略。

### 方案 C：快照专用测试数据

后续建立专门的 snapshot seed 或 bootstrap 数据，用于快照脚本。

优点：

- 数据最稳定。
- 可以保留更多关键字段和统计值。
- 有利于后续接入手动 workflow。

缺点：

- 增加 seed / bootstrap 维护成本。
- 需要区分 production-safe seed、dev seed 和 snapshot seed 的职责。
- 需要避免把测试数据混入生产初始化链路。

### 方案 D：快照专用账号

使用只读快照账号运行快照脚本。

目标：

- 权限固定。
- 数据范围固定。
- 避免管理员权限过大导致返回范围随数据变化扩大。

优点：

- 权限边界更稳定。
- 更接近后续 workflow 的可控执行环境。

缺点：

- 需要账号初始化和权限维护。
- 需要明确该账号不能用于写入型 e2e。
- 需要避免提交密码或 token。

### 方案 E：降低快照内容粒度

降低数据敏感 snapshot 的内容粒度。

可选方向：

- 列表只保留字段集合、count category 和少量稳定字段。
- 详情只保留字段集合和稳定业务字段。
- stats 先保留字段名，数值仅在固定数据下保留。
- 对易变数组只保留字段集合和首条归一化样本。

优点：

- 减少误报。
- 不需要立刻准备固定数据。

缺点：

- 对业务口径变化的捕捉能力降低。
- 过度降粒度会让快照只剩 schema 检查。

### 方案 F：隔离运行顺序

快照测试尽量在写入型 e2e 之前运行。

优点：

- 立刻可执行。
- 不需要改脚本。
- 可以减少 `first-release-workorders.mjs` 对 baseline 的即时影响。

缺点：

- 仍依赖初始数据稳定。
- 如果测试库已经被污染，运行顺序不能解决问题。
- 不适合作为长期唯一策略。

## 6. 推荐策略

### 短期

短期建议：

- 快照脚本继续手动运行。
- 快照测试优先运行在写入型 e2e 之前。
- 不接入 CI。
- 不继续扩大接口覆盖范围。
- 对列表保留结构和有限样本。
- 对 stats 数值变化保持人工审查。
- baseline 更新必须遵守维护规则。
- 如果已运行写入型 e2e，再跑快照时先判断 diff 来源，不直接 update baseline。

### 中期

中期建议：

- 引入固定业务标识。
- 为工单和房源准备稳定快照数据。
- 快照脚本优先通过业务编码查找目标记录。
- 减少对列表第一条的依赖。
- 对 `workorders.stats` 区分字段名快照和数值快照。
- 设计固定查询条件和排序参数。

### 长期

长期建议：

- 设计 snapshot seed 或 snapshot bootstrap。
- 设计只读快照账号。
- 明确快照数据不进入生产初始化链路。
- 考虑手动 workflow 或 release-smoke label。
- baseline 稳定后再评估 CI。

## 7. 后续脚本调整建议

后续实施时可考虑：

- 支持 `SNAPSHOT_WORKORDER_NO`。
- 支持 `SNAPSHOT_UNIT_NO`。
- 支持固定排序参数。
- 支持固定筛选参数。
- 支持仅 schema 模式作为低波动检查。
- 支持跳过 data-sensitive snapshot。
- 支持在检测到写入型 e2e 后提示重新判断 baseline diff。
- 输出 baseline 波动原因提示。
- 输出当前查询锚点，例如工单编号、房源编码、租户、园区。
- 对 `stats` 支持字段名快照和数值快照分层。

本阶段不实现上述脚本能力。

## 8. 快照运行顺序建议

当前手动流程建议：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
```

如果需要更新 baseline，建议流程：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-api-snapshots.mjs
```

如先运行了写入型 e2e，再跑快照，应预期 baseline 可能变化。不应直接 update，需要先判断差异来源。

## 9. baseline 更新补充规则

baseline 更新前应补充判断：

- 差异是否来自写入型 e2e 新增数据。
- 差异是否来自本地手动脏数据。
- 差异是否来自测试库重置、seed 或 bootstrap 变化。
- 差异是否来自不同租户 / 园区 / 账号上下文。
- 差异是否来自排序不稳定。
- 差异是否来自列表第一条变化。
- stats 数值变化是否由测试数据变化导致。

处理建议：

- 如果差异来自写入型 e2e 新增数据，应优先判断是否需要重置测试库或调整查询条件，而不是直接更新 baseline。
- 如果 stats 数值变化，应先确认是否由测试数据变化导致。
- 如果列表第一条变化，应检查排序和筛选是否稳定。
- 如果只是本地脏数据导致变化，不应提交 baseline 更新。
- 如果固定数据缺失，应先解决数据来源，而不是把空结果固化成 baseline。

## 10. 不建议方案

当前不建议：

- 每次快照前清空生产类数据库。
- 在快照脚本中自动创建大量业务数据。
- 在 baseline 维护规则和数据策略不稳定前接入常规 CI。
- 直接扩大覆盖范围。
- 将写入接口纳入快照。
- 将状态流转接口纳入快照。
- 将账务、租赁、幂等写入口、导入导出、附件上传、认证流程纳入当前快照范围。
- 把本地脏数据直接固化为 baseline。
- 通过反复 update baseline 掩盖数据不稳定问题。

## 11. 分阶段路线

### D1：数据稳定性策略设计

当前阶段。

产出：

- 明确污染来源。
- 明确稳定字段和易变数据。
- 明确短中长期策略。
- 明确后续脚本调整方向。

### D2：脚本支持固定业务标识设计

只做设计。

建议重点：

- `SNAPSHOT_WORKORDER_NO`
- `SNAPSHOT_UNIT_NO`
- 固定查询条件。
- 固定排序。
- 缺失固定数据时的 skip / fail 策略。

### D3：脚本支持固定业务标识实施

小范围改脚本。

实施原则：

- 不改业务代码。
- 不新增依赖。
- 不扩大接口范围。
- 不接入 CI。
- 保持旧 baseline 对照能力。

### D4：快照专用测试数据设计

再评估是否需要 seed / bootstrap。

重点：

- 不污染 production-safe seed。
- 与 dev seed 职责隔离。
- 明确数据所有权和更新规则。

### D5：手动 workflow 或 release-smoke label 设计

规则稳定后再考虑。

目标：

- 先手动 workflow。
- 再 release-smoke label。
- 最后才评估常规 CI。

## 12. 结论

当前建议先收口数据稳定性策略。

下一步优先设计固定业务标识机制，减少对列表第一条和当前测试库滚动数据的依赖。暂不扩接口范围，暂不接 CI，暂不修改脚本、baseline、业务代码或 seed。

后续同步：固定业务标识机制已落地，文档入口为 `docs/testing/api-snapshot-business-key-plan.md`，收口复核见 `docs/testing/api-snapshot-business-key-closure-review.md`。当前脚本已支持 `SNAPSHOT_WORKORDER_NO`、`SNAPSHOT_UNIT_NO` 和显式 `ALLOW_SNAPSHOT_FALLBACK=true`，但仍未接入 CI，也未新增 seed 或 snapshot 专用账号。固定测试数据设计见 `docs/testing/api-snapshot-fixed-data-plan.md`，下一步建议继续设计 snapshot bootstrap。
