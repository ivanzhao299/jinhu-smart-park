# HR 产品独立性 P0 真实依赖盘点

## 1. 结论先行

盘点基线为 `origin/main@bc8c79d5762ab044173b1eb1ade0175e365f6353`。产品目标取自 PR #615 候选 `8604c967` 的《玉舟 HR 兼容开发计划》第 1 节及同任务的 PRD、design、implement：**保持一套 HR 业务内核，同时支持 Smart Park 集成模式和独立企业平台模式；独立模式不得启动资产、租赁、物业、设备等园区业务模块。** `8604c967` 在盘点时尚不是该 `origin/main` 的祖先，因此本文把它作为目标输入，不把它误写成已合并运行事实。

静态代码能确认：

1. HR 业务能力已经集中在 `apps/api/src/modules/hr` 与 `apps/web/app/hr`，不需要另建一套业务内核。
2. 当前产物**不能独立启动**。API 唯一入口固定启动综合 `AppModule`，HR 与园区全部业务模块一起装载；Web 的 HR layout 固定使用综合 `DashboardLayout`。
3. 可复用的企业基础能力已经存在，包括账号、RBAC、审计、消息表、文件表、配置与请求基础设施；但其中若干 Nest 模块/实现又直接依赖 Parks、物业、工单、安全等园区模块，不能整模块原样搬入独立组合根。
4. 最大的结构性耦合是 `TenantParkScope`、`sys_org`、`sys_user`、`biz_user_message`、`sys_file` 和 `@RequireModule("hr")`。这不是把 `park` 文案改成 `company` 就能解决的；需要在同一内核前增加企业作用域、身份、组织、消息、文件、审计端口，并为两种模式提供适配器。
5. 最短可交付路径不是拆微服务，而是先增加第二个 Nest composition root 和第二个 Web shell，只打通“登录 → 员工档案 → 一条审批 → 历史回读 → 审计”的纵向链，再逐域替换直接依赖。

本文是 P0 静态盘点，不是运行证明。import 数量、表数量或目录集中度均不代表独立模式已经可运行。

## 2. 证据边界与分类

- 只读检查受 Git 管理的 TypeScript、SQL、Shell 和示例配置；未读取 `.env`、凭据、真实业务行或文件二进制。
- 未连接数据库、未启动服务、未执行迁移、未做生产操作。
- “可带走”表示业务语义适合两种模式共用，**不表示现有 Nest 模块可以不改依赖直接启动**。
- “必须解耦”表示当前实现引用了 Smart Park 专属业务、园区作用域，或综合应用组合根。
- “未决”表示仅靠静态代码无法证明运行时行为，必须由后续最小启动合同验证。

| 分类 | 含义 |
| --- | --- |
| HR 内核 | 两种模式共同复用，不复制业务逻辑 |
| 共享基础能力 | 身份、权限、审计、消息、文件、配置等，可经端口/适配器在两种模式复用 |
| 园区业务耦合 | 物业、资产、租赁、设备、安全、工单或“必须有 park”语义，独立模式必须切断 |
| 迁移控制面 | 玉舟历史导入与回滚基础设施，独立部署可按需安装，但不得成为日常 HR 启动前提 |

## 3. 真实依赖清单

### 3.1 TypeScript import、Nest 注入与依赖方向

