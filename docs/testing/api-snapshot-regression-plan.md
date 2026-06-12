# JinHu Smart Park 接口快照与查询响应对照设计

## 1. 设计目的

本文用于设计接口快照和查询响应对照机制，防止后续重构中出现响应结构、统计口径、筛选逻辑、排序逻辑和分页逻辑的静默变化。

本阶段只做设计文档，不新增测试脚本，不修改业务代码，不修改 CI，不新增依赖。

## 2. 背景

阶段五-F 已完成前端大页面拆分和后端 query service 拆分。后端已将房源和工单主要只读查询迁移到 query service：

- 房源 `UnitsQueryService` 已承接 `list`、`detail`、`listStatusLogs`、`statistics`。
- 工单 `WorkOrderQueryService` 已承接 `list`、`detail`、`logs`、`overdue`、`listSlaRules`、`stats`。
- 现有回归脚本更多验证流程是否成功，例如登录、创建、列表可查、详情可查、幂等 replay / conflict、首发链路是否跑通。
- 当前仍缺少对关键查询响应结构、统计字段名、统计口径和查询结果稳定性的系统化验证。

因此下一阶段建议先补接口快照和查询响应对照设计，再决定是否新增脚本。

## 3. 当前已有回归能力

当前首发统一回归入口是：

```bash
node scripts/e2e/first-release-regression.mjs
```

该脚本顺序执行：

- `first-release-menu-whitelist.mjs`
- `first-release-auth-health.mjs`
- `first-release-idempotency.mjs`
- `first-release-files.mjs`
- `first-release-users-assets.mjs`
- `first-release-workorders.mjs`
- `first-release-leasing.mjs`

现有重点脚本覆盖摘要：

| 脚本 | 当前主要覆盖 |
|---|---|
| `first-release-regression.mjs` | 串联首发菜单、认证健康、幂等、文件、用户资产、工单、租赁回归 |
| `first-release-auth-health.mjs` | `GET /health`、`GET /ready`、`POST /auth/login`、`GET /auth/me`、错误密码、SMS / WeChat 禁用路径 |
| `first-release-users-assets.mjs` | `GET /users`、`POST /users`、`GET /users/:id`、`POST /users/:id/reset-password`、`GET /roles`、`POST /users/:id/roles`、`GET /assets/parks`、`GET /assets/buildings`、`GET /assets/floors`、`GET /assets/units` |
| `first-release-workorders.mjs` | `POST /auth/login`、`GET /auth/me`、`GET /work-orders`、`POST /work-orders`、`GET /work-orders/:id`、`POST /work-orders/:id/assign` 及幂等 replay / conflict |
| 其它 `scripts/e2e/**` | 覆盖租赁、文件、菜单白名单、S1/S2/S3/S5/S6/S8/S9 阶段 smoke，更多是业务流程或专项 smoke |

现有脚本已经能证明“关键流程跑通”，但大多数断言集中在 HTTP 状态、分页基本结构、创建后可查、关键 id / code / title 匹配和幂等行为，不是面向响应结构稳定性的快照测试。

## 4. 当前测试缺口

当前缺口包括：

- 缺少响应结构快照，例如顶层包装、`data`、`items`、分页字段和列表 item 字段集合。
- 缺少查询结果关键字段对照，例如工单状态、工单编号、房源编号、房源状态、用户账号、业务枚举字段。
- 缺少 `stats`、`statistics` 等统计接口字段名和统计口径快照。
- 缺少稳定字段与动态字段的统一归一化规则。
- 缺少针对 query service 重构的轻量回归入口。
- 缺少筛选、排序和分页查询结果的稳定性验证。
- 缺少对空列表、单条详情、状态日志分页和统计分组数组的统一对照策略。

## 5. 第一批建议覆盖接口

第一批建议覆盖刚完成 query service 拆分、且以只读查询为主的接口。接口路径以当前 controller 和现有脚本为准。

### 5.1 工单接口

建议第一批覆盖：

- `GET /work-orders`
- `GET /work-orders/:id`
- `GET /work-orders/:id/logs`
- `GET /work-orders/stats`
- `GET /work-orders/overdue`
- `GET /work-orders/sla-rules`

覆盖重点：

