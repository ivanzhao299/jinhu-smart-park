# JinHu Smart Park 接口快照小范围扩展设计

## 1. 设计目的

本文用于评估接口快照脚本初版后的第一轮小范围扩展，避免盲目扩大覆盖范围或提前接入 CI。

本轮只做扩展设计，不修改 `scripts/e2e/first-release-api-snapshots.mjs`，不修改 baseline，不接入 CI。

## 2. 当前状态

当前已有：

- 快照脚本：`scripts/e2e/first-release-api-snapshots.mjs`
- baseline：`scripts/e2e/snapshots/first-release-api-snapshots.json`
- baseline 维护规则：`docs/testing/api-snapshot-baseline-policy.md`
- 初版收口复核：`docs/testing/api-snapshot-initial-closure-review.md`

当前 baseline 覆盖 7 个 snapshot：

- `workorders.list`
- `workorders.detail`
- `workorders.logs`
- `workorders.stats`
- `units.list`
- `units.detail`
- `units.statistics`

对应接口：

- `GET /work-orders`
- `GET /work-orders/:id`
- `GET /work-orders/:id/logs`
- `GET /work-orders/stats`
- `GET /park-units`
- `GET /park-units/:id`
- `GET /park-units/statistics`

## 3. 候选扩展接口

### 工单

- `GET /work-orders/overdue`
- `GET /work-orders/sla-rules`

### 房源兼容路径

- `GET /assets/units`
- `GET /assets/units/:id`

## 4. workorders.overdue 分析

`GET /work-orders/overdue` 当前是只读接口。

代码路径：

- `WorkOrdersController.overdue`
- `WorkOrderQueryService.overdue`
- `WorkOrderQueryService.list`

当前实现通过 `{ ...query, overdue_only: true }` 复用工单列表查询逻辑，只追加 `workOrder.overdue_flag = true` 过滤条件。该 GET 路径不调用 `recalculateOverdue`，不写入工单，也不创建工单日志。

适合保存的快照内容：

- 顶层分页结构。
- 列表 item 字段集合。
- 第一条归一化样本。
- `overdueFlag`、`overdueReason` 的字段存在性。
- `status`、`priority`、`urgency`、`woType` 等关键枚举。

应归一化的字段：

- `id`、`*_id`、`*Id`
- `createTime`、`updateTime`、`dispatchTime` 等时间字段
- `createBy`、`updateBy`
- `total`、`total_pages`

误报风险：

- 测试环境没有逾期工单时，列表可能为空。
- 运行会写数据的工单 e2e 后，排序和 first item 可能变化。
- 如果后续把 GET overdue 改成实时重算，会改变只读假设，应先单独设计。

结论：适合第一批扩展，但实现时应允许空列表形成稳定结构，或明确要求首发测试数据中存在逾期工单。若选择 fail-on-empty，需要在 PR 中说明数据前置条件。

## 5. workorders.slaRules 分析

`GET /work-orders/sla-rules` 当前是只读接口。

代码路径：

- `WorkOrdersController.listSlaRules`
- `WorkOrderQueryService.listSlaRules`
- `workOrderSlaRulesRepository.findAndCount`

当前 GET 路径只读取 `biz_work_order_sla_rule`，按租户、园区、未删除状态和查询条件过滤。SLA 规则写入路径是独立的 `POST /work-orders/sla-rules`、`PUT /work-orders/sla-rules/:id`、`DELETE /work-orders/sla-rules/:id`，不在本候选接口内。

适合保存的快照内容：

- 顶层分页结构。
- 列表 item 字段集合。
- `woType`、`urgency`、`priority`、`dispatchSlaMin`、`finishSlaMin`、`status`。
- `escalateRoleCode` 字段存在性。

应归一化的字段：

- `id`
- `tenantId`、`parkId`
- `createTime`、`updateTime`
- `createBy`、`updateBy`
- `total`、`total_pages`

