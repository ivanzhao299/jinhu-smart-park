# Engineering Project Delivery Runtime

EPDR（Engineering Project Delivery Runtime，工程项目交付运行时）是 Smart Park 的工程项目全生命周期 Runtime。

当前目录为 Task 001 骨架，不包含业务表、状态流转实现或生产数据写入。Phase 1 后续任务会在本目录内按以下边界扩展：

- `domain/`: 状态机、枚举、业务规则、Runtime 类型。
- `dto/`: 请求 DTO、查询 DTO、动作 DTO。
- `entities/`: TypeORM 实体，统一继承 `AuditableEntity`。
- `events/`: EventBus 事件 envelope 与事件类型。
- `repositories/`: 复杂查询或领域仓储封装。
- `workflow/`: Workflow Runtime placeholder 与后续接入适配器。

当前可用接口：

- `GET /api/engineering/runtime/status`
- 权限：临时复用 `module:read`。EPDR 专属菜单和操作权限将在 Task 021 实现。

Task 001 不新增数据库迁移，不新增菜单，不写生产数据。
