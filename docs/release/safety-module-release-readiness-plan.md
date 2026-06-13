# 安全巡检与隐患整改模块上线整改计划

## 1. 目标与范围

本文用于将“安全巡检与隐患整改模块”从首发隐藏/二期预留状态调整为生产可开放模块前的整改与验收计划。

本计划只基于当前仓库已有实现续接上线，不包含从零重写方案，不扩大到移动端、通知、AI、大屏或复杂审批流。

本文不记录真实生产 IP、域名、账号、密码、密钥、Token 或敏感连接串。

## 2. 当前实现状态摘要

当前模块已具备较完整的初步实现：

- 已有数据库结构：S5-A migration 已创建巡检点、巡检模板、巡检计划、巡检任务、隐患、隐患状态日志等核心表。
- 已有后端接口：NestJS 模块已注册，核心 controller 均接入 `@RequireModule("safety")` 和 `@RequirePermissions(...)`。
- 已有前端页面：`apps/web/app/safety/*` 页面已存在，主要通过 `apiRequest("/safety/...")` 调用真实 API。
- 已有菜单定义但首发隐藏：`apps/web/lib/menu.ts` 已定义“安全管理”菜单，但 `FIRST_RELEASE_MENU_PATHS` 当前未包含 `/safety/*`。
- 已有权限与角色 seed：`packages/shared/src/index.ts` 定义权限常量，S5-A migration 已插入权限、角色权限、数据权限规则。
- 已有 smoke 脚本：`scripts/e2e/s5a-safety-smoke.mjs` 覆盖巡检、隐患整改、转工单、统计等主链路。
- 未发现安全页面使用静态 mock 数据替代真实 API；但 `000092` 会插入默认巡检模板和检查项，需要明确生产口径。

## 3. 已有文件路径清单

### 3.1 数据库、seed、权限与菜单

- `database/migrations/000081_s5a_safety_precheck_module_code_rules.sql`
- `database/migrations/000082_s5a_safety_inspect_points.sql`
- `database/migrations/000083_s5a_safety_inspect_templates.sql`
- `database/migrations/000084_s5a_safety_inspect_plans.sql`
- `database/migrations/000085_s5a_safety_inspect_tasks.sql`
- `database/migrations/000086_s5a_safety_hazards.sql`
- `database/migrations/000087_s5a_safety_hazard_rectify.sql`
- `database/migrations/000088_s5a_safety_hazard_manage_all.sql`
- `database/migrations/000089_s5a_safety_hazard_recheck_close.sql`
- `database/migrations/000090_s5a_safety_hazard_create_workorder.sql`
- `database/migrations/000091_s5a_safety_statistics.sql`
- `database/migrations/000092_s5a_permissions_menu_dict_seed_patch.sql`
- `database/seeds/000001_s1_production_core.sql`
- `packages/shared/src/index.ts`
- `apps/web/lib/menu.ts`

### 3.2 后端

- `apps/api/src/app.module.ts`
- `apps/api/src/modules/safety-inspect-points/*`
- `apps/api/src/modules/safety-inspect-templates/*`
- `apps/api/src/modules/safety-inspect-plans/*`
- `apps/api/src/modules/safety-inspect-tasks/*`
- `apps/api/src/modules/safety-hazards/*`
- `apps/api/src/modules/safety-statistics/*`
- 交叉模块：`apps/api/src/modules/work-orders/*`
- 交叉模块：`apps/api/src/modules/safety-emergency/*`
- 交叉模块：`apps/api/src/modules/safety-work-permits/*`
- 交叉模块：`apps/api/src/modules/video-cameras/*`

### 3.3 前端

