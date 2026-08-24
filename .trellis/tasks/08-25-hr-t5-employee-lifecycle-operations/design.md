# HR T5 技术设计

## Architecture

保持单一 `HrModule`，按服务边界拆分而不复制通用基础设施：

- `HrRecruitmentService`：招聘需求、候选人、阶段动作、转员工。
- `HrLifecycleChecklistService`：入职/离职模板、实例、项目动作与消息。
- `HrEmployeeRecordService`：家庭、履历、技能、证照与受保护附件投影。
- `HrTrainingService`：课程、计划、参训和结果更正。
- `HrRewardDisciplineService`：类别、事件、审批及外部联动引用。
- 现有 `HrNotificationService`/`biz_user_message` 负责待办；现有 Files HR business authorization 扩展受保护 biz type。

Controller 只绑定 scope/user/DTO/精确权限/审计装饰器；状态机、范围、事务、锁、投影和持久化均在 Service。共享权限常量先进入 `@jinhu/shared`，API 与 Web 同批消费。

## Data Model

采用前向迁移，从创建文件前重新扫描的最高空闲号开始。建议按风险拆分：

1. recruitment + lifecycle checklist；
2. employee extended records + protected documents；
3. training；
4. reward/discipline；
5. optional legacy compatibility columns/tables。

核心表：

- `hr_recruitment_requisition`, `hr_candidate`, `hr_candidate_action`, `hr_candidate_conversion`。
- `hr_lifecycle_checklist_template/version/item`, `hr_lifecycle_checklist`, `hr_lifecycle_checklist_item/action`。
- `hr_employee_family`, `hr_employee_experience`, `hr_employee_skill`, `hr_employee_credential`。
- `hr_training_course`, `hr_training_plan`, `hr_training_participant`, `hr_training_result_correction`。
- `hr_reward_discipline_category`, `hr_reward_discipline_case`, `hr_reward_discipline_action`, `hr_reward_discipline_link`。

所有业务表带 tenant/park；跨表使用复合 scoped FK，子 FK 使用完整非 partial 索引。动作/版本/更正表 append-only。候选人原始联系方式和证件值使用现有字段加密/掩码策略，不进入普通索引；匹配使用当前项目既有规范化指纹模式，不能明文唯一索引。

## State And Transaction Contracts

- 候选人阶段动作锁候选人；`hired` 转化同时锁候选人、目标 requisition、员工业务键，并在同事务创建 preboarding employee、conversion 和 onboarding checklist。数据库唯一约束兜底并发重复转化。
- 清单项目完成/退回/豁免锁实例和项目，动作与 `biz_user_message` 同事务。离职清单只能引用现有离职 transition/event，不能自己写 employee status。
- 培训 publish 冻结课程标题、学时、预算和参训范围；completed 后更正追加记录并计算 latest projection。
- 奖惩 case 与 approval action 同事务；批准后 link 仅记录目标类型和目标版本，真正工资/绩效消费者必须显式读取并再次授权，不做隐式副作用。

## Data Scope And Projection

- park：HR/专项运营精确权限。
- managed_org_tree：负责人，仅候选需求摘要、清单、培训进度及奖惩非金额摘要。
- self：员工本人入离职任务、培训、已批准奖惩和获准档案。
- none：无权限或无法解析 employee 绑定，列表空、详情安全 not-found。

每个响应使用 allowlist DTO/projection，禁止返回 TypeORM entity、legacy raw、tenant/park、source hash、actor、version、soft-delete、storage path。敏感 GET 在 return 前 `recordOperationRequired`。

## Protected Files

扩展 HR 文件业务类型而非授予通用 Files 权限：candidate resume/offer evidence、employee credential、training certificate、reward evidence、checklist evidence。FilesService 先解析 tenant/park + HR business owner + actor scope，再 required audit，最后返回 metadata/headers/stream。上传 MIME/size前后端一致，Web 使用共享上传控件。

## Legacy Compatibility

历史提取输出按领域分 manifest，绑定 backup/catalog/file SHA-256、source count、column contract 和业务 hash。加载使用独立 migration batch、record map、quarantine、check/rollback point；历史行 `is_historical_import=true` 且不可触发在线消息/审批/状态转换。

第一实现切片优先交付在线产品与 schema；真实旧数据抽取按招聘、培训、奖惩/档案分别做独立可回滚切片。生产导入必须另有明确 run ID、停机窗口和授权，不随普通发布执行。

## Web Information Architecture

- `/hr/recruitment`：招聘需求、候选人管道、面试/Offer、转入职。
- `/hr/lifecycle`：HR 入离职运营；员工/负责人按权限看到“我的任务/团队任务”。
- 现有员工页抽屉：扩展档案和证照，敏感分区按权限惰性加载。
- `/hr/training`：课程、计划、团队进度、我的培训。
- `/hr/rewards`：HR 奖惩流程、本人已批准记录；负责人只见安全摘要。

工作台只显示 KPI、异常和下一动作，不堆放设计说明。管理型复杂表单桌面优先；任务、审批、培训和本人查看必须 390px 可用。

## Rollout And Rollback

- 迁移 forward-only；已成功迁移不编辑。应用回滚不逆转数据库，旧应用必须能容忍新增表/权限。
- 新菜单/权限由 production seed 收敛；没有权限不发 API 请求。
- 先部署 schema/API/Web 与空业务表，真实旧数据生产导入独立控制。
- 失败时保留迁移与审计，回滚应用 SHA；仅隔离库 loader 可按 record-map 精确删除未发布历史导入。
