# Design

## Boundary

- Shared 继续作为 bundle/template 权限集合与冻结签名的源码所有者。
- `000262` 在生产仅有失败记录且事务已回滚，因此按 failed-only retry 契约原位修正其 preflight；不新增无法越过先行 fail-fast 的后续 migration。
- Production seed 继续只维护受保护角色模板及其权限关系，不创建用户或业务 fixture。

## Data Flow

`shared bundle v2` → `forward migration bundle member/revision` → `production seed managed template reconcile` → `role template instance` → `/homestay/tasks` permission guard。

## Compatibility

- 保留 bundle code、template code 与现有权限；仅追加最小域读取权限。
- 已实例化的普通角色不由 seed 直接扩权；受保护模板在 seed 后收敛，后续模板实例化获得新集合。
- migration/seed 任一签名或权限缺失时继续 fail closed。

## Rollback Shape

- migration forward-only，不提供反向删除；若发布前失败只修复未成功 migration。
- 每个已应用目标 bundle 的 tenant 必须恰有一条 active API permission；缺失、重复或异常状态均按 tenant 明细 fail closed，不改生产权限数据。
- shared/seed 必须与 migration 同批发布，避免签名漂移。
