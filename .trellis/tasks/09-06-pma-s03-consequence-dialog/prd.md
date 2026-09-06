# PMA S-03 统一高风险动作确认

## Goal

落实 Issue #664 与 D-05：只对入住、退房、结算确认及退租生效使用共享 `ConsequenceDialog`，普通编辑不弹确认。

## Requirements

- 复用 `features/property-shared` 现有 `ConsequenceDialog`，不另建同类组件。
- 民宿办理入住/退房展示稳定目标、后果与结果状态，确认后才调用原 API。
- leasing 确认结算与退租生效替换 `window.confirm/prompt`；生效日期和意见留在 dialog 内。
- 预览、普通编辑和退款登记不新增确认。
- 零 migration；不修改 HR #565-#646。

## Acceptance Criteria

- [ ] 民宿入住/退房均使用共享 consequence contract。
- [ ] leasing 结算确认与生效均使用共享 dialog，代码中不再为这两条路径调用 `window.confirm/prompt`。
- [ ] 失败保持 dialog 打开，成功后关闭并保留原刷新行为。
- [ ] Web 定向测试、lint、typecheck/build 与 CI/Smoke 通过。

## Notes

- GitHub Issue: #664
- D-05：高风险才确认；普通编辑不弹。
