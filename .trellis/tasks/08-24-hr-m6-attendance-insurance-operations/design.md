# HR M6 技术设计

## Domain boundary

- 玉舟 `hr_attendance_calendar_source/hr_attendance_day` 是历史月历模板兼容层，只读且没有员工归属。
- 在线考勤新建 `hr_attendance_shift`、`hr_employee_shift_assignment`、`hr_attendance_clock_event`、`hr_employee_attendance_day` 和 `hr_attendance_period`，不得复用历史模板主键表达员工事实。
- 在线申请统一使用 `hr_attendance_request` 与类型化明细，业务类型为 `leave/overtime/business_trip/correction`；现有 `hr_approval_request` 仅承载流程投影和 inbox，不替代领域状态。
- 社保历史继续复用 `hr_insurance_policy*`、`hr_employee_insurance_period/item`，通过显式投影产品化；后续在线参保关系和政策版本另加前向表。

## State and consistency

- 申请：`draft -> submitted -> approved/rejected`，允许 `draft/submitted -> cancelled`；审批后更正以新请求产生，不原地改历史。
- 日结果：`open -> calculated -> confirmed -> closed`；每次重算生成递增版本和计算输入摘要。
- 月度期间：`open -> calculating -> review -> closed`；同园区同年月只有一个活动期间，封账使用悲观锁。
- 原始打卡事件追加写、不可物理覆盖；重复来源通过 `source_system + source_event_id` 唯一约束拒绝。
- 所有金额使用 `numeric`/字符串投影，所有分钟数使用整数，日期时间保存时区与本地业务日期。

## Permission and projection model

- 页面：`hr:attendance`、`hr:insurance`。
- 读取：`hr:attendance:read/team_read/self_read`、`hr:insurance:read/team_read/self_read`。
- 动作：`hr:attendance:shift_manage/schedule_manage/import/manage_period`、`hr:attendance:request/approve/correct`、`hr:insurance:manage/review`。
- 服务端解析 `park/managed_org_tree/self/none`，详情越界一律同形态 not-found。
- 员工社保投影不返回单位成本、源快照、legacy id、tenant/park/audit/version；团队投影只给合规状态和个人应缴汇总；HR 投影才给完整分项，但仍不出站源快照。

## API surface

- 历史与台账：`GET /hr/attendance/calendars`、`GET /hr/insurance/periods`、`GET /hr/insurance/periods/me`、`GET /hr/insurance/periods/:id`。
- 申请：`GET/POST /hr/attendance/requests`、`POST /:id/submit|approve|reject|cancel`。
- 在线内核：shift、schedule、clock-event import、daily-result 和 period close 使用独立动作路由。
- 高敏感社保、打卡明细和更正记录读取使用 required audit；审计失败不得返回响应。

## Web surface

- `/hr/attendance`：当前考勤摘要、本人申请、团队异常和 HR 月结入口，按权限呈现，不发送无权限请求。
- `/hr/insurance`：本人台账、团队合规状态、HR 月度汇总及待复核列表。
- 表单使用抽屉/显式办理区；首屏只呈现任务、异常、关键指标和下一动作，详细规则放入按需展开区。
- 桌面使用共享 DS panel/table，手机使用 `ds-mobile-record-list` 和触控友好操作。

## Compatibility and rollout

- 不修改 `000239`～`000242`；新迁移从当前最新编号之后递增。
- 所有 historical row 均拒绝写入，历史总账契约继续作为发布门禁。
- 先发布只读历史/社保产品化，再发布在线申请，再启用考勤内核/月结；工资消费端在双轨门禁完成前保持关闭。
- 数据库、seed、API、Web 任一门禁失败即停止发布，不跳过迁移或权限校验。
