# Engineering Rectification UI

## 页面路由

| 路由 | 页面 |
| --- | --- |
| `/engineering/rectifications` | 整改任务列表 |
| `/engineering/rectifications/:id` | 整改任务详情、反馈、复查动作 |
| `/engineering/projects/:id` | 项目详情中的整改任务摘要与最近整改入口 |
| `/engineering/inspections/:id` | 巡检问题表中的“生成整改”入口 |

## 页面功能

### 整改任务列表

支持：

1. 关键词查询。
2. 按项目、问题、巡检筛选。
3. 按状态、严重等级、责任人、施工单位、期限筛选。
4. 分页。
5. 查看详情。
6. 执行当前状态可用动作。
7. 对 `PENDING` / `REJECTED` 整改进行删除。

列表字段：

- 整改编号。
- 标题。
- 状态。
- 严重等级。
- 整改期限。
- 责任人/责任组织。
- 反馈/复查时间。
- 项目 ID。

### 整改详情

展示：

- 整改基本信息。
- 来源问题和来源巡检。
- 责任人、责任组织、施工单位、监理单位。
- 反馈时间、反馈人、反馈内容。
- 复查时间、复查人、复查意见。
- 关闭时间、关闭人。
- 位置和备注。

### 反馈与复查动作

动作按钮由前端根据后端状态机规则计算，并由后端再次校验。

支持：

- `START`：开始整改。
- `SUBMIT`：提交整改反馈，必须填写反馈。
- `START_RECHECK`：进入复查。
- `PASS`：复查通过。
- `REJECT`：复查驳回，必须填写复查意见。
- `CLOSE`：关闭整改。
- `MARK_OVERDUE`：标记逾期。

所有动作调用：

```text
POST /api/engineering/rectifications/:id/actions
```

前端不直接修改状态。

## 项目详情入口

项目详情页接入：

- 整改总数。
- 待整改。
- 整改中。
- 已逾期。
- 已关闭/复查通过。
- 最近 5 条整改任务。
- “查看全部整改”入口。

## 巡检问题生成整改

巡检详情页的问题列表中，当问题未关闭、未取消且未生成整改时，显示“生成整改”按钮。

按钮调用：

```text
POST /api/engineering/issues/:id/generate-rectification
```

生成后可直接跳转查看对应整改任务。

## 权限控制

当前前端权限入口为 `engineering-rectifications-permissions.ts`。

| 页面/动作 | 权限 |
| --- | --- |
| 列表/详情 | ENGINEERING_RECTIFICATION_VIEW |
| 创建/派发 | ENGINEERING_RECTIFICATION_ASSIGN |
| 更新/开始/标记逾期 | ENGINEERING_RECTIFICATION_UPDATE |
| 提交整改 | ENGINEERING_RECTIFICATION_SUBMIT |
| 复查通过/驳回/开始复查 | ENGINEERING_RECTIFICATION_RECHECK |
| 关闭 | ENGINEERING_RECTIFICATION_CLOSE |
| 删除 | ENGINEERING_RECTIFICATION_UPDATE |

Task 021 后已按 `ENGINEERING_RECTIFICATION_*` 权限精确控制；普通账号必须具备对应权限或 `*` 通配权限。

## Phase 1 边界

已实现：

1. 整改任务列表。
2. 整改任务详情。
3. 整改反馈动作。
4. 整改复查动作。
5. 项目详情整改入口。
6. 巡检问题生成整改入口。

未实现：

1. 附件上传与图片预览。
2. 整改任务独立编辑页。
3. 逾期自动检测。
4. 通知推送。

## 后续任务

- Task 017：整改逾期检测机制。
- Task 018：工程验收模型与 API。
