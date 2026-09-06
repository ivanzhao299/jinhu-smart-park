# Jinhu Smart Park — Meeting & Execution Center 开发需求文档

版本：V1.0
日期：2026-09-06
状态：Approved for Development

## 1. 产品定位

在 Jinhu Smart Park 内新增一级业务域“会议与执行中心（Meeting & Execution Center）”。该模块不是传统会议预约工具，而是集团战略执行入口：管理者用自然语言表达会议精神/经营意图，AI结合组织、历史会议、任务与业务数据生成会前材料；会议中沉淀决议；会后自动生成会议纪要并拆解为目标、任务和责任；员工围绕任务反馈执行进度，系统自动汇总日报、周报、月报、半年总结和年度总结，形成战略—会议—任务—执行—汇报—复盘闭环。

核心链路：
Strategic Intent → Meeting → Agenda/Material → Decision → Goal → Task/SubTask → Assignment → Execution → Work Report → Review → Strategy Feedback

## 2. V1 核心验收目标

必须跑通以下端到端闭环：
1. 管理者输入几句话即可创建会议草案。
2. AI识别会议类型、主题、目标、议题、建议参会部门/人员和待决策事项。
3. AI可结合历史会议、未完成任务和可访问的业务数据生成会前提纲。
4. 用户确认后进入正式会议。
5. 会议记录支持文本录入；语音/录音作为后续增强能力预留接口。
6. AI从会议记录中提取决议、责任人、截止日期、协作人、验收标准和风险。
7. 对缺责任人、缺截止时间、缺验收标准的决议给出“不可执行”提示，不静默生成低质量任务。
8. 会议结束自动生成结构化会议纪要，人工确认后归档。
9. 已确认决议一键/自动转换为 Goal/Task/SubTask/Assignment，并保留来源证据链。
10. 员工在“我的任务”中反馈完成情况、进度、问题、下一步。
11. 系统根据任务执行记录自动生成个人周报；日报/月报/半年/年度总结使用统一 WorkReport 模型逐步开放。
12. 管理者可从会议追踪到任务，从任务反查来源会议与原始决议。

## 3. 会议类型

V1预置：
- GROUP_WEEKLY：集团周例会
- MONTHLY_OPERATION：月度经营会
- SPECIAL_TOPIC：专项会议
- PROJECT_PROGRESS：项目推进会
- DEPARTMENT：部门会议
- STRATEGY：战略会议

会议类型采用模板驱动，不复制业务逻辑。模板定义默认议程、AI提示词、数据上下文、纪要格式、任务拆解策略。

## 4. 用户角色与权限

- 总裁/集团管理层：创建会议、查看授权范围经营上下文、确认决议、查看跨部门执行。
- 会议主持人：编辑议程、开始/结束会议、确认纪要和决议。
- 会议记录人：维护会议记录、材料、纪要草稿。
- 部门负责人：接收部门目标、分解任务、审核下属汇报。
- 员工：查看本人任务、反馈执行、提交/确认工作汇报。
- 系统管理员：会议模板、权限、AI策略配置。

必须复用现有 RBAC 默认拒绝原则；所有 Meeting/Decision/Task/Report 读取和写入均执行组织范围与对象权限校验，并进入 Audit/Event。

## 5. 功能需求

### 5.1 会议首页/驾驶舱
展示：本周会议、待确认纪要、会议产生任务、逾期任务、本人待办、待审核事项、会议任务完成率、重点异常。

### 5.2 AI自然语言建会
输入示例：“明天开集团例会，重点抓招商、金特福投产、展贸中心、公寓、装修和信息化，明确责任人和时间节点。”

AI输出结构化 Draft：meetingType、title、objective、scheduledAt、suggestedParticipants、agendaItems、contextQueries、decisionQuestions、expectedOutputs。

AI输出必须是 schema-constrained JSON，经后端校验后写库；AI不得直接越权创建人员、部门或最终任务。

