# Engineering Project Delivery Runtime

EPDR（Engineering Project Delivery Runtime，工程项目交付运行时）是 Smart Park 的工程项目全生命周期 Runtime。

当前目录已承载 Phase 1 的核心闭环能力，包括工程项目、计划、施工日报、工程巡检、问题整改、工程验收、Dashboard、RBAC 入口、DataScope 适配、EventBus 事件日志、AuditLog 审计入口、附件引用和工程通知入口。

- `domain/`: 状态机、枚举、业务规则、Runtime 类型。
- `dto/`: 请求 DTO、查询 DTO、动作 DTO。
- `entities/`: TypeORM 实体，统一继承 `AuditableEntity`。
- `events/`: EventBus 事件 envelope、事件类型与本地事件日志 publisher。
- `repositories/`: 复杂查询或领域仓储封装。
- `workflow/`: Workflow Runtime placeholder 与后续接入适配器。

当前可用接口：

- `GET /api/engineering/runtime/status`
- `GET /api/engineering/dashboard`
- `GET /api/engineering/projects`
- `GET /api/engineering/plans`
- `GET /api/engineering/daily-reports`
- `GET /api/engineering/inspections`
- `GET /api/engineering/rectifications`
- `GET /api/engineering/acceptances`
- 权限：Task 021 起使用 `ENGINEERING_*` 专属权限和 `engineering:*` 菜单权限。

RBAC 说明见 `docs/engineering/engineering-rbac.md`。业务对象、状态动作、Dashboard 和前端按钮均由 EPDR 专属 RBAC 控制。

总文档入口见 `docs/engineering/README.md`。

事件流说明见 `docs/engineering/engineering-eventbus.md`。Task 023 起，工程领域事件会写入 `biz_engineering_event_log`，供后续 Workflow、Notification 和 AI Agent 消费。

审计说明见 `docs/engineering/engineering-audit-log.md`。Task 024 起，工程项目基础写操作与各子 Runtime 写操作统一经 `EngineeringAuditLogger` 写入平台 AuditService。

通知说明见 `docs/engineering/engineering-notification.md`。Task 026 起，关键工程事件可通过 `EngineeringNotificationService` 写入既有 `biz_user_message` 收件箱。