| 依赖方向 | 代码证据 | 判定 | P0 最小动作 |
| --- | --- | --- | --- |
| `HrModule → OrgEntity / UserEntity / UserMessageEntity` | `apps/api/src/modules/hr/hr.module.ts:3-5,36` | 共享基础能力，但 HR 直接持有平台实体 | 先把身份、组织、消息行为抽成 HR 端口；集成适配器仍可复用当前实体 |
| `HrModule → AuditModule` | `apps/api/src/modules/hr/hr.module.ts:6,36` | 可带走的共享基础能力 | 保持审计合同；独立组合根只装载审计叶子模块 |
| `HrModule → PartySensitiveDataService` | `apps/api/src/modules/hr/hr.module.ts:15,36` | 明确园区/物业命名与实现耦合 | 抽出中性的 HR sensitive-data port；现有 service 作为集成适配器或迁移成共享 crypto provider |
| `HrService → OrgEntity / UserEntity / PartySensitiveDataService` | `apps/api/src/modules/hr/hr.service.ts:6-7,12,23-56` | 组织、登录账号、敏感数据三类依赖直接注入主 service | 不改业务方法；先通过 token 注入三个端口，再逐方法收口 |
| `HrLifecycleService / HrRecruitmentService → PartySensitiveDataService` | `apps/api/src/modules/hr/hr-lifecycle.service.ts:9-13,27-31`; `apps/api/src/modules/hr/hr-recruitment.service.ts:3-6,14` | 园区物业模块被 HR 招聘与人员档案启动所必需 | 是首条纵向链的硬阻断，优先替换为同一个 sensitive-data port |
| `HrNotificationService → UserMessageEntity` | `apps/api/src/modules/hr/hr-notification.service.ts:2-8,10-15,23-35` | 消息语义可复用，持久化实现被写死 | 建立 HR notification port；当前 `biz_user_message` 写入作为集成适配器 |
| 多数 HR service → DataSource / raw SQL | 例如 `apps/api/src/modules/hr/hr-performance-evaluation.service.ts:1-22`; `apps/api/src/modules/hr/hr-contract-reminder.service.ts:1-16` | HR 内核仍绑定 TypeORM/PostgreSQL，但这不是园区专属 | 独立模式继续使用 PostgreSQL；P0 不做 repository 大重构，只隔离跨域 SQL |
| Controller → shared decorators/guards | 20 个 HR controller 均带 `@RequireModule("hr")`，例如 `apps/api/src/modules/hr/hr.controller.ts:13`; `apps/api/src/modules/hr/hr-performance-legacy.controller.ts:17-18` | 权限体系可复用，但模块授权查询绑定 SaaS/park | 保留 HR permission code；把“HR 模块是否启用”改由产品模式适配器提供 |

`PartySensitiveDataService` 的加密、解密、指纹和掩码算法本身是通用能力（`apps/api/src/modules/property-operations/party-sensitive-data.service.ts:8-109`），问题在于它位于物业域、读取 `PARTY_DATA_*` 配置，且综合 `AppModule` 在启动校验里直接调用物业 keyring（`apps/api/src/app.module.ts:83,93-96`）。最小修改应是移动/包装为共享的 sensitive-data provider 并保留旧 token 兼容，而不是重写算法或迁移密文格式。

### 3.2 raw SQL 的跨域依赖

| 非 `hr_*` 对象 | 依赖方向与代表证据 | 业务含义 | 判定 |
| --- | --- | --- | --- |
| `sys_org` | HR 读取组织树、负责人和部门名称：`apps/api/src/modules/hr/hr-access-policy.ts:12-20`; `apps/api/src/modules/hr/hr-job-change.service.ts:18,26,36-37,75,79,83` | 部门树、主管数据范围、岗位归属 | 企业 HR 必需；现有表/服务的 park 语义必须经组织适配器解耦 |
| `sys_user` | 员工登录关联、审批/校准参与者与提醒接收者：`apps/api/src/modules/hr/hr-lifecycle.service.ts:454`; `apps/api/src/modules/hr/hr-performance-evaluation.service.ts:27,33`; `apps/api/src/modules/hr/hr-contract-reminder.service.ts:57-62` | 登录主体，不等于员工主体 | 企业基础能力可带走；必须保持 employee identity 与 login identity 分离 |
| `rel_user_role`, `sys_role`, `rel_role_perm`, `sys_permission` | 奖惩审批人按有效权限求解：`apps/api/src/modules/hr/hr-rewards.service.ts:413-440`; 合同提醒按角色求接收人：`apps/api/src/modules/hr/hr-contract-reminder.service.ts:57-60` | RBAC 与任务路由 | 可带走的企业基础能力；不可依赖园区角色种子才能启动 |
| `biz_user_message` | 生命周期、绩效、培训、奖惩直接插表，例如 `apps/api/src/modules/hr/hr-performance-evaluation.service.ts:22`; `apps/api/src/modules/hr/hr-training.service.ts:65`; `apps/api/src/modules/hr/hr-lifecycle.service.ts:496,537` | 站内信/待办 | 语义可带走，实现必须封装；独立模式不能为消息而装载完整 WorkflowModule |
| `sys_file` | 培训证书、奖惩证据直接校验文件表：`apps/api/src/modules/hr/hr-training.service.ts:71`; `apps/api/src/modules/hr/hr-rewards.service.ts:149,385` | 文件元数据与业务引用 | 文件基础能力可带走；访问判定需拆出 HR 专用策略 |
| `migration_batch`, `migration_batch_item`, `legacy_record_map` | 历史关系/档案 API 与迁移表建立证据绑定，例如 `apps/api/src/modules/hr/hr-performance-legacy-relations.service.ts:215,223`; `database/migrations/000235_hr_legacy_migration_control.sql:43-88` | 玉舟迁移审计与回滚 | 迁移控制面；可随 HR 数据包安装，但不能要求普通新企业先有旧系统批次 |

