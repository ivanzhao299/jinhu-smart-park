# HR 独立运行最小登录→本人档案→审计链设计

## 1. 结论与边界

本文是只读代码盘点后的最小实施设计，不是独立运行完成声明。基线为
`origin/main@b0b14ce191abcf7f9da5e467b850ba84addddbde`；同时参考 PR #618 的候选提交
`288ae62d0fa514a0ca45681d40a9f345739c1ccf`。#618 已把 HR 使用的敏感数据服务和
keyring 实现移到 `apps/api/src/shared/security/`，但本文不修改、复制或回退该候选。

真正独立的 HR 首个纵向闭环应当是：

1. 独立 HR 组合根启动真实 Auth、RBAC、员工本人档案、审计和数据库连接，而不是只启动空控制器；
2. 密码登录解析出一个真实、启用的 `enterprise` 业务作用域；
3. JWT、刷新令牌及每次请求都绑定同一个租户和业务作用域；
4. `GET /hr/employees/me/profile` 仍执行现有 HR 本人权限、员工关联、掩码投影和敏感读取审计；
5. 必达审计写入成功后才返回本人档案；
6. 同一套 HR 业务服务也继续服务 Smart Park 的真实 `park` 作用域。

不接受以下捷径：

- 为独立企业创建假的 `biz_park`；
- 把企业作用域 ID 填进 `park_id`，或使用固定 UUID、`0`、`unknown` 作为业务事实；
- 只把 `TenantParkScope` 重命名而保留所有 park 查询语义；
- 建第二套 HR 实体、服务或路由；
- 只证明 Nest 容器能 compile，却不证明真实登录、本人档案、权限和审计；
- 让独立 HR 运行时依赖物业、资产、租赁、IoT、工单等模块或其数据库事实。

## 2. 当前硬阻断（代码事实）

### 2.1 作用域合同把园区写死

- `packages/shared/src/index.ts:22-25` 的 `TenantParkScope` 强制 `tenantId + parkId`。
- `apps/api/src/shared/types/jwt-principal.ts:1-20` 的 principal 和 session claims 都强制
  `parkId`。
- `apps/api/src/shared/decorators/current-scope.decorator.ts:6-11` 只能从 JWT 生成
  `TenantParkScope`。
- `apps/api/src/shared/entities/auditable.entity.ts:3-11` 让所有继承者的 `park_id` 非空。
- `packages/shared/src/index.ts:290-317` 的 `UserContext` 必须返回 `park_id`，并围绕
  `accessible_parks/current_park` 建模。

这意味着企业独立运行目前没有合法的请求作用域表达方式。

### 2.2 principal 解析要求真实园区

`apps/api/src/modules/users/users.service.ts:722-831` 的 `resolveJwtPrincipal`：

- 按 `$3 = parkId` 连接 `rel_user_role` 和 `rel_role_perm`；
- 用 `rel_user_park` 判断访问权；
- 在 `:825-829` 强制存在启用的 `biz_park`。

所以“不接入园区业务但复用当前 JWT”在代码上不可成立。伪造 park 只会隐藏这个阻断，
并让 RBAC、审计和 HR 数据获得错误的园区归属。

### 2.3 Auth 的可复用逻辑被大模块依赖拖住

- `apps/api/src/modules/auth/auth.module.ts:21-46` 同时导入 `TenantsModule` 和
  `UsersModule`。
- `apps/api/src/modules/tenants/tenants.module.ts:20-41` 导入 `FilesModule`；
  `apps/api/src/modules/files/files.module.ts:13-17` 又导入 `PropertyOperationsModule`。
- `apps/api/src/modules/users/users.module.ts:19-29` 导入 Parks、SaaSModules、DataScopes、
  FieldPolicies 和 Roles 的完整管理图。
- 实际租户状态判断本身只查询 `TenantEntity`
  （`apps/api/src/modules/tenants/tenants.service.ts:205-216`），却被
  `TenantsService` 构造函数的 Files/DataSource 等依赖绑在大图中
  （`:125-134`）。

