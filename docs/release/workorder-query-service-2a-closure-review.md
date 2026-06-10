# JinHu Smart Park 工单查询 Service 第二刀 2A 收口复核

## 1. 复核目的

本文用于复核工单 query service 第二刀 2A 拆分后的状态，确认 `overdue` 与 `listSlaRules` 迁移后是否保持接口行为稳定，并判断是否达到阶段性收口标准。

本阶段只做文档复核，不修改业务代码，不继续拆 service，不修改 controller、DTO、entity、测试脚本、CI、依赖、migration 或 seed。

## 2. 拆分前状态

工单查询 service 第一批已迁移：

- `list`
- `detail`
- `logs`

第二刀设计建议将低风险查询拆成 2A / 2B：

- 2A：`overdue`、`listSlaRules`
- 2B：`stats`

其中 `stats` 统计口径复杂，依赖状态常量、统计 helper、逾期分钟计算和满意度聚合，因此不与 2A 混在同一批实施。

以下范围继续冻结，不进入 2A：

- 状态流转。
- 日志写入。
- 附件绑定。
- 逾期重算。
- SLA 创建 / 更新 / 删除。
- 幂等写入口。
- 跨模块聚合。

## 3. 已完成 2A 拆分

2A 已完成以下拆分：

- `overdue` 已迁移到 `WorkOrderQueryService`。
- `listSlaRules` 已迁移到 `WorkOrderQueryService`。
- `WorkOrdersController` 中 `GET /work-orders/overdue` 直连 `WorkOrderQueryService.overdue`。
- `WorkOrdersController` 中 `GET /work-orders/sla-rules` 直连 `WorkOrderQueryService.listSlaRules`。
- `WorkOrdersService` 保留 `overdue` / `listSlaRules` facade，继续兼容其它模块或既有调用。
- `work-orders.module.ts` 已保持 provider / export 兼容：继续注册 `WorkOrdersService`、`WorkOrderQueryService`，并继续 export `WorkOrdersService`。

## 4. 当前职责边界

### WorkOrderQueryService

当前承接：

- `list`
- `detail`
- `logs`
- `overdue`
- `listSlaRules`

当前 query service 依赖：

- `WorkOrderEntity` repository。
- `WorkOrderLogEntity` repository。
- `WorkOrderSlaRuleEntity` repository。
- `DataScopeService`。
- `FieldPolicyService`。

### WorkOrdersService

继续保留：

- `stats`
- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 工单创建 / 更新 / 删除
- SLA 创建 / 更新 / 删除
- 派单 / 改派
- 接单 / 开始处理
- 待料 / 完成
- 确认 / 评价 / 关闭
- 取消 / 退回 / 驳回
- 日志写入
- 附件绑定
- 幂等写入口相关逻辑
- query facade

## 5. overdue 行为保持

`overdue` 仍是逾期工单只读列表查询。

当前实现保持为：

```ts
const overdueQuery = { ...query, overdue_only: true };
return this.list(scope, overdueQuery, actor);
```

行为保持结论：

- 仍通过 `overdue_only: true` 复用 `list`。
- 不触发 `recalculateOverdue`。
- 不调用 `checkOverdue`。
- 不写库。
- 不改变 `overdueFlag`。
- 不改变状态语义。
- 不写日志。
- 不绑定附件。
- 不触碰幂等写入口。
- 继续复用 `list` 的分页、筛选、排序、租户 / 园区过滤、数据范围过滤和字段策略过滤。

## 6. listSlaRules 行为保持

`listSlaRules` 仍是 SLA 规则只读分页查询。

行为保持结论：

- 保持 `tenant_id` 过滤。
- 保持 `park_id` 过滤。
- 保持 `is_deleted=false` 过滤。
- 保持 `wo_type` 可选筛选。
- 保持 `urgency` 可选筛选。
- 保持 `priority` 可选筛选。
- 保持 `status` 可选筛选。
- 保持 `rule.update_time DESC` 排序。
- 保持 `{ items, total, page, page_size }` 返回结构。
- 不修改 SLA 创建 / 更新 / 删除。
- 不修改 SLA DTO / entity。
- 不移动或修改 SLA 写入 helper。
- 不触发日志、附件或状态流转副作用。

## 7. 行为保持与验证

行为保持结论：

- API 路径不变：`GET /work-orders/overdue`、`GET /work-orders/sla-rules` 仍由原 controller 路由暴露。
- DTO 不变：继续使用 `WorkOrderQueryDto` 和 `WorkOrderSlaRuleQueryDto`。
- entity 不变：未修改 `WorkOrderEntity`、`WorkOrderLogEntity`、`WorkOrderSlaRuleEntity`。
- 请求参数不变。
- 返回结构不变。
- 分页字段不变。
- 筛选字段不变。
- 排序行为不变。
- 权限装饰器不变：`WORKORDER_OVERDUE`、`WORKORDER_SLA_READ` 未变。
- 租户 / 园区过滤不变。
- 数据范围过滤不变：`overdue` 继续复用 `list` 的 `applyDataScope`。
- 状态流转语义不变。
- 幂等写入口未修改。
- 写入接口仍由原 `WorkOrdersService` 处理。

已完成验证：

- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。
- `node scripts/e2e/first-release-workorders.mjs`：通过。
- `node scripts/e2e/first-release-regression.mjs`：production-like auth 环境下通过，最终输出 `First-release regression completed`。

## 8. 剩余风险

- `stats` 仍在原 `WorkOrdersService`。
- `tenant360Workorders` / `unitWorkorders` 继续作为跨模块聚合暂缓。
- 状态流转和副作用继续冻结。
- query helper 复制后需要避免长期分叉。
- 暂未做专门接口快照对比测试。
- 后续 `stats` 统计口径复杂，应单独设计。

## 9. 收口判断

建议工单 query service 第二刀 2A 阶段性收口。

判断依据：

- `overdue` / `listSlaRules` 已迁移到 `WorkOrderQueryService`。
- controller 查询入口已直连 query service。
- `WorkOrdersService` 保留 facade，兼容原有调用边界。
- 工单专项回归通过。
- 首发统一回归在 production-like auth 环境下通过。
- 状态流转、写入、副作用、SLA 写入、逾期重算和幂等写入口均未修改。

不建议直接实施 `stats`。

建议先进入 2B：`stats` 设计。`stats` 虽然是纯查询，但涉及统计口径、状态常量、平均耗时、满意度、逾期 top 和多个 helper，应先单独完成设计复核，再进入实施。

## 10. 后续建议

- 工单查询 service 第二刀 2A 阶段性收口。
- 下一步进入 `stats` 的 2B 设计。
- 不要直接实施 `stats`。
- 继续冻结跨模块聚合、状态流转、日志写入、附件绑定、逾期重算、SLA 写入和幂等写入口。
- 2B 设计需重点确认统计返回字段、统计口径、数据范围过滤和 helper 复制边界。

## 11. 结论

工单 query service 第二刀 2A 已达到阶段性收口标准。建议停止本轮继续迁移，将下一阶段切换到 `stats` 的 2B 设计；在 2B 设计完成前，不直接实施 `stats` 拆分。
