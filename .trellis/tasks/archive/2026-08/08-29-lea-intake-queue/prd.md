# 长租经营准入与房源配置实施队列

## Goal

按照调查报告和用户已批准的 D1-D10 决策，分三个串行 PR 完成长租经营的准入、命名和出租状态一期闭环，最后执行一轮跨 PR UAT 与归档。

## Requirements

- 依据：`docs/reviews/asset-unit-field-semantics-and-intake-plan-2026-08-29.md`。
- 严格串行：LEA-001+002 → LEA-003 → LEA-004 一期 → 统一 UAT。
- 每个子任务独立 Issue/Trellis/分支/PR/review/CI/merge/main 双绿闭环，不留半成品。
- 权限码 `housing_*` 与 housing API 路径保持兼容。
- 不碰 HR 系列，不直接操作生产，不伪造证据，迁移严格 forward-only 且逐租户语义。
- 进度和续跑点写入各子任务 `implement.md`。

## Acceptance Criteria

- [x] 三个子任务均通过各自验证、review 不超过 3 轮、CI 和 main 双绿。
- [x] UAT 覆盖 mode×用途矩阵、picker reasons/facet、改名全链和出租状态同步。
- [x] G1-G7 关键抽查和住房/民宿双业务主链无回退。
- [x] 存量审计清单、截图 manifest、Network 证据、精确清理与 teardown 可追溯。
- [x] 队列任务和调查遗留归档，终报含 Issue/PR/commit/CI+Deploy/UAT/风险。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
