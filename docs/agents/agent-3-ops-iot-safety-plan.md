# Agent 3 实施计划：工单 / 安全 / 运维 / IoT 联动增强

> 生成日期：2026-06-20
> 分支：agent-3-ops-iot-safety
> 本文档为扫描阶段产出，不包含业务代码变更。

---

## 1. 当前模块现状

### 1.1 工单模块（`apps/api/src/modules/work-orders`）

**已有表**

- `biz_work_order`：完整工单记录，包含 `source_type`、`source_id`、`device_id`、`robot_id`、`unit_id`、`building_id`、`floor_id`、`park_tenant_id`、`overdue_flag`、`sla_dispatch_min`、`sla_finish_min` 等字段。
- `biz_work_order_log`：操作日志。
- `biz_work_order_sla_rule`：SLA 规则配置。

**已有状态流转**

```
10 提交 → 20 已派单 → 30 已接单 → 40 处理中 → 45 等待材料 → 50 已完成 → 60 已确认 → 70 已评价 → 100 关闭
                                                                                              ↑
                               ↗ 90 已取消  ↗ 91 已退单（可重新派单）
```

**已有来源类型（`source_type`）**

- `manual`（手动创建）
- `iot_alert`（IoT 告警转工单）
- `inspection`（安全巡检发现隐患生成）
- `hazard`（隐患升级生成）

**已有 API**（`work-orders.controller.ts`）

- `GET /work-orders`（分页列表）
- `GET /work-orders/overdue`（超期工单）
- `GET /work-orders/statistics`（统计）
- `GET /work-orders/stats`（图表数据）
- `GET /work-orders/sla-rules`（SLA 规则列表）
- `POST /work-orders`（创建）
- `POST /work-orders/:id/assign`（派单）
- `POST /work-orders/:id/accept`（接单）
- `POST /work-orders/:id/start`（开始处理）
- `POST /work-orders/:id/finish`（完成）
- `POST /work-orders/:id/confirm`（确认）
- `POST /work-orders/:id/evaluate`（评价）
- `POST /work-orders/:id/close`（关闭）
- `POST /work-orders/:id/cancel`（取消）
- `POST /work-orders/:id/return`（退单）
- `POST /work-orders/:id/wait-material`（等待材料）
- `POST /work-orders/sla-rules`（创建 SLA 规则）

**已有 Web 页面**

- `/workorders/list`（工单列表）
- `/workorders/[id]`（工单详情，含 `workorder_source_type` 字典展示）
- `/workorders/overdue`（超期工单）
- `/workorders/statistics`（统计）
- `/workorders/sla-rules`（SLA 规则管理）

---

### 1.2 安全模块（`apps/api/src/modules/safety-*`）

**已有表**

- `biz_safety_hazard`：安全隐患，含 `source_type`、`source_id`、`inspect_task_id`、`inspect_point_id`、`park_tenant_id`、位置字段、状态字段。
- `biz_safety_hazard_status_log`：隐患状态变更日志（带 `before_status`、`after_status`、`action`、`reason`）。
- `biz_safety_inspect_task`、`biz_safety_inspect_task_result`：巡检任务与结果。
- `biz_safety_action_log`：巡检操作日志。
- `biz_safety_inspect_plan`、`biz_safety_inspect_point`、`biz_safety_inspect_template`：巡检计划、点位、模板。
- `biz_safety_emergency_event`、`biz_safety_emergency_timeline`、`biz_safety_emergency_plan`、`biz_safety_emergency_contact`：应急事件及时间线。
- `biz_safety_work_permit`：作业票。

**已有状态流转**

隐患（`biz_safety_hazard`）：
```
10 已登记 → 20 已分配 → 30 整改中 → 40 已整改 → 60 已关闭
                    ↓             ↓
                70 超期       80 已升级
                    ↓             ↓
                91 已生成工单  92 已上报应急
```

**已有 API**

- `safety-hazards`：CRUD + 分配整改责任人、整改、复查（pass/fail）、升级应急、生成工单、逾期查询。
- `safety-inspect-plans`/`tasks`/`points`/`templates`：完整巡检闭环。
- `safety-emergency`：事件 CRUD、时间线 `GET/POST /:id/timeline`、应急联系人、应急预案。
- `safety-work-permits`：作业票 CRUD。
- `safety-statistics`：`GET /safety/statistics`、`GET /safety/emergency-work-permit-statistics`。

