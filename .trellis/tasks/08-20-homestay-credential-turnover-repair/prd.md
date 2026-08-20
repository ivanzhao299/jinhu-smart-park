
# 民宿凭证保洁维修闭环

## Goal

补凭证遗失审计，并核实周转异常关联维修工单、维修占用和恢复可售门禁。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [x] issued 凭证可登记 lost，lost/void/returned 状态不可非法转换。
- [x] 周转异常只能关联同房源有效工单；工单仍由工单权威入口创建。
- [x] 未完成周转占用持续阻止恢复可售；关联工单的生命周期不由民宿模块伪造。
- [x] 遗失原因、附件、关联工单和占用来源可追溯。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。
- 在缺少跨模块事务、唯一业务键和生命周期事件合同前，民宿异常自动创建维修工单。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #328
