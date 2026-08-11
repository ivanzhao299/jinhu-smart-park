## Bug Analysis: 新租户首管只有首页且无业务菜单

### 1. Root Cause Category

- **Category**: B/C/D/E - 跨层契约、变更传播、测试覆盖与隐式假设叠加
- **Specific Cause**: Web 允许空套餐，API 又把空授权输入静默解释为 `system`；套餐变更只更新租户字段而不必然重算模块和角色权限；safety 模块没有权限族派生；既有回归只验证登录落点，没有验证创建后的数据库授权与 `/users/me` 菜单。

### 2. Why Fixes Failed

1. Issue #250 只修复 post-login route：避免了 403 症状，但没有改变创建时已经退化的授权数据。
2. 单层单测只证明菜单选择和部分权限派生：没有跑真实 `POST /tenants -> login -> /users/me -> guarded API`。
3. 首轮修复只过滤 `module:*` 标记：独立复核发现套餐普通显式权限仍可能在缩减模块后残留，随后补成按最终模块权限族过滤。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Runtime | 缺套餐且无显式模块直接 400，禁止隐式 system-only | DONE |
| P0 | Architecture | 套餐变化在同一事务同步模块、TENANT_ADMIN 权限和配额 | DONE |
| P0 | Security | 套餐 permission codes 与最终启用模块求交集 | DONE |
| P0 | Test | 真实数据库/API/浏览器覆盖创建、首管登录、菜单、200/403 | DONE |
| P1 | Documentation | 将租户开通授权闭环写入 module access control spec | DONE |

### 4. Systematic Expansion

- **Similar Issues**: `assignModules`、登录配置更新、自定义套餐显式权限和存量停用套餐都是相同收敛边界。
- **Design Improvement**: 套餐是授权输入，模块与角色权限是事务内派生状态，`/users/me` 和 Web 菜单只是只读投影。
- **Process Improvement**: 任何租户/套餐授权改动必须跑“创建租户 → 首管登录”的真实链路，并同时断言允许与拒绝路径。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/api/backend/module-access-control.md`
- [x] Issue #253 记录根因、修复与验收标准
- [x] 任务中记录真实 E2E 证据
- [x] 当前仓库不存在 `src/templates/markdown/spec/`，无对应模板可同步