**已有 Web 页面**

- `/safety/hazards`、`/safety/hazards/overdue`（超期隐患）
- `/safety/inspect-plans`、`/safety/inspect-tasks`、`/safety/my-inspect-tasks`、`/safety/inspect-points`、`/safety/inspect-templates`
- `/safety/emergencies`、`/safety/emergency-plans`、`/safety/emergency-contacts`、`/safety/emergency-dashboard`
- `/safety/work-permits`
- `/safety/dashboard`（安全统计）
- `/operations/terminal`（现场工作台）

**已有 e2e 脚本**

- `s5a-safety-smoke.mjs`（安全巡检全流程）
- `s5b-emergency-permit-smoke.mjs`（应急 + 作业票）

**已有自动触发关系**

- 巡检任务发现问题 → 自动生成 `biz_safety_hazard`（`source_type=inspection`，`inspect_task_id` 关联）。
- 隐患升级 → 自动生成应急事件（`SafetyHazardsService.createHazardEmergency`）。
- 隐患生成工单 → `SafetyHazardsService.createHazardWorkOrder`，工单 `source_type=hazard`，`status=91`。

**Migration 144 & 145**（已应用）：对 safety 权限进行了全面开放，修正了应急统计 API 路径元数据。

---

### 1.3 IoT 模块（`apps/api/src/modules/iot`）

**已有表**

- `biz_iot_device`：设备，含 `building_id`、`floor_id`、`unit_id`、`park_tenant_id`。
- `biz_iot_gateway`：网关。
- `biz_iot_metric`、`biz_iot_point`、`biz_iot_protocol_config`：指标、采集点、协议配置。
- `biz_iot_alert_rule`：告警规则。
- `biz_iot_alert`：告警，含 `work_order_id`（FK 工单）、`building_id`、`floor_id`、`unit_id`、`park_tenant_id`、状态字段（active/acknowledged/processing/resolved/closed）。
- `biz_iot_alert_log`：告警操作日志。
- `biz_iot_device_data`、`biz_iot_device_heartbeat`、`biz_iot_device_latest`：设备数据历史及最新状态。
- `biz_iot_rule`、`biz_iot_rule_execution_log`：IoT 联动规则及执行日志。
- `biz_scene_template`、`biz_scene_instance`、`biz_scene_execution_log`：场景模板、实例、执行日志。

**已有 API**

- 设备、网关、指标、采集点、协议配置、告警规则、告警（含 `POST /iot/alerts/:id/create-work-order`）、数据接入（HTTP/MQTT）、实时推送（WebSocket）、规则引擎、场景中心、Dashboard。
- `POST /iot/unified-action/execute`（统一动作执行器）。

**已有自动触发**

- 设备指标上报 → 告警规则评估（`IotAlertRulesService`）→ 生成/更新告警（`biz_iot_alert`）→ 触发规则引擎（`IotRuleTriggerService.handleAlertCreatedOrUpdated`）→ 场景执行（`SceneExecutionService`）→ 统一动作（`UnifiedActionExecutorService`）。
- 统一动作支持 `CREATE_WORK_ORDER`（实际执行）和 `CREATE_IOT_ALERT`（实际执行），其余动作类型（`CREATE_SAFETY_HAZARD`、`CREATE_INSPECTION_TASK`、`CONTROL_DEVICE` 等）目前为 **SIMULATED**。
- IoT 告警手动转工单：`iot_alert:create_workorder` 权限，授予 SUPER_ADMIN / OPERATIONS_OWNER / PARK_OPERATOR / PROPERTY_MANAGER / SAFETY_MANAGER。

**已有 Web 页面**

- `/iot/devices`、`/iot/gateways`、`/iot/metrics`、`/iot/alert-rules`、`/iot/alerts`、`/iot/rules`、`/iot/overview`（Dashboard）。
- `/admin/iot/devices`、`/admin/iot/gateways`、`/admin/iot/alerts`、`/admin/iot/dashboard`、`/admin/iot/protocol-configs`、`/admin/iot/rules`、`/admin/iot/scenes`。

**已有 e2e 脚本**

- `s9a`（设备中枢）、`s9b`（运行时告警）、`s9c`（规则引擎）、`s9d`（场景中心）、`s9d1`（统一动作执行器）。

---

### 1.4 能耗模块（`apps/api/src/modules/energy`）

**已有表**