密码登录已有应保留的真实安全行为：候选查找、密码校验、锁定、租户状态校验、重复上下文
处理、刷新令牌、`auth_version` 撤销和登录审计
（`apps/api/src/modules/auth/auth.service.ts:128-305,843-901`）。设计只拆依赖，不复制这些规则。

### 2.4 数据库存储把 park 当作所有业务记录的必填列

当前迁移链明确存在以下事实：

- `database/migrations/000001_init_auth.sql:3-137`：用户、角色、权限、绑定、登录日志和
  操作日志均为 `tenant_id + park_id NOT NULL`；
- `database/migrations/000002_s1_system_foundation.sql:11-63`：组织、岗位和用户组织关系也
  是 `park_id NOT NULL`；
- `database/migrations/000019_rel_user_park.sql:1-28`：用户上下文成员关系就是
  `rel_user_park`；
- `database/migrations/000204_org_hierarchy_integrity.sql:64-82`：组织树完整性按
  `(tenant_id, park_id)` 加固；
- `database/migrations/000230_hr_employee_foundation.sql:2-20`：职位、员工、员工档案及
  其他 HR 基础记录都要求 `park_id NOT NULL`；
- `apps/api/src/modules/hr/entities/hr.entities.ts:24-45` 中员工和档案继续继承这一实体合同。

`database/migrations/000018_sys_tenant.sql:3-4` 中 `sys_tenant.park_id='0'` 是租户元数据的
历史默认值，不是可供企业 HR 使用的真实业务作用域，不能拿来代替企业范围。

### 2.5 本人档案业务链已经存在，不应重写

- 路由仍应使用精确权限 `hr:employee_profile:self_read`
  （`apps/api/src/modules/hr/hr.controller.ts:13-24`、
  `packages/shared/src/hr.ts:30-33,76-100`）。
- `apps/api/src/modules/hr/hr.service.ts:71` 用登录用户 ID 找员工；`:164-165` 复用同一个
  档案读取路径。
- `apps/api/src/modules/hr/hr.service.ts:536-544` 先做访问判定和显式字段投影，再调用必达
  敏感读取审计。
- `apps/api/src/modules/hr/hr-access-policy.ts:153-162,205-239` 已实现本人/团队/管理者权限和
  掩码投影。
- `apps/api/src/modules/hr/hr-sensitive-read-audit.ts:25-49` 只把字段组和投影写入审计，
  不应写入敏感字段值。
- `apps/api/src/modules/audit/audit.service.ts:120-148` 的 `recordOperationRequired` 会把审计
  保存失败传回调用者，这是“先审计成功、后返回档案”的关键边界。

因此 P1 只应把上述链的作用域输入改成中性合同，不应另建 `StandaloneHrService`。

当前也不能为了省事直接把完整 `HrModule` 当作最小依赖：
`apps/api/src/modules/hr/hr.module.ts:3-36` 注册完整 HR controllers/providers 和
`UserMessageEntity`，`apps/api/src/modules/hr/hr-notification.service.ts:7-14` 直接从 workflow
目录注入消息实体；`HrService` 构造函数也依赖大量与本人档案无关的 HR repository
（`apps/api/src/modules/hr/hr.service.ts:23-56`）。这虽然没有直接导入 `WorkflowModule`，仍会要求
独立数据库携带工作流消息表，并扩大启动闭包。首个纵向链应从现有实现中提取真实的本人档案
叶服务，由现有完整 `HrModule` 同样复用；这属于移动业务逻辑，不是创建第二套内核。

## 3. 权威业务作用域合同

### 3.1 新的领域类型

新增中性合同（建议名，最终命名可按代码规范调整）：

```ts
type BusinessScopeKind = "park" | "enterprise";

interface BusinessScopeContext {
  tenantId: string;
  scopeId: string;
  scopeKind: BusinessScopeKind;
  parkId: string | null;
}
```

