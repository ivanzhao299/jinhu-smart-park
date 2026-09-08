# PMA M-01 资产投影生命周期对称化

## 关联

- GitHub Issue: #696
- 审查项: PMA-009 / 报告 §5.2 M-01
- 已批准决策: D-02（active 运营投影存在时默认禁止删除；必须显式停用/解绑）

## 目标与用户价值

让物理 `asset_unit` 与运营 `biz_unit` 的删除、停用、解绑和恢复形成可解释、可审计、逐租户隔离的完整生命周期，避免源记录不可见但运营投影仍活跃，或恢复后映射状态不确定。

## 已确认事实

- `AssetsService.deleteUnit` 已在事务内锁源，并阻止仍关联 active `biz_unit` 的源删除；这是 S-02 最小防线。
- `AssetSpaceMappingService` 已提供带 advisory lock、幂等键和 append-only audit 的 link/unlink。
- `PUT /property/units/:unitId/operation` 可同时设置 `operating_status=disabled` 与 `asset_unit_id=null`，但当前解绑前没有按 D-02 校验 occupancy/合同等生命周期 blocker。
- `asset_unit` 当前没有恢复 API；active 映射唯一索引与父链 trigger 已存在。

## 功能要求

1. 删除源 unit 时锁定同 scope 的源与投影；任何仍绑定的 active 投影继续返回 409。
2. 显式停用/解绑必须是单事务工作流：验证版本、锁 unit scope、确认 active occupancy、传统 leasing 合同、housing lease、homestay booking 及运营占用均无 blocker，然后将经营配置置为 disabled，并解除 asset mapping；失败不得部分更新。
3. 历史合同、已释放 occupancy 与已结束业务记录不得阻止解绑，也不得被删除或改写。
4. 源 unit 软删必须保留映射审计；源恢复必须按 tenant/park/data scope 锁定并恢复同一源记录，不创建重复源或重复运营 unit。
5. 恢复后的投影一致性规则：若删除前已显式解绑，恢复保持未绑定；若存在保留的 disabled、未删除投影关联，则恢复后仍保持同一关联且不可生成重复投影。恢复不猜测或重绑已被其他源占用的运营 unit。
6. controller path UUID、权限、AuditLog 与现有 asset unit 管理契约一致。
7. DB 变更只在应用事务无法封闭竞态或无法表达逐租户完整性时新增；如新增，必须 forward-only，含 preflight/replay 验证且不编辑旧迁移。

## 验收标准

- [ ] active 投影直接删源返回稳定 409，源与投影均不变。
- [ ] 有 active/held occupancy、有效商业合同、active housing lease 或 confirmed/checked-in homestay booking 时，停用/解绑返回 409 并附 blocker 事实。
- [ ] 仅有 completed/released/cancelled/history/soft-deleted fixture 时允许原子停用+解绑，写入不可变 unlink audit。
- [ ] 停用/解绑成功后允许源软删；重复删除不误恢复或破坏审计。
- [ ] 恢复同一 soft-deleted 源成功；active 唯一键冲突、跨租户/园区、无权限均失败且不产生部分状态。
- [ ] API service/controller 定向测试、PostgreSQL fixture 与独立 HTTP E2E 覆盖上述正反路径。

## 非目标

- 不扩展到 building/floor 的 UI 生命周期重构。
- 不合并 asset 与 biz domain，不修改 housing/leasing 边界。
- 不物理删除历史、合同、occupancy、财务或映射审计。
- 不做生产数据直操作。

## 开放问题

- 无阻塞产品问题；D-02 已决定默认拒绝与显式工作流。DB 迁移由实现前 schema/竞态论证决定。
