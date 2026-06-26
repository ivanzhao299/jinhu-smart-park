# EngineeringProject UI

## 1. 页面定位

EngineeringProject UI 是 EPDR-P1 Project Runtime 的前端入口，负责工程项目中心的列表、详情、新建、编辑、状态动作和状态日志展示。

Task 005 只实现工程项目页面，不开发 Planning、Construction、Inspection、Rectification、Acceptance 页面。

## 2. 页面路由

| 路由 | 说明 |
| --- | --- |
| `/engineering` | Engineering Project Delivery Runtime 入口页 |
| `/engineering/projects` | 工程项目列表页 |
| `/engineering/projects/new` | 新建工程项目页 |
| `/engineering/projects/:id` | 工程项目详情页 |
| `/engineering/projects/:id/edit` | 编辑工程项目页 |

## 3. 页面功能

### 工程项目列表

列表页包含：

- 页面标题：工程项目
- 新建项目按钮
- 关键词搜索
- 工程类型筛选
- 项目状态筛选
- 项目级别筛选
- 风险等级筛选
- 园区 ID 筛选入口
- 项目负责人 ID 筛选入口
- 计划开始日期范围筛选
- 分页
- 加载、空状态、错误提示
- 查看、编辑、删除操作

表格展示：

- 项目编号
- 项目名称
- 工程类型
- 状态
- 项目级别
- 风险等级
- 项目负责人
- 计划开始日期
- 计划结束日期
- 进度
- 预算金额

### 新建工程项目

新建页调用：

```text
POST /api/engineering/projects
```

基础校验：

- 项目名称必填。
- 项目负责人 ID 必填。
- 计划开始日期必填。
- 计划结束日期必填。
- 计划结束日期不能早于计划开始日期。
- 预算金额不能为负数。
- 合同金额不能为负数。

`tenantId` 和 `parkId` 不允许前端手填，由后端 `CurrentScope` 写入。

### 编辑工程项目

编辑页调用：

```text
GET /api/engineering/projects/:id
PATCH /api/engineering/projects/:id
```

编辑表单复用新建表单，但不包含：

- `projectCode`
- `status`
- `settlementAmount`
- `transferStatus`
- `financeStatus`
- `assetStatus`

项目状态只能通过详情页状态动作按钮变更。

### 工程项目详情

详情页包含：

- 项目概览
- 基础信息
- 责任单位与责任人
- 状态动作区
- 状态日志时间线
- 后续 Runtime 入口占位

后续 Runtime 占位：

- 工程计划
- 施工日报
- 工程巡检
- 整改任务
- 工程验收
- 工程档案
- 物业移交

## 4. API 调用关系

前端统一通过：

```text
apps/web/lib/engineering-projects-api.ts
```

API client 方法：

- `createProject`
- `listProjects`
- `getProject`
- `updateProject`
- `deleteProject`
- `executeProjectAction`
- `getAvailableActions`
- `getStatusLogs`

页面不直接写裸 `fetch`，也不直接操作数据库。

## 5. 状态动作按钮逻辑

详情页加载时调用：

```text
GET /api/engineering/projects/:id/actions
```

后端返回可用动作后，前端渲染按钮。

点击按钮后，弹窗要求填写：

- `reason`
- `comment`

提交调用：

```text
POST /api/engineering/projects/:id/actions/:action
```

成功后刷新：

- 项目详情
- 可用动作
- 状态日志

前端不允许直接修改 `status`。

## 6. 权限控制

前端新增：

```text
apps/web/lib/engineering-projects-permissions.ts
```

预留权限：

- `ENGINEERING_PROJECT_VIEW`
- `ENGINEERING_PROJECT_CREATE`
- `ENGINEERING_PROJECT_UPDATE`

Task 021 前工程权限尚未正式种子化，因此当前策略与后端一致：

- 超级管理员允许。
- `*` 允许。
- 如果账号尚无任何 `ENGINEERING_` 权限，允许访问 Phase 1 UI。
- 如果账号已有 `ENGINEERING_` 权限，则严格按目标权限判断。

菜单入口暂不绑定工程模块授权，避免 Task 021 前无法进入页面。页面内部保留工程权限判断边界。

## 7. 中文枚举映射

前端新增：

```text
apps/web/lib/engineering-projects-display.ts
```

覆盖：

- 工程类型
- 工程状态
- 项目级别
- 风险等级
- 状态动作

状态、风险、级别均使用标签展示。

## 8. Phase 1 边界

本任务完成：

- 工程项目列表
- 工程项目新建
- 工程项目编辑
- 工程项目详情
- 状态动作按钮
- 状态日志时间线
- 后续 Runtime 入口占位

本任务不实现：

- 工程计划页面
- 施工日报页面
- 工程巡检页面
- 整改任务页面
- 验收页面
- 工程 Dashboard
- 财务、资产、物业真实流程
