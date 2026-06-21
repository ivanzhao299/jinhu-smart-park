# Agent 4：菜单权限缺口扫描报告

> 生成日期：2026-06-21  
> 分支：agent-4-dashboard-mobile-rbac  
> 扫描范围：`/assets/statistics` 与 `/assets/unit-status-board` 菜单、权限、白名单、页面访问一致性

---

## 1. 扫描结论速览

| 检查项 | `/assets/statistics` | `/assets/unit-status-board` |
|---|---|---|
| 在 `FIRST_RELEASE_MENU_PATHS` 中 | ✅ menu.ts:93 | ✅ menu.ts:92 |
| 在 `MERGED_MENUS` 菜单定义中 | ✅ menu.ts:144 | ✅ menu.ts:143 |
| 前端 PermissionGuard 一致 | ✅ | ✅ |
| API 权限装饰器一致 | ✅ | ✅ |
| 共享权限常量存在 | ✅ | ✅ |
| 生产 seed 已播种权限 | ✅ | ✅ |
| 关键角色已具备权限 | ✅ | ✅ |
| s2b-smoke 已覆盖 | ✅ | ✅ |
| s1-rbac-std-fix-smoke 已覆盖 | ✅ | ✅ |
| **whitelist.mjs requiredPaths 已覆盖** | ❌ **缺口（已修复）** | ❌ **缺口（已修复）** |

---

## 2. 详细扫描记录

### 2.1 `/assets/statistics`

**菜单定义**
- `FIRST_RELEASE_MENU_PATHS`（menu.ts:93）：`"/assets/statistics"` ✅
- `MERGED_MENUS`（menu.ts:144）：`{ label: "资产统计", href: "/assets/statistics", permission: "asset:statistics", module: "asset" }` ✅

**权限层**
- 前端 PermissionGuard（statistics/page.tsx:175-176）：双层守卫 `asset:read` + `asset:statistics`
- API 端点：`GET /assets/statistics`（assets.controller.ts:32-33）`@RequirePermissions(ASSET_READ, ASSET_STATISTICS)`
- 对应权限常量（shared/src/index.ts:735）：`ASSET_STATISTICS: "asset:statistics"`
- 前端与 API 权限码完全一致 ✅

**权限播种**
- 生产 seed（000001）：`sys_permission` 中有 `asset:statistics`（leaf）和 `asset:statistics-page`（page-type）
- 角色映射（seed:2201-2202 + migration 000093）：EXECUTIVE、OPERATIONS_OWNER、INVEST_MANAGER 已具备
- s2b role 验证（s2b-smoke.mjs:500,508）：EXECUTIVE 和 OPERATIONS_OWNER 的 expectedPermissions 包含 `asset:statistics`，expectedMenus 包含 `/assets/statistics` ✅

**s2b-smoke 覆盖（s2b-smoke.mjs:707-738）**
- admin（SUPER_ADMIN）调用 → 200，返回 summary + by_building ✅
- normal 用户调用 → 403 ✅
- 数值断言：total_units、total_area、rented_area、occupancy_rate 均有断言 ✅

**s1-rbac-std-fix-smoke 覆盖（s1-rbac-std-fix-smoke.mjs:170）**
- 租户模块禁用后 `/assets/statistics` → 403 ✅

**whitelist.mjs 缺口**
- `requiredPaths` 中不含 `/assets/statistics`，无法防止该路径被意外从白名单中移除 ❌ → **已修复**

---

### 2.2 `/assets/unit-status-board`

**菜单定义**
- `FIRST_RELEASE_MENU_PATHS`（menu.ts:92）：`"/assets/unit-status-board"` ✅
- `MERGED_MENUS`（menu.ts:143）：`{ label: "房源状态看板", href: "/assets/unit-status-board", permission: "asset:status_board", module: "asset" }` ✅

**权限层**
- 前端 PermissionGuard（unit-status-board/page.tsx:346-348）：三层守卫 module `asset` + `asset:status_board` + `unit:read`
- API 端点：`GET /assets/unit-status-board`（assets.controller.ts:38-40）`@RequirePermissions(ASSET_STATUS_BOARD, UNIT_READ)`
- 对应权限常量（shared/src/index.ts:734）：`ASSET_STATUS_BOARD: "asset:status_board"`
- 前端与 API 权限码完全一致 ✅

**权限播种**
- 生产 seed（000001）：`sys_permission` 中有 `asset:status_board`（leaf）和 `asset:unit-status-board`（page-type）
- 角色映射（seed + migration 000093）：EXECUTIVE、OPERATIONS_OWNER、INVEST_MANAGER、INVEST_SPECIALIST 已具备
- s2b role 验证（s2b-smoke.mjs:499-514）：
  - EXECUTIVE：expectedPermissions 含 `asset:status_board`，expectedMenus 含 `/assets/unit-status-board` ✅
  - OPERATIONS_OWNER：同上 ✅
  - INVEST_SPECIALIST：expectedPermissions 含 `asset:status_board`，expectedMenus 含 `/assets/unit-status-board` ✅

**s2b-smoke 覆盖（s2b-smoke.mjs:740-759）**
- admin 调用 → 200，buildings 树结构 ✅
- 房源字段：`code`、`unit_code`、`rental_status_name`、`usage_type_name` ✅
- `current_tenant_name` 字段存在（s2b-smoke.mjs:749）✅
- rental_status 过滤不泄漏其他状态（s2b-smoke.mjs:752-756）✅
- normal 用户调用 → 403 ✅

**whitelist.mjs 缺口**
- `requiredPaths` 中不含 `/assets/unit-status-board`，无法防止该路径被意外从白名单中移除 ❌ → **已修复**

---

### 2.3 迁移与权限码二层体系说明

该系统使用两套权限码并行存在：
- **Leaf 权限**（API 层）：`asset:status_board`、`asset:statistics` — 用于 `@RequirePermissions()` 和前端 `PermissionGuard`
- **Page 权限**（菜单树层）：`asset:unit-status-board`、`asset:statistics-page` — 用于 `sys_menu` 路由访问控制

Migration `000093` 使用 page 权限码向角色授权，这与 seed 中两类权限的映射关系一致（seed:447-448），无冲突。

---

## 3. 发现的缺口与修复

| 缺口 | 位置 | 严重度 | 修复方式 |
|---|---|---|---|
| `/assets/statistics` 未在 whitelist.mjs `requiredPaths` 中 | `scripts/e2e/first-release-menu-whitelist.mjs` | 低（不影响运行时，影响回归覆盖率） | 已添加到 `requiredPaths` |
| `/assets/unit-status-board` 未在 whitelist.mjs `requiredPaths` 中 | `scripts/e2e/first-release-menu-whitelist.mjs` | 低（同上） | 已添加到 `requiredPaths` |

无其他缺口：无"菜单可见但 API 403"情况，无"API 可访问但菜单不可见"情况，无权限码不一致情况。

---

## 4. 未改动范围确认

- 未改 `apps/web/lib/menu.ts`（无需改动，路径已正确存在）
- 未改任何业务 service、controller
- 未改任何 migration 或 seed
- 未引入新依赖
- 未修改认证、CI、Docker 相关配置
