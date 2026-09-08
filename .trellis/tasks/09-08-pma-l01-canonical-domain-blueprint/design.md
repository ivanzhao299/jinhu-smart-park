# Design: PMA L-01 canonical 领域蓝图

## Architecture

- 新蓝图位于 `docs/architecture/property-canonical-domain-blueprint.md`，`property-current-state-index.md` 继续作为短入口并链接蓝图。
- 蓝图用稳定 section marker、状态表、endpoint 表和 schema 表表达机器可核验声明；不复制所有实现细节。
- `scripts/e2e/property-canonical-domain-blueprint.contract.mjs` 作为静态 contract gate，读取蓝图、shared ABI、关键 controllers/entities/migrations/specs，并 fail closed。

## Contract comparison

1. **Status**：解析 shared `HOUSING_LEASE_STATUSES`、property occupancy enum，以及 leasing service canonical status constants/transition map，与蓝图 code token 对照。
2. **Endpoint**：从关键 controller decorators/共享 endpoint manifests 提取 canonical method+path，确保蓝图列出的 owner endpoints 存在且无重复。
3. **Schema**：从关键 migrations/entities 对照 table、check enum、scope key 与关系 marker；只验证已发布 schema，不生成或修改 migration。
4. **Owner/projection**：断言蓝图与实现同时保留 occupancy owner restriction、rental status projection、property event runtime、housing task/workbench projection、leasing status log/financial void markers。

## Compatibility and safety

- 纯文档与只读对照脚本，不改变运行时、数据库或生产状态。
- 金融状态仅描述现状；不将 soft delete 简化为物理删除，不弱化 applied/paid/invoiced/waived 阻断。
- endpoint 对照复用已有 manifest validators；避免维护第二份权限真相。
- CI 放在 verify 的 contract steps；文档/脚本变化本身不要求额外真实 DB release smoke，但 `package.json` 会按现有 scope 触发 smoke，HR 失败按队列裁定记录。

## Trade-offs

- 选择显式 marker + 结构化 Markdown，而非引入新的 schema generator：成本较低、review 可读、能覆盖漂移；代价是新增 domain 字段时需同步蓝图 marker。
- 不把所有 endpoint/schema 全量镜像进文档；只冻结 owner/边界/状态主链，详细权限仍由 shared manifest 和 spec 权威负责。

## Rollback

- 回滚蓝图、索引链接、contract script、package/CI step即可；无数据回滚。
