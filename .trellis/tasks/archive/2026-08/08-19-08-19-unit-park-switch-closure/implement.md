# 修复房源新增归属园区选择闭环 Implement

## Steps

1. 任务建模：记录根因、方案、验收范围。
2. 前端实现：
   - `UnitsPageClient` 增加园区上下文状态、切换函数、候选刷新和提交前上下文保障。
   - `UnitFormDialog` 增加新增模式园区选择、表单错误、切换/提交禁用态。
   - `types.ts` 增加 `parkId`。
3. 回归覆盖：
   - 增加房源园区切换逻辑测试并纳入 `test:unit:assets`。
   - 扩展 `first-release-context-switch.mjs` 覆盖目标园区房源创建、隔离查询和清理。
4. 验证：
   - `pnpm --filter @jinhu/web test:unit:assets`
   - `pnpm --filter @jinhu/web test:unit:floor-layout`
   - `pnpm --filter @jinhu/web test:unit:auth-session`
   - `pnpm --filter @jinhu/web typecheck`
   - `pnpm --filter @jinhu/web lint`
   - `node --check scripts/e2e/first-release-context-switch.mjs`
   - `git diff --check`
   - Chrome DevTools MCP 本地浏览器自测。
5. 闭环：创建 Issue，推送独立分支，创建 PR，触发 Codex review，处理意见，合并并跟进部署/CI 状态。
