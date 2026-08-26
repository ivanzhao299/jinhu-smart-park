# HR 工资培训奖惩企业样式统一

## Goal

统一工资内部工作区、培训与奖惩顶部企业级样式，并修复生产培训列表参数绑定错误

## Requirements

- 工资管理四个工作区采用统一的企业级分区导航、工具栏和内容卡片层级，不再混用旧圆片标签与裸操作区。
- 培训管理、奖惩管理顶部改用与合同、绩效、工资一致的 `ds-hero`，保留现有权限和业务动作。
- 桌面与 390px 手机端保持稳定留白、触控尺寸与无页面级横向溢出。
- 修复生产培训计划列表在 park 范围下多传 SQL 绑定参数的问题，并增加回归测试。
- 不改变工资、培训、奖惩的权限、状态机、数据投影或数据库结构。

## Acceptance Criteria

- [ ] 工资四个工作区均使用一致的新版视觉层级与移动端行为。
- [ ] 培训、奖惩顶部与其他 HR 核心页的 Hero 结构一致。
- [ ] 培训列表不再返回参数绑定错误。
- [ ] HR/API 定向测试、Lint、Typecheck、CSS 检查和生产构建通过。
- [ ] 部署后完成三页桌面截图及 390px 实测。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
