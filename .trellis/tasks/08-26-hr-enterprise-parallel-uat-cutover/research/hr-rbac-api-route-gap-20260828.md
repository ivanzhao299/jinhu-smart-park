# HR 前端 Route、API 与 RBAC 全链路差距矩阵

日期：2026-08-28

方式：只读审计 `apps/web/app/hr` 全部 18 个 `page.tsx`、HR controllers/services/entities、`packages/shared/src/hr.ts`、production-safe RBAC seeds 及现有正负向测试。
范围：`route -> action -> API -> entity/table -> permission -> positive/negative test`，重点复核 `HR_MANAGER`、`DEPARTMENT_MANAGER`、`EMPLOYEE_SELF_SERVICE` 的 park / managed_org_tree / self / none 与敏感字段投影。

## 1. 总结结论

当前 HR 已具备较完整的页面原子权限、API decorator、服务端范围过滤和部分 required-audit，但还不是统一、可证明的企业级 RBAC 闭环：

1. `HR_ACCESS_MATRIX` 声明了三角色范围与敏感投影，却没有任何运行代码消费；`HR_SENSITIVE_FIELD_GROUPS` 常量也没有成为统一投影策略。服务实际审计还使用了声明外的 `demographic`、`education`、`qualification`、`employment_contract`、`attendance`、`insurance`、`payroll_input` 等组名，无法由 shared exact-set 校验。真实授权由各 service 的本地 resolver、SQL 和 projector 分散实现，声明与执行可能漂移。
2. 员工目录缺少独立 `HR_EMPLOYEE_TEAM_READ`。部门经理通过 `HR_WORK_REPORT_TEAM_REVIEW` 或 `HR_PERFORMANCE_MANAGER_REVIEW` 间接获得 managed-tree 员工目录，权限语义耦合；移除任一业务能力可能意外关闭目录，增加任一能力又可能意外开放目录。
3. shared 矩阵声明部门经理可看 masked profile、员工可看 self_masked profile，但 `GET /hr/employees/:id/profile` 只接受 broad `HR_EMPLOYEE_PROFILE_READ`，没有 profile team/self 原子权限；因此声明的两个投影在标准角色授权下不可达。
4. 工资历史的团队能力采用独立 `team-summary`，并且没有让部门经理进入个人明细，这是正确边界；但这类“聚合而非明细”的字段策略尚未被统一为可复用合同。
5. 18 个前端 route 的 `page.tsx` 都只是装载 Client 组件，安全依赖 Client `PermissionGuard` 和后端 API。API 是权威边界，但尚缺一个自动化门禁证明每个页面显示的动作均有对应 API permission，并且每个 API 都有正向与跨租户/跨园区/跨组织/跨员工负向测试。

## 2. 三角色基线审计

| 角色 | 声明目标 | 当前可执行事实 | 主要缺口 |
|---|---|---|---|
| `HR_MANAGER` | park；敏感档案和工资需原子 permission | 生产 seed 对大多数 HR 域授予全园区读取/管理；API 仍以细分 permission 控制，工资、候选人、档案、附件有独立原子权限与部分 required audit | “角色=全权限”与细分原子权限之间缺少生成式 exact-set 测试；部分敏感读取只测 projector，未逐 route 验证 audit failure 前不返回数据 |
| `DEPARTMENT_MANAGER` | managed_org_tree；敏感档案 masked；工资仅本人已发布 + 团队异常摘要 | 合同、考勤、保险、生命周期、培训、绩效、360、人才、奖惩等已有 team atoms 和 managed-tree SQL；工资仅 `team_summary`；员工目录通过工作汇报/绩效权限间接开放 | 缺 `employee:team_read`；profile masked API 不可达；各域 managed-tree 定义重复，direct report、组织负责人、子组织和本人是否包含并不完全统一；缺统一 sibling/foreign-tenant/foreign-park/UUID-guess 矩阵 |
| `EMPLOYEE_SELF_SERVICE` | self；self_masked；只读本人已发布工资 | 多数域有 self atoms；本人工资条和历史工资独立；生命周期/培训/绩效/360/人才/考勤/保险等有 self route 或 scope | 扩展档案 self_masked API 不可达；部分页面同时调用管理型 setup/options API，需验证前端不会因 403 破坏自助主流程；缺全部 18 route 的 direct URL 和 cross-employee 负向浏览器矩阵 |

## 3. 18 个前端 Route 全链路矩阵

状态：`闭环` 表示现有源码中有 route/API/entity-or-table/permission/test 主链，不代表真人 UAT；`部分` 表示仍缺至少一个原子或负向证明；`缺口` 表示关键角色路径不可达或权限语义错误。