误报风险：

- SLA seed 或测试数据变化会影响列表数量和 first item。
- 当前按 `update_time DESC` 排序，更新 SLA 规则后 first item 可能变化。
- 如果后续新增默认 SLA 规则，baseline 会发生预期 diff。

结论：适合第一批扩展。相比 `overdue`，该接口数据形态更稳定，建议优先纳入。

## 6. /assets/units 兼容路径分析

`GET /assets/units` 当前是只读接口，但它不是 `/park-units` 的同一路由代理。

代码路径：

- `AssetsController.listUnits`
- `AssetsService.listUnits`
- `AssetUnitEntity`

`GET /park-units` 的代码路径是：

- `UnitsController.list`
- `UnitsQueryService.list`
- `UnitEntity`

两者都返回分页结构，也都经过字段权限处理，但查询服务、实体和默认排序不同：

- `/assets/units` 使用 `AssetsService.listUnits`，按 `unitNo ASC, createTime DESC` 排序。
- `/park-units` 使用 `UnitsQueryService.list`，默认按 `updateTime DESC, createTime DESC` 排序。

因此不应假设 `/assets/units` 与 `/park-units` 返回结构完全一致。`/assets/units` 的快照价值是保护资产域兼容读面，避免后续重构时破坏仍在使用的基础资产接口。

适合保存的快照内容：

- 顶层分页结构。
- 列表 item 字段集合。
- `unitCode`、`unitName`、`unitNo`、`usageType`、`leaseStatus`、`status` 等兼容路径字段。
- `assetPark`、`building`、`floor` 关联字段的结构存在性。

误报风险：

- 与 `/park-units` 字段命名和排序不同，不能共用 baseline。
- 现有 `first-release-users-assets.mjs` 已覆盖 `/assets/units` 分页可用性，快照扩展属于结构稳定性补强。
- 如直接同批扩展，容易与工单 query service 扩展混在一个 baseline diff 中，降低复核清晰度。

结论：适合扩展，但建议放第二批，使用独立 snapshot 名称，例如 `assetsUnits.list`。

## 7. /assets/units/:id 兼容路径分析

`GET /assets/units/:id` 当前是只读接口，但它同样不是 `/park-units/:id` 的同一路由代理。

代码路径：

- `AssetsController.detailUnit`
- `AssetsService.detailUnit`
- `AssetUnitEntity`

`GET /park-units/:id` 的代码路径是：

- `UnitsController.detail`
- `UnitsQueryService.detail`
- `UnitEntity`

`/assets/units/:id` 详情逻辑会读取 `assetPark`、`building`、`floor` 关联，并经过字段权限处理；`/park-units/:id` 则读取房源 query service 的详情结构，包含其自身的关联与文件字段策略。两者可以都代表房源读面，但不是同一套查询逻辑。

适合保存的快照内容：

- 详情字段集合。
- 房源编码和状态类字段。
- 楼栋、楼层、园区关联字段结构。

应归一化的字段：

- `id`、`*_id`、`*Id`
- 时间字段。
- 创建 / 更新人。
- 文件 URL 或签名 URL。

误报风险：

- 详情 ID 需要从 `/assets/units` 列表中取得，不应复用 `/park-units` 的 ID 假设。
- 字段权限策略可能使不同账号下字段可见性不同。
- 兼容路径与直连路径字段差异应作为独立 baseline 维护，而不是要求一致。

结论：适合纳入快照，但建议与 `assetsUnits.list` 一起作为第二批扩展。

## 8. 扩展范围建议

### 方案 A：一次扩展全部候选

一次新增：

- `workorders.overdue`
- `workorders.slaRules`
- `assetsUnits.list`
- `assetsUnits.detail`

优点：

- 一次完成当前候选范围。
- 快速覆盖更多只读接口。

风险：

