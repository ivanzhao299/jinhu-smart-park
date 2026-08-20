
# 民宿凭证保洁维修闭环

## Goal

补凭证遗失/补发审计，以及周转异常创建/关联维修工单、维修占用和恢复可售门禁。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [ ] lost/void/returned 状态不可非法转换。
- [ ] 异常可幂等创建或关联同房源工单。
- [ ] 未完成维修不得复检通过或恢复可售。
- [ ] 赔偿/附件/占用来源可追溯。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #328