- 列表分页结构、列表 item 字段集合、筛选后关键字段。
- 详情字段集合、工单编号、标题、状态、类型、优先级、处理人字段。
- 日志分页结构和日志 item 字段集合。
- `stats` 的 `summary`、`by_status`、`by_type`、`by_priority`、`by_assignee`、`overdue_top` 字段名。
- 逾期列表的分页结构和逾期相关字段存在性。
- SLA 规则列表分页结构和规则字段集合。

### 5.2 房源接口

当前房源 query service 直接路由是 `park-units`；`/assets/units` 是资产域兼容 / 基础资产读接口，现有 `first-release-users-assets.mjs` 已覆盖其分页结构。

建议第一批优先覆盖 query service 直接路由：

- `GET /park-units`
- `GET /park-units/:id`
- `GET /park-units/:id/status-logs`
- `GET /park-units/statistics`

可作为兼容读面补充覆盖：

- `GET /assets/units`
- `GET /assets/units/:id`

覆盖重点：

- `park-units` 列表分页结构、列表 item 字段集合、筛选字段。
- `park-units` 详情字段集合、房源编号、房源状态、楼栋 / 楼层关联字段。
- 状态日志分页结构和日志 item 字段集合。
- `statistics` 的总量、面积、租赁状态、使用类型、楼栋聚合和出租率字段名。
- `/assets/units` 与 `/park-units` 不强求完整字段一致，只验证各自公开结构稳定。

### 5.3 用户 / 资产基础接口

建议第一批作为轻量补充覆盖：

- `GET /users`
- `GET /users/:id`
- `GET /assets/parks`
- `GET /assets/buildings`
- `GET /assets/buildings/:id`
- `GET /assets/floors`
- `GET /assets/floors/:id`

可暂缓到第二批的直连资产域接口：

- `GET /buildings`
- `GET /buildings/:id`
- `GET /floors`
- `GET /floors/:id`

原因是现有首发用户资产脚本已经覆盖 `/assets/buildings`、`/assets/floors`、`/assets/units` 的分页结构，第一批先贴近既有首发入口更稳；直连 `/buildings`、`/floors` 可在 baseline 稳定后扩展。

## 6. 暂不纳入第一批的接口

第一批暂不纳入：

- 写入接口：例如 `POST`、`PUT`、`PATCH`、`DELETE`。
- 状态流转接口：例如工单派单 / 接单 / 开始 / 完成 / 确认 / 关闭，房源状态变更。
- 账务接口：应收、收款、核销、减免、开票相关。
- 租赁合同主链接口。
- 幂等写入口。
- 导入导出接口。
- 附件上传和文件下载接口。
- 认证流程接口。
- 跨模块聚合接口：例如 `park-units/:id/workorders`、`park-units/:id/hazards`、`park-units/:id/emergencies`、`park-units/:id/work-permits`、`park-units/:id/devices`。
- 大聚合看板：例如 `GET /assets/statistics`、`GET /assets/unit-status-board`。

暂缓原因：

- 写入和状态流转接口副作用多，应该继续依赖业务流程回归和幂等语义测试。
- 账务、租赁合同和幂等链路风险高，需要单独测试策略，不能用简单快照替代业务断言。
- 导入导出、附件和文件 URL 动态字段多，容易产生误报。
- 跨模块聚合接口依赖模块开关、权限、数据范围和其它模块数据，baseline 稳定性较差。
- 认证流程涉及 token、过期时间、禁用配置和安全策略，不适合写入原始快照。

## 7. 快照类型设计

### 7.1 Schema Snapshot

Schema Snapshot 用于验证响应结构，不验证完整原始 JSON 值。

建议验证：

- 顶层响应字段，例如 `code`、`message`、`data` 或当前包装结构。
- `data` 字段结构。
- 分页结构：`items`、`total`、`page`、`page_size`。
- 列表 item 字段集合。
- 详情对象字段集合。
- 统计对象字段集合。
- 分组数组 item 字段集合。

适用接口：

- 所有第一批只读列表、详情、日志和统计接口。

### 7.2 Key Fields Snapshot

Key Fields Snapshot 用于验证关键业务字段，避免完整 JSON 过于脆弱。

建议验证：

- 工单编号、标题、状态、类型、优先级。
- 房源编号、房源名称、租赁状态、使用类型、楼栋 / 楼层关联字段。
- 用户账号、展示名称、状态、角色字段结构。
- 楼栋编码、楼栋名称、楼层编码、楼层名称。
- 统计字段名和分组 key。

适用场景：

- 固定测试数据下，可以对关键字段值做精确对照。
- 非固定数据下，仅对字段存在性、枚举集合和类型做校验。