静态扫描没有发现 HR runtime service 直接查询资产、租赁、楼宇、设备或安全业务表。真正的园区耦合主要通过 `PartySensitiveDataService`、`TenantParkScope`、综合 modules 和文件/消息基础模块的反向依赖进入。

### 3.3 数据库 FK 与作用域

1. HR TypeORM 实体主要继承 `AuditableEntity`；该基类强制每条记录带 `tenant_id` 和 `park_id`（`apps/api/src/shared/entities/auditable.entity.ts:3-11`）。部分迁移/历史实体又显式重复该作用域。`TenantParkScope` 类型也只有 `tenantId + parkId`（`packages/shared/src/index.ts:22-25`）。这证明“企业作用域”目前没有独立表达。
2. 首个 HR 基础迁移把岗位和员工 FK 直接指向 `sys_org`、`sys_user`，员工文档 FK 指向 `sys_file`（`database/migrations/000230_hr_employee_foundation.sql:2-19`）。全量静态 FK 扫描在含 HR 对象的迁移中还识别出：`sys_user` 79 处、`sys_org` 7 处、`sys_file` 4 处，以及迁移控制表 `migration_batch` 23 处、`legacy_record_map` 12 处。该数字仅用于定位耦合面，不是运行完整度评分。
3. 当前迁移和函数普遍工作在 `public` search path，例如 `database/migrations/000300_hr_performance_yuzhou_legacy_model.sql:265,301,349,361,402`；没有生产 HR 专属 schema/connection 的应用配置。`TypeOrmModule` 使用单个连接、`autoLoadEntities: true` 和默认数据库 `jinhu_smart_park`（`apps/api/src/app.module.ts:135-146`）。
4. 通用 `scripts/db-migrate.sh` 默认扫描整个 `database/migrations` 目录并记录到 public migration history（`scripts/db-migrate.sh:4-20,420-428`）；独立 HR 目前没有可验证的最小迁移 manifest。因此即使另配数据库，仅改 `POSTGRES_DB` 也可能把整个园区 schema 装进去。

最小边界不是立即把 71 个已映射实体全部改 schema。P0/P1 应先建立“独立 composition root + HR migration manifest + scope adapter”的可运行合同；P2 再以 forward-only 迁移把 HR 数据区和共享企业基础表打包到专用数据库/专用 schema，并验证搬迁。

### 3.4 API 启动与全局基础设施

当前只有 `apps/api/src/main.ts`，并固定 `NestFactory.create(AppModule)`（`apps/api/src/main.ts:1-10`）。综合 `AppModule` 同时装载：

- HR：`apps/api/src/app.module.ts:164`；
- 资产、租赁、物业、IoT、工单、安全等园区业务：`apps/api/src/app.module.ts:148-211`；
- 单一 Config/CLS/Schedule/TypeORM：`apps/api/src/app.module.ts:120-146`；
- 全局 auth、permission、module、idempotency、**PropertyHighRiskActionGuard**、audit 和 response：`apps/api/src/app.module.ts:213-255`。

所以“只访问 `/hr` 路由”并不会减少启动依赖；整个综合 provider graph 已被创建。独立入口应复用通用 bootstrap 函数，但创建独立的 HR composition root，只装载：Config、CLS、TypeORM、认证/RBAC 叶子能力、审计、HR 文件/消息适配器和 `HrModule`。PropertyHighRiskActionGuard 不应进入独立 root。

认证模块也不能直接视为叶子模块：`AuthModule` 依赖 `TenantsModule` 与 `UsersModule`（`apps/api/src/modules/auth/auth.module.ts:21-46`）；`UsersModule` 又直接注册 ParkEntity、SaaSModules、DataScopes、FieldPolicies 等（`apps/api/src/modules/users/users.module.ts:1-29`）。P0 必须先画出并验证 HR standalone 所需的最小 identity/RBAC provider 集，而不是把 `AuthModule + UsersModule` 整包复制。

### 3.5 Web layout、权限与会话

