# Engineering Acceptance UI

## 页面路由

| 路由 | 功能 |
| --- | --- |
| `/engineering/acceptances` | 工程验收总列表 |
| `/engineering/acceptances/new` | 新建工程验收 |
| `/engineering/acceptances/[id]` | 工程验收详情 |
| `/engineering/acceptances/[id]/edit` | 编辑工程验收 |
| `/engineering/projects/[id]` | 项目详情中的工程验收摘要和入口 |

## 页面功能

### 总列表

支持：

1. 关键词、项目、计划、验收类型、状态、风险、责任人、验收组织、计划日期筛选。
2. 分页、加载状态、空状态、错误提示。
3. 中文状态标签和验收类型标签。
4. 查看、编辑、提交、评审、关闭、删除操作。

### 新建 / 编辑

表单包含：

1. 项目 ID、计划 ID。
2. 验收名称、验收类型、计划验收日期、实际验收日期、风险等级。
3. 验收描述、验收范围、验收标准、结果摘要。
4. 责任人、验收组织、施工单位、监理单位。
5. 位置描述、建筑、楼层、空间。

规则：

1. 项目详情进入新建页时自动带入 `projectId`。
2. 项目 ID 和计划 ID 仍由后端校验 DataScope 与归属关系。
3. 编辑页不发送 `acceptanceStatus`，状态只能通过提交/评审/关闭接口变更。
4. 附件上传留到 Task 025 统一接入。

### 详情页

展示：

1. 验收概览。
2. 验收范围、验收标准、结果摘要、评审意见。
3. 提交、评审、关闭时间与操作人。
4. 组织、位置、Workflow、附件数量。
5. 提交、评审、关闭、删除按钮。

## API 调用关系

前端 API client：`apps/web/lib/engineering-acceptances-api.ts`

| 前端方法 | 后端接口 |
| --- | --- |
| `createAcceptance` | `POST /api/engineering/acceptances` |
| `listAcceptances` | `GET /api/engineering/acceptances` |
| `getAcceptance` | `GET /api/engineering/acceptances/:id` |
| `updateAcceptance` | `PATCH /api/engineering/acceptances/:id` |
| `deleteAcceptance` | `DELETE /api/engineering/acceptances/:id` |
| `submitAcceptance` | `POST /api/engineering/acceptances/:id/submit` |
| `reviewAcceptance` | `POST /api/engineering/acceptances/:id/review` |
| `closeAcceptance` | `POST /api/engineering/acceptances/:id/close` |
| `getProjectAcceptances` | `GET /api/engineering/projects/:projectId/acceptances` |

## 状态按钮逻辑

前端只根据后端状态显示可用按钮，最终状态规则以后端为准：

1. `DRAFT / FAILED / RECTIFICATION_REQUIRED`：可编辑、可提交。
2. `SUBMITTED / REVIEWING`：可评审。
3. `PASSED / FAILED / RECTIFICATION_REQUIRED`：可关闭。
4. `DRAFT`：可删除。

## 项目详情页接入

`/engineering/projects/[id]` 已接入：

1. 验收总数。
2. 待处理数量。
3. 已通过/关闭数量。
4. 未通过数量。
5. 需整改数量。
6. 最近 5 条验收记录。
7. 新增验收、查看全部验收入口。

## 权限控制

前端权限入口：`engineering-acceptances-permissions.ts`

权限：

- `ENGINEERING_ACCEPTANCE_VIEW`
- `ENGINEERING_ACCEPTANCE_CREATE`
- `ENGINEERING_ACCEPTANCE_UPDATE`
- `ENGINEERING_ACCEPTANCE_DELETE`
- `ENGINEERING_ACCEPTANCE_SUBMIT`
- `ENGINEERING_ACCEPTANCE_REVIEW`
- `ENGINEERING_ACCEPTANCE_CLOSE`

Task 021 之前沿用 Phase 1 宽松模式：没有 ENGINEERING 权限种子的现有运营账号可进入页面。

## Phase 1 边界

已实现：

1. 工程验收前端页面。
2. 项目详情页验收入口。
3. 提交、评审、关闭、删除操作。
4. 类型、状态、权限、状态守卫测试。

未实现：

1. 验收未通过后自动生成整改任务。
2. 验收附件上传。
3. 复杂审批流可视化。
4. 验收与项目状态机自动联动。