- `apps/web/app/safety/layout.tsx`
- `apps/web/app/safety/dashboard/page.tsx`
- `apps/web/app/safety/inspect-points/page.tsx`
- `apps/web/app/safety/inspect-templates/page.tsx`
- `apps/web/app/safety/inspect-plans/page.tsx`
- `apps/web/app/safety/inspect-tasks/page.tsx`
- `apps/web/app/safety/inspect-tasks/InspectTasksPageClient.tsx`
- `apps/web/app/safety/my-inspect-tasks/page.tsx`
- `apps/web/app/safety/hazards/page.tsx`
- `apps/web/app/safety/hazards/overdue/page.tsx`
- 交叉入口：`apps/web/app/assets/unit-status-board/page.tsx`
- 交叉入口：`apps/web/app/leasing/tenants/page.tsx`

### 3.4 测试与文档

- `scripts/e2e/s5a-safety-smoke.mjs`
- `scripts/e2e/s8e-video-evidence-inspection-smoke.mjs`
- `scripts/e2e/first-release-menu-whitelist.mjs`
- `package.json`
- `README.md`
- `docs/release/pre-release-acceptance-checklist.md`
- `docs/release/production-release-sop.md`
- `docs/sprint-roadmap.md`
- `docs/handover/smart-park-handover-checklist.md`

## 4. P0：正式开放前必须完成

1. 菜单开放确认
   - 决定开放的最小菜单范围：建议先开放 `安全看板`、`巡检点位`、`巡检模板`、`巡检计划`、`巡检任务`、`我的巡检`、`隐患整改`、`超期隐患`。
   - 更新 `apps/web/lib/menu.ts` 的 `FIRST_RELEASE_MENU_PATHS`，仅加入已验收路径。
   - 同步更新 `scripts/e2e/first-release-menu-whitelist.mjs` 对安全菜单的预期。

2. 权限与角色确认
   - 核对 `packages/shared/src/index.ts` 与 `000092_s5a_permissions_menu_dict_seed_patch.sql` 的权限码一致。
   - 确认 `SAFETY_MANAGER`、`SAFETY_OFFICER`、`SECURITY_GUARD`、`PROPERTY_MANAGER`、`MAINTENANCE_ENGINEER` 的菜单和接口权限符合岗位职责。
   - 确认 `SUPER_ADMIN` 与 `OPERATIONS_OWNER` 是否应拥有全量安全模块权限。
   - 确认无权限账号访问 `/safety/*` 页面和 API 均被拒绝。

3. `tenant_id` / `park_id` 隔离验收
   - 覆盖巡检点、模板、计划、任务、隐患、状态日志、附件、关联房源、关联租户、关联用户。
   - 使用两个不同 `tenant_id` / `park_id` 的数据进行越权读取、编辑、删除、状态动作验证。
   - 验证服务层查询条件和关联对象校验均使用当前登录上下文。

4. 状态流转验收
   - 按本文第 12 节矩阵验证巡检任务和隐患整改状态。
   - 验证非法状态动作返回明确错误，不能静默成功。
   - 验证状态日志、操作日志和关键时间字段落库。

5. 幂等与重复提交风险处置
   - 明确当前安全模块多数写接口只有全局 `X-Idempotency-Key` 要求，不等价于完整 replay/conflict 语义。
   - 对高风险写接口优先补齐重复提交防护或业务唯一约束验收：生成巡检任务、提交巡检结果自动生成隐患、隐患转工单、隐患转应急、整改提交、复查关闭。
   - 未补齐完整幂等前，验收必须覆盖双击、刷新重试、相同请求重复提交。

6. `000092` 默认模板/检查项生产口径确认
   - 判断 `STPL-FIRE-DEFAULT`、`STPL-ELECTRICAL-DEFAULT` 及其检查项是否属于生产安全基线。
   - 若作为生产基线，需由业务方确认名称、检查项、风险等级、标准描述符合园区实际。
   - 若仅为演示样例，开放前不得作为生产初始化数据启用，需要另行制定安全迁移或数据修正方案。

