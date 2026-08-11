# 修复园区省市区三级联动

## Goal

修复 GitHub issue #242

## Requirements

- 园区新增和编辑抽屉中的省份、城市、区县使用三级联动选择，不再允许任意自由文本输入。
- 选择或清空上级区域时同步清空不再有效的下级选择。
- API 仍提交并保存规范中文名称字符串，不引入数据库迁移。
- 编辑历史园区时不得静默丢失不在当前区域目录中的已有值，应允许用户看见并显式调整。

## Acceptance Criteria

- [ ] 省份选择后仅显示该省城市，城市选择后仅显示该市区县。
- [ ] 上级变化不会提交旧的下级值，清空值仍按现有 API 语义保存为 null。
- [ ] 新增、编辑和历史值兼容均有自动化回归断言。
- [ ] 桌面和 390px 页面无横向溢出，表单可正常操作。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
