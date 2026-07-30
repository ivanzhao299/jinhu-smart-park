# PR #196 Review Break-Loop Analysis

## 1. Root Cause Category

- **Primary: B — Cross-Layer Contract.** “模块开通”在迁移中取自
  `sys_module_registry`，但运行时 `/users/me` 与 `ModuleGuard` 取自
  `rel_tenant_module + sys_module`。
- **Secondary: D — Test Coverage Gap.** 原验证只覆盖同时具备两套记录的默认 UAT
  租户，以及普通角色的模块禁用态；没有标准 assignment-only 范围和超级管理员禁用态。
- **Contributing: E — Implicit Assumption.** 把超级权限理解成可旁路产品模块开通，
  并假定 registry 与 assignment 会始终同步。

## 2. Why The Previous Fix Passed

1. 默认 UAT 迁移同时写入 registry 和 tenant-module assignment，错误数据源被同形数据掩盖。
2. 迁移测试只做源码包含断言，并明确要求 registry 条件，测试固化了错误设计。
3. 模块禁用实测账号是普通 `PROPERTY_MANAGER`，没有触发 `hasModule` 的 superuser 分支。
4. 浏览器验收只验证已启用模块的正常路径，没有执行角色 × 模块状态的负向矩阵。

## 3. Prevention Mechanisms

| Priority | Mechanism | Action | Status |
|---|---|---|---|
| P0 | Architecture | `hasModule` 永远以 `enabled_modules` 为准，删除 superuser 旁路 | DONE |
| P0 | Architecture | `000182` 与运行时同源，查询有效 assignment + module | DONE |
| P0 | Tests | 增加 superuser 禁用态、assignment-only 与禁止 registry 依赖 | DONE |
| P1 | Runtime | 用真实数据库和 superuser `/users/me` 投影复验迁移、菜单与路由 | DONE |
| P1 | Documentation | 新增七段式模块访问契约并链接 API/Web 规范 | DONE |
| P1 | Review | 增加跨层模块可用性检查清单 | DONE |

## 4. Systematic Expansion

- `hasModule` 是全站共享入口，修正后所有模块菜单和页面都获得一致行为。
- 移动登录存在独立 `is_super` 快捷路径，已同步移除，避免修好侧栏后仍落入模块 403。
- 其他读取 `sys_module_registry` 的代码不能一概替换；只有在表达“租户是否开通产品”时才必须
  使用 assignment authority。后续评审应先判定语义，再选择表。

## 5. Knowledge Capture

- [x] `.trellis/spec/api/backend/module-access-control.md`
- [x] API/Web spec indexes
- [x] `.trellis/spec/guides/cross-layer-thinking-guide.md`
- [x] PR192 task PRD/design/implementation state
- [x] 本仓库不存在 `src/templates/markdown/spec/`，无项目模板副本可同步。
