# JinHu Smart Park 接口快照小范围扩展实施 1 收口复核

## 1. 复核目的

本文用于复核接口快照第一轮小范围扩展后的状态，确认新增工单快照是否稳定，baseline diff 是否合理，以及当前是否适合阶段性收口。

本阶段只做文档复核，不修改脚本、不修改 baseline、不扩展接口、不接入 CI、不修改业务代码。

## 2. 扩展内容

本轮新增 snapshot：

- `workorders.overdue`
- `workorders.slaRules`

对应接口：

- `GET /work-orders/overdue`
- `GET /work-orders/sla-rules`

本轮未扩展：

- `/assets/units`
- `/assets/units/:id`
- 用户 / 楼栋 / 楼层
- 写入接口
- 状态流转接口
- 账务 / 租赁 / 幂等 / 认证
- 导入导出 / 附件上传 / 跨模块聚合

本轮未修改：

- 业务代码
- 后端 controller / service / DTO / entity
- 前端代码
- CI workflow
- `package.json` / `pnpm-lock.yaml`
- database migration / seed

## 3. 当前 baseline 状态

当前 baseline 文件为 `scripts/e2e/snapshots/first-release-api-snapshots.json`，共 9 个 snapshot：

- `workorders.list`
- `workorders.detail`
- `workorders.logs`
- `workorders.stats`
- `workorders.overdue`
- `workorders.slaRules`
- `units.list`
- `units.detail`
- `units.statistics`

当前 baseline mode 为 `normalized`。

## 4. 新增 snapshot 复核

### workorders.overdue

`workorders.overdue` 对应 `GET /work-orders/overdue`，当前为只读快照。

当前 baseline 结构：

- 保留分页结构：`page`、`page_size`、`total`、`total_pages`。
- `total` 使用 `"<normalized-number>"` 归一化。
- 当前 `item_count_category` 为 `empty`。
- 当前 `item_fields` 为空数组。
- 当前 `first_item` 为 `null`。

复核结论：

- 当前是空列表快照，符合当前测试数据状态。
- 即使列表为空，仍保留了分页结构，能保护接口返回形态。
- 未发现 token、密码、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。
- 适合继续保留。

注意：后续如果测试数据包含逾期工单，`workorders.overdue` 会从空列表变成非空列表，届时需要重新复核字段集合和 first item 归一化结果。

### workorders.slaRules

`workorders.slaRules` 对应 `GET /work-orders/sla-rules`，当前为 SLA 规则只读快照。

当前 baseline 结构：

- 保留分页结构：`page`、`page_size`、`total`、`total_pages`。
- `total` 使用 `"<normalized-number>"` 归一化。
- 当前 `item_count_category` 为 `many`。
- 保留 SLA 规则 item 字段集合。
- 保留首条归一化样本。

当前字段集合包含：

- `woType`
- `urgency`
- `priority`
- `dispatchSlaMin`
- `finishSlaMin`
- `escalateRoleCode`
- `status`
- `version`
- `remark`
- 以及已归一化的审计 / 租户 / 园区字段

复核结论：

- 当前包含 SLA 规则结构和首条归一化样本。
- `id`、`tenantId`、`parkId`、`createBy`、`updateBy`、`createTime`、`updateTime` 均已归一化。
- 未发现 token、密码、request id、trace id、原始 UUID、ISO 时间戳、文件 URL 或 signed URL。
- 适合继续保留。

## 5. baseline diff 复核

本轮 baseline diff 包含：

- 新增 `workorders.overdue`。
- 新增 `workorders.slaRules`。
- `units.*` 未变化。
- 既有 `workorders.list`、`workorders.detail`、`workorders.logs`、`workorders.stats` 有变化。

既有 `workorders.*` 变化原因：

- 按验证要求执行了 `node scripts/e2e/first-release-workorders.mjs`。
- 该脚本会创建并派单一个新工单。
- 新工单改变了工单列表第一条样本、详情样本、日志样本和 stats 统计值。
- 已重新执行 `UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs`。
- 已再次执行普通快照检查并通过。