不使用只有 `scopeId` 的弱类型。`scopeKind` 和可空的真实 `parkId` 必须一起由服务端从数据库
解析，客户端不能自行声明。约束为：

- `park`：`parkId` 必须非空，且对应同租户启用的真实 `biz_park`；
- `enterprise`：`parkId` 必须为 `NULL`，不允许回退到默认园区；
- 所有查询首先匹配 `(tenant_id, scope_id)`；只有明确调用 park-only 适配器时才使用
  `park_id`。

保留 `TenantParkScope` 作为 Smart Park 旧调用面的兼容类型。新增唯一的 fail-closed 适配器：

```ts
toTenantParkScope(scope: BusinessScopeContext): TenantParkScope
```

它仅在 `scopeKind === "park"` 且 `parkId` 已被权威解析时返回；企业作用域调用时直接拒绝，
绝不生成默认值。

### 3.2 权威持久化模型

后续应通过未编号、前向迁移新增两类事实表；本文不预留迁移编号、不写 SQL：

1. `sys_business_scope`
   - `id`（`scope_id`）、`tenant_id`、`scope_kind`、`park_id NULL`、`scope_code`、
     `scope_name`、`status` 和审计列；
   - `(tenant_id,id)` 唯一；
   - 每个真实 park 最多一个活动的 park scope；
   - 企业根 scope 的 `park_id IS NULL`；
   - park scope 必须引用同租户真实 park；
   - 不能把 `sys_tenant.park_id='0'` 当外键目标。
2. `rel_user_business_scope`
   - `tenant_id,scope_id,user_id,status,is_default` 和审计列；
   - 同租户同 scope 同用户活动关系唯一；
   - 一个用户在同一产品登录范围内最多一个活动默认 scope；
   - 用户、scope 和绑定必须属于同一租户。

模块可用性也要有 scope 事实，不能在代码中因“独立版”而无条件放行：

- 新的中性 `rel_business_scope_module(tenant_id,scope_id,module_code,status)` 可作为共同授权源；
- park 集成模式可由迁移把当前已启用模块映射到对应 park scope；
- 独立 HR 安装必须显式存在活动的 `hr` 授权关系；
- 模块授权只说明产品能力开启，不代替 RBAC 权限。

### 3.3 现有 `park_id NOT NULL` 的前向兼容方式

必须采用“新增真实 scope、回填验证、双约束过渡、最后放宽 park”的顺序，不能全库直接把
`park_id` 改成 nullable：

1. 新增 `scope_id`，最初允许为空；
2. 为每个现有真实 park 创建一对一 park scope；
3. 按 `(tenant_id,park_id)` 回填现有记录的 `scope_id`；任何无 park、重复映射或跨租户映射
   都应 fail closed；
4. 对迁移闭包建立 `(tenant_id,scope_id)` 外键和 scope 化唯一索引；
5. 所有写路径先双写 `scope_id` 和原 `park_id`，并用数据库约束触发器验证：park scope 的
   `park_id` 必须等于 scope 的真实 park，enterprise scope 的 `park_id` 必须为 NULL；
6. 只有回填守恒和双写验证通过后，才在迁移闭包中把 `park_id` 放宽为 nullable；
7. 应用查询切换到 `(tenant_id,scope_id)` 后，旧 park 查询只留在适配器和未迁移模块中。

不能仅依靠普通 `CHECK` 去查另一张表；跨表一致性需要复合外键能表达的部分加上受测的约束
触发器。不得在应用层静默修正冲突。

首个闭环的最小迁移闭包如下。缺少任何一项都不能声称纵向链成立：

