# Engineering Project Delivery Runtime

EPDR（Engineering Project Delivery Runtime，工程项目交付运行时）是金湖 Smart Park 的工程项目全生命周期 Runtime。Phase 1 已形成 MVP 闭环：

```text
工程立项 -> 工程计划 -> 施工日报 -> 工程巡检 -> 问题整改 -> 复查关闭 -> 工程验收 -> Dashboard / 审计 / 事件 / 通知
```

## 当前能力

| Runtime | 能力 | 文档 |
| --- | --- | --- |
| 工程项目 | 项目模型、API、状态机、前端页面 | `engineering-project-model.md` / `engineering-project-api.md` / `engineering-project-ui.md` |
| 工程计划 | 计划层级、进度、状态、项目详情入口 | `engineering-plan-api.md` / `engineering-plan-ui.md` |
| 施工日报 | 日报创建、提交、审核、项目入口 | `engineering-daily-report-api.md` / `engineering-daily-report-ui.md` |
| 工程巡检 | 巡检记录、工程问题、自动生成整改 | `engineering-inspection-api.md` / `engineering-inspection-ui.md` |
| 整改闭环 | 整改状态机、反馈、复查、逾期扫描 | `engineering-rectification-api.md` / `engineering-rectification-ui.md` |
| 工程验收 | 验收创建、提交、评审、关闭 | `engineering-acceptance-api.md` / `engineering-acceptance-ui.md` |
| Dashboard | 项目、计划、日报、巡检、整改、验收统计 | `engineering-dashboard.md` |
| RBAC | 工程菜单和操作权限 | `engineering-rbac.md` |
| DataScope | 租户、园区、组织、自有责任视图 | `engineering-data-scope.md` |
| EventBus | 工程事件日志 | `engineering-eventbus.md` |
| AuditLog | 关键动作审计 | `engineering-audit-log.md` |
| Attachment | 工程附件引用校验 | `engineering-attachment.md` |
| Notification | 工程事件写入站内消息 | `engineering-notification.md` |
| Test Matrix | Phase 1 验收测试矩阵 | `engineering-phase1-test-matrix.md` |

## 页面入口

- `/engineering`
- `/engineering/dashboard`
- `/engineering/projects`
- `/engineering/plans`
- `/engineering/daily-reports`
- `/engineering/inspections`
- `/engineering/rectifications`
- `/engineering/acceptances`

## API 入口

- `/api/engineering/runtime/status`
- `/api/engineering/dashboard`
- `/api/engineering/projects`
- `/api/engineering/plans`
- `/api/engineering/daily-reports`
- `/api/engineering/inspections`
- `/api/engineering/issues`
- `/api/engineering/rectifications`
- `/api/engineering/acceptances`

## 关键运行规则

1. 状态流转必须通过状态机或 Service 动作接口，不允许前端直接改状态。
2. 查询和写操作必须经过 RBAC 与 DataScope 入口。
3. 关键写操作必须写 AuditLog。
4. 关键业务事件必须写 `biz_engineering_event_log`。
5. 可通知事件通过 `EngineeringNotificationService` 写入 `biz_user_message`。
6. 附件只保存 `attachment_ids` 引用，不在工程表中存文件内容或外部凭证。
7. Workflow、Finance、Asset、Facility、AI、IoT 保持边界预留，不在 Phase 1 里做真实外部联动。

## 验证命令

```bash
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api test:unit
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web build
git diff --check
```

## Phase 1 剩余边界

- 真实附件上传 UI 和预览体验仍使用文件中心能力承接。
- 角色组通知解析当前为明确用户收件人，后续可接组织/岗位。
- Workflow 仍是 placeholder，尚未接复杂审批流。
- 结算、财务付款、资产入账、物业移交只预留字段和接口边界。
- 移动端工程专项体验需要后续单独优化。

## 下一阶段建议

1. 用真实工程项目跑一次端到端业务演练。
2. 将工程通知合并到前端 Workflow Inbox 的工程筛选视图。
3. 补充附件上传/预览/归档体验。
4. 接入简单 Workflow 审批节点。
5. 开始 Finance / Asset / Facility 移交接口的 Phase 2 设计。
