
# 民宿前端结构状态与测试门禁

## Goal

在行为测试保护下收敛 feature ownership、状态矩阵和 Web CI；离线高风险写继续 fail-closed。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [x] 民宿 Web test 纳入默认 test:unit。
- [x] 无 dual fetch/mutation owner。
- [x] loading/empty/403/404/409/stale/submitting 覆盖。
- [x] DS、390px、键盘和焦点门禁通过。

## Verification Evidence

- Final reviewed candidate SHA: `8012b854bcd2024b1f6bdfddf7cf13607d02bfc3`；合并后 main SHA：`619b8d20e891c74f69abcc9c908666034c37c648`。
- 默认 Web 单测门已包含民宿与共享房产 DS 契约。
- Chrome DevTools MCP 已完成桌面、平板、390px 和 360px 响应式检查，并验证结构化返回、键盘焦点、403/404/409 和真实列表/详情链路。
- 最新复审缺口已在 Chrome DevTools MCP 复验：审批列表从 `?page=2` 请求并显示第 2 页；已退房订单不显示“费用”，草稿订单禁用登记；390×844 无溢出且无小于 44px 的工作面控件。
- 深链目标切换后，旧目标写操作的成功/失败回调不会再刷新或覆盖新目标状态；共享运行时契约门已覆盖任务与审批两条路径。
- 最终候选验证：Web property 契约 19/19、Web lint、Web typecheck 与 `git diff --check` 通过；Codex 对 `8012b854` 明确确认无重大问题，main CI run `32340203702` 全绿。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #329
