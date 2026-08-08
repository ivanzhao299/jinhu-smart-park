# 技术设计

## 失败证据

- GitHub Actions run `31259810154`, job `93109047416`, head `8afa88b2`。
- `003_asset_park_scope_reconcile.sql` 于 `2026-08-08T13:41:02Z` 报
  `property-asset-park-scope-reconcile-preflight-failed`；target `000189` 未执行。
- prerequisite 自带事务，runner 记录 `failed` 后退出 3；旧源码恢复并通过 API/Web 完整健康检查。

## 根因

现有前置项对每个 active asset module assignment 都强制要求唯一同 scope `biz_park`，即使该
scope 已经拥有唯一 active `asset_park`。这违反“只补缺失投影、保留已有资产”的注释合同。
同时，生产 core seed 通过全局唯一 `park_code` upsert `JH`，冲突更新不会改写旧
`tenant_id/park_id`；因此 canonical assignment 可能只有唯一 active legacy-scope `JH` 来源。

## 解析状态机

对每个 target scope 计算 active tenant、active asset、exact-scope biz park、default JH fallback
计数：

1. tenant 必须唯一有效，scope ID 必须合法。
2. asset count = 1：已满足，不要求 biz park，也不写资产行。
3. asset count > 1：歧义，失败。
4. asset count = 0 且 exact biz count = 1：从 exact source 投影。
5. asset count = 0、exact biz count = 0、scope 为默认 canonical，且 active JH count = 1：从
   legacy default source 投影。
6. 其他缺失/重复 source：失败。

投影后对所有 target scope 断言 active asset count 恰为 1。错误只输出各失败类别数量。

## 兼容与边界

- 不更新 `biz_park`、`sys_tenant`、module assignment 或任何授权数据。
- fallback 只允许固定默认 scope + 固定全局唯一 `park_code=JH`，不做“数据库里只有一个 park”之类猜测。
- 只修改生产记录为 failed 的 prerequisite；不可变 target migration 保持原 checksum。
- production seed 镜像同一解析逻辑，但不替代 migration prerequisite。
