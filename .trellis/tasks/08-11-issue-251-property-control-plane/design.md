# Issue #251 技术设计

## 1. 设计原则

- 继续以 `biz_unit` 作为经营锚点，以 `asset_unit_id` 显式关联物理资产，不合表。
- `biz_property_operation_config` 是经营模式与状态的唯一权威来源。
- `biz_property_occupancy` 是跨民宿、住房、商业租赁、维修和运营的唯一时间占用账本。
- 复用既有 advisory lock、GiST exclusion、审批运行时、幂等和 PropertyUnitAccess；不在 Web 重建业务判断。
- 查询和写入必须同时满足 Shared 契约、API 装饰器、服务权限断言及数据范围。

## 2. 分层设计

### 2.1 Shared

- 保留既有 Track B surface/API 常量，补齐聚合模式切换 API 常量和查询类型。
- 对齐 occupancy create/activate/release/force-release 的端点权限声明。
- 补齐资产管理岗位的人工占用创建、激活和普通释放权限；强制释放仍要求审批创建。
- 菜单使用独立的 asset property surface 集合，避免混入民宿/住房业务 surface。

### 2.2 API：控制面查询

- `PropertyOperationListController` 继续提供经营配置聚合列表。
- `PropertyOccupanciesController` 继续提供占用列表、详情、可用性、创建、激活和释放。
- 新增 `GET /api/v1/property/mode-transitions` 聚合查询；服务先取得 `PropertyUnitAccess.allowedUnitIds`，再与 tenant/park 条件共同下推 SQL。
- 列表统一返回分页信息；详情返回版本、权限允许的动作和领域来源信息。

### 2.3 API：经营模式审批

- `transitionMode` 始终创建 `property.mode-transition.request` 审批请求。
- 申请事务：锁定房源范围和配置，生成 blocker snapshot/hash、source expected version 和 business intent key。
- 执行事务：重新锁定并比较配置版本、当前模式、状态、快照 hash；成功后乐观更新并写 transition log。
- 任何模式目标（包括 `none`）都不得绕过该路径。

### 2.4 API：人工锁房与释放

- 创建入口只接受 `source_domain in ('maintenance','operations')`，服务端拒绝调用方伪造业务来源。
- 创建前标准化 `[start,end)`，锁房源作用域，检查模式策略和冲突，写入来源唯一键及审计。
- 普通释放仅允许人工来源，并要求 `PROPERTY_OCCUPANCY_RELEASE`。
- 业务来源普通释放继续失败；`force=true` 要求 `PROPERTY_OCCUPANCY_FORCE_RELEASE + PROPERTY_APPROVAL_CREATE`，创建审批请求。
- 审批执行按 expected version 和 effect manifest 重验，释放仅更新状态与释放元数据。

### 2.5 住房房源资格策略

新增单一的 `HousingLeaseUnitEligibilityService`（名称可按现有模块规范调整），负责：

- 房源存在、未删除、`status=1`；
- 当前经营配置存在、`operating_mode='long_rent'`、`status='enabled'`；
- PropertyUnitAccess 数据范围；
- 在提供租期时调用共享可用性/占用策略检查冲突；
- 返回 `eligible`、稳定 `reasonCodes` 和面向页面的非敏感提示。

候选查询将基础资格条件直接下推 SQL，避免先查全量后过滤。命令流程调用同一策略：

- create/submit：检查基础资格和请求租期；
- approval execution/sign/activate：重新检查基础资格和租期；
- 失败时抛稳定 4xx 业务异常，事务中不得提前改变状态或创建审批/占用。

建议原因码：

- `UNIT_INACTIVE`
- `OPERATION_CONFIG_MISSING`
- `OPERATION_MODE_NOT_LONG_RENT`
- `OPERATION_STATUS_NOT_ENABLED`
- `UNIT_OUT_OF_SCOPE`
- `LEASE_PERIOD_OCCUPIED`

越权场景不向客户端泄露房源资格细节。

### 2.6 历史草稿投影

- 住房租约列表/详情读取时批量投影资格，避免 N+1。
- 非草稿记录仍可展示历史资格信息，但不据此回写历史状态。
- 草稿详情展示阻断原因和“前往房源经营配置”的快捷入口。
- 修复配置后刷新即可恢复提交按钮，无需复制或重建租约。

### 2.7 Web

- 新增专用控制面 clients，避免继续扩张只面向身份/通知/异常的通用 `PropertyControlPlaneClient`。
- 页面使用 `PropertyControlPlaneGuard` 或等价 capability guard。
- operations：桌面表格、移动卡片、详情配置表单、审批式模式切换表单。
- occupancies：桌面表格、移动卡片、人工锁房表单、详情释放动作。
- transitions：聚合只读审计列表。
- `/assets/units` 详情只增加链接，不复制控制面表单。
- 住房租约选择器沿用远程 picker，但只消费收紧后的候选 API；详情显示资格原因。

## 3. 数据与迁移

优先复用现有表和索引。本任务预计无需修改已应用迁移。若聚合查询经执行计划证明需要新索引，只能新增 forward-only migration，并先检查现有重复编号；不得修改 `000176` 等历史迁移。

## 4. 并发、幂等与错误语义

- 所有写操作继续要求 `X-Idempotency-Key`，真实重放/冲突必须由 interceptor 或领域唯一键保证，不能只依赖 guard。
- 模式切换、人工锁房和释放均在事务内锁定房源或占用记录。
- 数据库 exclusion violation 转换为稳定占用冲突，不回传 SQL 细节。
- 资格失败必须在状态转换、审批创建或占用创建之前发生。
- 401 清理会话；403/404 遵循既有非泄露式策略；409 表示版本、幂等或占用冲突。

## 5. 测试设计

### Shared

- surface route、详情 route、页面权限、API 常量和 endpoint permission manifest。
- 权限包覆盖普通释放与强制释放的差异。

### API

- 数据范围：tenant/park/building/floor/unit 正向与越界。
- 模式切换：所有目标均创建审批、快照变化、版本变化、幂等重放与冲突。
- 占用：人工 maintenance/operations 创建、普通释放；业务来源普通释放拒绝；强制审批与陈旧执行拒绝。
- 住房候选：inactive、缺配置、非 long_rent、非 enabled、越权均排除。
- 历史草稿：可见、原因码、submit 无副作用阻断、修复后通过；后续阶段 TOCTOU 重验。

### Web

- 菜单、landing/guard、列表与详情查询、权限动作、错误/空态。
- 移动卡片与 390px 无横向溢出。
- 住房 picker 不展示不合格房源，草稿详情显示阻断提示和快捷入口。

## 6. 发布与回滚边界

- 只在本地隔离环境验证，不访问生产。
- 若无迁移，回滚为应用版本回滚；若新增索引迁移，采用向前兼容且不删除业务数据。
- 浏览器通过不代表真人岗位签署或 `production_ready`。