### 7.3 Business Count Snapshot

Business Count Snapshot 用于验证统计类接口和数量类字段。

建议验证：

- `stats.summary` 字段名和固定数据下的关键计数。
- `by_status`、`by_type`、`by_priority` 分组字段名和分组 key。
- `by_assignee` 字段结构和排序规则。
- `overdue_top` 字段结构。
- `statistics` 的总量、面积、租赁状态、使用类型、楼栋聚合和出租率字段名。
- 分页 `total` 在固定数据集下的值。

字段稳定性建议：

- 固定 seed / 固定回归数据下，关键统计值可以精确对照。
- 使用共享或本地脏数据时，统计值只做存在性、类型、非负数、范围或下限校验。
- 对排序不稳定的分组数组，先按稳定 key 排序再对照。

## 8. 动态字段归一化规则

建议归一化或忽略：

- `id`
- UUID
- `request_id`
- `trace_id`
- token、refresh token、session id
- `created_at`、`updated_at`
- `create_time`、`update_time`
- `createdAt`、`updatedAt`
- `createTime`、`updateTime`
- 其它 timestamp 字段
- 上传文件 URL
- signed URL
- 文件下载 URL
- 审计流水号、日志编号中不可稳定的随机部分
- `pagination.total`，当测试数据不固定时只验证类型或范围
- 排序不稳定的数组

建议保留：

- 业务编码，例如 `woCode` / `wo_code`、房源编码、楼栋编码、楼层编码。
- 状态、类型、优先级、使用类型、租赁状态等关键枚举。
- 响应字段结构。
- 分页字段名。
- 统计字段名。
- 固定测试数据下的关键统计值。
- 固定测试数据下的列表关键字段集合。

数组归一化建议：

- 有稳定业务 key 的数组，按业务 key 排序。
- 没有稳定业务 key 的日志数组，优先只快照 item schema 和关键字段类型。
- 列表接口同时保留 `page`、`page_size`，但 `total` 根据数据来源选择精确对照或范围校验。

## 9. 快照数据来源

建议数据来源分三层：

1. 优先使用现有 first-release regression 运行后产生的数据。
2. 使用 production-like auth 环境和固定测试账号获取 token。
3. 避免依赖本地手动脏数据。

第一批建议方式：