| 现状 | 代码证据 | 独立模式影响 |
| --- | --- | --- |
| HR layout 固定包裹综合 Dashboard | `apps/web/app/hr/layout.tsx:1-5` | 独立品牌/导航无法注入 |
| Dashboard 强制读取综合用户、菜单和园区切换 | `apps/web/components/layout/DashboardLayout.tsx:6-29,46-58,76-110,126-175` | standalone 仍要求 park context，并带园区恢复行为 |
| Dashboard 固定渲染综合 Header/Sidebar、管理员问题反馈 | `apps/web/components/layout/DashboardLayout.tsx:188-223` | 会暴露非 HR 导航/依赖非 HR API |
| UserContext 强制 `tenant_id`、`park_id`、current/access parks、enabled modules | `packages/shared/src/index.ts:290-318` | 缺少 company/operating-unit 的中性 session contract |
| 前端权限同时检查 permission 与 module assignment | `apps/web/lib/permissions.ts:19-53` | standalone 若无 SaaS module assignment 将被拒绝 |
| HR 菜单已集中为一棵子树 | `apps/web/lib/menu.ts:314-336` | 可复用；应由两种 shell 消费同一菜单定义 |
| API client 已允许配置 prefix | `apps/web/lib/api-client.ts:1-5,30-56` | 可带走；不需要复制 HR clients |
| session 工具含物业离线数据清理和 park 切换状态 | `apps/web/lib/auth.ts:3-18,51-70,107-120` | standalone shell 不能直接复用完整综合 session side effects |

因此最小前端实现是新增 mode-aware shell/context，并继续复用现有 `/hr/**` 页面和 API client；不是复制一套页面。独立 shell 只发布 HR 菜单、企业品牌、HR notification 入口和中性 scope switch（若企业确有多经营单元），集成 shell 保持现状。

### 3.6 文件、消息与审计

**文件。** HR Web 已复用 `FileUploader` / `AttachmentList`（例如 `apps/web/app/hr/employees/HrEmployeesClient.tsx:7-8,84`），API 文件控制器也声明 HR 文件权限（`apps/api/src/modules/files/files.controller.ts:42-48,58-127`）。但 `FilesModule` 直接 `forwardRef(PropertyOperationsModule)`（`apps/api/src/modules/files/files.module.ts:1-18`），`FileBusinessAccessService` 同时注入 `PropertyUnitAccessService` 并混合物业和 HR biz type（`apps/api/src/modules/files/file-business-access.service.ts:1-32,99-105,144-168`）。所以应拆“通用文件存储 + HR 文件访问策略”叶子组合，不能为了 HR 附件启动 PropertyOperationsModule。存储 provider 本身只依赖配置并限制根路径（`apps/api/src/modules/files/storage/local-file-storage.provider.ts:8-44`），可复用到独立模式并配置 HR 专用根/对象存储。

**消息。** `WorkflowModule` 同时注册 WorkOrder、SafetyInspectTask 和 UserMessage 实体（`apps/api/src/modules/workflow/workflow.module.ts:1-15`），而 HR 自身既通过 `HrNotificationService` 写 `UserMessageEntity`，又有多个 service 直接插入 `biz_user_message`。应先提供 notification port + 仅 UserMessage 的 adapter；独立模式不能装载完整 WorkflowModule。

**审计。** `AuditModule` 仅注册审计实体、controller 和 service（`apps/api/src/modules/audit/audit.module.ts:1-14`），是较干净的共享能力。HR 对敏感读取明确记录 tenant/park、用户、字段组、投影和数量（`apps/api/src/modules/hr/hr-sensitive-read-audit.ts:25-49`）。独立适配时应保持这些字段的审计语义，把 scope 由 adapter 提供，不能删掉审计或降级成普通日志。

### 3.7 后台任务

静态扫描在非测试 HR TypeScript 中没有发现 `@Cron`、`@Interval`、`@Timeout`、`OnModuleInit` 或 `setInterval`。劳动合同提醒、培训逾期提醒目前是显式 service/controller 动作：`HrContractReminderService.run` 在 `apps/api/src/modules/hr/hr-contract-reminder.service.ts:42-77`；培训逾期提醒在 `apps/api/src/modules/hr/hr-training.service.ts:78`。

这意味着第一条独立纵向链不需要后台 worker；但综合 `AppModule` 总是启动 `ScheduleModule.forRoot()`（`apps/api/src/app.module.ts:133`），并装载所有园区模块。独立 composition root 应只在未来确有 HR job 时注册 HR 调度，不得通过装载综合 AppModule 获得调度能力。

### 3.8 配置与部署边界

