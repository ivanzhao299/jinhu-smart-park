
# 民宿前端结构状态与测试门禁

## Goal

在行为测试保护下收敛 feature ownership、状态矩阵和 Web CI；离线高风险写继续 fail-closed。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [ ] 民宿 Web test 纳入默认 test:unit。
- [ ] 无 dual fetch/mutation owner。
- [ ] loading/empty/403/404/409/stale/submitting 覆盖。
- [ ] DS、390px、键盘和焦点门禁通过。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #329