复核结论：既有 `workorders.*` 变化有明确数据写入来源，可接受。`units.*` 未变化，说明本轮没有扩大房源快照影响面。

## 6. 敏感信息与动态字段检查

baseline 检查未发现：

- token
- 密码
- request id
- trace id
- 原始 UUID
- ISO 时间戳原值
- 文件 URL
- signed URL
- Bearer token
- 临时下载地址

当前归一化规则对本轮新增 snapshot 足够，不需要立即调整。

## 7. 验证情况

已完成验证：

- 普通快照检查。
- `UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs`。
- 再次普通快照检查。
- `node scripts/e2e/first-release-workorders.mjs`。
- 工单回归写入新工单后，再次 update baseline。
- 再次普通快照检查。
- `git diff --check`。
- `node --check scripts/e2e/first-release-api-snapshots.mjs`。
- `pnpm lint`。
- `pnpm typecheck`。

未执行完整 `node scripts/e2e/first-release-regression.mjs`。

原因：本轮是最小快照扩展，完整首发回归范围更大且会继续写入测试数据，不作为本次收口必要验证。后续如果准备接入 workflow 或 release-smoke label，再单独设计完整回归组合。

## 8. 当前限制

当前限制：

- `workorders.overdue` 当前为空列表快照，后续如测试数据包含逾期工单，需要重新评估 baseline。
- 未覆盖 `/assets/units` 兼容路径。
- 未覆盖 `/assets/units/:id` 兼容路径。
- 未接入 CI。
- baseline 仍依赖当前测试数据。
- `first-release-workorders.mjs` 会写入新工单，可能导致 `workorders.*` 快照变化。
- 当前仍未建立自动隔离测试数据机制。
- 当前仍未建立专用快照 seed。
- 当前仍未建立独立快照测试账号 / 数据集。

这些限制与本轮“只扩工单两个只读 snapshot”的目标一致，不构成本轮继续改脚本或扩大范围的理由。

## 9. 收口判断

建议本轮扩展阶段性收口。

判断：

- 建议本轮阶段性收口。
- 不建议立即接入 CI。
- 不建议立即继续扩展 `/assets/units`。
- 暂不需要调整归一化规则。
- 暂不需要修改 baseline 维护规则。

理由：

- 两个新增接口均为只读查询。
- baseline 已包含 9 个 snapshot。
- 新增 snapshot 结构可读、可解释、可复核。
- 敏感信息和动态字段检查未发现问题。
- 既有 `workorders.*` diff 有明确测试数据写入来源。
- 普通快照检查已在最终 baseline 上通过。
- lint 和 typecheck 已通过。

## 10. 后续建议

### P1：快照数据稳定性策略

优先设计快照数据稳定性策略：

- 减少 e2e 写入对 baseline 的影响。
- 明确快照测试前置数据状态。
- 评估是否需要独立快照测试账号。
- 评估是否需要独立快照测试数据。
- 评估是否需要在快照脚本中选择更稳定的样本规则。
- 明确会写数据的 e2e 执行后是否必须重新 update baseline。

### P2：/assets/units 兼容路径扩展设计

后续再设计 `/assets/units` 兼容路径扩展：

- 先设计，再实施。
- 不直接扩脚本。
- 不默认 `/assets/units` 与 `/park-units` 返回结构一致。
- 单独复核字段集合、排序、详情 ID 来源和 baseline diff。

### P3：手动 workflow / release-smoke label

当前仍暂缓。

建议在 baseline 更稳定后，再评估：

- 手动 workflow。
- release-smoke label。
- PR label 触发。

不建议当前直接进入常规 CI。

## 11. 结论

接口快照小范围扩展实施 1 可以阶段性收口。

本轮新增 `workorders.overdue` 和 `workorders.slaRules` 两个只读快照，baseline 已扩展到 9 个 snapshot。新增 snapshot 未发现敏感信息或动态原值；既有工单快照变化由 `first-release-workorders.mjs` 写入新工单造成，来源清楚且已通过 update 后普通检查验证。

下一步建议优先设计快照数据稳定性策略，再评估 `/assets/units` 兼容路径扩展。不建议立即接入 CI，也不建议立即继续扩大接口覆盖范围。