- API 只有一套数据库配置：`POSTGRES_*`，默认 DB 为 `jinhu_smart_park`（`apps/api/src/app.module.ts:135-146`; `.env.example:11`; `.env.production.example:44`）。没有 `HR_PRODUCT_MODE`、`HR_POSTGRES_*` 或第二入口。
- Web 只有 `NEXT_PUBLIC_API_PREFIX` 可切换后端路径（`apps/web/lib/api-client.ts:4`; `.env.production.example:15-16`），没有 HR shell/branding mode。
- 文件根可通过 `FILE_STORAGE_LOCAL_ROOT` 配置（`.env.production.example:127`），但当前不是 HR 专属。
- 敏感数据依赖 `PARTY_DATA_*` 名称（`.env.production.example:162-165`），需要兼容迁移到中性命名；不得直接删除旧配置兼容。
- `apps/api/package.json:6-9` 只有默认 Nest start/build；根脚本 `package.json:7-10` 也只有综合 dev/build，没有 standalone start 命令。

## 4. 哪些能力可带走，哪些必须解耦

### 4.1 可复用，但应以叶子能力或适配器带走

1. `apps/api/src/modules/hr/**` 的 HR 业务实体、规则、服务和 controller。
2. `packages/shared/src/hr.ts` 的 HR 权限常量、访问矩阵与业务类型；权限码在两种模式保持一致。
3. JWT、密码登录、用户、角色、权限、审计的业务语义；先抽最小 provider set，不整包带走当前强耦合模块。
4. `sys_file` 元数据模型、文件存储 provider、上传安全规则；通过 HR access policy 组合。
5. `biz_user_message` 的消息模型和幂等键语义；通过 HR notification adapter 组合。
6. 玉舟 legacy/record-map/migration control 表与函数，作为历史迁移可选包，保持回执、漂移拒绝和回滚能力。
7. 现有 HR Web 页面、组件、API client、HR 菜单子树和响应式设计；只替换外层 shell/session/scope provider。

### 4.2 Smart Park 集成模式保留、独立模式必须切断

1. `PropertyOperationsModule`、`PartySensitiveDataService` 的域位置和 `PropertyHighRiskActionGuard`。
2. FilesModule → PropertyOperationsModule 与 FileBusinessAccessService → PropertyUnitAccessService 的依赖。
3. WorkflowModule → WorkOrder/SafetyInspectTask 的依赖。
4. 综合 AppModule 中资产、招商、租赁、物业、楼宇、IoT、工程、安全、工单等模块。
5. DashboardLayout 的园区选择、园区角色恢复、综合菜单、工单收件箱和管理员问题反馈。
6. 把 `park_id` 当企业存在前提的认证、模块授权、组织树和数据范围逻辑。独立企业无需伪造园区；需要明确企业/经营单元 scope 映射。

## 5. 最短可实现的独立启动纵向链

原则：不复制 HR 内核、不拆微服务、不先重构全部 71 个实体；每步必须有可运行合同。

| 顺序 | 最小切片 | 精确改动所有权（建议） | 通过条件 |
| --- | --- | --- | --- |
| 1 | 双模式 composition contract | `apps/api/src/hr-standalone-app.module.ts`、`apps/api/src/main-hr-standalone.ts`、`apps/api/src/bootstrap.ts`；专项测试放 `apps/api/src/hr-standalone-app.module.spec.ts` | standalone provider graph 可创建；模块列表不含 assets/leasing/property/iot/safety/work-orders；integrated 仍用原 AppModule |
| 2 | 中性企业 scope + identity/RBAC 最小适配 | 新合同归 `apps/api/src/modules/hr/platform/`；集成 adapter 归同目录；共享类型归 `packages/shared/src/hr-product-mode.ts` | 登录能生成企业 scope；employee 与 login 可为空/可关联；不要求创建伪 park；HR permissions 与 module entitlement 可判定 |
| 3 | 敏感数据、审计、通知端口 | HR port 位于 `apps/api/src/modules/hr/platform/`；通用 crypto 可迁至 `apps/api/src/shared/security/` 并保留旧 provider alias | 员工敏感字段可安全写读并审计；一条审批能发消息；不加载 PropertyOperations/Workflow 完整模块 |
| 4 | HR 文件叶子组合 | 通用存储保持 `apps/api/src/modules/files/storage/`；HR access adapter 独立文件；FilesModule 分 composition | 一份 HR 附件元数据可上传/授权读取；standalone graph 不含 PropertyUnitAccessService |
| 5 | 独立迁移 manifest / 数据区 | 新 manifest/runner 归 `database/hr-manifest/` 与 `scripts/hr-standalone/`；数据库变化只用新 forward migration | 空 PostgreSQL 可只安装企业基础 + HR + 可选 legacy 包；不创建园区业务表；迁移可重跑/校验 checksum |
| 6 | 双模式 Web shell | mode contract 归 `apps/web/lib/hr-product-mode.ts`；shell 归 `apps/web/components/hr-shell/`；现有 `apps/web/app/hr/**` 页面保持共享 | standalone 只显示 HR 菜单/品牌，不调用 park switch、property offline cleanup、workorder inbox；integrated UI 不回归 |
| 7 | 首条纵向 UAT | `scripts/e2e/hr-standalone-vertical-smoke.mjs` 及合成 fixture | 独立进程完成登录 → 员工档案 → 一条审批 → 历史回读 → 审计，且进程/数据库/文件根可单独迁移 |

