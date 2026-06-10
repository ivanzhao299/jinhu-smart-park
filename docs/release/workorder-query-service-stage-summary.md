# JinHu Smart Park 工单 Query Service 阶段性总结

## 1. 总结目的

本文用于总结工单 query service 拆分阶段成果，判断当前治理目标是否已经达成，以及是否继续拆分 `tenant360Workorders` / `unitWorkorders` 等跨模块聚合查询。

本阶段只做文档总结，不修改业务代码，不继续拆 service，不修改 controller、DTO、entity、测试脚本、CI、依赖、migration 或 seed。

## 2. 拆分前状态

拆分前 `WorkOrdersService` 同时承担多类职责：

- 查询：工单列表、详情、逾期列表、统计、日志列表。
- SLA 只读查询：SLA 规则分页列表。
- 工单 CRUD：创建、更新、软删除。
- SLA 写入：SLA 规则创建、更新、删除。
- 派单 / 改派。
- 状态流转：接单、开始处理、待料、完成、确认、评价、关闭、取消、退回、驳回。
- 日志写入。
- 附件绑定。
- 逾期重算。
- 跨模块聚合：租户 360 工单、房源关联工单。
- 写入前校验、状态合法性校验、处理人权限判断、工单号 / 日志号生成、事务写入和文件 `bizType` / `bizId` 回写。

主要问题是只读查询、统计、状态流转、日志写入、附件绑定、SLA 写入、逾期重算和跨模块聚合集中在同一个 service 中，维护时容易扩大副作用和状态语义风险。

## 3. 已完成拆分

### 第一批：基础查询

已迁移到 `WorkOrderQueryService`：

- `list`
- `detail`
- `logs`

本批目标是先迁移 controller 直接暴露、行为最稳定的基础查询入口。`WorkOrdersService` 保留同名 facade，写入和状态流转仍由原 service 处理。

### 第二刀 2A：低风险扩展查询

已迁移到 `WorkOrderQueryService`：

- `overdue`
- `listSlaRules`

`overdue` 保持只读列表语义，仍通过 `overdue_only: true` 复用 `list`，不触发 `recalculateOverdue`，不调用 `checkOverdue`，不写库。

`listSlaRules` 保持 SLA 规则只读分页查询语义，保留 `tenant_id`、`park_id`、`is_deleted=false`、可选筛选和 `rule.update_time DESC` 排序，不修改 SLA 创建 / 更新 / 删除。

### 第二刀 2B：统计查询

已迁移到 `WorkOrderQueryService`：

- `stats`

`stats` 保持接口路径、DTO、entity、返回结构、统计字段、统计口径、筛选字段、租户 / 园区过滤和数据范围过滤不变。迁移前后真实接口响应 `data` 已完成对照，`diff -u` 为空。

### 批次共同保持项

每一批均保持：

- 路由不变。
- DTO 不变。
- entity 不变。
- 返回结构不变。
- 权限装饰器不变。
- 租户 / 园区过滤不变。
- 数据范围过滤不变。
- 写入 / 状态流转不变。
- 幂等写入口不变。
- 原 `WorkOrdersService` 保留 query facade。

## 4. 当前职责边界

### WorkOrderQueryService

当前承接：

- `list`
- `detail`
- `logs`
- `overdue`
- `listSlaRules`
- `stats`

当前 query service 承接的是 controller 直接暴露的主要只读查询入口，以及 SLA 规则只读分页和基础统计查询。

### WorkOrdersService

继续保留：

- `tenant360Workorders`
- `unitWorkorders`
- `recalculateOverdue`
- `createLog`
- 工单 CRUD
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

当前边界是：主要只读查询进入 `WorkOrderQueryService`；写入、状态流转、日志写入、附件绑定、逾期重算、SLA 写入、幂等写入口和跨模块聚合继续保留在 `WorkOrdersService`。

## 5. 验证情况

各批次实施后已完成以下验证：

- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。
- `node scripts/e2e/first-release-workorders.mjs`：通过。
- `node scripts/e2e/first-release-regression.mjs`：通过。

第二刀 2B 额外完成：

- `stats` 迁移前后真实接口响应 `data` 对照。
- 对照文件：
  - `/tmp/jinhu-regression/workorder-stats-before.data.json`
  - `/tmp/jinhu-regression/workorder-stats-after.data.json`
- `diff -u` 结果为空，`data` 完全一致。

## 6. 治理收益

本阶段治理收益：

- 主要只读查询职责已从原 `WorkOrdersService` 中拆出。
- 低风险查询已有独立 `WorkOrderQueryService` 承接。
- controller 查询边界更清楚，查询入口直连 query service。
- `WorkOrdersService` 仍保留 facade，兼容其它模块或既有调用。
- 写入、状态流转、日志写入、附件绑定、逾期重算、SLA 写入和幂等写入口未被扰动。
- 后续维护工单列表、详情、日志、逾期、SLA 规则列表和统计查询时，可优先在 query service 中处理。
- 原 service 的主要职责更集中到状态流转和副作用链路。

## 7. 剩余风险

剩余风险：

- `tenant360Workorders` / `unitWorkorders` 仍在原 service。
- `tenant360Workorders` / `unitWorkorders` 属于跨模块聚合，不应直接迁移。
- query helper 复制后需避免长期分叉。
- `WorkOrdersService` 仍包含复杂状态流转和副作用。
- 暂未新增自动化接口快照测试。
- 跨模块聚合若继续拆，需单独设计调用方边界、字段策略、数据范围过滤和返回结构。

## 8. 是否继续拆分判断

建议工单 query service 当前阶段性收口。

不建议继续直接迁移 `tenant360Workorders` / `unitWorkorders`。

判断依据：

- controller 直接暴露的主要只读查询入口已迁移。
- `stats` 这种统计口径复杂的查询已单独完成迁移和响应对照。
- 工单专项回归和首发统一回归均已通过。
- 状态流转与写入边界未被扰动。
- 剩余的 `tenant360Workorders` / `unitWorkorders` 是跨模块聚合，风险模型不同于 controller 查询入口。

如果后续评估跨模块聚合，应采用独立只读设计，不直接实施。设计中至少应确认：

- 调用方模块和调用路径。
- 是否需要保留 `WorkOrdersService` facade。
- 字段策略输出是否保持一致。
- 数据范围过滤是否保持一致。
- 返回结构是否存在隐式前端或跨模块依赖。
- 是否需要接口或内部方法响应对照。

当前更建议停止工单 service 拆分，转入其它治理方向。

## 9. 后续建议

### 方案 A：工单 query service 阶段性停止

推荐优先选择方案 A。

后续可转入其它治理方向：

- 测试补强。
- 接口快照设计。
- 其它后端 service 只读设计。
- 文档索引清理。
- 代码治理阶段总结。

### 方案 B：跨模块聚合只读设计

如需继续评估，仅做只读设计，不直接拆：

- `tenant360Workorders`
- `unitWorkorders`

不建议马上实施。跨模块聚合查询应独立评估，避免把已稳定的工单 query service 收口阶段重新扩大为跨模块重构。

## 10. 结论

工单 query service 拆分已达到阶段性治理目标。当前建议阶段性收口，不继续直接迁移 `tenant360Workorders` / `unitWorkorders`，并转入其它治理方向或阶段性总结类工作。
