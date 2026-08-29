# LEA-003 长租经营改名

## Goal

把住房长租业务面向用户的总称统一为“长租经营”，并在具体房源语境中明确区分“住宅长租”和“办公长租”，消除“住房出租”对办公长租场景的误导，同时保持现有模块、菜单和权限代码完全兼容。

## Confirmed facts

- GitHub Issue 为 #485，交付 PR 必须 `Closes #485`。
- 当前分支为 `codex/fix-lea-003-rename-long-rental`，基线为 LEA-001+002 合并提交 `8dce1137`。
- `housing_rental`、`housing:*`、`housing_rental:*` 是授权身份，不属于本次改名范围。
- `sys_permission` 定义按 `(tenant_id, code)` 租户级唯一；权限绑定的 park 语义位于 `rel_role_perm`。
- 既有 picker 已按 `rental_segment` 输出“办公长租”或“住宅长租”。
- 历史迁移不可修改；下一个未占用迁移号为 `000283`，仓库仅保留已知的历史重复 `000136`。

## Requirements

- 根业务显示名统一为“长租经营”：共享权限/业务 surface 显示定义、API canonical 与 fallback 菜单、Web canonical 与 fallback 菜单、住房工作台标题和访问边界文案保持一致。
- 具体房源经营模式显示为“住宅长租”或“办公长租”；不把办公长租重新表述为住房业务。
- 权限目录与页面权限的中文显示名同步到“长租经营”语义，但所有 permission/menu/module code 保持不变。
- 新增 forward-only reconcile migration，逐租户只更新目标模块、registry、菜单/页面权限和 API 权限的显示名；不创建新 code、不改角色绑定、不改变授权范围。
- reconcile 对每个受影响租户执行基数/目标名称断言并 fail closed；可安全重复执行。
- 修改或新增自动化回归，至少覆盖逐租户迁移、API/Web 菜单契约和权限显示名。
- 在实际页面以桌面和 390px 手机宽度检查改名后的菜单、标题、边界提示与关键长租页面，无横向溢出或截断。

## Acceptance Criteria

- [ ] API `/users/me` canonical 菜单与 fallback 菜单根节点显示“长租经营”，子页面 label 与 Web 一致。
- [ ] Web 菜单、住房工作台和无权限/不可用边界不再把根业务显示为“住房出租”。
- [ ] 房源经营模式、候选 picker 等具体语境正确显示“住宅长租”或“办公长租”。
- [ ] shared 权限目录及数据库中既有目标权限显示名更新，所有 code 逐项保持不变。
- [ ] `000283` 迁移按租户收敛名称、可重跑、对缺失/重复/漂移目标 fail closed，且不触碰角色权限绑定。
- [ ] 迁移逐租户断言、API/Web 菜单契约、权限显示名回归均通过。
- [ ] 桌面及 390px 浏览器证据通过，截图/Network/检查结果写入实施记录且不包含敏感信息。
- [ ] PR 审查不超过 3 轮，CI 全绿，squash merge 后 main 的 CI 与 Deploy 双绿，Issue #485 关闭。
- [ ] Trellis 任务进度、续跑点与最终证据完整记录并归档。

## Out of Scope

- 不重命名任何 module/menu/page/permission code 或路由。
- 不改变租约、财务、交割、报修等领域行为。
- 不改变角色模板授权集合或 park 数据范围。
- 不直接操作生产数据库、生产容器或他人的浏览器/容器。

## Open Questions

- 无。产品名、迁移语义、兼容边界和验收方式均已由用户确认。
