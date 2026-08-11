# 修复住房租客来源域

## Goal

修复 GitHub issue #244

## Requirements

- 新增住房租客档案不得发送契约外的 `source_domain= housing`。
- 来源域由住房租客 API 服务端确定为 `housing_rental`，浏览器不得重复声明服务端拥有的领域字段。
- 不改变共享枚举、数据库约束或既有合法租客数据。

## Acceptance Criteria

- [ ] 新增租客请求通过 DTO 校验并由服务端持久化为 `housing_rental`。
- [ ] 前端回归测试可阻止非法 `housing` 值再次进入请求体。
- [ ] 相关 API 既有住房租客服务测试保持通过。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