### 5.3 会前包 Meeting Package
自动聚合：上次同类会议、未完成/延期任务、相关项目计划、可访问经营数据、用户补充附件/文字。
输出：会议提纲、上期销项、各议题背景、待决策事项、建议目标、风险提示、建议材料。

### 5.4 会议进行态
状态：DRAFT → READY → IN_PROGRESS → MINUTES_REVIEW → CLOSED → ARCHIVED；CANCELLED 为旁路状态。
会议中支持按议程记录文本、即时新增决议草稿、标记待办/风险/待确认事项。

### 5.5 AI决议提取
Decision字段至少包括：title、description、decisionType、ownerUserId、ownerDepartmentId、collaboratorIds、dueAt、priority、acceptanceCriteria、risk、sourceTranscriptRange、confidence、status。

Decision质量门：责任主体、动作、截止/里程碑、可验证结果至少四项完整；缺项时标记 NEEDS_CLARIFICATION。

### 5.6 会议纪要
自动生成正式纪要：基本信息、议题、讨论摘要、决议、重点任务、责任分工、时间节点、风险/待确认事项。
纪要采用版本化；AI草稿不可覆盖人工确认版本；确认动作必须审计。

### 5.7 任务生成与分解
Decision → Goal/Task，可继续AI拆为 SubTask。任务字段：title、description、goalId、sourceType=MEETING_DECISION、sourceId、assignee、department、collaborators、startAt、dueAt、priority、status、progress、acceptanceCriteria、evidence、riskLevel。

任务必须可追溯至 meetingId/decisionId；禁止删除证据链，撤销采用状态与审计记录。

### 5.8 我的任务
员工看到：今日、逾期、本周、待确认、已完成。反馈字段：progressDelta、status、completedWork、blockers、nextAction、evidence、reportedAt。

### 5.9 工作汇报
ReportPeriod：DAILY/WEEKLY/MONTHLY/HALF_YEAR/YEARLY。
AI优先基于真实 Task/TaskUpdate/Decision 数据生成，不鼓励员工重复写作文。员工可补充说明并确认。
周报V1必须上线；其他周期共用数据模型和生成服务，分阶段开放。

### 5.10 管理复盘
按个人/部门/会议/目标查看：任务完成率、准时率、延期任务、重大成果、阻塞事项、重复问题、目标贡献。V1不直接将指标等同绩效分数，为后续HR绩效域提供事实数据。

## 6. 核心数据模型

建议新增：
- Meeting
- MeetingTypeTemplate
- MeetingParticipant
- MeetingAgenda
- MeetingMaterial
- MeetingTranscript
- MeetingDecision
- MeetingMinutes + MeetingMinutesVersion
- Goal
- WorkTask
- TaskAssignment
- TaskUpdate
- WorkReport
- Review
- AiGenerationRun

关键关系：Meeting 1:N Agenda/Participant/Transcript/Decision；Meeting 1:1 active Minutes；Decision 1:N WorkTask；Goal 1:N WorkTask；WorkTask 1:N Assignment/Update；User 1:N Assignment/Report。

AiGenerationRun保存 model/provider、promptTemplateVersion、inputContextRefs、outputSchemaVersion、status、latency、token/usage metadata、resultRef，避免将敏感完整Prompt无控制写日志。

## 7. API 草案

- POST /meetings/ai-draft
- POST /meetings
- GET /meetings
- GET /meetings/:id
- PATCH /meetings/:id
- POST /meetings/:id/prepare
- POST /meetings/:id/start
- POST /meetings/:id/transcript
- POST /meetings/:id/extract-decisions
- PATCH /meetings/:id/decisions/:decisionId
- POST /meetings/:id/generate-minutes
- POST /meetings/:id/confirm-minutes
- POST /meetings/:id/materialize-tasks
- POST /meetings/:id/close
- GET /tasks/my
- GET /tasks/:id
- POST /tasks/:id/updates
- POST /tasks/:id/ai-breakdown
- POST /work-reports/generate
- PATCH /work-reports/:id
- POST /work-reports/:id/confirm
- GET /execution/dashboard