- 先沿用 `first-release-regression.mjs` 的环境变量约定，例如 `API_BASE_URL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`DEFAULT_TENANT_ID`、`DEFAULT_PARK_ID`。
- 对工单可复用回归创建的测试工单，再读取 list / detail / logs / stats。
- 对房源可先读取已有生产安全 seed / 首发回归数据中的可见房源。
- 对用户、楼栋、楼层、资产基础列表先做 schema 和 key fields，不强求精确 total。

后续如需要精确统计值，可以新增专用快照 seed 或专用测试夹具，但本阶段不实现。

## 10. 后续脚本设计建议

后续可新增：

```bash
scripts/e2e/first-release-api-snapshots.mjs
```

建议脚本能力：

- 登录获取 token。
- 调用关键只读接口。
- 归一化响应。
- 输出稳定 JSON。
- 与 baseline 对照。
- 支持 `UPDATE_SNAPSHOTS=true` 更新 baseline。
- 支持只检查 schema。
- 支持只检查 key fields。
- 支持 full normalized snapshot，但默认不使用原始完整响应。
- 输出清晰 diff。
- 不提交本地临时响应文件。
- 默认失败时输出接口、快照类型、差异路径和归一化后的片段。

建议目录结构后续单独设计，例如：

```text
scripts/e2e/first-release-api-snapshots.mjs
scripts/e2e/snapshots/
```

是否提交 baseline 文件需要下一阶段再定。本阶段不新增脚本和 baseline。

## 11. 是否进入 CI

建议分阶段进入 CI。

### 第一阶段

手动运行，不进入 CI。

原因：

- 快照初期容易误报。
- 需要先稳定归一化规则。
- 需要确认 baseline 是否依赖固定 seed 或首发回归数据。
- 需要观察共享测试环境中的动态字段和 total 波动。

### 第二阶段

在 release-smoke 或 PR label 下运行。

建议形式：

- 手动触发。
- 或仅在带有回归 / release label 的 PR 中运行。
- 或作为 release-smoke 的可选增强项。

### 第三阶段

稳定后再纳入常规 CI。

进入常规 CI 前置条件：

- baseline 稳定。
- 动态字段归一化规则稳定。
- total 和排序误报已降低。
- 快照失败信息足够清晰。
- 不依赖本地手动数据。

## 12. 实施路线

### T1：设计文档

当前阶段。

交付：

- 新增本文档。
- 不修改业务代码、测试脚本、CI、依赖、migration、seed。

### T2：新增快照脚本初版

建议只覆盖：

- 工单 `GET /work-orders/stats`
- 工单 `GET /work-orders`
- 工单 `GET /work-orders/:id`
- 工单 `GET /work-orders/:id/logs`
- 房源 `GET /park-units`
- 房源 `GET /park-units/:id`
- 房源 `GET /park-units/statistics`

初版目标是跑通登录、请求、归一化、schema snapshot 和 key fields snapshot。

### T3：补充 baseline 与归一化规则

建议：

- 固定字段规则。
- 动态字段 placeholder。
- 数组排序规则。
- stats / statistics 字段名基线。
- 避免动态字段误报。

### T4：接入 release-smoke label 或手动 workflow

先不进主 CI。

建议：

- 保持手动运行或 label 触发。
- 累积误报样本。
- 逐步决定是否参与 release-smoke。

### T5：扩展到更多查询接口

再评估：

- `GET /users`
- `GET /users/:id`
- `GET /assets/buildings`
- `GET /assets/buildings/:id`
- `GET /assets/floors`
- `GET /assets/floors/:id`
- `GET /assets/units`
- `GET /assets/units/:id`
- `GET /buildings`
- `GET /floors`
- 跨模块聚合只读接口

跨模块聚合、大聚合看板和账务查询需要单独设计，不应直接混入第一批。

## 13. 风险与注意事项

- 快照不能过度依赖完整 JSON 原文。
- 需要控制动态字段，否则会造成高频误报。
- 需要固定测试数据，否则 `total`、统计值和排序结果可能波动。
- 不应用快照测试替代业务流程回归。
- 不应把敏感 token、密码、signed URL、文件 URL 写入快照。
- 不应把本地临时响应文件提交到仓库。
- 统计接口需要区分字段名稳定性和数值稳定性。
- 字段权限、数据范围过滤和模块开关可能影响响应结构，需要在脚本输出中记录运行上下文。
- `/assets/units` 和 `/park-units` 是不同读面，不应默认要求两者字段完全一致。

## 14. 结论

建议先完成本文档作为接口快照和查询响应对照机制的设计基线。

下一步可新增快照脚本初版，初期手动运行，不进入常规 CI。第一批优先覆盖工单和房源核心查询，尤其是已完成 query service 拆分的 `work-orders` 和 `park-units` 只读接口。待归一化规则和 baseline 稳定后，再考虑扩展到用户、楼栋、楼层、资产兼容读面和更多聚合查询。

## 15. 初版脚本落地状态

- 新增 `scripts/e2e/first-release-api-snapshots.mjs`。
- 新增 baseline 文件 `scripts/e2e/snapshots/first-release-api-snapshots.json`。
- 第一版覆盖工单和房源核心只读查询。
- 当前手动运行，不接入 CI。
- 初版已进入收口复核，复核文档为 `docs/testing/api-snapshot-initial-closure-review.md`。
- 下一步优先建议制定 baseline 维护规则和快照使用规范。
- baseline 更新需遵循 `docs/testing/api-snapshot-baseline-policy.md`。

## 16. 小范围扩展计划

接口快照小范围扩展设计见 `docs/testing/api-snapshot-small-expansion-plan.md`。

扩展建议：

- 第一批优先扩展 `GET /work-orders/overdue` 和 `GET /work-orders/sla-rules`。
- 第二批再评估 `/assets/units` 和 `/assets/units/:id` 兼容路径。
- 扩展阶段仍保持手动运行，不接入常规 CI。
- 新增或更新 baseline 必须遵循 `docs/testing/api-snapshot-baseline-policy.md`。
- 第一批工单扩展已实施，当前 baseline 已覆盖 9 个 snapshot。
- 第一批工单扩展收口复核见 `docs/testing/api-snapshot-workorder-extra-closure-review.md`。

## 17. 数据稳定性策略

接口快照数据稳定性策略见 `docs/testing/api-snapshot-data-stability-plan.md`。

后续继续扩展接口覆盖前，建议先解决数据稳定性问题，尤其是写入型 e2e、列表第一条样本、stats 数值和本地脏数据对 baseline 的影响。

固定业务标识机制设计见 `docs/testing/api-snapshot-business-key-plan.md`，收口复核见 `docs/testing/api-snapshot-business-key-closure-review.md`。当前脚本已支持 `SNAPSHOT_WORKORDER_NO` 和 `SNAPSHOT_UNIT_NO`，可减少对列表第一条的依赖；未设置时仍保持原有样本策略以兼容现有 baseline。

固定测试数据设计见 `docs/testing/api-snapshot-fixed-data-plan.md`。后续建议先设计 snapshot bootstrap，明确 `SNAPSHOT-WO-001` 和 `SNAPSHOT-UNIT-001` 的数据来源，再评估进一步扩大快照使用范围。

snapshot bootstrap 设计见 `docs/testing/api-snapshot-bootstrap-plan.md`。当前已新增 `scripts/e2e/bootstrap-api-snapshot-data.mjs`，通过手动、幂等、API 优先的方式准备固定快照样本；该脚本不接入 CI，不修改 seed，不更新快照 baseline。

bootstrap 收口复核见 `docs/testing/api-snapshot-bootstrap-closure-review.md`。当前 bootstrap 已可准备固定样本，下一步建议单独审查 baseline 是否切换到固定样本。

固定样本 baseline 更新审查见 `docs/testing/api-snapshot-fixed-baseline-review.md`。当前 baseline 可通过 `SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001` 和 `SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001` 切换到固定详情样本；写入型 e2e 后 `workorders.list/stats` 仍可能波动，后续需继续收口。

固定样本 baseline 收口复核见 `docs/testing/api-snapshot-fixed-baseline-closure-review.md`。当前固定样本 baseline 可阶段性收口，但 `workorders.list / workorders.stats` 的写入后波动需后续单独治理。

list / stats 快照波动治理设计见 `docs/testing/api-snapshot-list-stats-stability-plan.md`。当前已先实施 `workorders.list` 降级策略，不再强依赖默认列表第一条完整归一化样本；写入型 e2e 后仍不建议要求 full normalized snapshot 全量通过，因为 `workorders.stats` numeric 快照仍会随测试库数据变化。后续应优先单独治理 stats，将 schema 与 numeric 对照拆分。

`workorders.stats` 快照拆分策略见 `docs/testing/api-snapshot-workorders-stats-split-plan.md`。建议默认转向 schema snapshot，numeric snapshot 后续作为手动专项或隔离环境检查处理。

ST-1 已实施：默认 `workorders.stats` 已转为 schema snapshot，不再对 `summary` 和 `by_*` numeric count 做 exact comparison。ST-2A 已实现 numeric stats 专项模式的最小脚本能力；ST-2B-1C 已在 fresh 隔离固定数据集下建立 numeric baseline。

ST-1 收口复核见 `docs/testing/api-snapshot-workorders-stats-schema-closure-review.md`。当前建议阶段性收口 stats schema snapshot，后续进入 numeric 专项模式设计。

ST-2 numeric 专项模式设计见 `docs/testing/api-snapshot-workorders-stats-numeric-plan.md`。当前 numeric snapshot 是非默认、显式启用、独立 baseline 的手动专项检查方向；默认回归继续使用 stats schema snapshot，numeric snapshot 不属于普通回归默认路径，暂不进入常规 CI。

ST-2A 收口复核见 `docs/testing/api-snapshot-workorders-stats-numeric-mode-closure-review.md`。当前 numeric 模式可通过 `SNAPSHOT_STATS_MODE=numeric` 显式触发，numeric baseline 已建立但仍不属于默认 regression；默认 regression 仍应运行 schema 模式。

ST-2A follow-up 已修复 numeric 专项优先级：`SNAPSHOT_MODE=schema + SNAPSHOT_STATS_MODE=numeric` 会进入 stats numeric 路径。numeric 模式同时保留 `overdue_top` schema-only shape；默认 regression 仍不运行 numeric baseline。

ST-2B-0 numeric baseline 建立门禁见 `docs/testing/api-snapshot-workorders-stats-numeric-baseline-gate.md`。ST-2B-1C 已在 fresh 隔离固定数据集下建立 numeric baseline；该 baseline 仍不进入默认 regression，不进入普通 CI，后续更新必须继续确认隔离库或 reset 后测试库、固定样本、运行顺序和 diff 审查责任。
