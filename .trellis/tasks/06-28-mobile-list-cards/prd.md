# 列表页移动卡片化(手机端重构收尾)

## Goal

根治:全局 .ds-table-shell 在<=720px 被 display:none 导致 75 个 DataTable 列表页在手机端空白。改为用 DataTable 已注入的 data-label 将表格 CSS 转为卡片,一处修复全部列表页;运营终端保留自有卡片不重复。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
