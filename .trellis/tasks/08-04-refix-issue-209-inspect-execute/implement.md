# Implementation Plan

1. 扩展 API 巡检任务详情投影，统一返回 enabled 检查项，并让重复 start 在 in-progress 状态安全恢复详情。
2. 重构 Web 执行入口：按状态启动或恢复、移除模板检查项管理接口依赖、隐藏终态动作、增加同步防重锁与加载反馈。
3. 为 API 状态转换/详情投影和 Web 状态决策/源码接线补充回归测试。
4. 将业务动作上下文与单击启动规范写入相关 Trellis API/Web spec。
5. 运行目标测试、API 全量单测、Web/API lint、typecheck、build 和 `git diff --check`，再提交、推送、创建 PR 并请求 Codex review。
