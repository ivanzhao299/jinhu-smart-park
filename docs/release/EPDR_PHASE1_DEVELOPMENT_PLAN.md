# EPDR Phase 1 Development Plan

项目：金湖 Smart Park - Engineering Project Delivery Runtime（EPDR）

中文名称：工程项目交付运行时

阶段：Phase 1 - 工程管理 MVP 闭环

## 1. 目标

Phase 1 建立工程项目从立项、计划、施工日报、工程巡检、问题整改、复查关闭、阶段/竣工验收到移交和结算预留的最小闭环。

本阶段不实现真实财务付款、资产入账、物业移交、AI 模型调用、IoT 实时联动和数字孪生，但必须在模型、事件和接口上预留边界。

## 2. 当前 Task 001 结论

已建立 EPDR 基础骨架：

- 后端模块：`apps/api/src/modules/engineering/`
- 前端占位 Console：`apps/web/app/engineering/page.tsx`
- Runtime 元信息接口：`GET /api/engineering/runtime/status`
- 领域边界：`domain/`、`dto/`、`entities/`、`events/`、`repositories/`、`workflow/`

Task 001 未新增数据库表、未新增迁移、未新增菜单种子、未写生产数据。

## 3. 架构落点

后端沿用现有 NestJS + TypeORM 架构：

- Module：`EngineeringModule`
- Controller：仅暴露 Runtime 状态占位接口
- Service：返回 Runtime descriptor
- Entity：后续统一继承 `AuditableEntity`
- RBAC：后续使用 `@RequirePermissions`
- AuditLog：后续使用 `@AuditLog`
- DataScope：后续通过 `DataScopeService` 在 query service/repository 层过滤
- Workflow：后续在 `workflow/` 目录接入或实现 placeholder

前端沿用 Next.js App Router：

- Runtime Console 路由：`/engineering`
- Task 001 仅占位，不接真实业务 API
- 后续页面按 EPDR-P1 至 EPDR-P6 拆分

## 4. Phase 1 执行顺序

1. Task 001：创建 Engineering Runtime 模块骨架
2. Task 002：建立工程项目数据模型
3. Task 003：实现工程项目状态机
4. Task 004：实现工程项目 API
5. Task 005：实现工程项目前端页面
6. Task 006：建立工程计划数据模型与 API
7. Task 007：实现工程计划页面
8. Task 008：建立施工日报数据模型与 API
9. Task 009：实现施工日报页面
10. Task 010：建立巡检与问题数据模型
11. Task 011：实现巡检 API
12. Task 012：实现巡检页面
13. Task 013：实现巡检问题自动生成整改任务
14. Task 014：建立整改任务数据模型与状态机
15. Task 015：实现整改 API
16. Task 016：实现整改反馈与复查页面
17. Task 017：实现整改逾期检测机制
18. Task 018：建立验收数据模型与 API
19. Task 019：实现验收页面
20. Task 020：实现工程 Dashboard
21. Task 021：实现 RBAC 菜单和权限
22. Task 022：实现 DataScope 预留与基础过滤
23. Task 023：实现 EventBus 事件
24. Task 024：实现 AuditLog
25. Task 025：实现附件能力
26. Task 026：实现 Notification 预留
27. Task 027：编写单元测试
28. Task 028：编写集成测试
29. Task 029：补充开发文档
30. Task 030：提交 Git

## 5. Task 002 入口建议

下一步只做工程项目数据模型：

- 新增 `EngineeringProjectEntity`
- 新增项目状态枚举和类型枚举
- 新增状态日志/事件日志/审计日志基础实体边界
- 新增数据库迁移
- 不实现复杂业务 API

## 6. 安全边界

- 不写生产数据
- 不执行部署
- 不调用真实财务、资产、物业、AI、IoT
- 不绕过 RBAC
- 不绕过 DataScope
- 不把状态流转交给前端直接修改