| 事实 | 表/实体 | 为什么必须一起迁移 |
|---|---|---|
| 作用域和成员 | `sys_business_scope`, `rel_user_business_scope` | 登录和请求的权威范围 |
| 用户 | `sys_user` | 用户默认 scope、锁定、状态和用户名唯一性；`sys_user` 保存 `default_scope_id`，多 scope 成员关系仍在关系表 |
| RBAC | `sys_role`, `sys_permission`, `rel_user_role`, `rel_role_perm` | principal 权限必须与请求 scope 同域；角色/权限定义的 tenant/platform 语义与 scope 绑定需要分开建模 |
| 会话 | `sys_auth_refresh_token`, 密码身份所需的 `sys_user_identity` | access/refresh token 必须绑定同一 scope |
| 组织 | `sys_org`, `rel_user_org` | 员工主组织及后续 managed-org-tree 必须同 scope；不能跨域挂接 |
| HR 本人档案 | `hr_employee`, `hr_employee_profile` | `user_id` 关联和敏感档案读取 |
| 审计 | `sys_login_log`, `sys_op_log` | 登录事件和本人档案必达审计不能落到假 park |

职位对“本人档案读取”不是强制依赖，因为 `hr_employee.position_id` 可空；如果验收夹具设置职位，
则 `hr_position` 也必须纳入同一次 scope 闭包，不能留下跨 scope 外键。员工主组织同理可空，但
首个企业验收夹具应创建一个真实企业根组织，证明 Org 不是靠假 park 工作。

不应立即修改共享 `AuditableEntity` 并让全仓所有表一起变更。P1 只在上述迁移闭包的具体实体
上显式增加 `scopeId` 和 nullable `parkId`，或引入仅由这些实体继承的
`BusinessScopedAuditableEntity`；旧 `AuditableEntity` 继续服务未迁移的 park-only 模块。
后续每个 HR 域迁移完成后再扩大闭包。

RBAC 不能把当前的 `role_scope` 语义误删。现有角色和权限定义已经按租户唯一
（`database/migrations/000023_sys_role_open_rbac_contract.sql:50-69`、
`database/migrations/000024_sys_permission_open_model_contract.sql:38-63`）。因此：

- `sys_role/sys_permission` 作为 tenant/platform 定义时允许 `scope_id IS NULL`；
- 现有 park 专属角色定义迁移为真实 park scope 时必须带 `scope_id`；
- `rel_user_role` 与 `rel_role_perm` 的有效授权绑定必须带非空 `scope_id`，principal 只读取当前
  scope 的绑定；
- tenant/platform 角色可在多个真实业务 scope 被绑定，但不会因此绕过 scope membership；
- protected tenant-super 规则保留，不过它只能访问数据库中真实存在且已授权的 scope，不能
  合成 enterprise 或 park。

`sys_login_log` 是唯一需要区别处理的审计表。失败登录可能在识别出 tenant/scope 前发生，当前
代码会写入字符串 `unknown`（`apps/api/src/modules/auth/auth.service.ts:145-151`），这同样是伪
作用域。前向合同应允许“预认证失败事件”的 `tenant_id/scope_id/park_id` 全部为 NULL，但同时
强制 `user_id IS NULL AND result='fail'`；一旦识别出用户或登录成功，tenant/scope 必须完整且
相互一致。不得以 `unknown`、`0` 或固定 UUID 填空。`sys_op_log` 属于已认证业务审计，
`tenant_id/scope_id` 始终非空。

## 4. 最小 provider 切分

### 4.1 `TenantStatusService`（纯租户状态）

从 `TenantsService.assertTenantActive` 提取为只依赖 `TenantEntity` repository 的小服务。
`TenantsService` 委托它，Auth/JWT 直接依赖它。这样保留租户停用/到期规则，又不把
Files→Property 图带入独立 HR。

建议文件所有权：

- 新增 `apps/api/src/modules/tenants/tenant-status.service.ts`
- 新增 `apps/api/src/modules/tenants/tenant-status.module.ts`
- 最小调整 `apps/api/src/modules/tenants/tenants.service.ts`
- 最小调整 `apps/api/src/modules/tenants/tenants.module.ts`

### 4.2 `BusinessScopeResolver`

