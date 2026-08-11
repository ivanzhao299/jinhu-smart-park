# Implementation Plan

1. 为园区表单增加可维护的中国省市区目录和受控联动选择，补历史值与父级清空回归测试。
2. 将角色权限 DTO 数组上限调整为命名常量，补边界验证测试。
3. 删除住房租客创建请求中的非法来源域并补静态回归断言。
4. 运行目标测试、Web/API lint、typecheck 和 build；浏览器检查园区页桌面与 390px。
5. 运行 Trellis 质量检查和独立审查，修复发现项。
6. 提交、推送并创建中文 Draft PR，关联并更新 #242-244。
7. 等待 CI 和 Codex review；逐项处理可操作反馈，最新 head 无新增问题后完成集成。

## Validation commands

- `git diff --check`
- 目标静态/单元测试
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web build`
- `pnpm --filter @jinhu/api build`

## Rollback points

- 推送前：仅撤回本任务文件和代码变更。
- PR 合并前：补丁提交或关闭 PR，不触碰生产。
- 合并后：以正常修复 PR 回退；无数据库逆向操作。
