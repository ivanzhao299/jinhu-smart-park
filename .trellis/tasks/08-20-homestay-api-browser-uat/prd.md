
# 民宿真实API与浏览器UAT闭环

## Goal

补齐民宿真实 API E2E、角色/范围/文件/并发矩阵、真实浏览器 UAT、证据和发布门。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [x] 并发下单、成功改期/no-show、refund/waiver 通过。
- [x] 多角色、跨园区、模块启停、字段/文件权限通过。
- [x] desktop/768/390/360 无阻断问题。
- [x] fixture/file/approval residual=0。
- [x] 文档绑定同一 candidate SHA/环境。

## Verification Evidence

- Candidate SHA: `89d08149978c5677fff8d1541c2e248dabf07993`
- API E2E: `jinhu_homestay_api_e2e_r5`，PostgreSQL 16，数据库 `jinhu_property_api_e2e_homestay_r5_20260820`，全链路通过。
- Browser UAT: Chrome DevTools MCP，本地 API/Web，1440×900、768×900、390×844、360×800 通过。
- 角色与权限：独立审批人真实执行退款/减免；跨园区、模块、字段和文件边界由真实 API E2E 与现有权限/数据库契约测试联合覆盖。
- 清理：测试容器、网络、数据卷、临时 compose、文件目录、截图及临时诊断文件均已删除，残留检查为零。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #330
