# 金湖智慧园区数字孪生运营平台 — Codex 补充开发说明

> 版本：V1.0 | 2026-05  
> 用途：在 Phoenix ERP V3 现有代码基础上，按本文说明进行增改调修  
> 技术栈：Next.js 16 + React 19 + NestJS 10 + TypeORM + PostgreSQL + MQTT/EMQX

---

## 一、整体开发原则

### 1.1 代码风格强制要求
- 前端：Next.js App Router 架构，**禁止**使用 Pages Router
- CSS：**只用** CSS Variables（`globals.css` 中的 Token），**禁止** Tailwind、inline style、hardcode 颜色值
- 图标：**只用** lucide-react，**禁止**引入其他图标库
- 字体：Inter（已在 globals.css 引入），无需重复引入
- 后端：NestJS 模块化架构，每个业务域一个 Module，遵循 Controller → Service → Repository 分层
- ORM：TypeORM，**禁止**直接写原生 SQL（复杂查询用 QueryBuilder）
- 认证：所有 API 端点必须经过 JWT Guard，公开端点显式标注 `@Public()`

### 1.2 编码规范
- 统一编码体系必须贯穿前后端：
  - 园区：`PARK-001`
  - 楼栋：`BLD-A01`
  - 房间：`RM-0301`
  - 设备：`EQ-000001`
  - 摄像头：`CAM-001`
  - 机器人：`RB-000001`（清洁 `CLN-RB-001`，巡检 `INS-RB-001`）
- 所有实体表必须有 `code`（唯一业务编码）、`createdAt`、`updatedAt`、`deletedAt`（软删除）字段

### 1.3 数据库规范
- 生产：PostgreSQL + TimescaleDB（时序数据）
- 开发：SQLite（保持现有配置）
- 时序数据表（IoT 采集、能耗、机器人轨迹）必须使用 TimescaleDB hypertable
- 缓存：Redis（设备状态、实时数据缓存，TTL 30秒）
- 文件：MinIO（BIM 文件、视频截图、报告导出）
- 消息：RabbitMQ（工单事件、告警事件、机器人任务事件）
- MQTT Broker：EMQX（IoT 设备接入）

---

## 二、模块开发清单

### 2.1 第一阶段（优先开发）

#### 模块 A：组织与权限管理
**现有基础**：已有基础 User/Role 模块，需在此基础上扩展

**需新增/修改内容**：
```
后端：
- Organization 实体（园区/公司/部门三级树形结构）
- Role 扩展：新增角色类型字段（SUPER_ADMIN | PARK_ADMIN | PROPERTY | TENANT | VISITOR）
- Permission 粒度细化到菜单+按钮级别
- API: GET /organizations/tree（返回完整组织树）
- API: POST /organizations（创建组织节点）
- API: GET /users?orgId=&roleType=（按组织+角色筛选）

前端：
- 页面：/admin/organizations（组织树管理，支持拖拽排序）
- 页面：/admin/roles（角色权限矩阵配置界面）
- 组件：<OrgTreeSelector />（通用组织树选择器，供其他模块复用）
```

#### 模块 B：资产管理中心
**核心实体**：Park → Building → Floor → Room → Asset

**需新增内容**：
```
后端实体：
- Park { id, code, name, address, totalArea, lat, lng, description }
- Building { id, code, parkId, name, floors, buildYear, usage }
- Floor { id, code, buildingId, floorNumber, area, floorPlanUrl }
- Room { id, code, floorId, name, area, usage, status(VACANT|OCCUPIED|MAINTENANCE) }
- Asset { id, code, roomId, name, category, brand, model, serialNo, purchaseDate, warrantyDate, status }

后端 API：
- CRUD /parks, /buildings, /floors, /rooms, /assets
- GET /parks/:id/overview（园区总览数据：楼栋数、房间数、出租率、资产数）
- GET /buildings/:id/floors（楼层列表含房间统计）
- GET /rooms?buildingId=&status=（带筛选的房间列表）
- POST /assets/import（Excel 批量导入资产）
- GET /assets/export（导出资产台账）

前端：
- 页面：/assets/parks（园区列表+地图展示）
- 页面：/assets/buildings（楼栋管理，含楼层平面图上传）
- 页面：/assets/rooms（房间管理，支持状态筛选）
- 页面：/assets/inventory（资产台账，表格+筛选+导出）
- 组件：<AssetStatusBadge status={} />（VACANT=绿/OCCUPIED=蓝/MAINTENANCE=橙）
- 组件：<BuildingFloorPlan floorId={} />（楼层平面图展示，标注房间状态）
```

