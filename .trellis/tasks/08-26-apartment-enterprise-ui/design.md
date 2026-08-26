# 技术设计

- 新增路由内共享 `ApartmentSectionNav`，由一份栏目元数据渲染六个可描述导航卡，Workbench 和 Documents 共用，避免样式漂移。
- 保留全局 Design System 视觉属性；模块 CSS 只负责栏目网格、表单列、业务记录布局和响应式断点。
- 业务页顺序调整为 Hero → 栏目导航 → 错误 → KPI → 创建/办理 → 记录；总览为 Hero → 栏目导航 → KPI → 快捷入口。
- 720px 以下导航两列、表单一列；420px 以下导航单列。所有容器使用 `minmax(0, 1fr)`、`min-width: 0` 防止横向溢出。
- 不修改请求、状态、权限和动作代码。
