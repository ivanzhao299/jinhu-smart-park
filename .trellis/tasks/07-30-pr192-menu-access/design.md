# PR #192 菜单接入修复设计

## 1. 设计结论

采用数据库权限树、后端菜单投影、前端规范菜单三层同步的方案：

```text
sys_permission 菜单/页面节点
        ↓ 角色授权
GET /users/me → menu_tree + enabled_modules
        ↓
Web 规范菜单合并 → 侧栏显示 + 路由授权
        ↓
/homestay 或 /housing
        ↓
既有 RequireModule + API 权限 + 房源数据范围
```

菜单负责“发现和进入页面”，模块授权负责“租户是否启用产品模块”，API 权限负责“允许执行什么动作”，数据范围负责“允许操作哪些房源”。四者不互相替代。

## 2. 菜单信息架构

### 2.1 民宿

| 层级 | 权限码 | 类型 | 名称 | 路由 | 模块 |
|---|---|---:|---|---|---|
| 菜单 | `homestay` | 10 | 民宿管理 | 无 | `homestay` |
| 页面 | `homestay:operations` | 20 | 民宿运营 | `/homestay` | `homestay` |

### 2.2 住房出租

| 层级 | 权限码 | 类型 | 名称 | 路由 | 模块 |
|---|---|---:|---|---|---|
| 菜单 | `housing_rental` | 10 | 住房出租 | 无 | `housing_rental` |
| 页面 | `housing_rental:operations` | 20 | 住房运营 | `/housing` | `housing_rental` |

不使用 `/homestay/rates`、`/homestay/bookings` 等 PR #192 权限元数据里的路径，因为代码库没有这些页面。后续真正拆页时，再通过独立任务新增页面权限节点。

## 3. 数据库迁移

新增 `database/migrations/000182_property_business_menu_access.sql`，不编辑历史迁移。

迁移职责：

1. 从已启用的 `sys_module_registry` 范围中识别 `homestay` 和 `housing_rental`。
2. 对每个已注册范围 upsert 菜单及页面权限，设置：
   - `permission_type`
   - `perm_type`
   - `parent_id`
   - `permission_path` / `perm_path`
   - `permission_level` / `level`
   - `frontend_route`
   - `icon`
   - `visible`、`is_enabled`、`status`
3. 用已存在的同模块 API 权限反向识别合法角色：
   - 民宿：同租户/园区下已持有 `homestay:%` 且 `perm_type = 40` 权限的角色
   - 住房：同租户/园区下已持有 `housing:%` 且 `perm_type = 40` 权限的角色
4. 给这些角色补授菜单和页面节点。
5. 使用 `NOT EXISTS`/upsert 和明确的租户、园区、角色、权限联合条件保证幂等。
6. 同步生产安全种子的权限父级映射。标准发布顺序为迁移后执行生产种子；如果种子不认识
   `homestay`、`homestay:operations`、`housing_rental`、`housing_rental:operations`，
   通用父级重建会把新页面的 `parent_id` 清空。

选择“根据已有 API 授权派生菜单授权”，而不是再次硬编码角色清单，原因是：

- 保留 PR #192 已有角色能力分配；
- 自动覆盖迁移执行前已存在的自定义细粒度角色；
- 不给没有任何业务 API 权限的角色暴露空页面；
- 不扩大 API 或数据范围。

该迁移只修复迁移执行时已经注册对应模块的租户/园区。未来新租户的完整模块权限物化属于通用 SaaS 开通流程，不在本任务中扩张。

## 4. 共享权限契约

在 `packages/shared/src/index.ts` 增加四个系统权限常量及种子元数据：

- `HOMESTAY_MENU`
- `HOMESTAY_OPERATIONS_PAGE`
- `HOUSING_RENTAL_MENU`
- `HOUSING_RENTAL_OPERATIONS_PAGE`

权限种子用于把这些代码纳入内置系统权限契约，避免后台权限维护把它们当成任意租户自定义权限。现有 44 项业务 API 权限保持不变。

## 5. 后端菜单投影

更新 `apps/api/src/modules/users/users.service.ts`：

- 在 `inferModuleCode` 中明确识别：
  - `/homestay`、`homestay...` → `homestay`
  - `/housing`、`housing...`、`housing_rental...` → `housing_rental`
- 在 `USER_MENU_TREE` 增加两个规范回退菜单组。

数据库菜单仍是正常角色用户的主要来源；静态树用于超级管理员、历史数据缺失或回退路径。两者必须使用相同的名称、路由、权限码和模块码。

不修改 API 控制器权限装饰器。页面权限不替代既有 `@RequireModule` 与 `@RequirePermissions`。

## 6. 前端菜单与路由授权

更新 `apps/web/lib/menu.ts`：