- `energy_meter`：电表。
- `energy_reading`：读数。
- `energy_billing_cycle`、`energy_billing_item`：计费周期与明细。
- `energy_allocation_rule`：分摊规则。
- `energy_billing_adjustment`：计费调整（支持冲红）。
- `energy_alert`：能耗告警（`process_status`: PENDING/acknowledged/resolved），**无 `work_order_id` 字段**，**无 `meter_id` 以外的 `unit_id`/`tenant_id` 租户空间字段**。

**已有 API**

- 电表 CRUD、读数录入与历史、计费周期生成与导出、计费明细、分摊规则、调整与冲红、Dashboard、能耗告警（acknowledge/process/close）。
- `energy-to-receivable.adapter.ts`：计费明细转应收账款。

**已有 Web 页面**

- `/energy/meters`、`/energy/readings`、`/energy/alerts`、`/energy/billing-cycles`、`/energy/billing-items`、`/energy/allocation-rules`、`/energy/billing-adjustments`、`/energy/dashboard`。
- `/admin/energy/meters`、`/admin/energy/readings`、`/admin/energy/alerts`、`/admin/energy/billing-cycles`、`/admin/energy/billing-items`、`/admin/energy/allocation-rules`、`/admin/energy/billing-adjustments`、`/admin/energy/dashboard`。

**已有 e2e 脚本**

- `s9e`（电表监控）、`s9f`（按租户计费）、`s9f1`（计费调整与冲红）。

**注意**：Tenant 360 中 `energy: { available: false, summary: null }` 为硬编码未实现状态。

---

### 1.5 视频模块（`apps/api/src/modules/video-cameras`）

**已有表**

- `biz_camera_device`：摄像头设备。
- `biz_video_evidence`：视频证据（含 `source_type`、`source_id`，支持 inspection / hazard 等来源关联）。
- `biz_video_alert`：视频告警。
- `biz_video_alert_process_log`：视频告警处理日志。
- `biz_video_platform_config`：视频平台配置。

**已有 API**

- 摄像头 CRUD、实时流获取。
- 视频证据：通用 CRUD、`GET/POST /safety/inspections/:id/video-evidences`（巡检单证据）、`GET/POST /safety/inspect-tasks/:id/video-evidences`（巡检任务证据）、隐患证据（`DELETE /safety/hazards/:hazardId/video-evidences/:id`）。
- 视频告警：列表、处理、仪表盘。
- 视频平台配置 CRUD。

**已有 e2e 脚本**

- `s8c`（摄像头）、`s8d`（视频预览平台）、`s8e`（视频证据巡检）、`s8f`（视频告警仪表盘）。

---

### 1.6 机器人模块（`apps/api/src/modules/robots`）

**已有表**

- `biz_robot_command_log`：机器人指令日志。
- 机器人本体为 IoT 设备（`biz_iot_device`，`device_type=robot`，`device_category=cleaning_robot`）。

**已有 API**

- `GET /robots`（机器人列表）、`POST /robots/ezviz-config`（Ezviz 平台配置）、`GET/POST /robots/ezviz/devices`（设备同步）、`POST /robots/:id/clean`（开始清洁）、`POST /robots/:id/pause`/`stop`/`go-home`（控制）、`POST /robots/:id/region-clean`（区域清洁）、回调接口。

**已有 Web 页面**

- `/robots/overview`（总览）、`/robots/cleaning`（清洁任务）。

**Ezviz 集成**（migration 000132）：机器人通过 Ezviz API 同步设备、控制清洁，机器人也被注册为 IoT 设备（`iot_ingest` 推送状态）。

---

### 1.7 现有权限/菜单

IoT 模块主要权限常量（`packages/shared/src/index.ts`）：
- `IOT_ALERT_CREATE_WORKORDER`（告警转工单）
- `IOT_RULE_*`、`IOT_SCENE_*`、`IOT_DATA_*`

安全模块（migration 000144 全量开放）：
- `safety:operations-terminal`、`safety:hazards-overdue`、`safety:emergency-dashboard`
- `safety_hazard:overdue`、`safety_emergency_statistics:read`、`safety_work_permit_statistics:read`

---

## 2. 不允许重复开发的内容

### 2.1 工单状态机（勿破坏）

