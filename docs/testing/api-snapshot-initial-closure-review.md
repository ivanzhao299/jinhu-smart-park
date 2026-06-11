# JinHu Smart Park 接口快照脚本初版收口复核

## 1. 复核目的

本文用于复核接口快照脚本初版的覆盖范围、baseline 内容、归一化规则、运行方式、验证证据和后续扩展策略。

本次复核只做文档收口，不修改业务代码，不修改接口快照脚本逻辑，不修改 baseline，不扩展接口覆盖范围，不接入 CI。

## 2. 初版脚本状态

当前初版已落地：

- 新增脚本：`scripts/e2e/first-release-api-snapshots.mjs`
- 新增 baseline：`scripts/e2e/snapshots/first-release-api-snapshots.json`
- 当前仅手动运行。
- 当前未接入 CI。
- 当前未修改业务代码。
- 当前未修改后端 controller / service / DTO / entity。
- 当前未修改前端代码。
- 当前未修改现有 e2e 脚本行为。
- 当前未修改 `package.json` / `pnpm-lock.yaml`。

脚本复用现有 e2e 风格，包括 `API_BASE_URL` 默认值、管理员默认账号、登录获取 token、`fetch` helper、`[INFO] / [PASS] / [FAIL]` 输出和 `process.exitCode` 失败处理。

## 3. 当前覆盖范围

当前 baseline 包含 7 个 snapshot：

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

当前覆盖重点是阶段五-F 已完成 query service 拆分、且属于首发关键路径的工单和房源核心只读查询。

## 4. 当前运行方式

普通检查：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

更新 baseline：

```bash
UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs
```

模式：

```bash
SNAPSHOT_MODE=schema node scripts/e2e/first-release-api-snapshots.mjs
SNAPSHOT_MODE=key-fields node scripts/e2e/first-release-api-snapshots.mjs
SNAPSHOT_MODE=normalized node scripts/e2e/first-release-api-snapshots.mjs
```

环境变量支持：

- `API_BASE_URL`，默认 `http://localhost:3001/api/v1`
- `ADMIN_USERNAME`，默认 `admin`
- `ADMIN_PASSWORD`，默认沿用现有 e2e 脚本的 `Jinhu@123456`
- `TENANT_ID` / `DEFAULT_TENANT_ID`，默认 `10000001`
- `PARK_ID` / `DEFAULT_PARK_ID`，默认 `20000001`
- `UPDATE_SNAPSHOTS=true`
- `SNAPSHOT_MODE=schema|key-fields|normalized`，默认 `normalized`

## 5. baseline 内容复核

对 `scripts/e2e/snapshots/first-release-api-snapshots.json` 的只读复核结论：

- 未发现 token、password、Bearer、accessToken、refresh token、secret 等明显敏感字段原值。
- 未发现 `request_id`、`trace_id`、`x-request-id` 原值。
- 未发现 UUID 正则形态的原始 ID。
- 未发现 ISO 时间戳原值。
- 未发现 `http://`、`https://`、`/files/`、`signature=`、`x-amz-`、`expires=` 等明显文件 URL 或 signed URL。
- baseline 包含 `"<normalized>"` 和 `"<normalized-number>"` 占位，说明 ID、时间、创建 / 更新人、分页 total 等动态字段已被归一化。
- baseline 仍保留工单编号、房源编号、状态、类型、优先级、统计字段名、统计数值、列表 item 字段集合等关键业务信息。

复核结论：当前 baseline 未发现明显敏感信息或未归一化的高风险动态字段，内容符合初版手动快照 baseline 的预期。

## 6. 归一化规则复核

当前归一化规则覆盖：

- `id` / `uuid`
- `*_id`
- `*Id`
- `token` / `access_token` / `refresh_token`
- `request_id` / `trace_id`
- `created_at` / `updated_at`
- `create_time` / `update_time`
- `createTime` / `updateTime`
- `createdAt` / `updatedAt`
- `timestamp`
- `createBy` / `updateBy` / `statusUpdateBy`
- 以 `Time`、`_time`、`Date`、`_date` 结尾的字符串字段
- `file_url`
- `*Url` / `*_url`
- `url` 字段中的 HTTP、文件路径、签名参数或过期参数
- `pagination.total`
- `pagination.total_pages`
- 数组默认保留 item count category、字段集合和首条归一化样本
- `stats` / `statistics` 通过 `preserveArrays` 保留归一化后的数组内容和统计数值

过宽风险：

- `*Id` / `*_id` 会统一归一化，无法直接发现关联 ID 值变化，只能发现字段存在性变化。
- `*Url` / `*_url` 会统一归一化，无法发现普通非签名 URL 的具体路径变化。
- `createBy` / `updateBy` / `statusUpdateBy` 被归一化，无法发现操作人变更。

这些过宽点在初版可接受，因为当前目标是防止响应结构、关键业务字段和统计口径静默变化，而不是锁死运行环境中的 ID、文件链接或操作人。

过窄风险：

- 工单编号、房源编号、楼栋 / 楼层编码中包含回归时间片段，但它们属于业务编码，当前被保留。
- `stats` / `statistics` 保留统计数值，测试数据变化时可能造成 baseline 波动。
- 列表 first item 的选择依赖当前默认排序和现有测试数据；若先运行会写数据的 e2e，baseline 可能需要重新更新。