| 前端 route | 主要 action | API controller / entity-table anchor | shared permission | 正向/负向测试证据 | 状态与差距 |
|---|---|---|---|---|---|
| `/hr` | 工作台导航、按页面权限展示入口 | 各 HR controller 汇总；无单一业务 entity | `HR_MENU`, `HR_DASHBOARD_PAGE` 及各 page atom | `hr-route.contract.spec.ts`、live-role browser matrix | 部分：需生成式验证所有卡片 route/page permission/API read atom 一致；直接 URL 仍由子页处理 |
| `/hr/organization` | 组织树、岗位读取/维护 | `HrController` directory-options/positions；`sys_org`, `HrPositionEntity` | `HR_ORGANIZATION_PAGE`, `HR_POSITION_READ/MANAGE` | foundation/access policy 与 migration tests | 部分：组织树本身依赖系统 org API permission，需覆盖部门经理只读与员工拒绝；移动/删除组织的原子权限不在 HR 合同中 |
| `/hr/employees` | 目录、详情、档案、创建/更新、任职转换 | `HrController`; `HrEmployeeEntity`, `HrEmployeeProfileEntity`, employment event | employee read/manage/self, profile read/manage, transition | `hr-access-policy.spec.ts`, `hr-access-scope.pg.spec.ts`, foundation/basic-profile tests | **缺口 P0**：无 employee team atom；team 目录借用 work-report/performance；profile team/self masked 声明不可达；需 required-audit 失败负向 |
| `/hr/lifecycle` | 生命周期模板/实例、扩展档案、就职/转正/调岗/离职 | lifecycle/onboarding/probation/job-change/departure controllers；lifecycle/record/application tables | lifecycle park/team/self、record park/team/self、各流程 manage/review/apply | lifecycle/onboarding/probation/job-change/departure contract + PG specs | 部分：多个流程 managed-tree 实现分散；需统一本人不能自审、经理越级/跨树、附件字段投影和聚合页面错误隔离 |
| `/hr/contracts` | 合同清单/详情、草稿、变更、状态动作、附件 | `HrController`; `HrContractEntity`, `HrContractChangeEntity` | contract park/team/self/manage；补充 compensation/file atoms | access policy、contract read PG、route contract | 较强但部分：列表 projector 已排除薪资/源快照；需逐 detail/change/action 验证 team/self 不返回薪资、附件需 required audit，self 不能到管理 setup |
| `/hr/attendance` | 本人申请、经理审批、考勤读取、运营、月结/更正 | `HrController`; attendance request/calendar/daily/period/payroll-input tables | read/team/self, request, approve, operate, close, payroll-input-read | attendance request/calculation/month-close/access-policy tests | 部分：读范围较完整；需核查 periods 元数据对 self/team 的 park-wide 可见是否合规，审批必须只限 managed tree，payroll input 永不泄给经理/员工 |
| `/hr/insurance` | 期间清单、本人/团队/园区详情 | `HrController`; insurance contribution period/detail tables | insurance read/team/self | attendance-insurance read + access-policy tests | 较强但部分：需逐字段明确基数、单位额、个人额对经理的投影；team detail 的 required-audit 失败测试不足 |
| `/hr/recruitment` | 需求、候选、阶段、录用、入职资料 | `HrRecruitmentController`; requisition/candidate/onboarding/document tables | requisition read/team/manage；candidate read/manage/sensitive/stage/convert；document atoms | recruitment contract/service/PG + web contract | 较强：候选敏感详情双 permission 且 required audit；仍需部门经理只能看需求摘要、不能通过猜 UUID 查看候选，员工角色整页拒绝的浏览器负向 |
| `/hr/training` | 课程、计划、参与人、签到/完成、费用、附件 | `HrTrainingController`; course/plan/participant/document tables | read/team/self、course/plan/progress/self-action、cost、document | training list/contract/PG + web contract | 较强：team 投影隐藏费用且不可 action；需核查 employee document read 是否严格本人计划，经理无附件权限时详情不失败 |
| `/hr/rewards` | 奖惩清单/详情、维护、审核、申诉、原因/金额/附件、薪酬绩效引用 | `HrRewardsController`; reward case/action/document/link tables | read/team/self/manage/review + reason/amount/document/link atoms | rewards contract/PG + client spec | 较强：敏感字段原子化；需补齐 manager review “可审但不可看详细原因/金额”的端到端投影测试和 required-audit 失败 |
| `/hr/goals` | 周期、目标树、变更、check-in | `HrGoalReportController`; `HrGoalEntity`, collaborator/checkin | goal park/team/self/manage/cycle/change/checkin | goal-report contract/PG/query tests | 较强：self/team 排除 draft 并按 org tree；需统一目标 owner 与 direct-report 语义，员工只能本人/协作目标的 direct UUID 负向 |
| `/hr/work-reports` | 本人草稿/提交/撤销、团队读取/审核、动作历史 | `HrGoalReportController`; `HrWorkReportEntity`, action/suggestion | self-read/draft/submit、team-read/review | goal-report contract/PG + live UAT scenarios | 较强：team required audit 已有源码合同；`work_content` 敏感组未统一应用到字段级 projector，需要报告正文/风险/建议的角色与导出政策 |
| `/hr/performance` | 模板/计划、自评、经理评、校准、确认/申诉/结果 | base `HrController` + performance-review controller；performance cycle/template/plan/review entities | read/team/self/template/manage/self-review/manager-review/calibrate/ack/appeal/result | performance evaluation/review contract + PG | 较强：未确认前隐藏经理/校准分；需梳理旧 base endpoints 与新 review endpoints 的重复路径，避免不同 projector 造成字段泄露 |
| `/hr/feedback-360` | 模型/周期、提名、审批、评价、发布/结果 | `HrFeedback360Controller` 及旧 feedback endpoints；feedback model/cycle/assignment/response/result | feedback read/team/self/model/cycle/nominate/review/respond/publish/result | feedback360 contract/PG + access-policy projection | 部分：旧、新 controller 并存；需证明 result endpoint 对 subject/manager/employee 的发布状态和匿名性一致，禁止由宽 `result_read` 绕过范围 |
| `/hr/talent` | 人才画像、复核、继任、发展计划、自助行动 | `HrTalentController`; talent profile/review/succession/development tables | talent read/team/self/profile/review/succession/development/self-action | talent contract + `verify-hr-talent.sh` | 部分：manager 被授予 development manage，需逐 employee 验证 managed-tree；继任数据对 employee/self 必须严格隐藏，缺浏览器字段负向 |
| `/hr/compensation` | 薪酬方案、员工分配 | `HrController`; `HrCompensationPlanEntity`, assignment | compensation read/manage | payroll PG/access projection tests | 部分：仅 HR_MANAGER 应可达；需把银行卡、基薪、津贴等 compensation 字段纳入统一 field-group policy，并验证所有读取 required audit；当前无 manager/self 受限摘要设计 |
| `/hr/payroll` | 期间/批次/工资单、本人条、历史、团队异常摘要、规则/公式/双轨 | `HrController`, `HrPayrollHistoryController`; payroll run/payslip/history/item/formula/reconciliation | payroll read/manage/review/confirm；payslip self；history park/team-summary/self；rule/reconciliation | payroll PG/history/reconciliation/schema + web contract | 较强敏感边界：team 只有 aggregate summary；P0 仍需全 route audit-failure-before-return 与 manager detail/items 403/not-found；页面同时承载 HR 管理和员工自助，需确保 setup 调用不使 self 页面失败 |
| `/hr/approvals` | 本人申请/提交/撤回、待审/审核 | `HrController`; `HrApprovalRequestEntity`, action | approval page/self-manage/review | access-policy projection、foundation/live-role scenarios | **缺口 P0**：部门经理当前只有 self-manage，没有 team-review；`pendingApprovals` controller/service 又没有 actor 参数，若直接授予现有 `HR_APPROVAL_REVIEW` 将天然成为 park-wide；需拆分并实现 managed-tree review |