- 状态码 10/20/30/40/45/50/60/70/90/91/100 的完整流转逻辑。
- `WORK_ORDER_SOURCE_MANUAL`、`WORK_ORDER_SOURCE_INSPECTION`、`iot_alert`、`hazard` 四种来源类型。
- 工单 `overdueFlag` + SLA 规则自动标记逻辑。
- 工单评价（satisfaction/evaluation）只允许在 `confirmed(60)` 状态完成。
- 工单退单（`returned=91`）只允许在 `submitted/assigned/returned` 状态再次派单。

### 2.2 安全闭环（勿破坏）

- 隐患 `status=91` 生成工单、`status=92` 升级应急的流转判断。
- 复查结果 pass/fail 的业务判断（fail 时隐患回到 `rectifying` 状态）。
- 巡检任务结果触发隐患生成的流程（`inspect_task_id` 关联关系）。
- 应急事件时间线（`biz_safety_emergency_timeline`）的追加写入逻辑。
- `safety_emergency_statistics` 和 `safety_work_permit_statistics` 的 API 路径（000145 已修正为 `/api/v1/safety/emergency-work-permit-statistics`）。

### 2.3 IoT 告警自动触发（勿破坏）

- 规则引擎触发链：指标上报 → 规则评估 → 告警创建/更新 → 规则触发 → 场景执行 → 统一动作。
- `UnifiedActionExecutorService.executeAction` 中 `CREATE_WORK_ORDER` 和 `CREATE_IOT_ALERT` 的实际执行逻辑。
- IoT 告警 `work_order_id` 字段在手动转工单时的写入（`iot-alerts.service.ts`）。
- 规则执行日志（`biz_iot_rule_execution_log`）与场景执行日志的写入。

### 2.4 能耗计费（勿破坏）

- `energy-to-receivable.adapter.ts` 将计费明细转为应收账款的适配逻辑。
- 计费调整（冲红/反冲）的有效性校验。
- 分摊规则的比例计算逻辑。

### 2.5 视频证据关联（勿破坏）

- `video_evidence.source_type` / `source_id` 与巡检任务、隐患的关联索引。
- 安全模块视频证据专用路由（`safety-video-evidences.controller.ts`）。

### 2.6 机器人可见性（勿破坏）

- Migration 000134 已建立机器人可见性权限与菜单种子，勿重复。
- Ezviz 平台回调签名校验逻辑（`robots.service.ts`）。

---

## 3. 建议增强方向

> 以下均为建议方向，本轮不实现，需逐项评审后再启动对应子任务。

### 3.1 统一事件时间线（跨域事件流）

**问题**：工单、隐患、应急、IoT 告警、能耗告警、视频告警各自独立，无法在同一视图中按时间轴展现同一空间/设备/租户下的所有事件。

**方案**：
- 新增 API：`GET /events/timeline?unit_id=&device_id=&park_tenant_id=&date_from=&date_to=`，聚合 `biz_work_order`、`biz_safety_hazard`、`biz_safety_emergency_event`、`biz_iot_alert`、`energy_alert`、`biz_video_alert` 的时间点，返回统一格式的事件流。
- 前端：在房源详情、设备详情侧边栏增加"事件时间线"标签页，以卡片/流式方式展示。
- 注意：只读聚合，不修改各子模块状态机。

### 3.2 Tenant 360 relatedUnits 修复

**问题**（来自 Agent 1）：`park-tenants.service.ts` 第 393 行 `relatedUnits: []` 为硬编码空数组，导致租户视图中空间关联为空。

**方案**：
- 修复 `get360` 方法，查询当前激活合同（`status=75`）中的 `unit_id` 列表，关联 `biz_unit`（楼层、建筑名称、建筑面积），填充 `relatedUnits`。
- 需在 `park-tenants.service.ts` 中引入 `UnitRepository` 或通过已有 `LeasingContractsService` 获取。
- 与 Agent 1/2 的合同模块边界：只读取合同 `unit_id`，不改变合同逻辑。

### 3.3 Tenant 360 能耗摘要

**问题**：`energy: { available: false, summary: null }` 未实现，租户看不到能耗汇总。

**方案**：
- 在 `park-tenants.service.ts` 引入 `EnergyBillingItemService` 或直接查询 `energy_billing_item`。
- 返回最近计费周期内该租户的能耗总量、费用总额、未结账单数。
- 需在 `energy` 模块中新增 `getEnergyForTenant(tenantId, parkId, parkTenantId)` 方法供 360 调用。

### 3.4 设备运行状态与工单联动增强

