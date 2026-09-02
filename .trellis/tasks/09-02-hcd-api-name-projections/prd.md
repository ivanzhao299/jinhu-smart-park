# HCD API 名称投影与权限修复

## Goal

交付 PR2：补齐 HCD-011、012、020、027 的授权名称投影与 picker 恢复能力。

## Requirements

- 民宿详情补 `unitCode/unitName`；候选按 ID 查询仍受 scope/资格约束。
- task 补 `assigneeName`；采购补 `unitCode/unitName`。
- 名称不可见时返回 null；Web 中文占位，不回退 ID。
- 零 DB 字段、零 Web N+1、不扩大授权面。

## Acceptance Criteria

- [ ] 四项 shared/API/Web 契约闭环。
- [ ] API 覆盖授权、裁剪、null 与跨 scope；picker 刷新恢复名称。
- [ ] PR2 全部门禁、review ≤3、merge、main 双绿。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
