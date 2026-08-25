# 路由治理真实 Chrome 验收报告（2026-08-25）

## 结论

本轮在本地隔离全栈和 Windows 原生 Chrome CDP 上执行。五个 Trellis 修复任务中，登录设备识别、登录首页、403、404 四项通过；园区切换“可达路径保持原页”通过，但“不可达工程模块预测到合理落点”连续两次落到 `/403`，因此园区切换项失败且保持 `in_progress`。产品代码未修改。

## 环境

- Git 基线：`codex/main-post-bootstrap-landing`（`d0ecac65` 后两个本地 Trellis 提交）；验收分支 `codex/route-governance-browser-acceptance`。
- PostgreSQL：compose project `jinhu-route-acceptance-20260825`，容器 `jinhu-route-acceptance-20260825-postgres`，数据库 `jinhu_route_acceptance_20260825`，`127.0.0.1:55433`。
- API：`127.0.0.1:3101`；Web：`localhost:3100`。
- Chrome：Windows Chrome 151，专用 UAT profile，经已配置 CDP 操作。
- 桌面设备证据：viewport `1440×900`、`navigator.maxTouchPoints=10`、`(pointer:fine)=true`、`(pointer:coarse)=false`、Windows desktop UA，精确覆盖宽屏触屏笔记本场景。
- 移动近似：向真实 Chrome 请求 resize 到 `390×844`，Windows Chrome 保留最小窗口宽度，PNG 实际为 `500×844`；未模拟移动 UA、touch 或 coarse pointer，因此结论仅代表 `<=900px` 窄窗口契约，不冒充精确 390px 设备模拟。
- fixture 前缀：`UAT_ROUTE_20260825_`。包含 bootstrap 超管、租户首管、后建 TENANT_ADMIN、工程账号、窄权限账号和双园区账号。租户 `contact_user_id` SQL 核验为首管 user id。

## 初始化与健康门禁

- `pnpm db:migrate`：244/244 migration 成功，8 个 prerequisite 成功。
- `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`：production seed 成功，未运行 dev seed。
- bootstrap 前 `pnpm db:check:init`：仅 `no bootstrap admin found` 失败，符合预期。
- `pnpm db:bootstrap:admin`：创建 `UAT_ROUTE_20260825_SUPER`。
- bootstrap 后 `pnpm db:check:init`：全部 PASS。
- `GET /api/v1/health`：200；`GET /api/v1/ready`：200 且所有 readiness check 为 `ok`；Web `/login`：200。仓库实际 readiness 路径是 `/ready`，不是 `/health/ready`。

## Chrome 验收矩阵

| Case | 操作 | 期望 | 实际 | 结论 | 证据 |
|---|---|---|---|---|---|
| C01 / #344 + #346 | 1440×900、touchPoints=10、fine pointer 的 Windows Chrome 表单登录超管 | 不进工程终端，落 `/dashboard` | `/dashboard`，渲染数字运营中枢 | PASS | [C01](../../artifacts/route-governance-uat-20260825/C01-super-desktop-dashboard-pass.png) |
| C02 / #359 | 桌面表单登录租户 bootstrap 首管 | `/dashboard` | `/dashboard` | PASS | [C02](../../artifacts/route-governance-uat-20260825/C02-first-admin-desktop-dashboard-pass.png) |
| C03 / #359 | 桌面表单登录后建 TENANT_ADMIN | 首个可访问菜单，且非 `/dashboard` | `/system/orgs` | PASS | [C03](../../artifacts/route-governance-uat-20260825/C03-later-tenant-admin-first-menu-pass.png) |
| C04 / #353 | 已登录访问 `/nonexistent-xyz` | 真 404 | URL 保持未知路径，渲染“页面未找到 / 404” | PASS | [C04](../../artifacts/route-governance-uat-20260825/C04-unknown-route-real-404-pass.png) |
| C05 / #353 | 超管访问已注册、无独立页的 `/energy` | 保留兼容占位页 | 渲染“这个入口还没有单独做成完整页面”及相关正式入口 | PASS | [C05](../../artifacts/route-governance-uat-20260825/C05-registered-placeholder-preserved-pass.png) |
| C06 / #350 | 窄权限账号直达 `/engineering/dashboard` | `/403` 且不渲染工程看板 | `/403`，只显示权限拒绝文案 | PASS | [C06](../../artifacts/route-governance-uat-20260825/C06-layered-403-protected-route-pass.png) |
| C07 / #355 | 双园区账号在 park A 工程看板切到禁用 engineering 的 park B | 预测重定向到 park B 合理落点（fixture 提供 `/system/users`） | 两次均进入 `/403` | **FAIL** | [C07](../../artifacts/route-governance-uat-20260825/C07-park-switch-disabled-module-fail-403.png) |
| C08 / #355 | 双园区账号在两园区均可达的 `/system/users` 从 B 切回 A | 保持原 pathname | 保持 `/system/users` | PASS | [C08](../../artifacts/route-governance-uat-20260825/C08-park-switch-authorized-route-stays-pass.png) |
| C09 / 窄窗口观察 | 请求 390×844、实际 500×844 的 Windows Chrome 表单登录超管 | 记录窄窗口落点 | `/engineering/terminal`，符合既有移动优先矩阵；#346 只要求桌面 `/dashboard` | PASS（观察） | [C09](../../artifacts/route-governance-uat-20260825/C09-super-390px-terminal-observed.png) |
| C10 / #344 移动基线 | 请求 390×844、实际 500×844 的 Windows Chrome 表单登录工程账号 | `/engineering/terminal` | `/engineering/terminal`，渲染现场工程工作台 | PASS | [C10](../../artifacts/route-governance-uat-20260825/C10-engineer-390px-terminal-pass.png) |

### C07 失败说明

首次切换后落 `/403`。为排除 fixture 欠授权，补齐目标 park 的 `system:read`、`user:read`、`system:user`、`system:user:list`、`system:user:me`，并直接验证目标 park 的 `/system/users` 可以真实渲染；随后从 park A `/engineering/dashboard` 再次切换到 park B，仍落 `/403`。这满足同一环境问题最多两次的重试上限，现象按产品失败保留。疑似切换发布 `nextUser` 后，路由级守卫先于预测落点导航把当前工程页送入 `/403`；本轮未修改产品代码。

## 清理与 residual

- 浏览器通过真实“退出登录”结束最后账号，随后导航到 `about:blank`；没有关闭 Chrome 实例。
- 清理前审计：fixture users=6、tenant=1、parks=2、custom roles=2、`sys_file`=0、stored files=0。
- API/Web 均以 SIGINT 正常停止。
- `docker compose ... down -v --remove-orphans` 后：container=0、volume=0、network=0、监听端口（3100/3101/55433）=0、stored files=0。隔离数据库卷已删除，因此 fixture DB residual=0。
- `phoenix-v3-db`、`yuzhou-mssql`、既有 `jinhu-smart-park-postgres` 状态未改变。

## 遗留观察

- API watch 日志中，Safety inspection scheduler 对 production seed 的 7 个到期计划反复报告 `syntax error at or near "."`；路由验收未依赖该调度器，未影响本轮结论，也未在本轮修复。
- `/system/users` 在最小 fixture 角色下可通过路由守卫并保持 pathname，但数据区显示 `Forbidden resource`；本轮只用它证明园区切换 pathname 保持，不把数据列表授权计入 #355。