7. smoke 与构建验证
   - 必须通过 `pnpm lint`、`pnpm typecheck`、`pnpm build`。
   - 在隔离测试环境通过 `node scripts/e2e/s5a-safety-smoke.mjs`。
   - 菜单开放后更新并通过首发菜单白名单回归。

## 5. P1：上线前建议完成

1. 前端直达 URL 行为确认
   - 对无模块授权、无接口权限、未登录、过期登录分别确认展示和跳转。

2. 字段权限与数据权限补充验收
   - 验证 `safety` 模块下点位、模板、计划、任务、隐患字段策略不会隐藏关键必填字段。
   - 验证 `self` 数据范围下安全员只能看到和执行自己的巡检任务或整改任务。

3. 附件与文件安全验收
   - 验证巡检照片、整改前后照片、关联文件 ID 必须属于当前 `tenant_id` / `park_id`。
   - 验证删除或关闭后附件仍可审计，不出现跨业务误绑定。

4. 统计口径确认
   - 确认安全看板统计口径，包括未闭环、超期、重大隐患、完成率、任务状态。
   - 确认统计数据受数据权限影响，且不跨园区汇总。

5. 操作日志与审计检查
   - 验证新增、编辑、删除、下达整改、整改、复查、关闭、升级、转工单、转应急均有审计记录。

## 6. P2：暂缓项

- 移动端巡检体验。
- 通知、短信、企业微信、钉钉或飞书推送。
- AI 风险识别、自动整改建议。
- 大屏或复杂驾驶舱。
- 复杂多级安全审批流。
- 机器人自动巡检闭环。
- 与外部消防、安监平台对接。

## 7. 菜单白名单开放策略

开放策略应分阶段执行：

1. 第一阶段只开放安全巡检与隐患整改核心菜单：
   - `/safety/dashboard`
   - `/safety/inspect-points`
   - `/safety/inspect-templates`
   - `/safety/inspect-plans`
   - `/safety/inspect-tasks`
   - `/safety/my-inspect-tasks`
   - `/safety/hazards`
   - `/safety/hazards/overdue`

2. 暂不因本计划开放应急和作业许可菜单：
   - `/safety/emergency-dashboard`
   - `/safety/emergency-contacts`
   - `/safety/emergency-plans`
   - `/safety/emergencies`
   - `/safety/work-permits`

3. 菜单开放修改必须同步：
   - `apps/web/lib/menu.ts`
   - `scripts/e2e/first-release-menu-whitelist.mjs`
   - `docs/release/pre-release-acceptance-checklist.md`
   - `docs/release/production-release-sop.md`

## 8. 权限与角色确认策略

角色确认建议以“最小授权 + 岗位职责”为准：

| 角色 | 建议权限口径 |
|---|---|
| `SAFETY_MANAGER` | 管理巡检点、模板、计划、任务、隐患整改、超期处理和统计。 |
| `SAFETY_OFFICER` | 执行本人巡检任务，登记隐患，提交整改。 |
| `SECURITY_GUARD` | 执行本人巡检任务，登记隐患，提交整改。 |
| `PROPERTY_MANAGER` | 查看安全统计和隐患，分派整改，处理物业相关整改。 |
| `MAINTENANCE_ENGINEER` | 查看分派给自己的隐患并提交整改。 |
| `OPERATIONS_OWNER` | 根据运营职责决定是否保留模块管理权限。 |
| `SUPER_ADMIN` | 保留全量权限，但仅用于系统管理和应急处理。 |

验收时不得只验证超级管理员；必须覆盖至少一个安全主管、一个安全员、一个无安全权限账号。

## 9. `000092` 默认模板/检查项生产口径判断

`database/migrations/000092_s5a_permissions_menu_dict_seed_patch.sql` 当前插入：

- `STPL-FIRE-DEFAULT`：消防巡检模板。
- `STPL-ELECTRICAL-DEFAULT`：配电安全模板。
- `FIRE-001` 至 `FIRE-004`：消防通道、灭火器、消防栓、应急照明。
- `ELEC-001` 至 `ELEC-004`：配电箱上锁、私拉乱接、积水杂物、警示标识。

