# PMA S-02 endpoint gate scope UUID 契约与资产删除防线

## Goal

落实 Issue #661、PMA-008/009/010/014 与 D-02 deleteUnit 最小防线，零迁移。

## Requirements

- `GET /assets/operating-space-candidates` 必须传入当前 actor，并复用 unit data-scope predicate；自定义 scope 不得看到授权集合外候选。
- homestay 所有业务 endpoint 必须同时受 `homestay` 与 hard dependency `asset` module gate 保护；missing/disabled/expired 均 fail closed，包括 super/wildcard principal。
- asset/homestay 的资源 UUID path 参数统一在 HTTP 边界返回 400，不把非法值下沉为数据库错误。
- 删除源 asset unit 时，在事务内锁定源记录；若仍有 `is_deleted=false` 且 `status=1` 的 `biz_unit.asset_unit_id` 投影则返回 409。完整停用/解绑 UX/API 属 M-01，不在本任务扩展。
- 现有显式解绑契约保持为 `PUT /property/units/:unitId/operation` 携带 `asset_unit_id: null`，本任务只写契约说明/断言，不重做工作流。
- 零 migration、零 seed；不修改 HR #565-#646 相关实现。

## Acceptance Criteria

- [ ] 自定义 unit scope fixture 证明候选列表只返回授权房源。
- [ ] homestay endpoint module metadata 与 asset missing/disabled/expired 矩阵有可执行测试。
- [ ] asset/homestay 资源路由 malformed UUID 稳定为 HTTP 400。
- [ ] active 运营投影阻止 asset unit 删除；无 active 投影时仍可软删。
- [ ] 显式解绑契约被记录且完整 M-01 工作流明确留待后续。
- [ ] API lint、typecheck、定向测试、PR CI/Release Smoke 通过；无 migration/HR 变更。

## Notes

- GitHub Issue: #661
- 用户决策 D-02：active 运营投影存在时默认禁止删除，显式停用/解绑工作流另案完成。
