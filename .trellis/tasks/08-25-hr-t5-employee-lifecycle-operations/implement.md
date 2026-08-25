# HR T5 实施计划

## Phase 0 — 基线与规划门禁

- [ ] fetch 并确认工作树、`origin/main`、生产 SHA 一致；扫描全部远端分支的迁移号。
- [ ] 审计现有员工 lifecycle、审批、Workflow Inbox、Files HR 授权、加密/指纹、上传控件和 HR 工作台复用点。
- [ ] 对玉舟招聘/档案/培训/奖惩来源做真实只读 catalog/count/profile，冻结证据与迁移拆分。
- [ ] PRD/design/implement 经独立 Trellis 审查并激活任务。

## Phase 1 — 招聘与入职转化

- [x] Shared 原子权限和 production seed 最小三角色矩阵。
- [x] 前向 migration：requisition/candidate/action/conversion 与 scoped FK、索引、状态、唯一和 append-only 约束。
- [x] 招聘需求、候选人分页/筛选、阶段动作、面试/Offer 证据和事务化 hired→preboarding employee。
- [x] 候选人敏感字段加密/掩码/指纹，required audit 和 protected file policy。
- [x] `/hr/recruitment` 桌面管道和可读表单；390px 提供摘要/任务而不暴露批量敏感管理。
- [x] DB 并发转化、跨范围、安全投影、文件审计与 Web 契约测试。

## Phase 2 — 入职/离职清单与扩展档案

- [x] 模板/version/item、实例/item/action 前向 migration 和不可变约束。
- [x] 入职/离职模板、实例化快照、负责人动作、逾期和统一 Workflow Inbox 同事务。
- [x] 与现有 employment transition/event 建立单向引用，禁止清单直接改员工状态。
- [x] 家庭、教育/工作履历、技能、证照模型和 park/team/self/none 精确投影。
- [x] 扩展 HR protected files：简历、Offer、证照、培训证书、奖惩/清单证据；审计先于 metadata/header/stream。
- [x] HR 员工页与 `/hr/lifecycle`，负责人/员工移动任务卡；切换清敏感详情。

## Phase 3 — 培训运营

- [x] course/plan/participant/correction migration，计划快照、预算/费用 decimal 和完成后不可变。
- [x] 课程、计划发布、参训范围、签到/完成、成绩、证书、费用与更正 API。
- [x] 必修/逾期/完成消息与计划动作同事务；不自动改变绩效/工资。
- [x] `/hr/training` HR、团队、本人三视图及桌面/390px 适配。
- [x] 计划并发、组织树、费用字段权限、员工自助和历史版本 PG/API/Web 测试。

## Phase 4 — 奖惩运营

- [x] category/case/action/link migration，审批状态、追加动作、已批准终态和外部引用约束。
- [x] 草稿/提交/退回/重提/撤回/批准，统一待办、禁止自审和跨组织树审批。
- [x] 批准后只创建受控 payroll/performance link；断言在线工资条、薪酬、绩效结果零写。
- [x] `/hr/rewards` HR 流程、团队安全摘要、本人已批准最小投影；金额/原因/附件原子字段权限。
- [x] 幂等、悲观锁、并发审批、required audit、匿名安全 not-found 和数据库终态测试。

## Phase 5 — 玉舟兼容切片

- [ ] 招聘 `accept` 两次只读抽取业务 hash 一致，source=loaded+quarantined；不自动转在职员工。
- [ ] `family/his/knowhow/ticket/photo/docs` 只读抽取，敏感 staging 权限 0600，日志/报告脱敏。
- [ ] `course/train/trainhis/jobtrain` 培训历史 load→rollback→reload；未知员工/课程 quarantine。
- [ ] `bonuscode/bonusrecord/jch_1` 奖惩历史保真；空表和未知状态保持可见，不合成业务事实。
- [ ] 旧文件哈希/MIME/大小/可读性核对；生产导入继续 HOLD，除非另获 run 级授权。

## Phase 6 — 全量质量与发布

- [ ] 独立 `trellis-check` 修复所有有效发现；必要时 `trellis-break-loop` 固化非显然缺陷。
- [ ] Shared/API/Web lint、typecheck、build；API full unit、HR focused、CSS check、diff-check。
- [ ] `template0` fresh 全迁移、upgrade/replay、production seed 两次、真实 PG 并发/不可变/范围/零副作用。
- [ ] 本地隔离三角色 API/browser UAT；桌面和 390px 无横向溢出、无冗长说明文字。
- [ ] 提交前 fetch、PR CI + Release Smoke、合并前 fetch；生产 migration/seed/health/ready/受保护账号/Docker cleanup。
- [ ] local HEAD = `origin/main` = deploy workflow/runtime SHA；生产三角色浏览器 UAT 后记录限制。

## Risk / Rollback Points

- 任何迁移号冲突：停止并改用新的连续空号，不重命名已应用迁移。
- 任何敏感字段明文索引、实体泄露、审计失败仍响应：发布 NO-GO。
- 候选人转员工或离职清单绕过 lifecycle：发布 NO-GO。
- 奖惩/培训直接改变工资或绩效结果：发布 NO-GO。
- 历史装载改变在线员工聚合、消息、工资、绩效或生产数据：立即回滚隔离批次并阻断生产导入。
