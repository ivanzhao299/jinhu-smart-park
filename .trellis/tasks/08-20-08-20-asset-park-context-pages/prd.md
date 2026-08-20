# 修复资产页面园区切换缺口

## Goal

补齐房源状态看板、资产统计、房源经营配置、房源占用管理、经营模式审计的园区切换能力，并改善右上角园区切换样式。

## Requirements

- GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/323
- 复用 PR #311 的园区上下文模式：用户选择目标园区后，通过 `switchParkContext(parkId)` 切换认证上下文；后续查询/新增/详情请求使用切换后的 token 和服务端当前园区，不通过前端任意 `parkId` 绕过权限。
- 复用 PR #315 的样式修复思路，进一步提升页面右上角园区切换控件在生产浏览器中的文字/背景对比度、悬停/聚焦可读性、禁用态可读性。
- 目标页面：
  - 房源状态看板 `/assets/unit-status-board`
  - 资产统计 `/assets/statistics`
  - 房源经营配置 `/assets/property-operations`
  - 房源占用管理 `/assets/property-occupancies`
  - 经营模式审计 `/assets/property-mode-transitions`
- 页面切换园区后必须刷新目标园区数据，并避免继续展示旧园区数据造成误判。
- 保持权限、模块、认证边界不放宽；没有可访问园区时显示现有空态/权限提示，不新增越权入口。
- 本地必须使用 Chrome DevTools MCP 做桌面与移动视口 UAT。
- 按用户给定闭环流程完成：新分支、Issue、实现、验证、PR、Codex review、CI、合并、部署跟进。

## Acceptance Criteria

- [ ] 右上角园区切换控件文字、背景、悬停、聚焦、禁用态在生产样式下可读。
- [ ] 5 个目标页面都有清晰的园区切换入口，切换目标园区会调用 `switchParkContext` 并刷新页面数据。
- [ ] 切换失败时错误停留在页面本地，不跳转登录，不继续使用错误上下文请求。
- [ ] 目标页面的请求不新增任意 `parkId` 写入绕过；遵循认证上下文。
- [ ] 覆盖必要的单测/契约测试，防止目标页面再次缺少园区切换。
- [ ] Web typecheck/lint 和相关单测通过。
- [ ] Chrome DevTools MCP 本地 UAT 覆盖桌面与 390px 移动视口。
- [ ] PR 通过 Codex review 和 CI；合并后 main CI 与 Deploy Production 成功，Issue #323 更新最终结果。

## Notes

- 附图路径 `D:\PersonalFiles\Temp\codex-clipboard-08780ec6-5174-4f75-8404-c96d97d772f7.png` 当前不可读；本任务以用户文字描述和线上复测反馈为事实来源。
