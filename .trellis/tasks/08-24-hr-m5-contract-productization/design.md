# HR M5 技术设计

## Data and compatibility boundary

- 复用 `hr_contract_type/hr_contract/hr_contract_change` 和 T2 `legacy_record_map`，不修改历史迁移记录。
- 补充新的前向迁移只用于在线合同完整性、索引和受控状态字段；迁移历史数据保持 `is_historical_import=true` 且只读。
- API 使用明确 allowlist 投影，历史 `source_snapshot`、旧文本/路径标记、工资和审计基类字段均不进入响应。

## Access model

- `park`：HR 合同读取权限。
- `managed_org_tree`：合同团队读取权限，复用服务端组织递归范围。
- `self`：员工合同本人读取权限，以当前用户关联的员工为准。
- `none`：无权限返回空列表，详情使用同形态 not-found。
- 合同管理是独立动作权限，不因读取或负责人角色自动获得。

## API surface

- `GET /hr/contracts`：分页、keyword/status/expiryFrom/expiryTo，服务端数据范围。
- `GET /hr/contracts/me`：本人合同摘要。
- `GET /hr/contracts/:id`：主合同与有序变更投影。
- `POST /hr/contracts`：在线合同草稿。
- `POST /hr/contracts/:id/changes`：续签、变更、终止或更正草稿。

所有写入使用幂等拦截器、同事务悲观锁和 `captureBody:false` 审计。历史导入行拒绝在线修改。

## Web surface

- 新增 `/hr/contracts`，使用目录、到期指标、筛选、移动卡片和选择后详情。
- “新建合同”和“办理续签/变更”显式打开；权限不足时不发送管理请求。
- 员工工作台入口只调用本人接口，HR/负责人按已有精确权限选择接口。

## Rollout

- 先完成只读 API、权限和投影，再完成在线写入，最后前端与生产 UAT。
- 新迁移通过隔离 PostgreSQL 完整链和 production seed；生产部署失败时停止在迁移/seed 门禁，不继续发布。
