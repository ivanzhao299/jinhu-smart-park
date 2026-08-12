# 修复新租户 asset 投影缺失阻断生产部署

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/257

## Goal

使新租户启用 asset 模块时同时拥有可信的 `asset_park` 投影，并让历史“唯一有效 biz_park、缺失 asset_park、runtime controls 全空”的 scope 通过现有 production seed 安全收敛，解除生产部署门禁且不放宽其他异常状态。

## Acceptance Criteria

- 新租户创建及授权更新启用 asset 时在同一事务内确保唯一 `asset_park`、12 条 disabled runtime controls 与 24 条合同修正审计存在。
- 后续禁用 asset 不删除不可变审计或已投影业务数据；拥有合法历史 asset assignment 的完整 12/24 scope 作为 retained scope 继续通过只读门禁，partial/unknown scope 仍阻断。
- 业务写路径只接受唯一有效 `biz_park` 来源；固定默认 scope 仅允许使用 production seed 已审查的全局唯一 `JH` 回退，重复来源或投影继续 fail closed。
- predeploy classifier 仅在 production seed 明确启用、迁移/兼容历史正确、同 scope 唯一有效 biz_park 时允许 seed reconcile。
- production seed 000007 补 asset 投影，000008 补 12 条 disabled controls 与完整审计，复跑为 `ready_exact`。
- ambiguous/partial/invalid scope 继续 fail closed。
- active/retained scope 均只允许一个 enabled 且非删除投影；一个 enabled 加一个 disabled 非删除投影仍为 invalid。
- 所有启用 asset 的写入口共用同一 tenant/park 事务锁；直接创建资产园区与租户、SaaS 模块分配不能并发生成重复投影。
- 登录授权变更收敛所有非删除园区的模块和 TENANT_ADMIN 权限；仅 active 园区创建资产投影与运行时控制。
- 已停用 assignment 的 retained scope 即使租户已过期也继续按历史 exact-set 校验；active/retained 的 24 条修正审计内容或证据漂移均阻断。
- retained scope 只有在 `post_000195` 最终合同阶段才允许 `ready_retained_exact`；更早阶段必须阻断，不能等待不会处理 retained scope 的 forward migration 自动修复。
- inactive 园区保留最小 `park:read`/`park:update` 恢复能力和 system 模块页面入口，但不保留 building/unit/property 等资产模块权限。
- 受保护 scope 可停用或删除冗余 canonical park 行以修复歧义，但不能删除最后一个或留下多个 active 来源。
- runtime-control 应用侧验证两轮修正审计的时间链与最终 control `update_time` 一致。
- CI、Release Smoke、生产部署、健康、UAT、Docker 清理通过。
