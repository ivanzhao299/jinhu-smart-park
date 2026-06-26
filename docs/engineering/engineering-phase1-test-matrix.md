# EPDR Phase 1 Test Matrix

## 目标

本测试矩阵用于证明 Engineering Project Delivery Runtime Phase 1 不只是文件和页面堆叠，而是形成了可运行、可审计、可扩展的工程管理 MVP 闭环。

## 覆盖范围

| 能力 | 覆盖方式 | 状态 |
| --- | --- | --- |
| 工程项目模型与编号 | `engineering-project.repository.spec.ts` / `engineering-project.schema.spec.ts` | PASS |
| 工程项目状态机 | `engineering-project-state.machine.spec.ts` | PASS |
| 工程项目 API/Service | `engineering-project.service.spec.ts` / `engineering-projects.controller.ts` contract | PASS |
| 工程项目前端 | `engineering-projects-api.spec.ts` / Phase 1 integration route check | PASS |
| 工程计划模型与 API | `engineering-plan.repository.spec.ts` / `engineering-plan.service.spec.ts` | PASS |
| 工程计划前端 | `engineering-plans-api.spec.ts` / Phase 1 integration route check | PASS |
| 施工日报模型与 API | `engineering-daily-report.repository.spec.ts` / `engineering-daily-report.service.spec.ts` | PASS |
| 施工日报前端 | `engineering-daily-reports-api.spec.ts` / Phase 1 integration route check | PASS |
| 巡检与问题 | `engineering-inspection.service.spec.ts` / `engineering-inspection-issue.repository.spec.ts` | PASS |
| 整改闭环 | `engineering-rectification-state.machine.spec.ts` / `engineering-rectification.service.spec.ts` | PASS |
| 整改逾期 | `engineering-rectification.service.spec.ts` | PASS |
| 验收闭环 | `engineering-acceptance.service.spec.ts` | PASS |
| Dashboard | `engineering-dashboard.service.spec.ts` | PASS |
| RBAC 权限种子 | `engineering-rbac.seed.spec.ts` | PASS |
| DataScope | `engineering-data-scope.adapter.spec.ts` | PASS |
| EventBus 事件日志 | `engineering-event.publisher.spec.ts` / `engineering-event.schema.spec.ts` | PASS |
| AuditLog | `engineering-audit.logger.spec.ts` | PASS |
| 附件引用 | `engineering-attachment.service.spec.ts` | PASS |
| Notification 站内消息 | `engineering-notification.service.spec.ts` | PASS |
| Phase 1 集成契约 | `engineering-phase1.integration.spec.ts` | PASS |

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

## 当前边界

Phase 1 测试验证本地 Runtime 闭环，不执行生产部署、不连接外部服务器、不写真实生产库。真实业务联调、真实附件上传 UI、角色组收件人解析、移动端专项体验优化进入后续 Pilot/Phase 2。
