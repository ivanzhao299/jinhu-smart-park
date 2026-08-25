# 路由治理五项真实 Chrome 验收

## Goal

在完全隔离的本地全栈环境中，通过连接 Windows 专用 Chrome CDP 的真实页面操作，验收已经合入 main 的路由治理修复，并形成可审计证据、清理结果和 Trellis/GitHub 闭环。

## Requirements

- 验收 #344、#346、#359、#353、#350、#355 对应的登录落点、404/占位、403 分层和园区切换行为。
- PostgreSQL、API、Web 使用独立资源名和端口，不接触 `phoenix-round3-postgres`、生产环境或用户主 Chrome。
- 页面结论必须来自专用 Windows Chrome 的实际 URL、DOM/文本和截图；API 仅用于环境与 fixture。
- 使用 `UAT_ROUTE_20260825_` 前缀的无真实数据账号；截图不得暴露密码或环境机密。
- 关键页面覆盖桌面和 390px 视口；若 CDP 只能调整 viewport，报告中如实记录近似方式。
- 产品代码零改动；产品行为失败只记录，不现场修复。同一环境问题最多重试两次。
- 完成后登出并停在 `about:blank`，删除 fixture/文件，确认 residual=0，停止 API/Web 并 down 独立数据库。
- 产出截图和验收报告；仅推送 `codex/route-governance-browser-acceptance`，创建 PR、完成 review/CI/合并/main CI+Deploy 观察及本地收尾。
- 对应五个 Trellis 修复任务仅在其验收项全 PASS 时更新、完成并归档；失败任务保持 `in_progress` 并记录缺口。

## Acceptance Criteria

- [ ] 宽视口鼠标桌面登录不误落 `/engineering/terminal`；超管和 bootstrap 首管落 `/dashboard`。
- [ ] 后建 TENANT_ADMIN 登录落首个可访问菜单且非 `/dashboard`，证明首管指针契约边界准确。
- [ ] 完全未知路径显示真 404；已注册但未建页菜单仍显示占位页。
- [ ] 无权限用户直达受守卫页面进入 `/403` 或 `?reason=module`，且不出现受保护内容。
- [ ] 双园区账号从模块可用园区切到不可用园区时合理重定向；切回可用园区时保留原页。
- [x] 请求 390px（Windows Chrome 最小实际 500px）记录超管落点，并验证工程账号 `/engineering/terminal`，证明 `<=900px` 移动基线未回退；#346 的 `/dashboard` 契约仅限定桌面。
- [ ] 每项均有操作、期望、实际、PASS/FAIL 和截图文件名，证据位于 `artifacts/route-governance-uat-20260825/`。
- [ ] 清理报告包含 fixture/file residual=0、端口释放和独立 compose down 结果。
- [ ] 验收报告、Trellis 更新和截图经 PR 合入；review、分支 CI、main CI 与 Deploy 均有最终状态记录。

## Notes

- PR223 历史 UAT 仅作为隔离与证据格式先例，不复用其数据库、账号或浏览器 profile。
- “五项”按五个 Trellis 修复任务计数；#346 与 #359 均归属于登录首页契约验收。
