# HR P1-A 中性业务作用域核心

## 本切片完成的能力

P1-A 提供企业模式和园区模式共用的最小持久化内核：业务作用域、用户成员关系、模块授权以及只读解析器。唯一 DDL 源是：

- `database/components/business-scope/000001_core.sql`

该文件必须由后续独立安装 profile 显式执行，不属于 `database/migrations/*.sql` 默认生产迁移链。文件使用事务，但不是可任意重复执行的幂等迁移；后续 profile 必须用自己的 checksum/history 保证恰好执行一次，不能复制其中 SQL。

共同内核没有 `park_id`，也不引用任何 `biz_*` 表。一个租户可以有多个真实 enterprise scope；活动 `scope_code` 只在同一租户内大小写不敏感唯一。后续 P1-B 增补提供服务端唯一候选选择，尚未接入密码校验、登录或 JWT。

## 基础表前置合同

显式执行组件前，目标数据库必须已提供当前身份内核的基础列：

- `sys_tenant.id` 为 UUID 主键，`tenant_id` 为 `varchar`，`status` 为整数且 `1` 表示活动，并有 `expire_time` 与 `is_deleted`。
- `sys_user.id` 为 UUID 主键，`tenant_id` 为 `varchar`，`status` 为字符串且 `enabled` 表示活动，并有 `is_enabled` 与 `is_deleted`。

组件只给两表增加 `(id, tenant_id)` 非部分唯一索引，供复合外键证明真实租户归属。它不会给 `tenant_id` 增加全局唯一约束，因此不破坏 `sys_tenant` 已存在的活动行部分唯一和历史删除行并存语义。成员关系同时引用真实 scope 和同租户真实 user。

现有 Smart Park 的 `sys_user.park_id NOT NULL` 仍保持原状；P1-A 不修改该列。合成 PostgreSQL 测试使用满足上述前置接口的最小身份表，并保留一个不参与授权解析的旧 `park_id` 必填列。该测试只证明中性 scope 组件和解析合同，不证明现有全量数据库已经完成 enterprise 身份迁移。

## 只读解析规则

`BusinessScopeResolverService.resolveForUser` 只执行参数绑定的 `SELECT`，并同时核验：

- 租户行未删除、状态为 `1`、未过期；
- 用户未删除、`is_enabled=true` 且 `status=enabled`；
- scope、membership、所需 module 均活动；
- tenant、user、scope、membership 的复合身份一致。

查询最多读取两行，结果必须恰好一行；零行、重复行、形状错误、数据库错误都拒绝。enterprise 由共同内核直接解析。park 必须由服务端 Nest 组合根通过 `BusinessScopeCoreModule.register({ parkAdapterProvider })` 注入真实适配器；缺适配器、适配器异常、作用域身份不一致或空 `parkId` 均拒绝，绝不使用默认园区、固定 UUID 或客户端自报值。

### P1-B 增补：为已识别用户选择唯一业务范围

`resolveUniqueForUser({ tenantId, userId, requiredModuleCode })` 不接受 `scopeId`，
由同一只读查询核验用户、租户、成员关系与模块授权后选择唯一有效范围。
显式 `resolveForUser` 和唯一选择共用查询谓词及结果/适配器校验，不维护两套授权 SQL，
也不先选择再另行查询，从而避免两次查询之间的候选变化。

- 零个候选或两个候选均返回 `null`，不按排序选第一个，不提供隐式默认企业。
- 同时存在 enterprise 和 park 候选也属于歧义；缺少 park adapter 不意味着可以忽略该候选。
- 唯一 enterprise 返回真实 `scopeId` 和 `parkId: null`；唯一 park 仍须适配器证明真实身份。
- 查询只返回范围标识和类型，不读取密码、人员档案或薪资字段。
- 输入的用户身份必须由调用端先验证。这不是密码验证器，不签发 token，
  模块授权也不代替 RBAC 权限。当前 Auth/JWT 调用面尚未接线。

合成 Nest/PostgreSQL 回归增加唯一/零/多候选、跨租户用户、停用/过期、
缺模块授权和缺 park adapter 的验证，并检查模块图不加载 Users、Parks、SaaSModules、
DataScopes、FieldPolicies、PropertyOperations、完整 AppModule 或 HrModule。
这些证据只覆盖身份范围选择这一环，不代表独立登录或最终 P1 验收完成。

## 合成验证与未完成边界

`pnpm test:e2e:yuzhou-hr-business-scope-core` 先检查临时盘容量，再启动只绑定 `127.0.0.1` 随机端口的一次性 PostgreSQL 16 容器。它直接执行共同 DDL，使用只读数据库角色和真实 Nest application context 验证：

- 没有 `biz_park` 表也能创建并解析 enterprise scope；
- 同租户两个 enterprise scope 可共存，重复活动 scope code 被拒绝；
- 历史删除租户行可与同 `tenant_id` 活动行共存；
- 跨租户成员关系被数据库复合外键拒绝；
- membership、module、tenant、user、scope 任一失效都拒绝；
- 只读角色可以解析但不能写入；
- 默认组合没有 park adapter 时拒绝，显式注入的合成 adapter 只证明 Nest DI 接线。

测试只删除自己创建的临时容器，不接触既有容器、卷、备份或数据库。P1-B 的身份迁移、独立安装 profile、登录/JWT/UserContext 接线、真实 Smart Park binding、HR 实体去 `park_id` 适配和完整审计链仍未完成，因此本切片不能声称 HR 已可独立登录或生产运行。

## 本地候选验证

基于 `origin/main@d57c7fb2b42163bc395a99eb5772d71581d40d54` 完成以下验证：

- `pnpm test:e2e:yuzhou-hr-business-scope-core`：1/1 通过，结束后无本切片临时容器残留；
- resolver 专项：5/5 通过；
- shared build/lint、API typecheck/lint/build：通过；
- runner `node --check` 与 `git diff --check`：通过。

这些结果仅是合成基础合同和静态构建证据，未连接生产数据库，也不提升为独立登录或生产运行证明。

### 唯一范围选择候选验证（2026-09-05）

在 `origin/main@4488c025c7dcbb2867e3efbc0ee1f19c9e9f8a98` 上增补：

- resolver 专项：9/9 通过，显式和唯一入口共用同一条授权查询；
- `node scripts/e2e/yuzhou-hr-business-scope-core-postgres.mjs`：一次运行 1/1 通过，
  在真实只读角色和 Nest context 中检查上述唯一选择正负例；
- API typecheck、三个修改 TS 文件的定向 ESLint、`git diff --check`：通过；
- 结束后 `jinhu-hr-scope-core-*` 临时容器无残留；未运行全量历史迁移或生产写入。

验证时序：PG 与 API typecheck 完成后，输入拒绝条件从自有 `scopeId` 属性收紧为
包括原型链上的 `scopeId`；该一行修改后的专项 unit 9/9 和服务/测试 lint 通过。
SQL、结果解码与适配器代码未变；上述 PG 结果对应收紧前版本，不声称整提交重新跑过 PG。

本候选只增强已识别用户的范围解析，不读取登录凭据；Auth/JWT、RBAC 与本人档案的
中性范围接线仍是下一段工作。单一合成 PG 测试包含多个断言，不能报告成多个独立
部署验收，也不能把本节记为 P1 完成。
