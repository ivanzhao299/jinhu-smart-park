# 技术设计

## 1. 边界

父任务只负责需求源、子任务映射、跨子任务集成、发布门和最终证据；代码由六个子任务独立拥有。共享 contract 为唯一来源，禁止复制 permission、route、task 或 approval manifest。

## 2. 修复批次

1. `homestay-task-scope`：task read model、assignee/data-scope、count/list 一致性。
2. `homestay-deep-links`：task/request deep link 与安全导航。
3. `homestay-booking-finance-boundaries`：财务状态矩阵、住客上限、候选搜索和敏感投影。
4. `homestay-credential-turnover-repair`：凭证遗失、补发、维修工单和维修占用。
5. `homestay-web-gates`：feature 抽取、状态矩阵、Web unit/CI；高风险离线写仍 fail-closed。
6. `homestay-api-browser-uat`：真实 API E2E、浏览器 UAT、证据和发布门。

## 3. 财务状态矩阵

- `confirmed|checked_in`：允许有权限的普通 charge/payment。
- `checked_out`：只允许有明确业务来源的退房后费用/赔偿及其收款。
- `draft`：不允许普通人工 payment；确认生成房费沿用现有命令。
- `cancelled|no_show`：只允许取消/no-show 规则产生的费用，以及审批 refund/waiver。
- 所有不允许组合返回稳定 409；不物理删除账务记录。

## 4. 住客与隐私

- active guest 不得超过 `guest_count`；增加人数必须走显式、审计化调整或先变更订单。
- guest candidate 改为最小关键词、服务端分页、有限返回；继续 tenant/park/unit scope 与 stay-manage permission。
- 姓名候选不返回手机号/证件；敏感字段保护不得被 field policy 放宽。

## 5. 周转与维修

- 周转异常可幂等创建或关联同 scope、同 unit 的维修工单。
- 未完成维修必须有 maintenance occupancy 或等价不可售保护。
- 维修完成/解除后才允许复检或恢复可售。
- 凭证 lost/void/returned 状态转换不可覆盖历史时间和审计。

## 6. 兼容与回滚

- 优先应用层和测试修复；只有数据库无法保证 owner/唯一性时新增 forward-only migration。
- 已应用 migration 不修改；数据库失败即停止 seed、E2E、部署。
- 每个子任务可单独 revert；已应用 migration 只允许 forward fix。
- 生产回滚复用现有 runbook，部署健康后必须执行 Docker cleanup。