## 4. API-only 流程与前端 route 归属

以下 controller 没有同名独立前端 route，实际聚合在 `/hr/lifecycle`：onboarding、probation、job-change、departure。必须在 route-action ledger 中保留独立 action/permission/state/test 行，不能因前端共用一个页面而合并成一个 broad `lifecycle:manage` 权限。尤其：

- job change：apply/manage/review 和 team/self read 必须分离；申请人不能自审。
- departure：interview/survey/handover/wage-settle/archive-close 分属不同职责，部门经理当前只有 manage/interview/handover。
- onboarding/probation：创建、资料、审核、转正及敏感附件必须分别验证。

## 5. 敏感字段投影审计

| field group | 当前控制 | 已证明 | 差距 |
|---|---|---|---|
| identity/contact | `projectHrEmployeeProfile` 全量或 masked；候选 sensitive 双权限 | mask 单测、候选人双门禁、required audit helper | profile team/self 路由权限不可达；缺每个 route 的 audit failure 测试 |
| financial/compensation | payslip self projector；payroll history self/team-summary；reward amount、training cost 独立 permission | self payslip 不含 employeeId/snapshot；经理无工资明细权限；费用/金额有原子 atom | compensation 页面缺统一 field policy；合同薪资、保险基数/金额、工资历史 item 的投影需同一合同 |
| attachment | lifecycle/training/reward/recruitment documents 用独立 file permission | lifecycle 文件 required audit、候选/培训/奖惩附件有权限契约 | 缺统一 owner/self/team 校验矩阵和下载失败前零 metadata/header/stream 证明 |
| work_content | 工作汇报、离职原因/访谈、奖惩详细原因等由各 service 自行裁剪 | departure/reward/work-report 有部分 projection/audit | shared group 未成为执行策略；跨模块导出、搜索、日志不得泄露正文的门禁不完整 |