只依赖作用域、用户成员关系和（park scope 时）Park existence port：

- 按登录候选解析唯一活动 scope；
- 按 JWT claims 重新解析 scope，不信任 token 中的 `scopeKind/parkId`；
- 校验租户、用户、scope、成员关系和模块授权；
- 生成 `BusinessScopeContext`；
- 企业 scope 永远不查询/创建 `biz_park`。

建议新模块：`apps/api/src/modules/business-scopes/`，独占其 entity、service、module 和
park-only adapter。`ParksModule` 只在 Smart Park 组合根提供 park existence adapter；独立组合
根不导入 ParksModule。

### 4.3 `IdentityDirectoryService`（Auth 所需的用户/RBAC 叶节点）

从 `UsersService` 提取以下已有实现，`UsersService` 再委托它，避免第二套身份/RBAC 内核：

- scoped/unscoped 登录候选查询；
- 密码锁定状态读取和原子更新；
- 成功登录记录；
- 根据 `(tenantId,scopeId,userId)` 解析活动角色、权限、data scope 和 `auth_version`；
- 创建刷新令牌所需的用户/scope 上下文。

它不得依赖 Parks、SaaSModules、DataScopes 管理 UI、FieldPolicies 管理 UI 或 Org 管理服务。
精确权限计算保留当前 active/deleted/enabled、tenant-super 保护和角色层级规则，只把 park join
换成 scope join。

建议文件所有权：

- 新增 `apps/api/src/modules/users/identity-directory.service.ts`
- 新增 `apps/api/src/modules/users/identity-directory.module.ts`
- 最小调整 `apps/api/src/modules/users/users.service.ts` 和 `users.module.ts` 使管理面委托叶服务
- 调整 `apps/api/src/modules/auth/auth.module.ts` 只导入 identity、tenant status、scope 和 audit

### 4.4 `ProductEntitlementPort`

`apps/api/src/shared/guards/module.guard.ts:11-50` 当前直接依赖
`SaaSModulesService.listEnabledModulesForTenant(tenantId,parkId)`。改为注入中性 port：

```ts
listEnabledModules(scope: BusinessScopeContext): Promise<readonly string[]>
```

共同实现读取 `rel_business_scope_module`；Smart Park 可在过渡期使用现有 SaaS 适配器。无授权
记录、scope 不活动或适配器不支持该 kind 均返回拒绝，不能因为启动模式是 HR 就自动授予
`hr`。`PermissionGuard`（`apps/api/src/shared/guards/permission.guard.ts:11-59`）本身只读 JWT
权限，可以继续复用。

### 4.5 Auth/JWT 与审计

- `JwtSessionClaims` 改为包含 `tenantId,scopeId,authVersion`；`scopeKind/parkId` 即使作为展示
  提示也不能成为权威事实。
- `AuthUser/UserContext/LoginContextOption/SelectContextDto/SwitchContextDto` 同步改成中性
  `scopeId/scopeKind/parkId|null` 合同；当前硬编码位置包括
  `packages/shared/src/index.ts:217-235`、`apps/api/src/modules/auth/auth.service.ts:31-47`、
  `apps/api/src/modules/auth/dto/select-context.dto.ts:3-18` 和
  `apps/api/src/modules/auth/dto/switch-context.dto.ts:3-12`。Smart Park 的 park context switch
  由适配器保留，独立企业使用 business-scope switch，不能把 enterprise scope 塞进 `parkId`。
- `JwtStrategy` 每次请求调用 tenant status + scope resolver + identity directory；任何一项失败
  均拒绝。
- refresh token 表和服务保存 `scope_id`；刷新、退出和上下文切换都核对 token、用户和 scope。
- 登录 DTO 可以继续只提交账号/密码；当前 Web 已如此
  （`apps/web/app/login/page.tsx:30-67,104-115`）。唯一候选直接登录；多个真实 scope 时返回通用
  “业务范围选择”，不再把所有上下文叫“园区”。
