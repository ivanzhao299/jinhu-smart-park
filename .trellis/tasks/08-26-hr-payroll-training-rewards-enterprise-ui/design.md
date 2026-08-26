# Design

## Frontend

- 培训、奖惩以共享 `ds-hero` 作为顶部入口，说明文案与刷新动作放入 Hero 的 copy/actions 区。
- 工资保留单路由四工作区业务架构，把 tabs 与当前工作区操作合并为可辨识的企业级 section navigation；每个工作区继续使用显式 `ds-panel`、`ds-mobile-record` 和已有分页/权限门禁。
- 页面局部 CSS 只承担工资导航和小范围布局，不重定义全局卡片、输入框、颜色或阴影。

## Backend

- `listPlans` 仅在实际 SQL 使用 `$5` 的 self/team 范围传 actor 参数；park 范围只传 `$1..$4`，动态 status 参数保持占位符连续。
- 增加 Service 回归，证明 park、self 和可选 status 三种参数形态均与 SQL 占位符一致。

## Verification

- 静态合同覆盖三页 Hero/工资工作区导航。
- API 定向测试覆盖培训查询参数。
- Web/API lint、typecheck、build、CSS architecture、diff-check。
- 生产桌面与 390px 浏览器截图和 computed-style/overflow 验收。
