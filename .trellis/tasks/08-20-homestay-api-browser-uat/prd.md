
# 民宿真实API与浏览器UAT闭环

## Goal

补齐民宿真实 API E2E、角色/范围/文件/并发矩阵、真实浏览器 UAT、证据和发布门。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [ ] 并发下单、成功改期/no-show、refund/waiver 通过。
- [ ] 多角色、跨园区、模块启停、字段/文件权限通过。
- [ ] desktop/768/390/360 无阻断问题。
- [ ] fixture/file/approval residual=0。
- [ ] 文档绑定同一 candidate SHA/环境。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #330
