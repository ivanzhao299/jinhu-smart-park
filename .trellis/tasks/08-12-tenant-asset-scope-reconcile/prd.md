# 修复新租户 asset 投影缺失阻断生产部署

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/257

## Goal

使新租户启用 asset 模块时同时拥有可信的 `asset_park` 投影，并让历史“唯一有效 biz_park、缺失 asset_park、runtime controls 全空”的 scope 通过现有 production seed 安全收敛，解除生产部署门禁且不放宽其他异常状态。

## Acceptance Criteria

- 新租户创建及授权更新启用 asset 时在同一事务内确保唯一 `asset_park`、12 条 disabled runtime controls 与 24 条合同修正审计存在。
- 业务写路径只接受唯一有效 `biz_park` 来源；固定默认 scope 仅允许使用 production seed 已审查的全局唯一 `JH` 回退，重复来源或投影继续 fail closed。
- predeploy classifier 仅在 production seed 明确启用、迁移/兼容历史正确、同 scope 唯一有效 biz_park 时允许 seed reconcile。
- production seed 000007 补 asset 投影，000008 补 12 条 disabled controls 与完整审计，复跑为 `ready_exact`。
- ambiguous/partial/invalid scope 继续 fail closed。
- CI、Release Smoke、生产部署、健康、UAT、Docker 清理通过。