- `AuditService` 输入和表增加 `scopeId`；`parkId` 只在真实 park scope 时有值。预认证失败
  登录按上一节的 nullable 严格约束落库，不写伪 scope。登录审计继续保留当前 best-effort
  语义，但本人敏感档案审计必须继续使用 `recordOperationRequired`。

### 4.6 HR 和组织

- 从 `HrService` 提取 `HrEmployeeProfileQueryService`，统一拥有现有 `myEmployee`、
  `employeeProfile/myEmployeeProfile/readEmployeeProfile` 及其 access helper，避免本人和管理端出现
  两套投影/审计实现。依赖限于 employee/profile repositories、managed-tree 查询所需 DataSource、
  AuditService、scope 合同和投影策略；full projection 使用 #618 的共享 sensitive-data provider。
- 把 `/hr/employees/me` 与 `/hr/employees/me/profile` 移入
  `HrEmployeeSelfProfileController`，保持原 URL、`@RequireModule("hr")` 和精确权限不变。
- 完整 `HrModule/HrController/HrService` 导入或委托同一查询服务；不得保留第二份本人查询、投影或
  审计逻辑。独立组合根只加载该叶 module，不加载完整 `HrModule` 的消息、招聘、薪资、绩效等
  provider 图。
- 叶 controller/service、`hr-sensitive-read-audit` 和 `hr-access-policy` 接收
  `BusinessScopeContext`，所有本人档案查询以 `(tenantId,scopeId)` 过滤。
- 保留 `hr_employee.user_id` 可空，使“员工业务身份”和“登录身份”仍是两个概念；同一 scope
  内活动的非空 `user_id` 仍必须唯一。
- `sys_org` 的 parent、用户主组织和员工主组织都使用同一 scope 的复合约束；企业根组织是
  真实组织，不是园区占位。
- `managed_org_tree` 的递归 SQL 后续按 `(tenant_id,scope_id)` 迁移；P1 本人档案不借机扩大成
  团队查询改造。
- 使用 #618 的共享 sensitive-data provider，保持 `enc:v1`、keyring 轮换、HMAC 和配置合同；
  不复制 keyring，不重写现有密文。

## 5. 独立组合根不是空壳

新增独立入口（建议 `apps/api/src/standalone-hr-app.module.ts` 和
`apps/api/src/standalone-hr-main.ts`），但它必须加载真实生产代码：

- Config、CLS、TypeORM；
- Auth controller/service、JWT、密码身份和 refresh token；
- TenantStatus、BusinessScope、IdentityDirectory；
- AuditModule；
- 从当前 `HrService/HrController` 提取且被 Smart Park 同样复用的
  `HrEmployeeProfileQueryModule`，以及 #618 共享敏感数据 provider；
- JwtAuthGuard、PermissionGuard、中性 ModuleGuard、IdempotencyKeyGuard、响应/异常处理；
- health/readiness。

`apps/api/src/main.ts:8-30` 的 trust proxy、API prefix、CORS 和 ValidationPipe 初始化，以及
`apps/api/src/app.module.ts:93-115` 的生产认证/keyring 配置校验，应提取成两个组合根共用的
bootstrap/config helper；独立入口不能复制后逐渐漂移，也不能跳过生产安全校验。

它不能加载：Parks 管理、Property、Files/Attachments、Assets、Leasing、IoT、WorkOrders、Safety、
Workflow 及物业高风险 guard。现有 `AppModule` 继续作为 Smart Park 组合根，不需要复制 HR。

`HrEmployeeProfileQueryModule` 必须包含从现有代码移动的真实查询、权限投影和必达审计逻辑，
完整 `HrModule` 也使用它；禁止 mock 或另一份实现。独立组合根通过后只证明“同一 HR 内核的
首个真实纵向切片可独立装配”，不等于全 HR 产品已独立。只有登录→本人档案→审计 E2E 通过
时，才能声称首个纵向链完成，不能由 provider graph compile 单独得出这一结论。

