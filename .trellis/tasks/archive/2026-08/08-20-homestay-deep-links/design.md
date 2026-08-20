# 技术设计

由 tasks route 解析合同参数；taskId 先从授权 task projection 解析 source，requestId 跳转授权 approval incident/detail。未知类型显示稳定状态，禁止默认 booking。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
