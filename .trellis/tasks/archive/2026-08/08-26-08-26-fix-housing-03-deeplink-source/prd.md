# 修复住房审批深链来源白名单

## Goal

修复住房审批任务深链对经营模式审批来源的误拒绝，使 `property-operation-config` 审批可从 `/housing/tasks?requestId=...` 打开详情，同时保持来源校验 fail-closed。

## Requirements

- 住房 approval runtime source allowlist 接受 `property-operation-config`。
- 通知深链、runtime slot、详情 returnTo 与 shared contract 保持一致。
- 不扩大 task source allowlist，也不接受非住房或未知 approval source。
- 补充 Web/shared 契约测试，并进行真实浏览器回归。

## Acceptance Criteria

- [ ] `property-operation-config` 审批目标可通过住房任务 runtime slot 校验并到达正确审批详情。
- [ ] 未知 source 与明确非住房 source 继续被拒绝。
- [ ] `/housing/tasks` returnTo 保留 `requestId`，通知模板仍为 `/housing/tasks?requestId=[requestId]`。
- [ ] 相关 Web/shared/API 契约测试、typecheck、lint 通过。

## Notes

- GitHub Issue: #404（PR 必须 `Closes #404`）。
- 生产默认语义、审批写入和数据库结构均不在本任务范围。
