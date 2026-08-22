# 修复生产 canonical 园区来源歧义

## Goal

在不放宽现有 fail-closed 资产 scope 与 runtime-control 门禁的前提下，将生产默认 scope 中历史遗留的多个 active `biz_park` 来源安全收敛为与现有唯一 enabled `asset_park` 一致的 canonical 来源，并恢复自动生产部署。

## Confirmed Facts

- 生产 scope `10000001/20000001` 有 1 个有效租户、1 个 enabled `asset_park`、完整 12 个 controls，但有 2 个 active `biz_park` 来源：`CSYQ,JH`。
- `000189` 诊断当前因 `asset_count=1` 报 `ready_existing_asset`；`000194` 诊断按唯一 canonical 来源合同报 `invalid_scope`。
- 生产 seed `000007` 对来源歧义只阻断，不会更新或删除业务园区。
- 部署在迁移前执行 000189/000194 enforce，迁移后没有再次执行同一 parity gate。

## Requirements

- 使用新的 forward-only migration；不修改已应用迁移，不把历史业务数据修复混入 production seed。
- 仅当每个候选 scope 满足全部确定性证据时修复：有效租户恰好 1 个、enabled/nondeleted `asset_park` 恰好 1 个、active/nondeleted `biz_park` 至少 2 个、资产投影 `park_code` 在候选来源中恰好匹配 1 个。
- 迁移必须获取数据库 advisory lock 与相关行锁，重新验证证据后，仅软停用同 scope 中不匹配的 active `biz_park`；保留匹配来源及全部资产业务数据。
- 迁移维护 `status/is_deleted/version/update_by/update_time/remark`，校验更新行数并在任一不一致时整体回滚。
- 建立不可变、可查询的修复审计，记录 scope、survivor/retired 行标识与编码、before/after 状态和版本、时间与 evidence hash。
- 迁移前诊断仅在迁移尚未成功且上述证据完全成立时允许 `ready_ambiguous_source_migration_reconcile`；无匹配、多匹配、投影重复或历史漂移继续阻断。
- 部署在迁移后、seed 前再次执行 000189 与 000194 enforce；修复 scope 必须变为唯一 canonical 来源且 runtime controls/audits 保持 exact。
- 同步 Release Smoke、隔离 PostgreSQL 历史形态 fixture、部署文档与 Trellis 可执行合同。

## Acceptance Criteria

- [ ] 目标生产形态从两个 active canonical 来源收敛为与唯一 enabled `asset_park.park_code` 一致的一个来源。
- [ ] 所有被软停用来源都有不可变审计，evidence hash、before/after 版本和状态可验证。
- [ ] 无匹配、多匹配、0/多 enabled projection、无效租户、迁移已成功后的新歧义均 fail closed。
- [ ] migration 首次执行和成功 history 重跑均幂等；未知 checksum/history 漂移继续阻断。
- [ ] 迁移后 000189/000194 enforce 通过，production seed 重跑不重新制造歧义。
- [ ] CI、Release Smoke、Codex review 通过；PR 使用中文标题和正文。
- [ ] 合并后生产部署、健康检查、UAT 与 Docker cleanup 全部成功。

## Out of Scope

- 不自动合并不同 `(tenant_id, park_id)` 的园区。
- 不根据名称、创建时间或任意排序猜测 canonical 来源。
- 不删除 `asset_park`、building/floor/unit、runtime controls 或不可变审计。
- 不放宽 000007/000008 seed 或应用 canonical resolver 的歧义检查。

## Open Questions

无；修复边界已由生产只读诊断、现有唯一投影和 fail-closed 合同确定。
