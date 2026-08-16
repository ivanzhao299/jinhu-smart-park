# 公寓模块界面统一与文书页视觉重构

## Goal

统一公寓模块字号、间距、信息层级和移动端表现，重点修复文书档案页。

## Requirements

- 公寓总览、房源、申请、在住、退房、文书使用同一套页面层级和控件样式。
- 缩小当前过大的标题、留白和表单控件，恢复清晰的信息密度。
- 文书页使用明确的标题、说明、表单、模板和档案分区，内容不得贴边。
- 当前栏目提供可识别的选中状态，操作按钮使用共享设计系统。
- 手机宽度下不得横向溢出，表单、模板、档案记录和操作按钮可用。
- 本任务仅改变前端结构和样式，不改变接口、业务逻辑或数据库。

## Acceptance Criteria

- [x] 页面标题、说明、栏目导航、面板标题和表单字号比例统一。
- [x] 文书模板改为紧凑卡片，文书档案保留桌面和手机可读布局。
- [x] 公寓模块共用工作台与新建表单同步采用统一样式。
- [x] React/TypeScript 文件通过定向 ESLint，变更通过 `git diff --check`。
- [ ] 在部署后的桌面和 390px 手机视口完成视觉验收。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
