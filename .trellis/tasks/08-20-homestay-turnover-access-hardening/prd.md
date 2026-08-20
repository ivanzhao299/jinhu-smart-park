# 修复民宿周转权限边界

## 目标

修复 Issue #333 和 PR #332 复审发现的已上线民宿周转越权：已分配周转的详情/操作必须执行 `workorder_handler` 范围；关联维修工单必须按权威候选规则校验可见性、房源、状态和当前范围。

## 确认事实

- `listTasks` 已按 `workorder_handler` 过滤已分配 `homestay_turnover`，但 `getTurnover` / `executeTurnover` 仅校验 tenant/park/unit。
- `linked_work_order_id` 仅校验 tenant/park/unit/未删除，未使用候选规则的状态与数据范围。
- 公共到店/离店和未分配周转是可领取队列，必须保持可用。

## 验收标准

- [x] self/custom 不能读取、执行或改派他人已分配周转；公共队列、未分配周转和主管范围保持可用（定向 service 回归覆盖）。
- [x] 范围外、无工单读取权、终态或错误房源的 `linked_work_order_id` 被拒绝；同范围有效工单可关联（锁定候选查询与回归覆盖）。
- [ ] 单测覆盖详情、mutation、工单引用负向矩阵；真实 API E2E 覆盖跨园区拒绝。
- [ ] API 定向测试、lint、typecheck 和 E2E 通过，最新 Codex 复审无重大问题（lint/typecheck/41 项定向单测已通过；真实 API E2E 与 PR 复审待执行）。

## 非范围

自动创建/回调工单、跨模块事务、以及周转/occupancy 生命周期变更。