生产口径判断：

- 可以作为生产基线的前提：业务方确认这些模板为园区通用安全基线，且风险等级、检查标准、名称均准确。
- 不能作为生产基线的情形：模板仅用于演示、字段含义不符合现场、风险等级未确认、检查项可能误导实际巡检。
- 结论未确认前：不得把默认模板作为“已完成生产配置”的证据，只能作为待确认基线数据。

## 10. 幂等与重复提交风险处理策略

当前前端页面已普遍传入 `idempotencyKey`，但后端安全模块控制器未明确接入完整 `IdempotencyInterceptor`。因此上线前按以下策略处理：

1. 对读接口无额外要求。
2. 对普通创建、编辑、删除接口验证全局幂等键要求和重复提交结果。
3. 对高风险副作用接口必须单独验收：
   - `POST /safety/inspect-plans/:id/generate-tasks`
   - `POST /safety/inspect-tasks/:id/submit-results`
   - `POST /safety/hazards/:id/create-work-order`
   - `POST /safety/hazards/:id/to-emergency`
   - `POST /safety/hazards/:id/rectify`
   - `POST /safety/hazards/:id/recheck`
   - `POST /safety/hazards/:id/close`
4. 生成巡检任务依赖 `(tenant_id, park_id, plan_id, point_id, plan_time)` 唯一约束防重，仍需验证并发重复生成的返回语义。
5. 隐患转工单、转应急必须验证重复点击不会创建多条工单或应急事件。

## 11. `tenant_id` / `park_id` 隔离验收策略

验收环境至少准备两个隔离 scope：

- Scope A：默认测试租户与园区。
- Scope B：另一个租户或园区，不共享安全业务数据。

验收项：

| 对象 | 验收内容 |
|---|---|
| 巡检点 | A 创建的点位，B 不可查询、详情、编辑、删除。 |
| 巡检模板和检查项 | A 创建的模板和检查项，B 不可复用或编辑。 |
| 巡检计划 | A 的计划不能引用 B 的模板、点位、用户、角色。 |
| 巡检任务 | A 的任务 B 不可查询；非处理人不能执行，除非有 `manage_all`。 |
| 隐患 | A 的隐患 B 不可查询、整改、复查、关闭、转工单。 |
| 附件 | A 的文件 ID 不能被 B 的巡检或隐患引用。 |
| 租户企业 | `park_tenant_id` 必须属于当前 `tenant_id` / `park_id`。 |
| 房源空间 | `building_id`、`floor_id`、`unit_id` 必须属于当前 `tenant_id` / `park_id`。 |
| 统计 | 安全看板不得跨 scope 汇总。 |

## 12. 隐患状态流转验收矩阵

| 当前状态 | 动作 | 预期状态 | 验收重点 |
|---|---|---|---|
| 已登记 `10` | 下达整改 | 已下发整改 `20` | 必须有整改人和整改期限。 |
| 已下发整改 `20` | 整改完成 | 已整改 `40` | 必须有整改说明和整改后照片。 |
| 整改中 `30` | 整改完成 | 已整改 `40` | 仅整改责任人或安全管理权限可执行。 |
| 已整改 `40` | 复查通过 | 已闭环 `60` | 写入复查人、复查时间、状态日志。 |
| 已整改 `40` | 复查不通过 | 整改中 `30` | 写入退回原因和状态日志。 |
| 已整改 `40` | 退回整改 | 整改中 `30` | 仅允许已整改状态退回。 |
| 非已整改状态 | 复查 | 拒绝 | 返回明确错误。 |
| 已闭环 `60` | 整改、复查、升级、转应急 | 拒绝 | 已闭环数据不可再次业务流转。 |
| 未闭环且超过整改期限 | 重算超期 | 已超期 `70` | 不应影响已闭环隐患。 |
| 已超期 `70` 且重大风险 | 升级 | 已升级 `80` | 仅重大隐患可升级。 |
| 已登记/整改中/超期 | 转工单 | 已转工单 `91` | 重复转工单不得创建重复工单。 |
| 重大风险且未闭环 | 转应急事件 | 应急状态 | 重复转应急不得创建重复事件。 |
| 已登记 `10` | 删除 | 软删除 | 仅允许未下发整改前删除。 |
| 已下发整改及后续状态 | 删除 | 拒绝 | 保护审计闭环。 |

