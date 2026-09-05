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

上述首次本地检查借用了另一工作树的依赖，因此仅为开发反馈，不作为当前候选的
独立发布验证。CI `33949279680` 随后在完整单元测试中失败：
`users.role-assignment-scope.spec.ts` 仍从 `users.service.ts` 查找已移出的 JWT SQL。
这属于移动实现后遗漏源码测试引用，而非已证明的运行时权限回归。

## CI 修复与独立依赖验证（2026-09-05）

- 工作树：`/private/tmp/jinhu-hr-identity-directory-v1`；合入主线
  `214fb4b3c259d5a1322c2173914b23a440141d5e`（唯一授权业务范围解析）。
- 只移除两个经核验的跨工作树 `node_modules` 符号链接，原目标目录完整保留。
  `pnpm install --offline --frozen-lockfile --prod=false` 使用本地缓存安装 818 个包，
  无下载；随后在本工作树执行 `pnpm --filter @jinhu/shared build`。
- API 与 Web 的 `@jinhu/shared` 均解析到本工作树 `packages/shared`。
- JWT SQL 的两条安全断言改读 `identity-directory.service.ts`；内存角色过滤断言
  原样保留，补充旧服务必须委托身份目录的断言，没有复制 SQL 或放宽断言。
- 失败文件、JWT principal 运行测试及真实 Nest 装配测试共 11 项通过。
  全部源码测试引用扫描未发现第二处同类遗漏。
- 完整 API 单元测试采用与 `test:unit` 相同的 `src/**/*.spec.ts` 文件集、
  `ts-node/register`、force-exit 和 dot reporter，仅将并发限制为 2；341 个测试文件
  组成的整组命令退出码为 0。专用数据库环境未启用，该结果不覆盖显式 opt-in 的 PG 演练。
  命令在 `apps/api` 执行：
  `find src -type f -name '*.spec.ts' -exec node --test --test-concurrency=2 --test-force-exit --test-reporter=dot --require ts-node/register {} +`。
- `pnpm test:unit:web` 的全部 14 组脚本通过，包括认证路由、会话、园区角色恢复
  和 HR 页面合同；这是单元/源码合同验证，不是浏览器 UAT。
- 当前工作树共享包 41 项测试、API typecheck、全部变更 TypeScript 文件定向
  ESLint 及差异检查通过。独立审查逐个比较迁出方法与主线，确认保留租户超级管理员、
  有效园区、普通角色和 wildcard 语义；没有借本次修复扩展企业登录或跨范围权限。
- 最终目标路线图合同 6 项通过；上述验证基于合并提交 `5e03fff9` 加本次三文件修复，
  不能引用旧 CI 失败运行作为新候选的发布证明。

缺陷分类为变更传播遗漏与定向回归范围不足。防复发要求已补入
`.trellis/spec/api/backend/park-role-integrity.md`：区分 SQL 与内存检查的真实所有者，
移动方法后扫描源码读取测试，并保留完整 API 单元测试。仓库没有
`src/templates/markdown/spec/` 模板目录，不创建无用副本。

未执行全量构建、真实数据库/HTTP 登录、浏览器 UAT 或生产部署；本次不改数据库结构、
SQL 语义或前端页面。独立企业身份/RBAC/session、`/auth/me` 的集成依赖和完整启动链
仍未交付，因此本片不能计为 P1 通过，也不解除历史导入 HOLD。
