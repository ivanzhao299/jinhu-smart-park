# 修复民宿周转权限边界

## 目标

修复 Issue #333 与 PR #332 复审发现的已上线民宿周转越权路径：已分配周转的详情/操作必须遵守 `workorder_handler` 负责人数据范围；关联维修工单必须按权威候选规则验证可见性、房源、状态和当前范围。

## 已确认事实

- `listTasks` 已对已分配的 `homestay_turnover` 使用 `workorder_handler`，但 `getTurnover` 和 `executeTurnover` 仅执行 tenant/park/unit 校验。
- `linked_work_order_id` 当前只校验 tenant/park/unit/未删除，未使用候选查询的状态和数据范围规则。
- 公共到店/离店和未分配周转是可领取队列，不能被该收紧误伤。

## 需求

- 详情和 mutation 使用与任务列表等价的负责人 scope；self/custom 不能访问他人已分配周转。
- 关联工单在 mutation 事务内重新读取并锁定，必须同 tenant/park/unit、非删除、非终态，且对调用人按工单 read/data-scope 规则可见。
- 不自动创建工单、不改变周转/occupancy 生命周期、不扩大既有角色权限。

## 验收标准

- [ ] self/custom 对他人已分配周转的详情、执行和改派均返回拒绝；公共队列、未分配周转和主管范围仍保持预期可用。
- [ ] 范围外、无工单读取权、终态或错误房源的 `linked_work_order_id` 被拒绝；同范围有效工单仍可关联。
- [ ] 单元测试覆盖详情、mutation 和工单引用负向矩阵；真实 API E2E 包含跨园区拒绝，或将未覆盖项明确记录为未完成。
- [ ] 相关 API lint、typecheck 和测试通过；PR 获得最新 Codex 无重大问题复审并完成发布后验证。

## 非范围

- 自动创建工单、工单回调、跨模块事务/业务唯一键设计。
- 改变退房后财务、周转完成或 occupancy 的业务生命周期。

## 跟踪

- GitHub Issue: #333

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
