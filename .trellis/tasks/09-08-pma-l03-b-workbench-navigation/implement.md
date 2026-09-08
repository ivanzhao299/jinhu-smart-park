# Implementation Plan: PMA L-03 B 端工作台与全局导航

## 1. Registry and breadcrumb

- [x] 新增 typed route registry 与 unit/contract tests。
- [x] 迁移 terminal 判断、动态 breadcrumb matcher，并接入安全动态 label provider；housing DetailPage 发布授权后 title。

## 2. Permission-aware palette

- [x] 新增 strict API menu tree recursive flatten/filter model 与全局 palette UI。
- [x] 加入 keyboard/focus trap/scope-reset mounted tests；permission/module/menu fingerprint 变化清空旧状态。

## 3. List preferences

- [x] 新增 versioned/scoped preference hook 与 mounted tests；坏/旧 storage、写异常、allow-list 稳定处理。
- [x] 接入 PropertyListShell 首批四页面的 filtersOpen；保持 mobile cards。

## 4. Quality and delivery

- [x] 导航 unit 21/21；targeted ESLint、`git diff --check` passed。Mounted Vitest/typecheck 在本地仅因 stale/root-owned node_modules 缺 Testing Library/Vitest 未执行/失败；L-03 TS 自身错误已清零，等待 clean PR CI。
- [ ] Desktop/390px browser：独立 Next dev 已启动成功；Chrome connector 未监听，缓存 Chromium 因主机缺 `libnspr4.so` 无法启动，未伪造实机证据。留给 L-04 专用浏览器基线并以 PR mounted tests/CSS contract 先兜底。
- [x] 3 轮 review：第 1/2 轮 findings 已修，第 3 轮 clean。
- [ ] PR/CI/merge/containing-main gate；archive/RBAC/branch/prune/journal。

## Cost Summary template

Task: PMA L-03 B 端工作台与全局导航
Status: implementation and local review complete; delivery pending
Files changed: web routes/menu/layout/palette/breadcrumb/list preferences, four list pages, tests, CSS, task artifacts
Tests run: menu/routes/palette 21/21; targeted ESLint; diff check; local Next dev readiness
Retries: canonical permission enrich test fixed in two attempts; no further retry
Approx model rounds: planning 1, implementation/check 3
Repeated scans avoided: three focused one-round scouts
Blocked issues: local test deps absent; cached Chromium missing host libnspr4
Next step: commit, clean PR CI, merge and containing-main closure
