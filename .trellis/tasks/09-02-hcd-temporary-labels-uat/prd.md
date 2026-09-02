# HCD D 类临时定名与 UAT 收尾

## Goal

交付 PR3：集中管理六组 D 类临时中文名，修复相关展示并完成全量 UAT。

## Requirements

- shared 常量标注“临时定名待产品确认”。
- 开放费用/支付优先 `/dict-items`，平台默认中文仅兼容 fallback。
- 不虚构尚无 Web 展示的问题。
- 覆盖 27 路由桌面/390px、权限、未知值、picker、长中文与主链。

## Acceptance Criteria

- [ ] HCD-005、007、015、026、028、030 修复。
- [ ] 30 项均有证据且无用户可见内部 ID。
- [ ] PR3/成熟基建/main 双绿，任务归档，终报列临时定名。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