这些过窄点需要后续通过 baseline 维护规则和固定数据策略管理，暂不建议在初版继续扩大归一化范围。

复核结论：当前归一化规则对初版手动运行是合理的，能保护结构和关键业务字段，同时控制高风险动态字段。短期不建议继续大改规则，下一步更适合先制定 baseline 更新规范。

## 7. 已完成验证

上一阶段已完成以下验证：

- TDD red：脚本不存在时运行 `node scripts/e2e/first-release-api-snapshots.mjs`，结果为 `MODULE_NOT_FOUND`。
- API 初次不可达时明确失败，随后启动本地 API 补跑。
- 初次 baseline mismatch 失败符合预期。
- `UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs` 生成 baseline：通过。
- `node scripts/e2e/first-release-api-snapshots.mjs` 普通快照检查：通过。
- `node scripts/e2e/first-release-workorders.mjs`：通过。
- `node scripts/e2e/first-release-users-assets.mjs`：通过。
- 因既有脚本会创建新工单，已再次执行 update + 普通快照检查：通过。
- `git diff --check`：通过。
- `node --check scripts/e2e/first-release-api-snapshots.mjs`：通过。
- `pnpm --filter @jinhu/api build`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。

验证结论：从脚本可运行性、baseline 更新、baseline 对照、现有核心 e2e 回归和静态检查看，初版验证证据足够支撑阶段性收口。

## 8. 当前限制

当前限制：

- 当前只覆盖工单和房源核心只读接口。
- 未覆盖 `GET /work-orders/overdue`。
- 未覆盖 `GET /work-orders/sla-rules`。
- 未覆盖 `/assets/units` 兼容路径。
- 未覆盖用户 / 楼栋 / 楼层快照。
- 未覆盖写入接口和状态流转接口。
- 未覆盖账务、租赁合同、幂等写入口、导入导出、附件上传、认证流程。
- 未接入 CI。
- baseline 仍依赖本地或测试环境中的当前数据。
- baseline 可能受会写数据的 e2e 脚本影响。
- 尚未建立 baseline 更新审批规则。
- 尚未定义 PR 中如何说明预期快照变化。

这些限制与初版目标一致，不构成本阶段继续修改脚本或 baseline 的理由。

## 9. 收口判断

建议接口快照脚本初版阶段性收口。

判断依据：

- 脚本覆盖了设计中 T2 的核心只读查询目标。
- baseline 未发现明显敏感信息。
- 动态字段归一化对初版目标基本合适。
- 脚本支持普通检查、更新 baseline 和三种 snapshot mode。
- 脚本未接入 CI，符合“先手动稳定”的策略。
- 未修改业务代码、现有测试脚本、CI、依赖、migration 或 seed。
- 上一阶段验证证据完整，包含 red、baseline mismatch、update、普通对照、相关 e2e、lint 和 typecheck。

不建议立即接入 CI。

不建议立即大规模扩展接口范围。

下一步优先建议设计 baseline 维护规则 / 快照使用规范；如需要扩展接口，建议小范围增加 `workorders.overdue`、`workorders.slaRules` 或 `/assets/units` 兼容路径，不要直接扩到账务、合同、状态流转或跨模块聚合。

## 10. 后续建议

### P1：baseline 维护规则

优先制定 baseline 维护规则：

- 谁可以更新 baseline。
- 什么场景可以更新 baseline。
- PR 中如何说明快照变化。
- 如何区分预期变更和回归。
- update 后必须再跑普通检查。
- 会写数据的 e2e 运行后，是否需要重新 update 并普通检查。
- baseline 变更是否需要附接口字段或统计口径说明。

### P2：小范围扩展

在维护规则明确后，再小范围扩展：

- `workorders.overdue`
- `workorders.slaRules`
- `/assets/units` 兼容路径

扩展时仍应保持只读接口、手动运行、不接入 CI 的策略。

### P3：手动 workflow / release-smoke label

仅在规则稳定后考虑：

- 手动 workflow。
- release-smoke label。
- PR label 触发。

不建议直接进入常规 CI。

### P4：用户 / 楼栋 / 楼层快照

后续再评估：

- `users.list`
- `users.detail`
- `assets.buildings.list`
- `assets.buildings.detail`
- `assets.floors.list`
- `assets.floors.detail`

这部分适合在 baseline 维护规则稳定后再扩展。

## 11. 结论

接口快照脚本初版建议阶段性收口。

当前脚本和 baseline 已满足初版目标：手动运行、覆盖工单和房源核心只读查询、具备归一化能力、能对照 baseline、未接入 CI、未扰动业务代码和既有测试脚本。

下一阶段不建议马上改脚本或扩大范围，优先建议补充 baseline 维护规则和快照使用规范，再决定是否小范围扩展 `overdue`、`sla-rules` 和 `/assets/units` 兼容路径。

后续同步：已进入 baseline 维护规则设计，文档入口为 `docs/testing/api-snapshot-baseline-policy.md`。

后续同步：已进入接口快照小范围扩展设计，文档入口为 `docs/testing/api-snapshot-small-expansion-plan.md`。建议第一批优先评估 `workorders.overdue` 和 `workorders.slaRules`，资产兼容路径 `/assets/units` 与 `/assets/units/:id` 单独作为第二批复核。