## 6. 实施顺序与文件所有权

以下顺序使每一步都有可验证产物，也降低和当前绩效、迁移 writer/API/Web 分支的冲突：

### P1-A：scope 合同与合成数据库门禁

所有权：

- `packages/shared/src/index.ts` 的中性 scope/UserContext 合同；
- `apps/api/src/modules/business-scopes/**`；
- 上述最小迁移闭包对应的 entities；
- 一个未来分配编号的 forward-only migration 及专用 PostgreSQL 合同测试。

先证明现有 park 数据 1:1 回填、企业 scope 无 park、跨租户/跨 scope/伪 park 写入全部拒绝。
本设计阶段不创建迁移编号。

### P1-B：身份、租户状态、RBAC 和模块授权叶服务

所有权：

- `apps/api/src/modules/tenants/tenant-status*`
- `apps/api/src/modules/users/identity-directory*`
- `apps/api/src/modules/auth/**` 的 scope 接线
- `packages/shared/src/index.ts` 的 `AuthUser/UserContext`，以及 Web `apps/web/lib/auth.ts`、
  `apps/web/app/login/page.tsx` 的中性上下文类型/文案（API 合同冻结后再改）
- `apps/api/src/shared/types/jwt-principal.ts`
- `apps/api/src/shared/decorators/current-scope.decorator.ts` 或新增中性 decorator
- `apps/api/src/shared/guards/module.guard.ts` 和 entitlement port

让现有 Users/Tenants 管理服务委托叶服务，不复制认证或 RBAC SQL。

### P1-C：HR 本人档案、Org 和审计 scope 接线

所有权：

- `apps/api/src/modules/hr/hr.controller.ts`
- `apps/api/src/modules/hr/hr.service.ts`（只改本人档案链所需 scope 查询）
- 新增 `apps/api/src/modules/hr/hr-employee-profile-query.service.ts`
- 新增 `apps/api/src/modules/hr/hr-employee-self.controller.ts`
- 新增 `apps/api/src/modules/hr/hr-employee-profile-query.module.ts`
- `apps/api/src/modules/hr/hr-sensitive-read-audit.ts`
- `apps/api/src/modules/audit/**`
- `apps/api/src/modules/orgs/**` 的 scope 查询和约束接线

把现有本人档案实现移动到叶服务后，旧 service/controller 必须委托或移除重复路由。不得在这
一片修改薪资、绩效、历史迁移 writer、玉舟 record-map 或 workflow 消息行为。

### P1-D：独立组合根和真实 E2E

所有权：

- `apps/api/src/standalone-hr-app.module.ts`
- `apps/api/src/standalone-hr-main.ts`
- package script/config 示例和一份独立运行说明
- 合成 PostgreSQL E2E（登录→本人档案→审计查询/数据库证明）
- Web 登录上下文的中性文案与独立布局配置，只在 API 合同冻结后接线

必须同时跑 Smart Park 集成模式回归，证明真实 park 路径没有退化。

## 7. 必须保持的业务边界

1. 租户停用/过期、用户停用/删除、密码锁定、`auth_version` 撤销、refresh token 撤销继续有效。
2. 用户必须通过活动 scope membership 获得上下文；tenant super 的权限也不能创造不存在的
   enterprise/park scope。
3. 模块授权和 RBAC 权限是两道门，任一缺失都拒绝。
4. `hr_employee.user_id` 的可空语义保留；未关联登录用户时，本人档案返回安全 404。
5. 本人权限不能读取他人档案；越权应返回安全 404/403，不暴露记录存在性。
6. 本人档案继续使用明确 allowlist 和掩码，不能返回密文、fingerprint、源哈希、迁移 ID 或
   未声明字段。
7. 本人敏感读取审计是 fail-closed；审计内容只记资源、字段组、投影、数量和请求上下文，
   不记敏感值。
