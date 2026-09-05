# HR P1-B：认证身份目录依赖提取

## 目标与边界

本切片把 Auth/JWT 使用的既有身份查询、密码锁定、登录活动和 principal 重建
从用户管理服务移入 `IdentityDirectoryService`。这是同一 HR 产品独立运行所需的
依赖拆分，不是另一套登录系统，也不代表 enterprise 登录已经可用。

身份目录模块只注册 `UserEntity` repository；不导入园区、角色、SaaS 模块、
数据范围或字段策略的管理模块。角色/权限实体关系仍须由运行 DataSource 注册，
不能把“没有管理模块依赖”误解成“不需要相关数据库表”。

## 同一份实现的调用关系

- `AuthService` 和 `JwtStrategy` 直接注入身份目录。
- `UsersService` 保留原公开方法签名并委托身份目录；管理端调用保持兼容。
- 身份查询、锁定策略调用和 principal SQL 只保留一份，不能复制到两个服务。
- `AuthModule` 暂时同时导入身份目录和 `UsersModule`：`AuthController` 的用户上下文、
  菜单及园区投影尚未提取，因此完整 Auth 模块图仍不是独立 HR 启动图。

## 不改变的运行语义

用户名/手机号候选查询、活动用户过滤、密码失败计数、锁定期重置、成功登录清理、
`auth_version`、当前角色权限、权限别名、租户超级管理员保护，以及实际园区存在性
均沿用当前实现。本切片不改 JWT/session 数据合同，不扩权限，不设置默认园区。

principal 仍依赖真实 `biz_park`、`rel_user_park` 和 park-scoped RBAC 表，
`UserEntity.park_id` 仍不可空。因此它不能消费 enterprise scope 并签发合法的企业 token。
后续须先完成真实 scope 的身份/RBAC/会话前向迁移，再接入唯一范围解析；
不得把 enterprise scope ID 填进 `park_id`。

`AuthService.changeOwnPassword` 的原子密码修改和 refresh-token 撤销事务保留原处，
本片不顺手移动或拆开事务。密码策略和审计行为也不改变。

## 验证要求

- 迁移既有 principal 与登录锁定测试，保留管理员重置密码及用户管理回归。
- 运行 Auth 锁定、密码修改、上下文切换、JWT 撤销及租户状态回归。
- 验证真实 Nest provider 接线，并明确使用合成 repository，不能称为数据库或 HTTP 登录验证。
- 检查身份目录模块图没有管理模块，并检查 principal SQL 没有双份实现。
- API typecheck、定向 lint 和差异检查通过后才提交候选。

本片不连接生产或玉舟源，不执行历史导入；生产登录、独立 HR 启动和最终 P1 验收
仍需各自的运行证据，不能由上述单元/组合测试替代。

## 本地验证记录（2026-09-05）

基于主线 `ccd99ff85f21488fb162a676ac28c10ff9dcaad6`，现有工作树改动保留并无冲突同步。
父任务最终验收目标修正随本候选携带，不改变生产授权或任何验收状态。

- 12 个定向测试文件共 88 项通过，使用 `node --test --test-concurrency=1` 串行执行。
  覆盖 Auth 锁定、上下文切换、密码修改、JWT、租户状态、principal、用户组织分配、
  用户密码锁定、物业菜单、角色及身份目录服务/模块装配。
- 新增 `identity-directory.module.spec.ts` 使用真实 `IdentityDirectoryModule`、
  `TenantStatusModule` 和 `JwtStrategy`；合成 DataSource 只提供 User/Tenant 两种 repository。
  验证模块导出与共享注入、角色为空时的本人权限、会话版本失效、账号及租户停用拒绝，
  并检查真实 Nest 模块图没有用户、租户、园区、角色、SaaS 等管理模块。
- TypeScript AST 对比证明迁出的 11 个公开方法体与主线一致；只归一化两处共享权限
  helper 的调用限定名。此对比不代替真实数据库测试。
- API `typecheck`、受影响 Auth/Users/Tenant 文件定向 ESLint、`git diff --check` 通过。

未执行全量构建、真实数据库/HTTP 登录、浏览器 UAT 或生产部署；本次不改数据库结构、
SQL 语义或前端页面。独立企业身份/RBAC/session、`/auth/me` 的集成依赖和完整启动链
仍未交付，因此本片不能计为 P1 通过，也不解除历史导入 HOLD。
