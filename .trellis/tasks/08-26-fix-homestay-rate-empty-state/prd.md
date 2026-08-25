# 修复民宿价格未配置空态

## Goal

修复 UAT FAIL-01：合法民宿房源尚未配置价格时，以明确的 2xx 未配置响应驱动页面空态，消除正常首配流程中的 HTTP 404 Console error。

## Confirmed Facts

- `GET /homestay/rates/:unitId` 当前在合法房源无 rate config 时抛出 `Homestay rate configuration not found` 404。
- Web 已把该精确 404 映射为“尚未配置价格”空态，但浏览器仍会记录失败网络请求。
- 不存在、跨租户/园区或超出 unit scope 的房源必须继续 fail-closed，不能被当作正常空态。

## Requirements

- shared rate calendar 响应提供明确的 configured/unconfigured 判别态；未配置态不得伪造 0 元价格、取消政策或其他已配置事实。
- API 对合法可见但无 rate config 的 unit 返回 2xx 未配置响应；已配置日历响应与保存语义保持不变。
- Web 按 2xx 未配置判别态进入既有首配 UI；保留旧精确 404 的兼容分支，但不得吞掉 `Unit not found` 等权限/存在性错误。
- 改动限定在 rate 响应契约、rate 查询服务、rate 页面消费逻辑及其 focused tests，不修改数据库结构、价格保存规则或生产 seed。

## Acceptance Criteria

- [ ] 合法未配置 unit 的 rate 读取返回 2xx 明确未配置态，页面展示首配表单且不产生该 HTTP 404。
- [ ] 已配置 unit 继续返回完整日历，价格、override 与取消政策字段不回退。
- [ ] 不存在/越权 unit 继续返回 404/fail-closed，不误显示首配空态。
- [ ] shared contract、API service 与 Web logic focused tests 覆盖 configured/unconfigured/scope 边界。
- [ ] PR 经 Codex review、required CI、squash merge、main CI 与 Deploy 双绿后关闭 Issue #390。

## Evidence

- `docs/uat/homestay-full-flow-uat-20260825-212435.md` 的 FAIL-01 / C01-A。
- GitHub Issue #390。

## Out of Scope

- 去除 React StrictMode 或仅通过抑制 Console/Network 信息隐藏失败请求。
- 创建默认 rate config、修改保存幂等或价格计算规则。