8. Org parent、user-org、employee-org 不得跨 tenant/scope；企业作用域不改变组织树颗粒度。
9. Smart Park 模式中的真实 park 身份、切园区和现有 RBAC 行为保持兼容。
10. 企业日常运行不依赖玉舟迁移控制表、源备份、生产导入批次或外部迁移授权。

## 8. 验收正例与负例

### 正例

- 从零数据库迁移后创建一个真实企业 tenant、enterprise scope、scope-module(hr)、用户、
  scope membership、HR self 角色/权限、企业根组织、关联员工和档案；不创建 `biz_park`。
- 通过真实 HTTP 密码登录获得绑定该 `scopeId` 的 access/refresh token。
- `GET /auth/me` 返回中性业务范围；enterprise 模式的 `park_id` 为 `null` 或不在新合同中，
  不能出现伪值。
- `GET /hr/employees/me/profile` 返回本人掩码字段，随后能以同一 tenant/scope/request 证明一条
  `sys_op_log`，且审计先于响应成功。
- 同一构建以 Smart Park 组合根启动，真实 park 用户完成相同链且原 park context switch 回归
  通过。

### 必须自动化的负例

1. enterprise scope 带非空 `park_id`，或 park scope 没有同租户真实 park：数据库拒绝。
2. 任何 enterprise scope 调用 `toTenantParkScope`：应用 fail closed；不能返回默认值。
3. JWT 的 tenant/scope 与数据库 membership、refresh token 或用户不一致：认证阶段拒绝，
   HR 查询和审计均不得执行。
4. scope/tenant/user 任一停用、租户过期、用户不属于 scope：登录或请求拒绝。
5. 角色、权限或绑定来自另一个 tenant/scope：principal 不获得权限。
6. scope 有 HR 模块但无 `HR_EMPLOYEE_PROFILE_SELF_READ`：403；有权限但无 HR 模块授权：403。
7. 用户未关联活动 `hr_employee`：安全 404；只持本人权限猜测他人员工 ID：安全 404。
8. `hr_employee`、profile、org 或父 org 跨 scope：数据库或服务在事务提交前拒绝。
9. 操作审计 insert 失败：本人档案不得返回 200。
10. 返回体和审计中出现 `idNumberEncrypted`、fingerprint、源哈希、迁移/batch/record-map ID 或
    未掩码敏感值：合同测试失败。
11. refresh token 已撤销/过期、`auth_version` 不匹配或绑定旧 scope：刷新和访问都拒绝。
12. 独立 provider graph 出现 ParksModule、SaaSModulesModule、PropertyOperationsModule、
    FilesModule、Assets、Leasing、IoT、WorkOrders、Safety 或 Workflow：架构测试失败。
13. 只启动 health/mock controller，没有执行真实登录、DB profile 和 required audit：验收失败，
    不得记为“独立运行完成”。

## 9. 完成定义与未决项

首个纵向链完成必须同时具备：迁移从零通过、集成 park 回填守恒、独立 provider graph 负面
扫描、真实 HTTP E2E、权限负例、审计 fail-closed、Smart Park 回归和 production build。任何一项
缺失都只能称为候选或局部解耦。

静态代码目前不能证明以下动态事实，实施时必须用合成 PostgreSQL 和 E2E 补证：

- 现有生产数据是否全部能唯一映射到真实 park scope；
- 修改 park 可空后，未盘点的触发器、函数、原生 SQL 是否仍假设 `park_id NOT NULL`；
- `HrEmployeeProfileQueryModule` 的运行期 provider 图是否仍间接拉入园区或 workflow 业务；
- Web 的 dashboard/layout/context switch 是否能在 enterprise scope 隐藏园区切换而不影响
  Smart Park；
- #618 合并后的真实基线 SHA 和独立构建结果。

因此下一最小实现应是 P1-A：只建立中性 scope 数据合同、现有 park 的守恒回填和企业无 park
负例；它是后续 Auth/HR/Audit 接线的共同地基，也是最短且不造假的路径。
