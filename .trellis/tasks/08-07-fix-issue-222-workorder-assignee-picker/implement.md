# Issue #222 Implementation Plan

## Implementation

- [x] 将现有派单抽屉提升到 `apps/web/components/workorders/`，用组件内最小 props 类型与姓名解析消除列表私有类型/工具依赖。
- [x] 更新工单列表页导入路径，确认列表现有行为不变。
- [x] 在工单详情页加载启用用户候选，处理加载中/空/失败状态，并维护 assign/reassign 抽屉与表单状态。
- [x] 将 assign/reassign 从 prompt 请求构建中分离，点击动作改为打开共享抽屉。
- [x] 实现详情页派单/改派校验、幂等提交、成功投影更新、日志刷新和状态清理。
- [x] 增加 Web 防复发测试，覆盖候选加载与空状态、无 ID prompt、共享抽屉、中文校验、每次提交幂等键和请求契约。

## Validation

- [x] 运行新增定向 Node 测试。
- [x] `pnpm --filter @jinhu/web lint`
- [x] `pnpm --filter @jinhu/web typecheck`
- [x] `pnpm --filter @jinhu/web build`
- [x] `git diff --check`
- [ ] 浏览器检查 `/workorders/:id` 的桌面与 390px 视口派单抽屉；记录测试账号/数据或工具阻塞。
- [x] 运行 Trellis `trellis-check` 质量复核并核对 PRD 验收项。

浏览器检查阻塞：`computer-use` 初始化返回 `sandboxCwd is not a local file URI`，且本地未安装 Playwright/Chromium；已通过 Web production build 与 `pnpm css:check` 作为可执行替代证据。

## Review And Delivery

- [ ] 仅提交 Issue #222 所需文件，确认隔离分支无无关改动。
- [ ] 创建清晰 commit，推送 `codex/fix-issue-222` 并创建 draft PR。
- [ ] 请求 Codex review；验证反馈后修复同类风险并补测试/规范。
- [ ] CI、Codex review 与所有 review threads 均稳定通过后再通知可合并，不自动合并。

## Risky Files / Rollback Points

- `apps/web/app/workorders/[id]/page.tsx`：状态分流必须保证非派单动作仍按原逻辑提交。
- 共享派单抽屉移动：列表页 import 和 props 结构必须同时验证。
- 候选加载失败：必须进入现有 message 错误通道，不得影响详情主体加载。
