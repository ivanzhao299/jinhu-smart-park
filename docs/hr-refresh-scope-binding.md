# HR 身份过渡：新会话范围持久化

属于 M1/P1-P2 的应用写入切片，依赖可选业务范围组件 000001–000003。
不是独立企业登录完成，也不是生产启用指令。最终完成仍要求 M0-M5 AND P0-P4 全部通过。

## 运行合同

- 默认 `AuthModule` 不注册新 writer；现有实体不增加 scope 列映射，原数据库无须提前安装组件。
- 显式 `AuthModule.withParkScopeTransition()` 才注册范围 writer。不增加环境开关，
  不根据数据库对象是否存在自动启用，也不改变现有 AppModule 入口。
- 登录、刷新、上下文切换生成新会话时，共用 `createScopedRefreshToken`。
  启用 writer 后，通过同一个事务 manager 核对真实范围、保存会话并填写 `scope_id`。
  后一步失败时，新会话插入一起回滚，不返回 token，也不回退旧路径。
- 只绑定当前有效租户实体、真实 park 行、启用且未删除的 park scope，以及同租户有效用户。
  范围不是客户端提供，也不能用用户默认园区替代当前已授权的会话园区。
  非删除的重复园区即使已停用也拒绝；通过共享锁保护核验至事务结束。
- 本片复用现有 principal/园区访问核验，不生成成员资格、模块或角色授权。
  `scope_id` 在此仅是会话的额外持久化引用，不代替后续 scope 化 JWT、权限和每次请求核验。
- 拒绝预设 token ID、非字符串 hash 和畸形布尔值。writer 与外层事务失败统一返回
  `Refresh token scope unavailable`，不携带原始数据库诊断。

## 必验用例

使用已有小型 PostgreSQL runner 和实际身份迁移文件；不创建另一套迁移框架。
通过真实 `AuthService.refresh` 和 TypeORM repository 验证正常园区、同用户第二园区、
停用/重复范围拒绝、绑定写入晚期失败零新会话、默认路径保持原行为及并发范围锁。
测试中的身份授权、JWT 签名和审计为明确合成替身，不能计入真实登录/权限/审计验收。

## 未完成边界

现有 refresh 在替换会话前撤销旧 token；本片不恢复旧 token，也不宣称旧 token 的撤销与
新会话整体原子。并发 refresh 的一次性认领、JWT scope 合同、刷新/退出/切换对持久化 scope
的消费核验、用户与 RBAC 双写、成员及模块转换、企业模式和真实浏览器链仍须闭合。
不得将这个显式过渡入口作为已验收生产配置发布。

## 工作恢复与验证

2026-09-05，原 `/private/tmp/jinhu-hr-refresh-scope-binding-v1` 目录在验证后不可用，
Git 分支仍保留基线 `9a24d459`，消失原因未确认。未删除或 prune 任何工作树元数据。
本片从同一提交在持久化工作树恢复；未提交实现依据已审查合同重建，不能声称字节级恢复。
原目录完整 API 退出 0 与 PostgreSQL PASS 仅为历史证据，不代表恢复后版本通过。
宿主 `kern.boottime` 确认 20:29:59 重启，随后 Colima 未运行、Docker socket 不存在。
恢复本地 Colima 后复测；没有改动生产配置或读取生产库。重启与临时目录消失相关，
但没有证据把具体删除动作归因于某个程序。

恢复版本验证：

- `pnpm install --offline --frozen-lockfile --prod=false`：通过，818 包，0 下载，依赖属于本工作树。
- `pnpm --filter @jinhu/shared build`、`pnpm --filter @jinhu/api exec tsc --noEmit`：通过。
- `pnpm --filter @jinhu/api exec node --test --test-concurrency=2 --test-force-exit --require ts-node/register 'src/modules/auth/**/*.spec.ts'`：190/190 通过，无跳过。
- 随后仅增补两个字符串布尔值负例，writer 专项重新运行 31/31 通过；未改执行代码。
- `pnpm test:e2e:yuzhou-hr-identity-scope-transition`：恢复 Docker 后 1/1 通过，无跳过。
  首次因 `BUSINESS_SCOPE_DOCKER_UNAVAILABLE` 退出，尚未创建测试库；不把这次失败算作代码通过。
- `node --test scripts/e2e/yuzhou-hr-enterprise-rewrite-roadmap-v2-contract.mjs`：7/7 通过。
- 所有改动 TypeScript 的 ESLint、`git diff --check`：通过。

PostgreSQL 测试仅用合成数据、loopback 和 512 MiB tmpfs；专用测试容器已由 runner 清理。
未重跑真实源提取、完整 A/B 或全量工资装载；没有进行生产数据、照片附件或工资操作。
恢复后完整 API 套件未重复执行；190 项认证回归与实际 PostgreSQL 是本候选的比例验证，
其余业务仍依赖后续 CI，不将早先临时目录的全套通过算作恢复版本全套通过。
