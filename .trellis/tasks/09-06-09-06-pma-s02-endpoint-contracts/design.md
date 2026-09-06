# Design

## Scope propagation

Controller 将 `JwtPrincipal` 传给 `AssetSpaceMappingService.listUnitCandidates`。服务使用现有 `DataScopeService` 的 unit 维度生成查询限制，保持 tenant/park 与 active mapping 条件不变。

## Endpoint gates and UUIDs

以 controller metadata/HTTP pipe 契约测试枚举全部 homestay handler。类级 hard dependency 改为同时声明 `homestay`、`asset`；资源型 UUID 参数统一 `ParseUUIDPipe({ version: "4" })`。

## Delete fence

`AssetsService.deleteUnit` 使用现有 `DataSource.transaction`，在同一事务内按 scope/data-scope 查找并锁源 unit，再查询 active `biz_unit` 投影。命中即 409，未命中继续软删，不新增 migration。

## Out of scope

- 不实现完整解绑/停用向导、批量解绑或新 endpoint。
- 不改变 housing 与传统 leasing 双域边界。
- 不修改历史 migration、seed 或 HR 战役文件。
