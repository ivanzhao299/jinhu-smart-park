# Design

## Boundary

- Shared 继续作为 bundle/template 权限集合与冻结签名的源码所有者。
- 新 forward migration 只把新增的既有系统权限投影到数据库 bundle，并升级 bundle revision/signature；不编辑历史 migration。
- Production seed 继续只维护受保护角色模板及其权限关系，不创建用户或业务 fixture。

## Data Flow

`shared bundle v2` → `forward migration bundle member/revision` → `production seed managed template reconcile` → `role template instance` → `/homestay/tasks` permission guard。

## Compatibility

- 保留 bundle code、template code 与现有权限；仅追加最小域读取权限。
- 已实例化的普通角色不由 seed 直接扩权；受保护模板在 seed 后收敛，后续模板实例化获得新集合。
- migration/seed 任一签名或权限缺失时继续 fail closed。

## Rollback Shape

- migration forward-only，不提供反向删除；若发布前失败只修复未成功 migration。
- shared/seed 必须与 migration 同批发布，避免签名漂移。