- 工单 query service 扩展和资产兼容路径扩展混在同一 baseline diff 中。
- `/assets/units` 与 `/park-units` 不共用查询逻辑，字段差异需要更多复核。
- 如果测试数据或排序造成 diff，排查范围更大。

### 方案 B：分两批扩展

第一批：

- `workorders.overdue`
- `workorders.slaRules`

第二批：

- `assetsUnits.list`
- `assetsUnits.detail`

优点：

- 先收口工单 query service 的剩余只读查询。
- baseline diff 更小，reviewer 更容易判断。
- 资产兼容路径可单独确认字段结构和命名差异。
- 更符合当前“手动运行、逐步稳定”的策略。

推荐方案 B。

## 9. baseline 更新要求

后续实施时必须遵循 baseline 维护规则：

1. 先运行普通检查。
2. 确认失败项来自预期新增 snapshot 或预期接口变化。
3. 再运行 `UPDATE_SNAPSHOTS=true`。
4. 再运行普通检查。
5. 查看 baseline diff。
6. 确认只新增或更新预期 snapshot。
7. 确认 baseline 不包含 token、密码、request id、trace id、原始 UUID、时间戳、文件 URL、signed URL。
8. PR 中说明 baseline 更新原因和新增 snapshot。
9. 如运行过会写数据的 e2e，需要重新判断数据变化是否会影响 first item、pagination total 或统计值。

新增 snapshot 命名建议：

- `workorders.overdue`
- `workorders.slaRules`
- `assetsUnits.list`
- `assetsUnits.detail`

## 10. 验证计划

后续实施时建议执行：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-api-snapshots.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-users-assets.mjs
git diff --check
node --check scripts/e2e/first-release-api-snapshots.mjs
```

可选执行：

```bash
pnpm lint
pnpm typecheck
```

如果只做文档设计，不执行脚本和 baseline 更新。

## 11. 是否进入 CI

本轮不进入 CI。

建议策略：

- 小范围扩展仍保持手动运行。
- baseline 维护规则稳定后，再考虑手动 workflow 或 release-smoke label。
- 不直接进入常规 CI。

原因：

- baseline 仍依赖测试数据稳定性。
- `overdue` 和 SLA 规则可能受本地数据或 seed 变化影响。
- `/assets/units` 兼容路径与 `/park-units` 字段差异需要先在人工 review 中稳定。

## 12. 暂缓范围

继续暂缓：

- 写入接口。
- 状态流转接口。
- 账务。
- 租赁合同。
- 幂等写入口。
- 导入导出。
- 附件上传。
- 认证流程。
- 跨模块聚合。
- 更多用户 / 楼栋 / 楼层接口。
- `park-units/:id/workorders`、`park-units/:id/hazards`、`park-units/:id/emergencies`、`park-units/:id/work-permits`、`park-units/:id/devices`。

这些接口要么副作用更强，要么动态数据更多，要么需要独立测试策略，不应混入第一轮小范围扩展。

## 13. 结论

建议继续扩展接口快照，但采用分两批策略。

第一批优先扩展：

- `GET /work-orders/overdue`
- `GET /work-orders/sla-rules`

第二批再扩展：

- `GET /assets/units`
- `GET /assets/units/:id`

本轮不修改脚本、不修改 baseline、不接入 CI。后续实施时应先普通检查，再 update baseline，再普通检查，并按 baseline 维护规则审查 diff。

## 14. 第一批实施状态

第一批工单只读查询扩展已实施：

- 已新增 `workorders.overdue`。
- 已新增 `workorders.slaRules`。
- baseline 已扩展到 9 个 snapshot。
- 当前仍保持手动运行，不接入 CI。
- `/assets/units` 和 `/assets/units/:id` 兼容路径仍作为下一批候选，不在本轮实现范围内。

后续如继续扩展第二批，应单独审查 `/assets/units` 与 `/park-units` 的字段差异和 baseline diff，不应默认两者返回结构一致。
