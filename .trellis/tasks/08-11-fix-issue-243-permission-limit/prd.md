# 修复角色权限保存数量上限

## Goal

修复 GitHub issue #243

## Requirements

- 角色权限保存应支持当前完整系统权限树（当前基线超过 200 项）及合理的租户扩展余量。
- 保留请求数组的显式安全上限，不削弱 UUID、租户范围、删除状态和权限存在性校验。
- 上限应由单一命名常量表达，避免测试和 DTO 各自硬编码。

## Acceptance Criteria

- [ ] 超过 200 且不超过新上限的有效 UUID 数组通过 DTO 校验。
- [ ] 超过新上限的请求仍被拒绝。
- [ ] 现有角色权限租户隔离和全量替换行为保持不变。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