**问题**：工单实体上有 `device_id` 字段，但：
- 工单详情页未回显设备名称/类型/当前状态。
- 设备详情页无法查看该设备历史工单。

**方案**：
- `work-orders.controller.ts` 详情接口补充设备名称快照（通过 `IotDeviceEntity` 查询）。
- 新增 `GET /iot/devices/:id/work-orders` 查询关联工单列表（只需在 `WorkOrdersService` 增加 `byDeviceId` 查询方法）。
- 前端设备详情抽屉增加"历史工单"标签页。

### 3.5 IoT 告警处理闭环增强

**问题**：统一动作执行器中 `CREATE_SAFETY_HAZARD`、`CREATE_INSPECTION_TASK`、`CONTROL_DEVICE` 等动作类型目前为 `SIMULATED`，不执行实际业务逻辑。

**方案**：
- **优先级高**：实现 `CREATE_SAFETY_HAZARD` 实际动作，调用 `SafetyHazardsService.create` 生成隐患记录（`source_type=iot_alert`，`source_id=alert_id`）。
- **优先级中**：实现 `CONTROL_DEVICE` 动作（通过 Ezviz API 或内部状态模拟），需注意设备控制权限隔离。
- `UnifiedActionExecutorService` 需注入 `SafetyHazardsService`。
- 不改变已有 SIMULATED 路径的返回结构。

### 3.6 安全隐患整改链路增强

**已有**：隐患→工单、隐患→应急的流转已实现。

**增强方向**：
- 隐患整改完成后（`status=40`），若存在关联工单且工单未关闭，自动更新工单备注（不修改工单状态机，仅写日志）。
- 隐患复查失败（fail）次数超阈值时，自动升级到紧急级别（目前需手动操作）。
- 隐患列表增加"关联工单数"、"关联视频证据数"快速计数列。

### 3.7 能耗异常与租户/设备关联分析

**问题**：`energy_alert` 实体仅关联 `meter_id`，缺少直接的 `unit_id`/`park_tenant_id` 字段，导致无法直接关联租户和房源。

**方案**（需迁移支持）：
- 在 `energy_alert` 表新增 `unit_id`（nullable）、`park_tenant_id`（nullable）字段，在 `EnergyAlertService.create` 时从电表记录中填充。
- 新增 `GET /energy/alerts/by-tenant/:parkTenantId` 聚合接口，供 Tenant 360 调用。
- 新增能耗异常→工单路径：`POST /energy/alerts/:id/create-work-order`（参照 `iot_alert:create_workorder` 实现）。
- **migration 建议编号**：`000147_energy_alert_tenant_unit.sql`（待确认，当前最新为 000146）。

### 3.8 机器人清洁任务与运营任务关联

**问题**：机器人清洁任务（Ezviz 清洁记录）未与工单或运营计划挂钩，园区调度不可见。

**方案**：
- 工单创建时允许关联机器人（当前 `robot_id` 字段已存在，但未在创建 DTO 中开放）。
- `RobotCommandLogEntity` 补充 `work_order_id` nullable 字段，在派发清洁任务时记录关联工单。
- 机器人清洁完成回调时，若存在关联工单，自动写入工单日志（不更改工单状态，仅记录）。
- **migration 建议编号**：`000148_robot_command_log_work_order.sql`。

### 3.9 移动端现场处理体验优化

**问题**：现有工单列表、巡检任务、隐患处理页面在 390px 视口下存在横向溢出风险（来自 AGENTS.md 前端移动端基线要求）。

**方案**：
- 工单列表（`/workorders/list`）：增加 `ds-mobile-record-list` + `ds-mobile-record` 卡片布局，作为 `< 640px` 的替代渲染。
- 隐患处理（`/safety/hazards`）：移动端表单改为全宽堆叠布局，照片上传使用现有 shared upload component。
- 现场工作台（`/operations/terminal`）：验证 390px 渲染，确保主操作按钮在拇指区域可达。
- 依据 AGENTS.md，所有高频现场操作页（工单详情、巡检任务、隐患处理）均需 mobile-first 验证。

### 3.10 数据质量检查接口

**问题**：无法快速发现无位置工单、无设备告警、无责任人任务、超时未处理记录等数据质量问题。

