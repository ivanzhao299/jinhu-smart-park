# 技术设计

复用 property API disposable gate 和现有 human-UAT kit；mock 仅作布局辅助，不替代真实 API/角色证据。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
