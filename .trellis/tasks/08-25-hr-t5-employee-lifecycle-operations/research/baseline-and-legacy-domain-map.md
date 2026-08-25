# T5 基线与玉舟领域映射

## 当前 Jinhu 可复用能力

- `hr_employee` 与 lifecycle transition/event 已存在，员工状态不可由普通更新修改。
- `hr_approval_request/action`、`HrNotificationService` 和 `biz_user_message` 可复用审批、动作留痕与统一待办。
- `hr_employee_document` 已建立 HR protected file、required audit 和显式 metadata projection 模式。
- `resolveHrEmployeeAccessScope`/组织树 SQL 已提供 park/managed_org_tree/self/none 范围模式。
- Web HR 已有工作台、员工目录、合同、考勤社保、工资等 DS surface 与移动卡片模式。
- Shared 权限、production seed、Controller 精确权限、Service 直调 fail-closed、IdempotencyInterceptor、body-free audit 是新写路由基线。

## 玉舟来源事实

来源：本机分析报告、`table_columns.md`、`schema_tables.sql` 和已恢复只读 SQL Server catalog。静态报告数字在正式抽取前只能作为 profile 预期，不能替代 `COUNT_BIG` 实测。

| 领域 | 旧表/对象 | 已知语义/静态数量 | 新系统边界 |
|---|---|---|---|
| 招聘 | `accept`、`web_accept` | 约 117 条，52 列近似 person | 候选人历史，不直接成为 active employee |
| 家庭 | `family`、`u_family` | 4,560 条 | 员工敏感扩展档案 |
| 履历 | `his` | 375 条 | 教育/工作经历拆分，未知类别保留原码 |
| 技能 | `knowhow/knowhowcode` | 待 SQL profile | 技能目录+员工技能历史 |
| 证照 | `ticket/ticketcode/orgticket` | 237 条；含编号、日期、发证机关、旧文件名 | 原号受保护，普通投影只返回掩码 |
| 照片/附件 | `person.photo/photofile`、`docs` | `docs` 1,003 条 | 受保护 File 对象；旧路径不做下载地址 |
| 培训 | `course/coursecode/course_person/train/trainhis/jobtrain`、`u_train*`、`web_train*` | 课程、计划/记录、学时、成绩、考试、费用 | 历史与在线模型区分，费用字段单独权限 |
| 奖惩 | `bonuscode/bonusrecord/jch_1`、`u_bonus*`、`web_bonus*` | 类别可配置；静态分析时 `bonusrecord` 为空 | 不合成不存在的记录；批准后仅受控外部引用 |

## 安全和迁移结论

- 招聘、家庭、履历、证照、培训成绩、费用、奖惩原因与附件均属于敏感 HR 数据。
- 提取必须显式列、稳定排序、只读账号，staging 权限 0600，业务 hash 不含明文敏感报告。
- employee/org mapping 缺失进入 quarantine；历史 loader 不调用在线服务，不发送消息，不创建用户，不修改员工状态。
- 文件实际二进制、旧路径和 MIME 需要独立 profile；生产导入在 run 级审批前保持 HOLD。

## 第一实施切片建议

先完成招聘需求、候选人、阶段动作、转 preboarding employee 和 onboarding checklist 的在线闭环。它形成后续培训、档案和离职清单的统一任务/文件/权限基础，又不会把所有 T5 表一次性塞入一个不可审查迁移。随后独立切片完成扩展档案/文件、培训、奖惩与旧数据 loader。
