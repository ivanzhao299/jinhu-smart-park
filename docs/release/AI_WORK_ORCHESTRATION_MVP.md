# AI 工作编排 MVP

## 目标

管理人员在 AI 工作台输入自然语言，系统将目标拆成工作清单，使用当前园区真实组织、角色、岗位、用户和在办负荷生成责任人候选。只有人工确认并批准后，系统才会生成和派发真实工单。

## 业务链

```text
自然语言目标
→ 本地语义规划适配器
→ 组织/角色/岗位/负荷匹配
→ 工作计划草案
→ 人工校正责任人、期限和验收标准
→ 管理人员批准
→ 工单创建与派发
→ Workflow Inbox / 消息
→ 处理、验收、评价和关闭
```

## 安全边界

- 规划器不直接访问或修改数据库。
- 人员只能从当前 tenant / park 的启用账号中选择。
- 低置信度匹配不会自动确认责任人。
- 草案不能直接生成工单。
- 批准要求 `ai:assistant` 与 `workorder:assign`。
- 工单生成要求 `ai:assistant`、`workorder:create` 与 `workorder:assign`。
- 工单生成支持重试，已生成任务不会重复落单。
- 所有草案校正、批准、驳回和工单生成均进入全局 AuditLog。

## 数据对象

- `biz_ai_work_plan`：原始指令、规范化目标、风险、状态与审批信息。
- `biz_ai_work_plan_task`：部门、人员、期限、验收标准、证据要求和工单关联。
- `biz_ai_assignment_decision`：候选人员、负荷、评分、原因和选择结果。

任务保留计划工时、速度权重、质量权重、验收标准和证据要求，为后续 HR 绩效 Runtime 提供事实数据。本阶段不自动计算员工绩效。

## API

- `POST /api/v1/ai/work-plans`
- `GET /api/v1/ai/work-plans`
- `GET /api/v1/ai/work-plans/:id`
- `GET /api/v1/ai/work-plans/directory`
- `PATCH /api/v1/ai/work-plans/:id/tasks/:taskId`
- `POST /api/v1/ai/work-plans/:id/approve`
- `POST /api/v1/ai/work-plans/:id/reject`
- `POST /api/v1/ai/work-plans/:id/materialize`

## UAT

```bash
pnpm go-live:uat-ai-work
```

UAT 使用受保护的本地凭证文件登录管理员、郑子勇和邵明洪，验证自然语言拆解、批准、工单生成、重复生成保护和个人流程收件箱。报告写入 `database/import-reports/ai-work-orchestration-uat-report.local.json`，不会记录密码。

## 后续扩展

`LocalNaturalLanguageWorkPlanner` 是可替换适配器。后续接入外部模型时，模型只返回同一结构化契约；组织验证、人员评分、审批、工单物化和审计仍由本地确定性服务负责。
