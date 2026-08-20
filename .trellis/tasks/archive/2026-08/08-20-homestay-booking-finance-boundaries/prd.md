
# 民宿订单住客财务边界闭环

## Goal

补齐普通财务终态、住客人数上限、住客候选最小披露和敏感字段 E2E。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [x] booking status/action matrix 稳定返回 409。
- [x] active guest 不超过 guest_count。
- [x] candidate 搜索分页限量且不返回敏感字段。
- [x] refund/waiver 审批和敏感响应 E2E 通过。

## Verification Evidence

- Final reviewed candidate SHA: `8012b854bcd2024b1f6bdfddf7cf13607d02bfc3`；PR #331，合并后 main SHA `619b8d20e891c74f69abcc9c908666034c37c648`。
- API policy/service/DTO 回归覆盖状态矩阵、人数上限、候选最小实质字符与通配符转义；Web 财务入口镜像后端状态矩阵。
- PostgreSQL 16 真实 API E2E 覆盖退款/减免审批成功链、敏感响应与跨园区负向路径；main CI、Release Smoke 与生产健康校验通过。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #326