## 13. smoke 验证范围

必须覆盖：

- 登录并取得安全相关角色 token。
- 普通无权限账号创建巡检点被拒绝。
- 创建巡检点，读取二维码。
- 创建巡检模板和检查项。
- 创建并启用巡检计划。
- 根据计划生成巡检任务，并验证重复生成处理。
- 我的巡检任务列表。
- 开始、打卡、提交巡检结果。
- 异常巡检结果自动创建隐患。
- 人工创建隐患。
- 下达整改、整改提交、复查通过、关闭重复操作拒绝。
- 复查退回后再次整改。
- 隐患转工单，并验证重复转工单。
- 超期重算、超期列表、重大隐患升级。
- 安全统计接口。
- 无统计权限账号访问统计被拒绝。

当前可参考脚本：`scripts/e2e/s5a-safety-smoke.mjs`。

## 14. 上线步骤

1. 冻结范围
   - 仅开放本文第 7 节第一阶段菜单。
   - 不同时开放应急、作业许可、机器人、视频、IoT 等能力。

2. 完成 P0 整改
   - 菜单白名单、权限角色、隔离验收、状态流转、幂等风险、默认模板口径全部确认。

3. 测试环境验证
   - 执行 migration、production seed、bootstrap admin。
   - 执行 `pnpm lint`、`pnpm typecheck`、`pnpm build`。
   - 执行 `node scripts/e2e/s5a-safety-smoke.mjs`。
   - 手工验证前端菜单、无权限访问、关键表单和状态动作。

4. 预发布确认
   - 备份数据库。
   - 确认无真实密钥写入文档或代码。
   - 确认生产环境仍禁用认证 mock。
   - 确认值守人员和回滚窗口。

5. 生产开放
   - 发布包含菜单白名单调整的镜像或代码。
   - 执行必要 migration。
   - 验证健康检查、登录、菜单可见、权限拒绝、核心 smoke。

6. 开放后观察
   - 观察 API 错误率、慢查询、审计日志、安全模块写入量。
   - 收集业务方对默认模板和隐患状态流转的反馈。

## 15. 回滚策略

优先采用入口回滚，避免破坏已产生的生产数据：

1. 菜单回滚
   - 从 `FIRST_RELEASE_MENU_PATHS` 移除 `/safety/*` 路径。
   - 保留后端、数据库和已产生业务数据。

2. 权限回滚
   - 撤销非必要角色的 safety 菜单和接口权限。
   - 保留 `SUPER_ADMIN` 应急处理权限。

3. 模块授权回滚
   - 如需完全隐藏，关闭租户的 `safety` 模块授权。
   - 回滚前确认不会影响已有审计和历史数据查询。

4. 数据回滚原则
   - 不直接删除生产隐患、巡检任务、状态日志、附件或审计记录。
   - 如默认模板被判定不适合生产，应通过后续安全迁移停用或替换，不手工删除历史记录。

5. 代码回滚
   - 使用已准备的回滚镜像或 Git 回滚提交。
   - 回滚后执行登录、菜单、权限拒绝和核心页面 smoke。

## 16. 不包含内容

本计划不包含：

- 真实生产 IP、域名、账号、密码、密钥或 Token。
- 移动端、通知、AI、大屏、复杂审批流。
- 从零重写安全模块。
- 非安全巡检与隐患整改主链路的扩展上线。
