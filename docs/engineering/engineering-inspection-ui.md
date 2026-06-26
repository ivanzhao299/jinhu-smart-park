# Engineering Inspection UI

## 页面路由

Task 012 新增工程巡检前端页面：

| 路由 | 说明 |
| --- | --- |
| `/engineering/inspections` | 工程巡检总列表 |
| `/engineering/inspections/new` | 新建工程巡检 |
| `/engineering/inspections/:id` | 工程巡检详情 |
| `/engineering/inspections/:id/edit` | 编辑工程巡检 |
| `/engineering/projects/:id` | 项目详情页新增真实巡检入口 |

## 页面功能

### 巡检列表

- 按关键词、项目、计划、类型、状态、施工单位、巡检人、日期范围筛选。
- 展示巡检编号、标题、日期、类型、状态、问题数量、项目 ID、提交信息。
- 支持查看、编辑、提交、删除。
- 只有 `DRAFT` 状态显示编辑、提交和删除。

### 新建/编辑巡检

- 新建时可通过 `projectId` query 自动带入项目。
- 支持关联工程计划和施工日报。
- 支持填写巡检人、巡检组织、施工单位、监理单位、位置、摘要、结论、问题数量。
- 校验问题数量和重大问题数量，重大问题数量不能超过问题总数。
- 编辑页不允许修改项目 ID，也不允许编辑非 `DRAFT` 巡检。

### 巡检详情

- 展示巡检概览、基础信息、提交状态、位置、人员、巡检结论和附件预留。
- 支持提交、编辑、删除。
- 展示巡检问题列表。
- 支持通过抽屉新增巡检问题。

### 项目详情页巡检入口

工程项目详情页新增真实巡检区域：

- 巡检总数。
- 草稿数。
- 已提交数。
- 问题总数。
- 重大问题数。
- 最近 5 条巡检记录。
- 新增巡检入口。
- 查看全部巡检入口。

## API 调用关系

前端统一使用 `apps/web/lib/engineering-inspections-api.ts`：

- createInspection
- listInspections
- getInspection
- updateInspection
- deleteInspection
- submitInspection
- getProjectInspections
- createInspectionIssue
- getInspectionIssues
- createIssue
- listIssues
- updateIssue
- deleteIssue

## 权限控制

前端统一使用 `engineering-inspections-permissions.ts`：

- ENGINEERING_INSPECTION_VIEW
- ENGINEERING_INSPECTION_CREATE
- ENGINEERING_INSPECTION_UPDATE
- ENGINEERING_INSPECTION_SUBMIT

Phase 1 沿用工程模块宽松权限模式：如果用户没有任何 `ENGINEERING_` 权限，则默认允许访问，后续 Task 021 接入正式权限种子。

## 问题和整改边界

当前页面只支持记录巡检问题，不自动生成整改任务。

后续 Task 013 会将巡检问题转为 EngineeringRectification，并在问题详情中展示整改关联。

## Phase 1 边界

已实现：

1. 巡检列表。
2. 新建巡检。
3. 编辑巡检。
4. 巡检详情。
5. 巡检提交。
6. 巡检删除。
7. 巡检问题列表。
8. 新增巡检问题。
9. 项目详情页真实巡检入口。

未实现：

1. 独立问题详情页。
2. 整改任务自动生成。
3. 附件上传。
4. 巡检移动端专用表单。
5. 巡检工作流审批。