- `MENU_ICON_MAP` 增加 `hotel`、`house` 映射；
- `dashboardMenus` 增加两个规范菜单组；
- `inferMenuModule` 识别两个模块；
- `FIRST_RELEASE_MENU_PATHS` 增加 `/homestay`、`/housing`，并保持其“历史兼容检查”定位。

前端规范菜单是合并骨架，因此必须显式增加两个组，否则后端动态顶层组可能在 `mergeWithDashboardMenus` 中被丢弃。

`DashboardLayout` 继续使用现有逻辑：

- 找到页面菜单但缺页面权限 → `/403`
- 有页面权限但模块未启用 → `/403?reason=module`

不新增一套平行路由守卫。

## 7. 权限和角色行为矩阵

| 模块 | 页面权限 | API 权限 | 预期结果 |
|---|---|---|---|
| 启用 | 有 | 有 | 菜单可见、页面可进入、授权数据块可加载 |
| 启用 | 有 | 部分 | 菜单可见、页面可进入，只显示授权数据块和操作 |
| 启用 | 无 | 有 | 菜单隐藏，直接页面访问被前端页面授权拒绝；API 权限本身不被撤销 |
| 禁用 | 有 | 有 | 菜单被模块过滤，直接页面访问被模块守卫拒绝 |
| 启用 | 无 | 无 | 菜单隐藏，页面及 API 均不可用 |

迁移完成后，迁移前已持有任一模块 API 权限的角色会进入前两种状态，不会意外停留在“有 API 但无入口”的状态。

## 8. 测试与验收设计

### 8.1 结构测试

新增针对 `000182` 的测试，验证：

- 四个菜单/页面权限存在；
- `perm_type` 分别为 10/20；
- 页面路由与父子关系正确；
- 角色桥接从已有 API 权限派生；
- 没有修改或重新授予业务 API 权限。

补充菜单契约测试，验证：

- 后端和前端均包含两个规范入口；
- 后端/前端模块推断结果正确；
- 后端动态菜单和静态规范菜单合并后不重复；
- `/homestay`、`/housing` 在兼容菜单路径中。

### 8.2 静态检查

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- 目标 lint
- API/Web build
- `node scripts/e2e/first-release-menu-whitelist.mjs`
- `git diff --check`
- 生产种子执行后再次断言两个页面节点仍分别挂在 `homestay`、`housing_rental` 下

### 8.3 运行时检查

在可用数据库环境中：

1. 执行迁移并验证重复执行安全性。
2. 读取目标角色 `/users/me`：
   - 民宿角色返回 `/homestay`
   - 住房角色返回 `/housing`
   - 无权角色不返回对应节点
3. 验证模块禁用后菜单过滤和直接路由拒绝。
4. 浏览器检查桌面与 390px：
   - 侧栏入口存在
   - 点击到达正确页面
   - 当前菜单高亮与面包屑正确
   - 无水平溢出

本次实测在 390px 发现民宿复选框继承通用输入框 `width: 100%` 后挤出父容器；局部规则必须
把复选框恢复为 `width: auto` 和不可伸缩，页面才满足无裁切/无横向溢出门禁。

## 9. 文档同步

实施时同步：

- `docs/testing/rbac-menu-dashboard-permission-release-checks.md`
- `docs/uat/full-product-acceptance-matrix.md`
- 如当前产品范围文档仍列出菜单状态，则同步 `docs/product/current-product-scope.md`

文档必须说明历史首发白名单不是现行安全边界，运行时证据以 `/users/me`、模块授权、页面权限、浏览器渲染和拒绝样本为准。

## 10. 风险与回滚

### 风险

- 只加数据库动态菜单但漏改前端规范菜单，顶层模块会在合并时丢失。
- 只授页面权限不授父菜单权限，后端树无法从根节点构造子页面。
- 用看板 API 权限直接当页面权限，会让细粒度非看板角色仍然没有入口。
- 给所有角色无条件授菜单权限，会暴露没有任何可用数据块的空页面。
- 使用不存在的 PR #192 `frontend_route` 创建子菜单会产生 404。
- 只检查迁移后的权限树、不检查随后生产种子的最终状态，会漏掉父子关系被种子重建破坏。

### 回滚

代码回滚：撤销本任务对共享常量、菜单投影和前端菜单的提交。

数据回滚不修改历史迁移，也不物理删除权限。若上线后需要紧急关闭：

1. 优先禁用对应租户模块，立即阻断菜单和 API 模块访问；
2. 或将新增菜单/页面权限设为 disabled/不可见并软删除对应角色关系；
3. 保留 PR #192 已有 API 权限及业务数据，避免影响业务审计。

前向修复迁移的正式回退 SQL 应在实施评审时随发布记录给出，但不放入自动向下迁移。
