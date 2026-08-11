# 修复 PR249 Codex review 问题

## Goal

关闭 PR #249 当前 head 的全部 Codex review 可操作线程，保持组织层级、数据范围和用户组织关系在并发、跨园区及失败重试场景下安全一致。

## Requirements

- 组织树必须复用分页组织列表的组织维度数据范围，不得向受限用户暴露未授权组织。
- `org_and_children` 只能返回递归查询验证为启用、未删除且同作用域的根和后代。
- 用户创建与可访问园区、组织/岗位关系必须原子提交；失败不得留下可登录账号。
- 用户抽屉必须忽略已过期的组织目录/关系响应。
- 组织删除只受活动用户关系阻断；软删用户的历史关系不能形成永久阻断。
- 负责人候选不得无提示截断有效用户。
- 组织父级并发修改必须序列化，不能由两个合法旧快照共同提交成环。
- 用户组织关系替换只软删目标用户当前租户/园区的关系，不得影响其他园区。
- 保持现有 API 的向后兼容：新增创建字段必须可选，既有分页 `/orgs` 和独立关系替换接口继续可用。

## Acceptance Criteria

- [ ] 受限用户的 `/orgs/tree` 只返回允许的组织 ID。
- [ ] 停用或删除的 `org_and_children` 根不会出现在允许 ID 中。
- [ ] 创建用户时组织关系校验或写入失败，用户、园区关系、组织关系均回滚。
- [ ] Web 新建用户单请求提交组织关系；旧组织目录响应不会覆盖新抽屉。
- [ ] 活动用户关系阻断组织删除，软删用户关系不阻断。
- [ ] 负责人候选返回当前园区全部有效用户。
- [ ] 并发 A→B 与 B→A 更新最多一个成功，数据库最终无环。
- [ ] 替换当前园区关系后，其他园区关系保持不变。
- [ ] API/Web 目标单测、lint、typecheck、build 通过；组织专项与完整首发回归通过。
- [ ] 8 个 review threads 均逐项回复并解决；最新 head 重新触发 Codex review 且无新增可操作反馈。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
