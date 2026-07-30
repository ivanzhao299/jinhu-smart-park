# PR #192 菜单接入实施计划

> 当前状态：实现、数据库/API 运行时验证及桌面/390px 浏览器验收全部完成。

## 1. 实施前门禁

- [x] 用户确认 `prd.md`、`design.md` 和本清单。
- [x] 确认当前分支为 `fix/pr192-menu-access`。
- [x] 确认最新迁移仍为 `000181`，`000182` 未被其他并行工作占用。
- [x] 重新读取 API、Web、shared 相关 Trellis 规范。
- [x] 检查工作区，仅保留本任务规划文件和后续授权实施的变更。

## 2. 数据库菜单权限

- [x] 新增 `database/migrations/000182_property_business_menu_access.sql`。
- [x] 基于已注册且启用的模块范围 upsert 民宿/住房菜单及页面节点。
- [x] 建立正确父子关系、路径、层级、图标、路由和启用状态。
- [x] 从既有 `perm_type = 40` 模块 API 权限派生目标角色。
- [x] 幂等补授父菜单和页面权限，不扩大 API/数据/模块授权。
- [x] 添加迁移结构与角色桥接测试。
- [x] 修复生产种子在迁移后重建权限父级时清空两个新页面 `parent_id` 的顺序缺陷，并增加回归测试。

回滚点：在进入共享/前端代码前，单独审查 SQL 是否只触碰四个新增权限和对应角色关系。

## 3. 共享权限契约

- [x] 在 `packages/shared/src/index.ts` 增加四个菜单/页面权限常量。
- [x] 在 `SYSTEM_PERMISSION_SEEDS` 增加对应元数据。
- [x] 验证没有改动 PR #192 已有业务 API 权限码。

## 4. 后端菜单投影

- [x] 更新 `users.service.ts` 的模块推断。
- [x] 更新后端 `USER_MENU_TREE` 回退定义。
- [x] 添加后端菜单树/模块推断契约测试。
- [x] 验证父菜单、页面节点和超级管理员回退定义；普通角色落库投影待数据库实跑抽样。

## 5. 前端规范菜单

- [x] 增加民宿和住房出租图标映射。
- [x] 增加两个规范菜单组及单一真实页面入口。
- [x] 增加前端模块推断。
- [x] 同步历史兼容路径 `/homestay`、`/housing`。
- [x] 添加动态/静态菜单合并与不重复测试，并沿用现有权限/模块过滤链路。
- [x] 不创建不存在的子路由菜单。
- [x] 修复 390px 实测发现的民宿复选框宽度继承导致的 18px 内容裁切。

回滚点：在文档和运行时验证前，检查 `/users/me → menu.ts → AppSidebar/DashboardLayout` 全链路字段一致。

## 6. 文档同步

- [x] 更新 RBAC 菜单发布检查文档。
- [x] 更新完整产品 UAT 验收矩阵。
- [x] 检查并按实际状态更新当前产品范围文档。
- [x] 明确菜单、页面、模块、API、数据范围五类控制的边界。

## 7. 验证命令

- [x] 目标迁移/菜单单元测试。
- [x] `pnpm --filter @jinhu/shared build`
- [x] `pnpm --filter @jinhu/api typecheck`
- [x] `pnpm --filter @jinhu/web typecheck`
- [x] `pnpm --filter @jinhu/api lint`
- [x] `pnpm --filter @jinhu/web lint`
- [x] `pnpm --filter @jinhu/api build`
- [x] `pnpm --filter @jinhu/web build`
- [x] `node scripts/e2e/first-release-menu-whitelist.mjs`
- [x] 数据库执行迁移、重复执行及目标角色 `/users/me` 抽样。
- [x] 浏览器桌面和 390px 检查菜单、跳转、高亮、面包屑和拒绝路径。
- [x] `git diff --check`

运行时证据（基于已合并 PR #195 的 `origin/main`）：

- 隔离 PostgreSQL 16 空库按顺序完成 000001～000182，共 183 个迁移成功；`000064` 前置脚本
  成功，迁移历史表共 184 条 succeeded 记录（含前置记录），failed/running 为 0。
- production seed 成功；实测发现通用父级重建会清空新增页面父级，修复种子映射并幂等重跑后，
  `homestay:operations -> homestay`、`housing_rental:operations -> housing_rental` 保持正确。
- 第二次 `pnpm db:migrate` 报告 `No new migrations`，两个迁移历史表状态/校验和差异为 0。
- 数据库中四个菜单/页面节点唯一存在，目标角色桥接共 16 条：
  - 民宿：`AUDITOR`、`OPERATIONS_OWNER`、`PROPERTY_MANAGER`、`PROPERTY_STAFF`、`SUPER_ADMIN`；
  - 住房：`OPERATIONS_OWNER`、`PROPERTY_MANAGER`、`SUPER_ADMIN`。
- 本地真实 API 登录及 `/users/me`：
  - `chen_guohui`（`PROPERTY_MANAGER`）返回民宿、住房两组菜单及 `/homestay`、`/housing` 页面；
  - `yuan_haitao`（`AUDITOR`）仅返回民宿菜单及 `/homestay`，未返回住房菜单；
  - 两个账号的租户模块均启用 `homestay`、`housing_rental`，证明菜单差异来自角色权限而非模块关闭。
- 真实业务接口边界：`chen_guohui` 的民宿/住房看板均为 200；`yuan_haitao` 的民宿为 200、
  住房为 403。
- 临时禁用隔离库的 `housing_rental` 租户模块后，`chen_guohui` 的 `/users/me` 不再返回该启用
  模块，住房看板接口返回 403；验证后已恢复模块启用状态。
- Chrome 插件仍存在 WSL 路径兼容问题；改用仅绑定本机调试端口的隔离 Chrome，连接真实
  Next.js/API/PostgreSQL 完成验收：
  - 1440×900：两个菜单组和运营子菜单存在，点击路由及 active 高亮正确；
  - 390×844：两个运营页面均无溢出元素；民宿复选框裁切修复后 `scrollWidth = clientWidth`；
  - AUDITOR 不显示住房菜单，直达 `/housing` 跳转 `/403`。

## 8. 完成门禁

- [x] Trellis check 静态、数据库、API 与浏览器质量门通过。
- [x] 变更文件只覆盖菜单接入、对应测试和必要文档。
- [x] 报告所有执行与跳过的验证。
- [x] 报告新租户通用权限物化仍不在本任务范围内的剩余风险。
