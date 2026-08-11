# 修复 GitHub Issues 242-244

## Goal

按既有闭环流程修复并验证开放 issues #242-244，创建 PR 并处理 Codex review

## Requirements

- 修复 GitHub issues #242、#243、#244，保持现有 API、租户权限和持久化兼容性。
- 三项修复可独立验证，但统一在一个修复分支和 PR 中交付。
- 按参考任务的闭环执行：本地验证、独立复核、提交推送、创建中文 Draft PR、处理 Codex review 与 CI，确认最新 head 无新增可操作问题后再完成集成。
- 不覆盖主工作区已有未提交改动，不修改生产数据或已执行迁移。

## Acceptance Criteria

- [ ] 三个子任务的验收标准全部通过，issues 对应行为均有回归保护。
- [ ] Web/API 相关 lint、typecheck、测试和 build 通过，用户可见页面完成桌面与 390px 浏览器检查。
- [ ] PR 最新 head 的 CI 全绿，Codex review 无未解决的可操作反馈。
- [ ] 修复结果与验证证据同步到对应 GitHub issues。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