## 6. 可直接拆分的实施批次

### P0-A：统一三角色 scope contract

- 新增独立 `HR_EMPLOYEE_TEAM_READ`，controller/resolver/seed/web 使用同一 atom；停止借用 work-report/performance 权限推导员工目录。
- 形成唯一 `resolveHrAccess(domain, actor)` 合同，规范 park / managed_org_tree / self / none、direct report、组织负责人、子组织、本人是否包含。
- 为全部 team/self 域生成相同负向矩阵：foreign tenant、foreign park、sibling org、unmanaged direct UUID、deleted/disabled org、无 employee 绑定。
- 验收：shared matrix 被运行代码消费，seed exact-set、controller metadata、service scope、PG 和 browser direct URL 五层一致。

### P0-B：员工敏感档案可达且最小投影

- 增加 profile team/self read 原子权限，或提供明确 `/employees/me/profile` 与 team-masked endpoint；禁止给经理/员工 broad profile read。
- 将 identity/contact 的 full/masked/self_masked 变成可执行 projector policy，并在 required audit 成功后才返回。
- 覆盖本人、managed employee、sibling、跨园区、猜 UUID、audit unavailable；验证响应不含 remark、完整证件、完整联系方式和内部 scope/audit 字段。

### P0-C：审批 review 数据范围

- 明确 `HR_APPROVAL_REVIEW` 是 park-wide HR 还是 managed-tree manager；若两者都需要，拆分 `HR_APPROVAL_PARK_REVIEW` / `HR_APPROVAL_TEAM_REVIEW`。
- `pendingApprovals` 和 review action 必须接收 actor，并在服务端按 subject/applicant managed tree 过滤；禁止前端过滤。
- 覆盖经理不能审批本人、不能审批 sibling/foreign park、HR_MANAGER 可 park-wide、employee self 只能本人申请。

### P0-D：工资与受保护附件 fail-closed

- 对 payroll run/payslip/history/items/formula/reconciliation、合同薪资、保险金额、受保护附件逐 route 增加 required-audit-failure-before-return 测试。
- 固定 department manager 只能 team aggregate，不能 history detail/items/payslip/compensation snapshot；employee 只能本人 published/confirmed。
- 验证下载审计失败时没有 metadata、header、stream 或签名 URL。

### P1-A：18 route 生成式 action ledger

- 从前端 `hasPermission`/API 调用和 controller decorators 生成 route-action ledger。
- 每个 action 必须绑定 API、entity/table、permission、positive test、negative test；页面-only 或 API-only 原子均 fail closed。
- 将 lifecycle 聚合页下 onboarding/probation/job-change/departure 保持独立原子行。

### P1-B：统一敏感字段策略

- 让 `HR_SENSITIVE_FIELD_GROUPS` 成为实际 projector/audit/attachment policy，而非只声明。
- 先统一 declared 与 observed field-group catalog；任何 service 使用未登记组名时 lint/contract fail closed。
- 为 identity/contact/financial/compensation/attachment/work_content 建立允许字段清单、mask 策略、审计 action、导出权限和日志禁入规则。
- 对 manager/self 的列表、详情、搜索、导出、附件、错误响应分别生成 snapshot/negative tests。

### P1-C：去重旧新 API 与前端自助容错

- 清点 performance、feedback 等旧 base controller 与新专用 controller 的重复入口，指定 canonical endpoint/projector，旧入口明确兼容层或下线计划。
- 每个同时服务 HR 与 self 的页面，将管理 setup 请求与 self 主流程隔离；无管理权限时不得因一个 403 使整页不可用。
- desktop/390 分别验证 HR_MANAGER、DEPARTMENT_MANAGER、EMPLOYEE_SELF_SERVICE 的空态、403/not-found、错误重试和详情切换后敏感 DOM 清理。

## 7. 验收门槛

完成上述批次后，至少需要：

1. 18/18 route 均有 route-action ledger，所有 action 具备 R/A/E/P/T 与正负向测试。
2. 三角色每个域的 scope 都由服务端确定；客户端过滤只可收窄。
3. 所有敏感读取先完成 required audit；失败时零业务数据、零 metadata/header/stream。
4. HR_MANAGER park、DEPARTMENT_MANAGER managed tree、EMPLOYEE_SELF_SERVICE self 的 exact-set seed 与 runtime 结果一致。
5. payroll 团队摘要、本人明细、HR 全量完全分离；附件、候选人、档案、合同薪资和保险金额遵守独立原子权限。
6. 三角色 API 与 desktop/390 正负向矩阵通过；技术通过不替代真人签署，生产历史导入继续 `HOLD`。

本文件仅包含代码结构和差距，不包含账号、密码、私网地址、真实员工信息、工资值或生产写操作。
