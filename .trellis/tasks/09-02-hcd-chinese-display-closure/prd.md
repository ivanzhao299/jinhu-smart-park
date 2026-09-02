# HCD 中文名称显示修复闭环

## Goal

依据 Issue #533 与审计报告，在不改变状态、查询值或持久化数据的前提下，修复民宿与长租 27 个路由的 30 项中文名称显示问题。

## Requirements

- 串行交付 shared/Web、API 名称投影、D 类临时定名与 UAT 三个 PR。
- 全程把进度与证据写入各子任务 `implement.md`。
- 关联实体使用“名称 → 业务编号 → 中文占位”，用户可见处禁止 UUID/内部 ID。
- 封闭枚举进 shared；Web presentation 负责展示；开放字典走 `/dict-items`。
- API 名称投影遵守 scope 与字段权限，无权或不可用时 null 回退。
- D 类六组按行业惯例集中临时定名并标注待产品确认。
- 零迁移；不碰 HR、生产、他人容器或主 Chrome；不改变状态/query/payload 语义。
- 仅推送 `codex/fix-hcd-*`、证据分支及 `gh pr merge` 的 main；禁止 force push。

## Acceptance Criteria

- [ ] HCD-001—030 均有修复与测试/UAT 证据。
- [ ] 27 路由桌面和 390px 覆盖中文、picker、未知值、权限裁剪和长文案。
- [ ] Network/console 无新增错误，民宿与长租主链无回退。
- [ ] 每 PR review ≤3、CI 通过、squash merge、main 双绿。
- [ ] 子任务与父任务归档，终报列出 D 类临时定名。

## Approval And Out Of Scope

用户已明确授权复核后执行。数据库、HR、生产直操作、无关重构和依赖升级不在范围内。
