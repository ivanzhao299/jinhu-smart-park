# 已核对来源

代码基线770a60e7；本地fdaa6b9c仅有归档/日志元数据差异，工作区创建任务前干净。现有完整HTTP enterprise62场景包括员工直接transitions、合同activate、培训complete、奖惩/考勤second actor批准、档案import/normalPUT/冲突；全部hr-enterprise helper的targeted检索确认没有approved profile fulfillment和employment from-approval→review/apply场景。这限定当前HTTP helper覆盖，不能推断实现/PG/交互测试不存在。

现有路由：POST /hr/approvals/:id/profile-fulfillment；POST /hr/job-change-applications/from-approval/:id；POST /hr/job-change-applications/:id/actions|review|apply。HR管理spec开头与1446+明确来源绑定、权限交集和独立正式生效。档案保留spec明确patch/clear与普通PUT区别。前端operation continuity明确body/token/key重试、独立读、完整身份切换与DS390。

应复用：hr-approved-profile-fulfillment.pg.spec.ts、hr-approved-employment-job-change.pg.spec.ts、hr-job-change-linked-target.pg.spec.ts及现有Web相应interaction；旧hr-job-change.pg.spec.ts默认15432，不能不经owned fixture直接执行。角色permissions在packages/shared/src/hr.ts，scope语义由实际service/access-policy确定。必须进一步完整读相关方法，根代理bounded minified搜索未作全方法业务结论。

之前的真实HTTP私有结果在/Users/mac/.codex/artifacts/hr-profile-continuity-http-20261020，所有该次资源已删除；既有32882/32883属于其他任务。当前生产发布证据/Users/mac/.codex/artifacts/hr-profile-continuous-update-20261020/release-evidence.json。合成资料、旧源码缺失或登录问题均不得阻断其他可做开发，也不得冒充生产岗位验收。
# Actual business-chain findings

- Fixture corrections: user identity IDs differ from formal employee IDs; new normal employees start `preboarding` and require a normal `confirm_employment` transition; integrated permission catalog is paginated and must be fully resolved; the independent catalog has page permissions but no `hr` root permission. These are fixture contracts, not reasons to relax business validation.
- Actual product gap observed in the modern lifecycle page: PostgreSQL calendar dates escaped as time-zone timestamps. The Web's exact write-response comparison could reject a successful save, and the apply guard compared a JavaScript Date with a date string rather than enforcing a future-day boundary.
- Keep application/effective dates as SQL-formatted `YYYY-MM-DD` at list, detail and locked apply boundaries. Use the database's Shanghai business date for apply eligibility, matching the existing Web business-date convention; no database schema or permission change is needed.
- Focused normal-actor HTTP evidence must verify same-day success, future-day refusal with no event/assignment mutation, exact date list/detail readback, source/key replay, patch preservation, explicit clear, and HR/department/self boundaries in both runtimes.