**方案**：
- 新增 `GET /work-orders/data-quality`（管理员权限）返回：无位置工单数、无派单人工单数、SLA 超时未处理数、来源为 `iot_alert` 但告警已关闭的工单数。
- 新增 `GET /iot/alerts/data-quality`：无设备关联告警数、`work_order_id` 非空但工单已取消的告警数。
- 以上为只读统计，无状态机变更风险。

---

## 4. 预计改动文件清单

### 4.1 API 文件

| 文件路径 | 改动类型 | 关联增强 |
|---|---|---|
| `apps/api/src/modules/park-tenants/park-tenants.service.ts` | 修改 | 3.2 relatedUnits、3.3 energy |
| `apps/api/src/modules/park-tenants/park-tenants.module.ts` | 修改（注入新依赖） | 3.2、3.3 |
| `apps/api/src/modules/iot/unified-action-executor.service.ts` | 修改 | 3.5 实现 CREATE_SAFETY_HAZARD |
| `apps/api/src/modules/iot/iot.module.ts` | 修改（注入 SafetyHazardsService） | 3.5 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 修改（新增 byDeviceId 查询、data-quality 统计） | 3.4、3.10 |
| `apps/api/src/modules/work-orders/work-orders.controller.ts` | 修改（新增路由） | 3.4、3.10 |
| `apps/api/src/modules/work-orders/work-order-query.service.ts` | 修改 | 3.4 |
| `apps/api/src/modules/energy/energy-alert.service.ts` | 修改（关联 unit/tenant 字段填充、create-work-order） | 3.7 |
| `apps/api/src/modules/energy/energy-alerts.controller.ts` | 修改（新增 create-work-order 路由） | 3.7 |
| `apps/api/src/modules/energy/energy.module.ts` | 修改（暴露 tenant 聚合方法） | 3.3 |
| `apps/api/src/modules/energy/entities/energy-alert.entity.ts` | 修改（新增字段） | 3.7 |
| `apps/api/src/modules/robots/robots.service.ts` | 修改（回调写工单日志） | 3.8 |
| `apps/api/src/modules/robots/entities/robot-command-log.entity.ts` | 修改（新增 work_order_id 字段） | 3.8 |
| 新增：`apps/api/src/modules/events/events-timeline.controller.ts` | 新建 | 3.1 |
| 新增：`apps/api/src/modules/events/events-timeline.service.ts` | 新建 | 3.1 |
| 新增：`apps/api/src/modules/events/events.module.ts` | 新建 | 3.1 |
| `apps/api/src/app.module.ts` | 修改（注册 EventsModule） | 3.1 |

### 4.2 Web 文件

| 文件路径 | 改动类型 | 关联增强 |
|---|---|---|
| `apps/web/app/workorders/[id]/page.tsx` | 修改（展示设备名称/状态） | 3.4 |
| `apps/web/app/workorders/list/page.tsx` | 修改（移动端卡片布局） | 3.9 |
| `apps/web/app/iot/devices/[id]/page.tsx` 或抽屉 | 修改（历史工单标签） | 3.4 |
| `apps/web/app/safety/hazards/page.tsx` | 修改（移动端布局、关联计数列） | 3.6、3.9 |
| `apps/web/app/leasing/tenants/page.tsx` | 修改（relatedUnits 渲染、energy 摘要标签） | 3.2、3.3 |
| `apps/web/app/operations/terminal/page.tsx` | 修改（390px 移动端验证） | 3.9 |
| 新增：`apps/web/app/workorders/data-quality/page.tsx` | 新建 | 3.10 |
| 新增：`apps/web/components/events/EventTimeline.tsx` | 新建 | 3.1 |

### 4.3 shared 文件

| 文件路径 | 改动类型 | 关联增强 |
|---|---|---|
| `packages/shared/src/index.ts` | 修改（新增权限常量：ENERGY_ALERT_CREATE_WORKORDER、EVENTS_TIMELINE_READ 等） | 3.5、3.7 |

### 4.4 migration 文件

> **不在本轮创建**，以下仅为预规划编号，需在实施阶段确认后按序创建。

| 建议编号 | 内容 | 关联增强 |
|---|---|---|
| `000147_energy_alert_tenant_unit.sql` | `energy_alert` 表增加 `unit_id`、`park_tenant_id` nullable 字段；补充 RBAC `energy_alert:create_workorder` 权限 | 3.7 |
| `000148_robot_command_log_work_order.sql` | `biz_robot_command_log` 表增加 `work_order_id` nullable 字段 | 3.8 |
| `000149_unified_event_timeline_permission.sql` | 注册统一事件时间线 API 权限与菜单 | 3.1 |

