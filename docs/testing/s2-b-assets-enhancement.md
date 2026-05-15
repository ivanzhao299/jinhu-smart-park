# S2-B Assets Enhancement Delivery

本轮范围：S2-B-00 至 S2-B-09，仅覆盖资产与房源增强、SaaS 权限接入、路由兼容、自测交付。

## 交付项

- S2-B-00：复核资产模块前置条件，保留既有 `biz_unit`、`/assets/units`、`/api/v1/park-units`。
- S2-B-01：`biz_unit_status_log` 已承载房源出租状态流转日志，状态流转写入日志与操作审计。
- S2-B-02：`/api/v1/park-units/import-template`、`/api/v1/park-units/import` 支持模板下载与 Excel 批量导入。
- S2-B-03：`/api/v1/park-units/export` 支持 GET CSV 与 POST Excel 条件导出。
- S2-B-04：`/api/v1/assets/statistics` 与 `/assets/statistics` 支持资产统计。
- S2-B-05：`/api/v1/assets/unit-status-board` 与 `/assets/unit-status-board` 支持轻量状态看板。
- S2-B-06：资产相关控制器统一接入 JWT、权限点与 `@RequireModule("asset")`；房源查询、统计、看板、导出接入数据权限与字段权限。
- S2-B-07：`/assets/rooms` 保持为 `/assets/units` 兼容入口。
- S2-B-08：补齐资产菜单、权限、字典、模块授权、编码规则与字段策略 seed。
- S2-B-09：通过 lint、build、e2e smoke 后交付。

## 关键约束

- 资产域查询必须按 `tenant_id`、`park_id`、`is_deleted = false` 过滤。
- 删除动作为软删除。
- 写操作通过 `@AuditLog` 或手动审计写入 `sys_op_log`。
- 后端业务查询使用 TypeORM QueryBuilder；楼栋/楼层删除前置校验不使用原生 SQL。
- 创建楼栋、楼层、房源时，传入编码继续兼容；未传编码时优先通过 `CodeRulesService` 生成。
- 前端资产页面不使用 Tailwind、inline style 或页面内硬编码色值；写操作检查 `res.ok`，number 输入聚焦时全选。

## 自测命令

```bash
pnpm run lint
pnpm run build
pnpm run test:e2e:s2b
```

完整回归可执行：

```bash
pnpm run test
```
