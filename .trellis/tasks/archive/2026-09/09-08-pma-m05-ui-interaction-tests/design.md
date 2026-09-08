# Design: PMA M-05 UI 真实交互测试

## Architecture

- 在 `apps/web` 增加 Vitest jsdom runner；React/ReactDOM 继续使用应用现有版本。
- 共享 setup 只提供浏览器缺失能力的最小 polyfill，不 mock 目标组件内部状态。
- 使用 Testing Library 查询可访问角色/名称，使用 user-event 触发点击、键盘、Tab 与输入；业务 API 仅在组件边界 mock，并断言真实调用参数。
- 新命令 `test:unit:interaction` 纳入现有 `test:unit:web` 聚合链；原 Node test runner 套件保持不变。

## Test slices

1. Dialog：直接 mount `ConsequenceDialog` 证明通用控件契约；再 mount 一个最小真实 S-03 接入组件/页面片段，证明确认行为抵达业务 mutation。
2. Picker：直接 mount `RemoteEntityPicker` 证明交互与 controlled rerender；mount `HousingLeaseCreatePanel` 证明 unit/tenant ID 进入 submit payload。
3. Dirty leave：用测试 host component 调用真实 hook，派发 beforeunload 与 anchor click，并验证多实例注册/清理。

## Mutation proof

- 每一类选择一个独立关键实现，工作树中临时打补丁后只跑对应测试并要求非零退出。
- 立即恢复该临时补丁，核对目标文件无 diff，再运行完整 interaction suite。
- mutation proof 不提交破坏性版本，只在 task evidence 中记录命令、被删语句、失败测试名和退出码。

## Compatibility and risk

- jsdom 不等于真实 Chromium，因此浏览器布局、390px overflow 与跨页面导航仍由 L-04 负责。
- `<dialog>` 的 jsdom polyfill只实现 open/showModal/close 与 cancel 事件所需合同，不伪造浏览器焦点算法；焦点移动仍由组件代码和 user-event 验证。
- 测试不得通过源码扫描作为主要断言，也不得直接调用组件函数或 props handler 来冒充用户行为。
- 不改金融、权限、API 或数据库行为；若组件无法测试，优先最小 seam，而不是重构业务流程。

## Rollback

- runner/config/dependency、共享 setup、三组测试分层提交；任何 runner 兼容问题可整体回退而不影响产品运行时代码。
- mutation proof 每步恢复后必须以 `git diff --exit-code -- <target>` 证明没有残留。