#### 模块 C：IoT 平台（设备接入层）
**协议支持**：MQTT + WebSocket + HTTP API + Modbus TCP

**需新增内容**：
```
后端：
- Device 实体 { id, code, name, type, protocol, roomId, status, lastOnlineAt, config(JSONB) }
- DeviceData 实体（TimescaleDB hypertable）{ deviceId, metric, value, unit, timestamp }
- DeviceAlert 实体 { deviceId, level, message, status, triggeredAt, resolvedAt }

MQTT 订阅规则（EMQX 配置）：
  Topic 格式：park/{parkCode}/device/{deviceCode}/{metric}
  示例：park/PARK-001/device/EQ-000001/power

后端 Service：
- IoTGatewayService：订阅 EMQX，解析 payload，写入 TimescaleDB
- DeviceStateService：维护设备实时状态（Redis 缓存，key: device:{code}:state）
- AlertService：规则引擎，阈值触发告警，推送 RabbitMQ

后端 API：
- GET /devices?roomId=&type=&status=（设备列表）
- GET /devices/:id/realtime（当前实时数据，from Redis）
- GET /devices/:id/history?start=&end=&metric=（历史时序数据）
- GET /devices/:id/alerts（设备告警历史）
- POST /devices/:id/command（下发指令）

WebSocket 推送（已有基础，扩展以下 events）：
  device:online / device:offline
  device:data:{deviceCode}（实时数据推送）
  device:alert（告警推送）

前端：
- 页面：/iot/devices（设备列表，含在线率统计卡片）
- 页面：/iot/devices/:id（设备详情：实时数据 + 历史趋势图 + 告警记录）
- 页面：/iot/alerts（告警中心，支持按级别/设备/时间筛选，一键确认）
- 组件：<DeviceStatusDot online={} />（绿点=在线/灰点=离线）
- 组件：<RealtimeChart deviceId={} metric={} />（实时折线图，WebSocket 驱动）
- 组件：<AlertBadge level="critical|warning|info" />
```

#### 模块 D：能耗管理系统
**数据来源**：电表/水表/燃气表 → IoT → TimescaleDB

**需新增内容**：
```
后端：
- EnergyMeter 实体 { id, code, type(ELECTRICITY|WATER|GAS), deviceId, roomId, multiplier }
- EnergyBill 实体 { meterId, billingMonth, consumption, amount, status }

后端 API：
- GET /energy/overview（总览：本月用电/用水/燃气 + 环比）
- GET /energy/trend?type=&start=&end=&granularity=hour|day|month（趋势数据）
- GET /energy/ranking?type=&period=（楼栋/房间能耗排行）
- GET /energy/meters（电表列表及当前读数）
- POST /energy/bills/generate（按月生成账单）
- GET /energy/bills?month=&status=（账单列表）

前端：
- 页面：/energy/dashboard（能耗总览：KPI卡片 + 趋势折线图 + 楼栋热力分布）
- 页面：/energy/meters（电表管理）
- 页面：/energy/bills（账单管理，支持导出 PDF）
- 组件：<EnergyTrendChart type={} granularity={} />
- 组件：<EnergyRankingTable />（前10高能耗房间排行）

KPI 卡片设计（4个，横排）：
  本月用电(kWh) | 本月用水(m³) | 本月费用(元) | 同比节约(%)
```

#### 模块 E：工单系统
**触发来源**：手动创建 / 设备告警自动生成 / 巡检发现

**需新增内容**：
```
后端：
- WorkOrder 实体：
  { id, code, title, type(REPAIR|MAINTENANCE|INSPECTION|CLEANING|OTHER),
    priority(HIGH|MEDIUM|LOW), status(PENDING|ASSIGNED|IN_PROGRESS|DONE|CLOSED),
    sourceType(MANUAL|ALERT|INSPECTION), sourceId,
    deviceId, roomId, assigneeId, reporterId,
    description, images(JSONB), resolveNote,
    createdAt, assignedAt, startedAt, completedAt }
- WorkOrderLog 实体（状态变更日志）

后端 API：
- POST /work-orders（创建工单）
- GET /work-orders?status=&type=&assigneeId=&startDate=&endDate=（列表+筛选）
- PUT /work-orders/:id/assign（指派工单）
- PUT /work-orders/:id/status（更新状态）
- GET /work-orders/stats（统计：待处理数/逾期数/本月完成数）
- POST /work-orders/:id/images（上传现场图片到 MinIO）

RabbitMQ 消费：
  Queue: alert.events → 自动生成告警工单
  Queue: inspection.findings → 自动生成巡检工单

前端：
- 页面：/workorders（工单看板，Kanban 视图：待处理/进行中/已完成）
- 页面：/workorders/list（工单列表，含高级筛选）
- 页面：/workorders/:id（工单详情：流程时间线 + 图片 + 操作按钮）
- 组件：<WorkOrderKanban />（拖拽卡片换状态）
- 组件：<WorkOrderTimeline logs={} />
- 组件：<PriorityBadge priority={} />（HIGH=红/MEDIUM=橙/LOW=蓝）
```

