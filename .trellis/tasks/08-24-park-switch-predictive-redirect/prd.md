# 园区切换后预判路由重定向

## Goal

园区上下文切换成功后，基于后端返回的权威 `nextUser` 预判当前路由在目标园区是否仍可达；可达时留在原页，不可达时按既有登录落点语义重定向，避免先落入 403 或空页面。

## Requirements

- 不修改 `switchParkContext` 的 token 轮换、跨标签锁、失败保留 session 契约或 API 契约。
- `/dashboard` 是无模块依赖的安全路由，切换后始终保留。
- 当前路径命中菜单 href 或其详情子路径时，继承菜单 permission 和父级 module；目标园区仍有访问权则保留，否则重定向。
- `/engineering/terminal` 与 `/operations/terminal` 按既有终端权限和模块规则判断。
- 无法映射到菜单或终端契约的非菜单工具页保守保留，由页面级守卫继续负责；不得靠硬编码全站路由表猜测权限。
- 不可达时复用 `resolvePostLoginPath(nextUser)`，不得回退 #344 的设备识别、#346 的桌面超管 `/dashboard`，不得破坏业务岗首菜单价值。
- 桌面 `UserMenu` 和移动 `MobileTerminalHeader` 行为一致；成功发布新用户后，重定向或刷新二选一。
- 影响矩阵：当前菜单权限保留/丢失、动态详情路由、工程/安全移动终端、超管、未知工具页、切换失败。

## Acceptance Criteria

- [x] 当前菜单页或详情子路由在目标园区仍可达时保持 pathname 并刷新。
- [x] 当前菜单页或终端在目标园区不可达时，重定向到目标用户合理落点。
- [x] `/dashboard` 与未知非菜单页不会被误重定向。
- [x] 桌面和移动切换入口共享同一判定契约。
- [x] 目标 spec、既有 auth-routing spec、Web typecheck、lint、build 通过。
- [ ] 浏览器不可用时如实记录，任务保持 `in_progress`。
- [ ] 2026-08-25 Windows 真实 Chrome：可达 `/system/users` 跨园区保持 pathname 通过；但从 park A `/engineering/dashboard` 切到禁用 engineering 的 park B 连续两次均落 `/403`，未到合理落点，因此保持 `in_progress`。证据见 `docs/uat/route-governance-browser-acceptance-20260825.md`。

## Notes

- 历史基线：PR #311（`a6349580`）的园区上下文安全切换契约；PR #344、#346 的登录落点规则。
- 既有 real HTTP context-switch E2E 脚本存在，但历史账本记录尚未实际运行通过；本项不把脚本存在当作运行时验收完成。
