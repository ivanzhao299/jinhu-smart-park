# Phase 5 Completion Audit

日期：2026-08-26。审计基线 `HEAD = origin/main = 9b62b41004ed5a6dfb998cdeddde94d21f60a5e6`；审计不修改已成功迁移，不提交、推送、部署或写生产。

## Findings fixed

- Phase 2 的考勤、奖惩、培训来源分别只选取 `effective` 批次、`approved` 案件和 `completed` 参与记录，并冻结来源 ID、版本和最小事实快照。
- 原绩效发布逻辑只冻结旧 `hr_feedback_cycle` 的关闭周期，未读取 T6 Phase 3 的现代匿名发布结果。已补充双轨读取：旧来源标记 `legacy_000232`；现代来源必须为 `hr_feedback360_subject.status = published`，以该 subject 为来源 ID，以 `result_published` 动作序号为来源版本，并冻结模型版本、问卷版本和发布时间。关闭周期、普通 assignment 或未发布 subject 均不能进入现代绩效证据。
- 同步了可执行 HR spec，并把此前已完成但遗漏勾选的 Phase 3 四项改为完成。

## Phase 3 evidence

- `000260_hr_competency_feedback360.sql` 建立版本化模型、维度、行为锚点、问卷、题目、周期、subject、提名、assignment、response、匿名维度结果和动作表；已应用迁移未被修改。
- `HrFeedback360Service` 与 Controller 实施模型/问卷发布、提名与分离审批、任务分派、一次提交、数据库聚合、阈值发布、required audit、精确权限和安全结果投影。
- focused contract 明确检查 Service 直调 fail closed、每个 POST 的精确权限/幂等/无 body 审计、小样本门禁、无 reviewer/assignment/free text 投影和最小权限 seed。
- 真实 PostgreSQL 门禁覆盖低样本失败、peer/subordinate 合并为 `others`、重复提交竞争、伪造 self/跨树失败、审计失败阻断及员工/绩效零副作用；该门禁随 Phase 3 发布前独立审查执行。

## Phase 4 evidence

- `000261_hr_talent_management.sql`、`HrTalentManagementService`、Controller、Web 与 focused/PG contract 覆盖人才画像冻结来源、盘点会与九宫格追加决议、关键岗位继任版本链、发展计划/行动/证据/待办、逐记录 `canAct` 和零员工状态/工资/绩效终值副作用；已应用迁移未被修改。
- Phase 4 独立审查修复 employee-bound 复合外键、前序版本链、父状态门禁、发展行动日期边界和本人字段投影，证据见 `phase4-independent-check.md`。

## Current verification

- HR focused contract：26/26 PASS（performance planning/evaluation、feedback360、talent）。
- Shared build、API lint/typecheck、Web lint/typecheck、CSS architecture、`git diff --check`：PASS。
- 生产 Phase 3：run `32864996302` / SHA `d28ea1d6`，`000260` 成功，health/ready、6 个受保护账号和 Docker cleanup 4.379GB 均通过。
- 生产 Phase 4：run `32875057657` / SHA `9b62b410`，`000261` 成功，health/ready、6 个受保护账号和 Docker cleanup 3.55GB 均通过。
- 最终 fetch 证明审计开始时 `HEAD = origin/main = 9b62b410`。

## Remaining release gates

- 三角色真实业务数据 UAT 未完成。当前只有生产管理员在 `/hr/talent` 的 desktop 与 390px 页面/空状态检查，无横向 overflow；不得声明 HR、部门负责人、普通员工的完整端到端业务流 UAT PASS。
- 本审计修复现代 360 到绩效证据的查询与 contract 后形成未提交候选；因此本地候选、远端主线和生产 SHA 已不再代表同一份代码。必须另行完成提交前 fetch、CI/Release Smoke、合并、生产发布、健康/账号/cleanup 和三 SHA 一致门禁。
- 结论：已部署的 T6 Phase 1–4 主体可继续运行，但 T6 Phase 5 最终结论为 **NO-GO**，直至上述两项完成。