#### 模块 F：机器人运营中心（基础版）
**接入类型**：清洁机器人、巡检机器人

**需新增内容**：
```
后端：
- Robot 实体：
  { id, code, name, type(CLEANING|INSPECTION|SECURITY|AGV|DISINFECTION),
    brand, model, status(IDLE|WORKING|CHARGING|ERROR|OFFLINE),
    batteryLevel, currentRoomId, currentX, currentY, currentMap,
    lastActiveAt }
- RobotTask 实体：
  { id, robotId, type, status, areaCode, startedAt, completedAt, coverage, result(JSONB) }
- RobotTrack 实体（TimescaleDB hypertable）：
  { robotId, x, y, heading, batteryLevel, timestamp }

后端 API：
- GET /robots（机器人列表含实时状态）
- GET /robots/:id（机器人详情）
- POST /robots/:id/tasks（下发清洁/巡检任务）
- PUT /robots/:id/tasks/:taskId/cancel（取消任务）
- GET /robots/:id/tasks（任务历史）
- GET /robots/:id/track?start=&end=（轨迹数据）
- WebSocket events：
    robot:status:{robotCode}（实时状态推送）
    robot:position:{robotCode}（实时位置推送，1Hz）

前端：
- 页面：/robots（机器人总览：状态卡片列表）
- 页面：/robots/:id（机器人详情：地图+实时位置+任务列表+轨迹回放）
- 组件：<RobotStatusCard robot={} />（显示：类型/状态/电量/当前位置）
- 组件：<BatteryIndicator level={} />（进度条样式）
- 组件：<RobotMapView robotId={} />（地图展示当前位置，预留后续接 BIM）
```

---

### 2.2 第二阶段（次优先）

#### 模块 G：BIM 与数字孪生
**技术选型**：xeokit-sdk + Three.js + IFC.js

**需新增内容**：
```
后端：
- BimModel 实体 { id, code, buildingId, name, version, fileUrl, status, convertedAt }
- BimSpace 实体 { id, modelId, ifcGuid, name, type, roomId }（BIM空间与业务房间映射）
- BimDevice 实体 { id, modelId, ifcGuid, deviceId, position(JSONB) }（BIM设备位置）

后端 API：
- POST /bim/models（上传 IFC 文件到 MinIO，触发转换任务）
- GET /bim/models/:id/spaces（获取空间列表）
- POST /bim/spaces/link（绑定 BIM 空间与业务房间）
- GET /bim/models/:id/viewer-config（返回前端渲染配置）
- GET /bim/devices/overlay（返回设备在 BIM 中的叠加数据：位置+状态+告警）

前端：
- 页面：/digital-twin（数字孪生主界面：BIM三维视图为主体）
- 三维视图功能：
    楼层切换（展开/收起楼层）
    点击房间 → 弹出房间信息面板（租赁状态/能耗/设备/告警）
    点击设备 → 弹出设备实时数据面板
    设备告警时模型高亮（红色闪烁）
    能耗热力图叠加（颜色渐变表示能耗高低）
    机器人实时位置显示（3D模型移动动画）
- 组件：<BimViewer modelId={} onSpaceClick={} onDeviceClick={} />
- 组件：<SpaceInfoPanel spaceId={} />
- 组件：<DeviceOverlayPanel deviceId={} />
```

#### 模块 H：招商与租赁管理
```
后端实体：
- Tenant { id, code, name, type, contactName, contactPhone, industry }
- Lease { id, code, tenantId, roomId, startDate, endDate, rentAmount, depositAmount,
          status(DRAFT|ACTIVE|EXPIRED|TERMINATED), signedAt }
- RentBill { id, leaseId, billingMonth, amount, dueDate, paidAt, status }
- LeaseDoc { id, leaseId, type, fileUrl, uploadedAt }

后端 API：
- CRUD /tenants, /leases
- GET /leases/expiring?days=30（即将到期合同预警）
- GET /rooms/vacancy-rate（出租率统计）
- POST /rent-bills/generate（按月批量生成账单）
- GET /rent-bills?leaseId=&status=&month=
- POST /leases/:id/docs（上传合同附件）

前端：
- 页面：/leasing/tenants（租户管理）
- 页面：/leasing/leases（合同管理，含到期预警高亮）
- 页面：/leasing/bills（租金账单，支持催缴操作）
- 页面：/leasing/map（租赁分布图：楼层平面图+房间状态着色）
- 组件：<VacancyRateChart />（出租率环形图）
- 组件：<LeaseStatusTag status={} />
```

