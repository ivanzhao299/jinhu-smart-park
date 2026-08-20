# 技术设计

凭证遗失使用独立、幂等且审计化的 `issued -> lost` 入口，`returned/lost/void` 均不可回退。周转异常继续使用现有的同房源工单候选与关联能力；未完成周转及其 occupancy 已同时阻止房态可售和新预订。

自动创建维修工单及随工单状态释放 maintenance occupancy 需要新增跨模块事务、业务唯一键和生命周期事件合同。现有架构尚无该权威入口，本任务不以绕过 `WorkOrdersService` 的方式伪实现；在合同落地前采用“工单模块创建 -> 周转异常关联”的显式流程。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
