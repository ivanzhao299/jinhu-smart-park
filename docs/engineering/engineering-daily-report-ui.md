# EngineeringDailyReport UI

## 1. 页面路由

施工日报前端页面属于 EPDR-P3 Construction Runtime。

路由：

| Route | 页面 | 说明 |
| --- | --- | --- |
| `/engineering/daily-reports` | 施工日报总列表 | 查询、筛选、提交、审核、删除入口 |
| `/engineering/daily-reports/new` | 新建施工日报 | 支持 `projectId` query 自动带入项目 |
| `/engineering/daily-reports/[id]` | 施工日报详情 | 展示日报完整内容与状态动作 |
| `/engineering/daily-reports/[id]/edit` | 编辑施工日报 | 仅允许 `DRAFT` / `REJECTED` 状态编辑 |
| `/engineering/projects/[id]` | 工程项目详情 | 接入施工日报摘要、最近 5 条日报和入口 |

## 2. 页面功能

列表页支持：

- 关键词、项目、计划、状态、天气、施工单位、监理单位、日报日期范围筛选。
- 分页、加载状态、空状态和错误提示。
- 状态、天气中文标签。
- 日报进度条。
- 按状态显示编辑、提交、审核、删除按钮。
- 删除二次确认。

新建页支持：

- 项目 ID 自动带入。
- 计划可选。
- 日报日期默认当天。
- 天气、温度、施工内容、完成/未完成工作、明日计划、人员、设备、材料、质量安全和问题录入。
- 人数不能为负数。
- 进度必须在 `0-100`。
- 附件能力只做预留说明，不接真实上传。

详情页支持：

- 展示日报编号、日期、项目、计划、状态、天气、温度、施工内容、人员、设备、材料、质量安全、问题、提交/审核信息。
- `DRAFT` / `REJECTED` 可编辑和提交。
- `SUBMITTED` 可审核。
- `DRAFT` / `REJECTED` 可删除。
- 返回项目详情和返回列表。

## 3. API 调用关系

前端统一通过 `apps/web/lib/engineering-daily-reports-api.ts` 调用后端：

- `createDailyReport` -> `POST /api/engineering/daily-reports`
- `listDailyReports` -> `GET /api/engineering/daily-reports`
- `getDailyReport` -> `GET /api/engineering/daily-reports/:id`
- `updateDailyReport` -> `PATCH /api/engineering/daily-reports/:id`
- `deleteDailyReport` -> `DELETE /api/engineering/daily-reports/:id`
- `submitDailyReport` -> `POST /api/engineering/daily-reports/:id/submit`
- `reviewDailyReport` -> `POST /api/engineering/daily-reports/:id/review`
- `getProjectDailyReports` -> `GET /api/engineering/projects/:projectId/daily-reports`

页面不直接修改数据库状态。

## 4. 项目详情页施工日报入口

工程项目详情页增加真实施工日报区域：

- 日报总数。
- 最近日报日期。
- 已提交数量。
- 已审核数量。
- 被驳回数量。
- 最近 5 条日报。
- “新增日报”按钮，自动带入当前 `projectId`。
- “查看全部日报”按钮，跳转 `/engineering/daily-reports?projectId=xxx`。

## 5. 提交流程

施工日报提交入口在列表页和详情页。

显示规则：

- 仅 `DRAFT` / `REJECTED` 状态展示提交按钮。

流程：

1. 用户点击“提交”。
2. 前端二次确认。
3. 调用 `POST /api/engineering/daily-reports/:id/submit`。
4. 成功后刷新列表或详情。
5. 失败时展示后端错误。

## 6. 审核流程

施工日报审核入口在列表页和详情页。

显示规则：

- 仅 `SUBMITTED` 状态展示审核按钮。

流程：

1. 用户点击“审核”。
2. 打开审核抽屉。
3. 选择“审核通过”或“驳回”。
4. 驳回时建议填写审核意见。
5. 调用 `POST /api/engineering/daily-reports/:id/review`。
6. 成功后刷新列表或详情。
7. 失败时展示后端错误。

## 7. 权限控制

前端权限入口集中在 `apps/web/lib/engineering-daily-reports-permissions.ts`。

权限点：

- `ENGINEERING_DAILY_REPORT_VIEW`
- `ENGINEERING_DAILY_REPORT_CREATE`
- `ENGINEERING_DAILY_REPORT_UPDATE`
- `ENGINEERING_DAILY_REPORT_DELETE`
- `ENGINEERING_DAILY_REPORT_SUBMIT`
- `ENGINEERING_DAILY_REPORT_REVIEW`

Task 021 后已按权限点精确控制：普通账号必须具备对应 `ENGINEERING_DAILY_REPORT_*` 权限或 `*` 通配权限。

## 8. 附件预留

Task 009 不接真实附件上传。

页面只展示“附件能力预留”说明，详情页展示附件 ID 数量。后续 Task 025 接入统一 `EngineeringAttachment` 后，可扩展为图片、视频、PDF、CAD、Word、Excel 等工程资料上传和预览。

## 9. Phase 1 边界

本任务只完成施工日报前端页面。

不包含：

- 巡检页面。
- 整改页面。
- 验收页面。
- 真实附件上传。
- 财务、资产、物业移交流程。
- AI 分析或 IoT 数据接入。

下一步 Task 010 将进入工程巡检与问题数据模型。