#### 模块 I：视频安防中心
```
后端：
- Camera 实体 { id, code, name, roomId, rtspUrl, brand, model, status, aiEnabled }
- VideoAlert 实体 { id, cameraId, type, snapshot, timestamp, status }

后端 API：
- GET /cameras（摄像头列表）
- GET /cameras/:id/stream（返回 WebRTC/HLS 播放地址）
- GET /cameras/:id/alerts（AI告警历史，含截图）
- POST /cameras/:id/snapshot（手动抓图）

AI 分析集成（预留接口，具体模型后续接入）：
- POST /ai/video/analyze { cameraId, type: 'intrusion|smoke|crowd|abnormal' }

前端：
- 页面：/security/cameras（摄像头列表+状态）
- 页面：/security/monitor（视频监控墙：4/9/16 宫格切换）
- 页面：/security/alerts（视频告警列表，含截图预览）
- 组件：<VideoPlayer streamUrl={} />（HLS 播放器）
- 组件：<CameraGrid cameras={} layout={4|9|16} />
```

---

### 2.3 第三阶段（AI 智能体系）

#### 模块 J：AI 运维助手
```
接入方式：调用外部 LLM API（OpenAI/Gemini/本地模型，配置化）

功能范围：
- 自然语言查询：设备状态、能耗数据、工单状态、机器人位置
- 告警智能分析：根据历史数据分析告警原因
- 节能建议：根据能耗趋势给出优化建议

后端：
- AiChat 实体 { id, userId, sessionId, role, content, tokens, createdAt }
- AiService：封装 LLM 调用，实现 RAG（检索园区实时数据作为上下文）

API：
- POST /ai/chat { sessionId, message }（流式返回）
- GET /ai/chat/history/:sessionId

前端：
- 组件：<AiAssistant />（侧边栏悬浮聊天框，支持流式输出）
- 集成到所有主要页面的右下角
```

---

## 三、页面导航结构（侧边栏）

```
仪表板
  └─ 总览 /dashboard

资产管理
  ├─ 园区 /assets/parks
  ├─ 楼栋 /assets/buildings
  ├─ 房间 /assets/rooms
  └─ 资产台账 /assets/inventory

招商租赁
  ├─ 租户 /leasing/tenants
  ├─ 合同 /leasing/leases
  ├─ 账单 /leasing/bills
  └─ 租赁分布 /leasing/map

IoT 平台
  ├─ 设备管理 /iot/devices
  └─ 告警中心 /iot/alerts

能耗管理
  ├─ 能耗总览 /energy/dashboard
  ├─ 电表管理 /energy/meters
  └─ 费用账单 /energy/bills

机器人运营
  └─ 机器人总览 /robots

数字孪生
  └─ 三维可视化 /digital-twin

视频安防
  ├─ 摄像头 /security/cameras
  ├─ 监控墙 /security/monitor
  └─ 视频告警 /security/alerts

工单管理
  ├─ 工单看板 /workorders
  └─ 工单列表 /workorders/list

系统管理
  ├─ 用户 /admin/users
  ├─ 角色 /admin/roles
  └─ 组织 /admin/organizations
```

---

## 四、数据库 Schema 关键约束

```sql
-- 所有主表必须有的字段
id          UUID DEFAULT gen_random_uuid() PRIMARY KEY
code        VARCHAR(50) UNIQUE NOT NULL  -- 业务编码
created_at  TIMESTAMPTZ DEFAULT NOW()
updated_at  TIMESTAMPTZ DEFAULT NOW()
deleted_at  TIMESTAMPTZ  -- 软删除，NULL=未删除

-- IoT 时序数据（TimescaleDB hypertable）
CREATE TABLE device_data (
  device_id   UUID NOT NULL,
  metric      VARCHAR(50) NOT NULL,
  value       DECIMAL(18,4) NOT NULL,
  unit        VARCHAR(20),
  timestamp   TIMESTAMPTZ NOT NULL
);
SELECT create_hypertable('device_data', 'timestamp');

-- 机器人轨迹（TimescaleDB hypertable）
CREATE TABLE robot_tracks (
  robot_id    UUID NOT NULL,
  x           DECIMAL(10,4) NOT NULL,
  y           DECIMAL(10,4) NOT NULL,
  heading     DECIMAL(6,2),
  battery     INTEGER,
  timestamp   TIMESTAMPTZ NOT NULL
);
SELECT create_hypertable('robot_tracks', 'timestamp');
```