切片 1 与 2 是下一步；如果不先建立真实 standalone provider graph，后续每个“已解耦”结论仍只是静态推测。

## 6. 动态未决项（必须 fail-closed）

1. Nest 运行时 provider graph 是否还经 Auth/Users/Files 间接实例化 Parks、SaaSModules、PropertyOperations；静态 import 不能证明最终实例化集合。
2. 从零 PostgreSQL 的最小 HR migration closure 尚未求出；FK、函数、extension、触发器和 grant 可能还有隐式前置。
3. `TenantParkScope` 向企业/经营单元 scope 的兼容策略尚无数据模型和 HTTP 合同；不能用固定假 park 代替。
4. 独立登录需要的 tenant activation、role assignment、module entitlement 最小表集尚未通过启动测试。
5. 文件保存、下载授权、消息投递、审计失败策略尚未在独立 graph 中执行验证。
6. Web standalone shell 的 390px、无综合菜单、无园区切换副作用尚未做浏览器验收。
7. 独立数据库/文件根的备份、恢复、迁移搬运和版本升级尚未演练。
8. 本盘点没有证明所有玉舟 M0-M5 功能等价；产品独立性 P0-P4 与兼容复现 M0-M5 必须分别完成后才能称为最终完成。

## 7. 可重跑的静态复核

以下命令均从仓库根运行，只扫描受 Git 管理的源码/示例配置，不读取 `.env`、业务数据或二进制：

```sh
git rev-parse HEAD
git status --short
rg -n '^import .*\.\./' apps/api/src/modules/hr --glob '*.ts' -g '!*.spec.ts'
rg -n 'sys_org|sys_user|sys_file|biz_user_message|rel_user_role|sys_role|rel_role_perm|sys_permission|migration_batch|legacy_record_map' apps/api/src/modules/hr --glob '*.ts' -g '!*.spec.ts'
rg -n 'REFERENCES\s+(sys_|migration_|legacy_)' database/migrations --glob '*.sql' | rg 'hr_|yuzhou'
rg -n '@Cron|@Interval|@Timeout|OnModuleInit|setInterval' apps/api/src/modules/hr --glob '*.ts' -g '!*.spec.ts'
rg -n 'standalone|integrated|HR_MODE|PRODUCT_MODE|APP_MODE' apps/api apps/web packages .env.example .env.production.example --glob '*.ts' --glob '*.tsx' --glob '*.json' --glob '*.example'
rg -n '"/hr|module: "hr"|HR_PERMISSIONS' apps/web/lib/menu.ts apps/web/app/hr apps/web/components/layout --glob '*.ts' --glob '*.tsx'
```

复核必须同时查看具体 import、注入、SQL、FK 和 composition root；不得用上述命中数量替代运行验收。

## 8. 下一最小切片

基于本清单，下一切片应只做 **standalone composition contract + sensitive-data 首个端口**：

1. 先写 provider-graph 合同，明确独立模式允许/禁止的模块集合。
2. 把 `PartySensitiveDataService` 从 HR 的直接依赖替换为中性 token，集成 adapter 保持当前密文兼容。
3. 创建最小 standalone root，只挂登录所需叶子 provider、审计与员工档案读路径。
4. 用空的合成 PostgreSQL 验证启动与“登录 → 本人档案读取 → 审计”；不接真实生产、不导入历史数据。

完成这条链后，再按相同方式接审批、消息、文件和独立 migration manifest。这样每个解耦动作都有运行证据，也避免先做大规模抽象再发现 provider graph 仍被园区模块拉起。
