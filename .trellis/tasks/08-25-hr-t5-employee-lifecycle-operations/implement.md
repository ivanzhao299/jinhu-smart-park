# HR T5 实施计划

## Phase 0 — 基线与规划门禁

- [ ] fetch 并确认工作树、`origin/main`、生产 SHA 一致；扫描全部远端分支的迁移号。
- [ ] 审计现有员工 lifecycle、审批、Workflow Inbox、Files HR 授权、加密/指纹、上传控件和 HR 工作台复用点。
- [ ] 对玉舟招聘/档案/培训/奖惩来源做真实只读 catalog/count/profile，冻结证据与迁移拆分。
- [ ] PRD/design/implement 经独立 Trellis 审查并激活任务。

### 2026-08-31 受控源基线复核

- 当前候选已在最新 `origin/main` 之上且未落后；当前候选线的迁移最高号为 `000288`。历史重复号风险仍存在，任何后续前向迁移必须在写入前重新 fetch 并基于候选线复核，而不是从远端全部分支的最大值推断编号。
- T5 在线产品实现已可在当前候选中定位：招聘、生命周期、培训与奖惩服务/控制器、受保护文件授权、迁移 `000251`～`000256` 及其 API/真实 PostgreSQL/前端契约测试均存在。此条只证明实现面可审计，不替代全量质量、真人 UAT 或生产发布门禁。
- 受控来源的两次目录字节哈希相同。当前快照的非零轻量域为 `family=4,560`、`his=375`、`knowhow=6`、`ticket=237`、`docs=1,003`、`trainhis=2`、`bonuscode=8`；`accept/course/train/jobtrain/bonusrecord` 均为零。零行域必须以零行守恒或明确 archive/reject 决策处理，不能使用过时估计生成导入记录。
- 非文件 T5 A/B 连续演练汇总为 `CONTRACT_PASS`，但生产导入仍为 `HOLD`。照片和文档二进制的实际读取、内容校验、对象写入和附件关联仍属于独立的文件迁移切片，不由本基线或非文件演练宣称完成。

### 2026-08-31 定向实现验证

- API 定向契约共 `24` 项通过，覆盖招聘转预入职、生命周期模板/清单与统一待办、培训不可变更正、奖惩审批/受控引用、最小权限与受保护文件审计。
- Web 定向契约共 `11` 项通过，覆盖招聘、生命周期、培训和奖惩的权限分支、移动记录、请求取消及敏感详情清理。
- 此批验证未启动完整单元套件、真实 PostgreSQL fixture、浏览器真人 UAT 或生产流程；这些 Phase 6 门禁仍保持未完成，不能据此解除任一历史生产导入 HOLD。

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

### 2026-08-31 当前代码与真源回执重绑

- 当前隔离代码提交 `424b937b98f856b5677337c02259b60269bcfb88` 已通过 T5 非文件 stage 的受限私有基线入口契约。该入口只接受绝对路径、非符号链接、单链接且权限 `0600` 的候选基线；默认仓库基线行为保持不变。
- 旧的 M6 “current”回执在运行时身份门禁中被拒绝，没有发生 T5 加载。随后重新采集只读源端恢复回执；它与受控规范回执字节一致，仍绑定同一备份快照、健康只读 SQL Server 和最小只读 ETL 权限。生产导入持续为 `HOLD`。
- 新鲜 stage 仅含非文件域 `person_core/family/knowhow/ticket`，来源守恒为 `7,752` 行，明确排除照片和文档。串行 A/B 隔离演练均得到一致的两轮结果：每轮 `source=7,752`、`loaded=7,648`、`quarantined=104`，每次均已回滚；A 与 B 最终均为 `CONTRACT_PASS`、`residualCount=0`。
- 以上证明当前代码对这一个非文件历史切片可重跑、可回滚、可比例验证；不证明照片、文档、培训、奖惩、工资或任何生产目标已经导入。其他历史域仍须各自与当前回执重绑并完成独立的隔离闭环。

### 2026-09-01 文档归属哈希证据 A/B 闭环

- 新增通用 `T5_FILE` 归属 pair 入口，串行执行 A 再 B；它仅接受独立的 `core_t0_t2` 受控配置与 `0700` stage，要求源快照、恢复回执、stage hash、两轮来源守恒/回滚回执均一致，并要求 A、B 均为零残留。入口不读取附件二进制，不创建 `sys_file`、`hr_employee_document` 或生产对象。
- 从当前受控回执分别生成两个独立文档归属 stage，stage hash 相同。两次隔离演练均完成两轮 `load -> rollback`：每轮 `source=1,003`、`loaded=989`、`quarantined=14`，A/B 比较为 `PASS`，两边均 `residualCount=0`。结果只证明旧文档与员工归属的 hash-only 证据可重跑、可审计、可回滚；二进制内容、对象归一化和附件关联仍未执行，生产导入保持 `HOLD`。
- 照片归属复用同一 pair 入口并完成独立 A/B 演练。两个 stage 的来源/回执/哈希一致；两边各完成两轮 `load -> rollback`，每轮 `source=2,155`、`loaded=2,155`、`quarantined=0`，最终均为 `CONTRACT_PASS` 与 `residualCount=0`。该结果只涵盖既有内容 hash、大小和 MIME 的归属证据，不读取或复制图片二进制，不创建在线文件或员工附件关联，生产导入继续 `HOLD`。

- [x] 招聘 `accept` 两次只读抽取业务 hash 一致，source=loaded+quarantined；不自动转在职员工。
- [x] `family/his/knowhow/ticket/photo/docs` 只读抽取，敏感 staging 权限 0600，日志/报告脱敏。
- [x] `course/train/trainhis/jobtrain` 培训历史 load→rollback→reload；未知员工/课程 quarantine。
- [x] `bonuscode/bonusrecord/jch_1` 奖惩历史保真；空表和未知状态保持可见，不合成业务事实。
- [x] 旧文件哈希/MIME/大小/可读性核对；生产导入继续 HOLD，除非另获 run 级授权。

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
