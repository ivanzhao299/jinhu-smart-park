# 实施计划

1. 定位 PR #311 已落地的 `switchParkContext` 页面模式，以及 PR #315 的 select 样式。
2. 梳理 5 个目标页面当前请求方式、过滤状态和共享组件边界。
3. 新增或复用一个资产页面园区上下文选择控件。
4. 接入房源状态看板与资产统计页面。
5. 接入 `PropertyFoundationListClient` 覆盖经营配置、占用管理、经营模式审计。
6. 改善右上角园区切换样式。
7. 增加契约/单测覆盖。
8. 运行验证：
   - `pnpm --filter @jinhu/web test:unit:assets`
   - 相关新增测试命令
   - `pnpm --filter @jinhu/web typecheck`
   - `pnpm --filter @jinhu/web lint`
   - `git diff --check`
9. 使用 Chrome DevTools MCP 做本地 UAT。
10. 提交、推送、创建 draft PR，请求 Codex review。
11. 跟进 review/CI，修复反馈，复审通过后 ready + merge。
12. 跟进 main CI 与 Deploy Production，并更新 Issue #323。
