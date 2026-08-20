
# 民宿任务审批深链闭环

## Goal

消费 Track-B 合同中的 taskId、requestId，安全直达任务 owning aggregate 或审批详情，并保留列表上下文。

## Requirements

- 以共享 route/access/task/approval contract 为唯一来源。
- 不扩大权限，不使用 SUPER_ADMIN 绕过岗位验证。
- 写操作具备权限、幂等、审计、scope 和终态保护。
- 修改前补可失败回归，修改后运行风险匹配验证。

## Acceptance Criteria

- [x] taskId/requestId 直达、刷新、返回上下文通过。
- [x] 未知 source type、无权、跨 scope 安全降级。
- [x] 403/404 不泄露对象存在性。
- [x] Web unit 与真实浏览器 desktop/390 通过。

## Verification Evidence

- Final reviewed candidate SHA: `8012b854bcd2024b1f6bdfddf7cf13607d02bfc3`；PR #331，合并后 main SHA `619b8d20e891c74f69abcc9c908666034c37c648`。
- Web 逻辑/契约回归覆盖 UUID 目标解析、source allowlist、结构化 returnTo、字面百分号、审批分页恢复、过期加载与并发 mutation 竞态。
- Chrome DevTools MCP 验证桌面与 390px 目标定位、返回、page=2、键盘焦点及无横向溢出；最终 Web property 契约 19/19、lint、typecheck 通过。

## Out of Scope

- OTA、在线支付、门锁、公安、自助端和无关模块重构。

## Open Questions

- 无。

## Tracking

- GitHub Issue: #327