### 4.5 e2e 脚本

| 文件路径 | 改动类型 | 说明 |
|---|---|---|
| 新增：`scripts/e2e/s3c-agent3-linkage-smoke.mjs` | 新建 | 覆盖 IoT→工单、隐患→应急、能耗告警→工单、设备历史工单、Tenant 360 relatedUnits |
| `scripts/e2e/s5a-safety-smoke.mjs` | 可能修改 | 若安全隐患 CREATE_SAFETY_HAZARD 实现后，需补充从 IoT 告警自动生成隐患的断言 |

### 4.6 docs 文件

| 文件路径 | 说明 |
|---|---|
| `docs/agents/agent-3-ops-iot-safety-plan.md`（本文件） | Agent 3 实施计划 |

---

## 5. 风险点

### 5.1 Migration 风险

- **重复编号风险**：当前存在历史 `000136` 重复（`idempotency_request.sql` 和 `s9f_energy_billing_allocation.sql`），新 migration 必须从 `000147` 开始，执行前务必用 `pnpm db:migrate` 确认当前已应用的最高编号为 `000146`。
- **`energy_alert` 表结构变更**：若增加 `unit_id`/`park_tenant_id` 字段，需确认现有 `idx_energy_alert_meter_status` 索引不受影响；ALTER TABLE 对大表的锁影响需在低峰期执行。
- **`biz_robot_command_log` 字段新增**：nullable 字段新增属于非破坏性变更，风险低。

### 5.2 RBAC 权限风险

- 新增 `energy_alert:create_workorder` 权限时，需确认目标角色（SUPER_ADMIN / OPERATIONS_OWNER / PROPERTY_MANAGER）已在对应 `sys_role` 中存在，避免外键引用失效。
- `events_timeline:read` 权限的 `parent_code` 挂载位置需与现有权限树层级一致，否则菜单不可见。
- 引入新权限常量后，需同步更新 `packages/shared/src/index.ts` 中的 `SYSTEM_PERMISSIONS`，避免 API 守卫报 `undefined permission` 错误。

### 5.3 工单状态机风险

- 新增"工单关联设备详情"查询仅为只读，不影响状态机。
- 机器人回调写工单日志（`WorkOrderLogEntity` 追加）不改变工单状态，但需在事务中处理，避免回调失败时脏写。
- 能耗告警转工单逻辑需复用 `WorkOrdersService.create` 现有路径，不引入新的状态初始值。

### 5.4 安全闭环风险

- 实现 `CREATE_SAFETY_HAZARD` 统一动作时，`SafetyHazardsService.create` 内部会调用 `CodeRulesService.generateNext`（隐患编号生成），需在 IoT 规则引擎并发触发场景下确认编号生成的幂等性（当前基于数据库序列，较安全）。
- 隐患 `status=91`（已生成工单）为终态之一，若统一动作重复触发 `CREATE_SAFETY_HAZARD`，需在执行前校验是否已存在 `source_type=iot_alert`、`source_id=<alert_id>` 的隐患记录，避免重复。

### 5.5 IoT 告警自动触发风险

- `SceneExecutionService.triggerAutomationsForRuleLogs` 内部已有 `safeTrigger` 异常捕获，新增 `CREATE_SAFETY_HAZARD` 实际执行路径需同样有 try/catch，避免隐患服务异常导致告警处理流程中断。
- 统一动作执行器新增注入 `SafetyHazardsService` 会造成循环依赖风险（IoT → Safety → WorkOrders → 已有），需在 NestJS 模块中确认无循环，或使用 `forwardRef`。
- `IotAlertRuleEntity` 的 `cooldownSeconds` 字段已防止短时间重复告警，但 `CREATE_SAFETY_HAZARD` 的幂等校验不应依赖冷却窗口。

### 5.6 能耗计费风险

- 能耗告警转工单不应影响 `energy-to-receivable.adapter.ts` 的计费转账逻辑，需确认两条路径完全独立。
- `energy_alert.process_status` 状态机（PENDING → acknowledged → resolved）不应被工单关联写入修改，工单仅为辅助跟踪。

### 5.7 与资产/空间、招商合同、财务、驾驶舱模块的边界风险

