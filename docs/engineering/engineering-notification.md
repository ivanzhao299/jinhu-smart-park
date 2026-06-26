# Engineering Notification

## 定位

Engineering Notification 是 EPDR Phase 1 的通知预留与站内消息接入能力。它不新建独立消息表，而是复用现有 Workflow Inbox 的 `biz_user_message`，让工程项目闭环中的关键节点能进入角色收件箱。

## 当前实现

- `EngineeringNotificationService` 统一接收工程事件。
- 事件 payload 中存在 `notificationRecipients` 时写入 `biz_user_message`。
- 消息 `category = engineering`。
- 使用 `uniqueKey = engineering:{eventId}:{recipientId}` 避免重复写入。
- 通过 EventPublisher 集中触发，不在 Controller 中写通知逻辑。

## 已接入通知节点

- 工程立项提交：通知工程负责人。
- 工程计划创建：通知项目负责人/计划责任人。
- 工程问题创建：通知责任人。
- 整改任务创建：通知整改责任人。
- 整改逾期：通知整改责任人。
- 验收创建/提交：通知验收责任人。
- 验收未通过/需整改：通知验收责任人和提交人。

## 边界

Phase 1 只写站内消息，不发送短信、企微、邮件或 App Push。后续 Notification Runtime 可以订阅 `biz_engineering_event_log` 或直接替换 `EngineeringNotificationService` 的发送适配器。

## 与 Workflow Inbox 的关系

当前通知进入已有 `/workflow/messages` 与 `/workflow/inbox` 数据源。前端可按 `category = engineering` 展示工程消息，也可在工程详情页按 `bizType/bizId` 过滤展示。

## 后续扩展

- 角色组收件人解析，例如工程总监、项目经理、监理单位。
- 组织级通知与班组通知。
- 消息已读、确认、反馈闭环。
- 逾期升级通知。
- 多渠道推送适配。
