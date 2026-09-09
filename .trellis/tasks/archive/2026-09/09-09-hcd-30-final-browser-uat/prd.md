# HCD 30 Case 终局浏览器 UAT

## Goal

在 L-04 `dcd9a9cf` 已入库浏览器证据基线上，以一次新的、真实认证的隔离浏览器运行完成 27 路由 × desktop/mobile 矩阵，并对 HCD-001—030 作不可继承旧状态的终局裁定。

## Requirements

- 核实窄权限 API probe 的 bearer header 已在 `main`；若缺失，仅修正该根因并加契约测试。
- 使用 disposable compose PostgreSQL、API、Web 和专用 Chromium/profile；不连接主 Chrome、不操作生产、不影响其他容器。
- 真实键盘登录并观察登录 POST；每个 27 路由在 1440×960 与 390×844 各执行一次，fail closed。
- 逐 Case 验证原审查报告定义，包括中文状态/来源、picker 名称回显、窄权限名称不泄漏和中文占位、未知值兜底、详情具名数据、长中文不溢出且不挤压主操作。
- ignored `artifacts/` 保存截图、DOM 断言、Network 摘要和 SHA-256 manifest；不得保存秘密或个人敏感信息，提交前逐图复核并扫描文本证据。
- HCD 范围内显示缺陷可修复并复验，同根因最多两次自动修复；范围外缺陷只登记 Issue。
- 更新 `docs/uat/hcd-chinese-display-uat-2026-09-02.md`，保留四轮基建史，30 Case 每项只能按本轮证据记 PASS/FAIL。
- 报告 PR 经最多三轮 review、CI、squash merge；按常设门禁规则观察 main，关闭对应 Issue，归档 Trellis 任务。
- 不碰 HR；无 force push；push 仅当前专用分支，main 只由 `gh pr merge` 更新。

## Acceptance Criteria

- [x] `origin/main` 上 bearer probe 和契约断言被明确核实，或已一次修正并验证。
- [x] 本轮报告记录完整 54 个 viewport cells、真实登录/登出/新 BrowserContext 隔离及每页 Network/DOM 证据。
- [x] HCD-001—030 每项均有本轮 PASS 证据索引，或 FAIL 与缺陷编号；无 BLOCKED/沿用旧 PASS。
- [x] 证据 manifest 可复算且隐私门禁通过，敏感凭据不在报告、截图、日志或 Git 中。
- [x] 范围内缺陷完成修复与针对性复验；范围外缺陷已有 Issue 且没有越界修改。
- [x] 文档终版、相关契约/产品检查和 lint 在可适用范围内通过；本机 typecheck/build 受 root-owned `node_modules` 缺少 Web 测试依赖阻断，待干净 CI 裁定。
- [ ] PR squash merged，main 常设门禁满足，Issue 关闭，任务归档并提交最终 30 Case 矩阵与 Cost Summary。

## Notes

- 基线：L-04 PR #719，commit `dcd9a9cf`。
- 本任务为独立 UAT/缺陷闭环；此前 BLOCKED、SURFACE_ONLY 或静态证据不得升级为本轮 PASS。
- 用户已明确批准本独立任务及完整执行闭环。