---

## 五、前端组件规范

### 5.1 页面布局模板
所有业务页面必须遵循以下结构：
```tsx
// 标准页面结构
export default function XxxPage() {
  return (
    <div className="page-container">
      {/* 页头：标题 + 操作按钮 */}
      <div className="page-header">
        <h1 className="page-title">页面标题</h1>
        <div className="page-actions">
          <button className="btn-primary">主操作</button>
        </div>
      </div>
      {/* 筛选栏（可选）*/}
      <div className="filter-bar">...</div>
      {/* 内容区 */}
      <div className="page-content">...</div>
    </div>
  )
}
```

### 5.2 统计卡片组件规范
```tsx
// KPI 卡片：用于总览页面
<StatCard
  title="本月用电"
  value="12,345"
  unit="kWh"
  trend={+5.2}      // 正数=上升，负数=下降
  trendLabel="较上月"
  icon={<Zap />}
  color="warning"   // primary | success | warning | danger | info
/>
```

### 5.3 表格规范
- 分页：默认每页 20 条，支持切换 10/20/50
- 排序：点击列头排序
- 筛选：复杂筛选用 Filter Bar（展开/收起），简单筛选内联
- 操作列：统一放最右列，图标按钮（查看/编辑/删除）
- 空状态：统一显示 `<EmptyState message="暂无数据" />`
- 加载：骨架屏（Skeleton），**不用** spinner

### 5.4 表单规范
- 创建/编辑统一用 Modal（宽度 600px），**不新开页面**
- 必填项标红星 `*`
- 提交按钮：加载状态时 disabled + 显示 loading icon
- 验证：前端 + 后端双重验证，错误信息显示在字段下方

---

## 六、API 响应格式（统一）

```typescript
// 成功响应
{
  "code": 200,
  "message": "success",
  "data": { ... } | [ ... ],
  "pagination": {  // 列表接口才有
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}

// 错误响应
{
  "code": 400 | 401 | 403 | 404 | 500,
  "message": "错误描述",
  "errors": [ ... ]  // 表单验证错误时才有
}
```

---

## 七、环境变量（新增）

在现有 `.env` 基础上新增以下变量：

```env
# TimescaleDB（生产）
TIMESCALE_URL=postgresql://user:pass@localhost:5432/smartpark

# Redis
REDIS_URL=redis://localhost:6379

# EMQX (MQTT)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=smartpark
MQTT_PASSWORD=xxx

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx
MINIO_BUCKET=smartpark

# AI
AI_PROVIDER=openai   # openai | gemini | local
AI_API_KEY=xxx
AI_MODEL=gpt-4o
```

---

## 八、开发优先级与任务顺序

| 优先级 | 模块 | 预估工作量 |
|--------|------|-----------|
| P0 | 组织权限扩展 | 2天 |
| P0 | 资产管理（Park/Building/Floor/Room） | 3天 |
| P0 | IoT 平台（设备接入+实时数据） | 4天 |
| P0 | 能耗管理 | 3天 |
| P0 | 工单系统 | 3天 |
| P1 | 机器人运营中心（基础版） | 4天 |
| P1 | 招商租赁管理 | 4天 |
| P2 | BIM 数字孪生 | 7天 |
| P2 | 视频安防 | 3天 |
| P3 | AI 运维助手 | 5天 |

**建议 Codex 开发顺序**：
1. 先完成所有 P0 后端实体和 API
2. 再完成所有 P0 前端页面
3. 联调测试 P0 完整流程
4. 再进入 P1

---

## 九、特别注意事项

1. **不要删除现有代码**，所有改动在现有架构基础上扩展
2. **数据库迁移**：新增实体使用 TypeORM Migration，不要 `synchronize: true`（生产环境危险）
3. **WebSocket**：实时数据推送必须有心跳机制（30秒 ping/pong），断线自动重连
4. **MQTT 主题设计**：严格遵循 `park/{parkCode}/device/{deviceCode}/{metric}` 格式
5. **软删除**：所有删除操作使用软删除（设置 `deletedAt`），TypeORM 的 `@DeleteDateColumn` 装饰器
6. **时区**：所有时间字段统一 UTC 存储，前端显示时转换为本地时间（Asia/Shanghai）
7. **文件上传**：大文件（BIM/视频）使用 MinIO 分片上传，小文件（图片）直接上传
8. **性能**：设备列表、能耗数据等高频查询必须有 Redis 缓存层