所有写API：DTO校验 + RBAC + scope policy + audit + domain event + idempotency（关键生成/物化接口）。

## 8. AI Orchestration

AI能力拆成可替换服务：
1. MeetingIntentParser
2. MeetingContextBuilder
3. AgendaGenerator
4. DecisionExtractor
5. MinutesGenerator
6. TaskBreakdownGenerator
7. WorkReportGenerator
8. ExecutionRiskAnalyzer

AI Context Builder只能通过后端授权后的结构化Context Provider读取数据；模型不直接访问数据库。所有生成结果必须经过 JSON Schema/DTO 校验；人员匹配采用系统用户目录解析，低置信度时要求人工确认。

## 9. 事件设计

至少产生：meeting.created、meeting.started、meeting.decision.confirmed、meeting.minutes.confirmed、meeting.closed、task.created_from_meeting、task.assigned、task.updated、task.overdue、work_report.generated、work_report.confirmed。

复用现有 Event/Audit 机制，为通知、绩效、战略驾驶舱和后续Agent自动化提供事件源。

## 10. 前端信息架构

新增一级菜单“会议与执行”：
- 驾驶舱
- 会议
- 我的任务
- 工作汇报
- 目标与复盘

会议详情采用：顶部状态/操作区 + 左侧议程 + 中间会议记录/材料 + 右侧AI决议助手。移动端优先保证任务反馈和汇报确认可用。

## 11. 非功能要求

- 权限默认拒绝；跨部门数据不可因AI上下文聚合而泄露。
- AI输出可解释、可回溯、可人工修改。
- 所有最终决议/任务/纪要必须有人类确认边界。
- 关键写操作幂等。
- 保留历史版本，不硬删除重要管理证据。
- AI失败不得阻塞人工会议与任务流程。
- 生成过程提供 loading/status/error/retry。
- 建立单元、API、权限、状态机、E2E测试。

## 12. 开发阶段

MEC-P0 基线与架构：核实现有 User/Department/RBAC/Audit/Event/EngineeringPlan 等可复用能力；ADR、schema、迁移方案。

MEC-P1 Meeting Core：Meeting/Participant/Agenda/Material/Transcript、状态机、RBAC、API、基础会议列表/详情。

MEC-P2 AI Preparation：自然语言建会、Context Builder、Agenda Generator、会前包。

MEC-P3 Decision & Minutes：决议提取、质量门、纪要生成/版本/确认、证据链。

MEC-P4 Execution：Goal/WorkTask/Assignment/TaskUpdate；会议任务物化；我的任务；逾期与状态流转。

MEC-P5 Reporting：任务反馈→周报自动生成；统一WorkReport模型；部门/个人汇总。

MEC-P6 Dashboard & E2E：会议执行驾驶舱、风险、全链路E2E、权限/审计验收。

MEC-P7 Enhancement：语音转写、实时会议Copilot、月/半年/年度总结、战略/绩效深度联动。

## 13. Definition of Done

用“集团周例会”作为首个真实验收场景：管理者只输入一段自然语言会议精神，系统能生成可编辑提纲；完成会议记录后生成纪要；至少3条决议成功转为不同员工任务；员工反馈后自动形成周报；管理者在驾驶舱看到完成/逾期/阻塞；任一任务可反查会议和决议；全过程RBAC、Audit、Event测试通过；AI不可用时人工流程仍可完成。

## 14. 首个业务模板：集团周例会

默认议程：上周任务销项 → 招商 → 金特福生产筹备 → 展贸中心招商运营 → 展贸中心二楼/办公室装修 → 公寓入住运营 → 信息化 → 本周重点任务确认。

默认输出：会议提纲、上周销项、待决策清单、会议纪要、本周重点工作任务表。

任务表字段：重点事项、本周目标、责任部门、第一责任人、配合部门、完成时间、验收标准、来源决议、状态。
