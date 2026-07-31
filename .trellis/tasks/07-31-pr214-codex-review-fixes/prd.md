# 处理 PR214 Codex Review P1

## Goal

修复 PR #214 Codex Review 的两个 P1，保护超期业务状态和隐藏巡检附件证据。

## Requirements

- 超期列表筛选上下文不得写入 `overdue_flag` 或其他持久化业务状态。
- 超期专用页面不得提供会产生“保存成功但不在当前列表”错觉的普通隐患新增入口。
- `overdue_flag` 继续由后端超期重算流程依据整改期限维护。
- 巡检打卡附件字段在响应缺失、脱敏或形态异常时，重新提交不得清空服务端既有附件。
- 明确区分“可见的空数组（用户主动清空）”和“不可用投影（必须省略字段并保留服务端值）”。
- 修复必须覆盖前后端边界测试，并回复两个 Codex review threads。

## Acceptance Criteria

- [x] `HazardsPageClient` 不再由 `effectiveOverdueOnly` 初始化或提交 `overdue_flag`。
- [x] 超期专用页面不显示新增隐患按钮；普通隐患页面新增能力不变。
- [x] 打卡请求仅在附件投影可用时发送 `photo_file_ids`。
- [x] API 在 `photo_file_ids` 缺省时保留既有附件，在显式空数组时允许按现有校验清空。
- [x] 新增回归测试覆盖筛选/业务状态分离、脱敏附件保留、显式空数组语义。
- [x] API/Web 相关单测、lint、typecheck、build 通过。

## Notes

- 来源：PR #214 Codex Review 的两个未解决 P1 threads。
- 不自动合并 PR。