- `relatedUnits` 修复需读取 `biz_leasing_contract` 表，但不改写合同逻辑，需通过已有 `LeasingContractsService` 方法读取，避免直接 Repository 查询绕过 DataScope 过滤。
- Tenant 360 能耗摘要调用 `energy_billing_item`，需确认 DataScope（`tenantId/parkId` 隔离）正确，不泄露跨租户数据。
- 统一事件时间线 API 聚合多表时，必须对每个子查询独立应用 `DataScopeService`，不能仅在最外层过滤。

### 5.8 生产数据风险

- 所有新增查询接口须通过现有 `DataScopeService` 确保租户隔离，禁止跨租户数据混合。
- 新增字段（`unit_id`/`park_tenant_id` 在 `energy_alert`）历史数据为 NULL，前端展示需兼容 NULL 值不崩溃。
- 统一事件时间线中包含的告警/隐患/应急记录，其字段策略（`FieldPolicyService`）需与各子模块一致，避免敏感字段泄露。

---

## 6. 推荐验收命令

### 6.1 基础校验

```bash
pnpm lint
pnpm typecheck
pnpm build
```

### 6.2 功能 e2e 回归

```bash
# 安全模块
pnpm run test:e2e:s5a-safety
pnpm run test:e2e:s5b-emergency-permit

# 视频模块
pnpm run test:e2e:s8c-video-camera
pnpm run test:e2e:s8d-video-preview-platform
pnpm run test:e2e:s8e-video-evidence-inspection
pnpm run test:e2e:s8f-video-alert-dashboard

# IoT 模块
pnpm run test:e2e:s9a-iot-device-hub
pnpm run test:e2e:s9b-iot-runtime-alert
pnpm run test:e2e:s9c-iot-rule-engine
pnpm run test:e2e:s9d-iot-scene-center
pnpm run test:e2e:s9d1-unified-action-executor

# 能耗模块
pnpm run test:e2e:s9e-energy-meter-monitor
pnpm run test:e2e:s9f-energy-billing-tenant
pnpm run test:e2e:s9f1-energy-billing-adjustment-reversal
```

### 6.3 回归基线

```bash
# 全量回归（涵盖工单、认证、资产等）
node scripts/e2e/first-release-regression.mjs
node scripts/e2e/first-release-workorders.mjs
```

### 6.4 Migration 验证（若新增 migration）

```bash
pnpm db:migrate
pnpm db:check:init
```

### 6.5 数据质量检查（新增接口上线后）

```bash
# 手动 curl 验证（需要有效 token）
curl -X GET "http://localhost:3001/api/v1/work-orders/data-quality" \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: 10000001" \
  -H "x-park-id: 20000001"
```

---

## 7. 附：关键联动现状总结图

```
IoT 设备上报指标
    │
    ▼
告警规则评估 (IotAlertRulesService)
    │
    ▼
biz_iot_alert 创建/更新
    │ work_order_id ← 已有字段
    ├──► [手动] POST /iot/alerts/:id/create-work-order → biz_work_order (source=iot_alert)
    │
    ▼
IoT 规则引擎触发 (IotRuleTriggerService)
    │
    ▼
SceneExecutionService → UnifiedActionExecutorService
    ├──► CREATE_WORK_ORDER  ✅ 已实现
    ├──► CREATE_IOT_ALERT   ✅ 已实现
    └──► CREATE_SAFETY_HAZARD  ⚠️ SIMULATED（建议 3.5 实现）

安全巡检任务
    │
    ▼
biz_safety_hazard (source=inspection)
    ├──► status=91 → biz_work_order (source=hazard)  ✅ 已实现
    └──► status=92 → biz_safety_emergency_event       ✅ 已实现

能耗异常
    │
    ▼
energy_alert (PENDING → acknowledged → resolved)
    └──► work_order_id  ⚠️ 字段不存在（建议 3.7 新增）

Tenant 360 聚合
    ├── workorders     ✅ 已实现
    ├── hazards        ✅ 已实现
    ├── emergency      ✅ 已实现
    ├── work_permits   ✅ 已实现
    ├── devices (IoT)  ✅ 已实现
    ├── relatedUnits   ⚠️ 硬编码 []（建议 3.2 修复）
    └── energy         ⚠️ available=false（建议 3.3 实现）
```

---

*本计划文档由 Agent 3 在 2026-06-20 扫描阶段生成，不包含业务代码变更。实施阶段需按各增强方向逐项创建子任务并通过 Phase 1 规划评审后方可开发。*
