# 权限管理机制与三模块符合性审计

## Goal

以 `origin/main@2526b577` 的仓库现状为唯一事实基线，建立可检验的权限机制设计标尺，并审查 `housing_rental`、`homestay`、`property`（含共享 asset、property approvals/tasks/operation config）对标尺的符合性，形成供用户批准后另行实施的修复方案与队列。

## Requirements

- 先从 shared 权限契约、API 守卫/数据与字段/文件策略、动态菜单、Web 路由与按钮、数据库迁移/生产 seed、测试、架构与 Trellis spec 中归纳 MEC-* 要求；每条包含设计出处与可检验判据。
- 对三个模块逐项给出“符合 / 部分符合 / 不符合”，所有关键结论引用当前仓库 `file:line`；历史 Issue/PR 仅作为补充证据并明确标注。
- 静态扫描权限码在 shared、API、菜单/Web 三视角的出现矩阵，识别孤儿权限、不可达能力、菜单/API 漂移、深链来源白名单脱节。
- 专项检查 tenant/park data scope、字段与文件策略接线、maker-checker 三分离、高风险写/幂等/effect audit、共享底座委托是否保留调用方 scope。
- 问题按 P0 越权、P1 功能缺陷、P2 契约漂移或冗余分级；区分静态确认与推断/建议 UAT。
- 每个问题给 1–3 个候选方案、改动面、风险、迁移需求和验证方式，并明确推荐方案及有依赖/可并行的修复队列。
- 涉及 seed/迁移的建议必须采用逐租户语义，并遵守 failed-only 迁移编辑规则；shared 变更必须评估 API/Web 双端。
- 报告写入 `docs/reviews/permission-mechanism-compliance-2026-08-27.md`。
- 只允许修改报告与本任务 Trellis 工件；不创建修复 Issue，不改产品代码，不触碰生产环境、他人容器、主 Chrome、HR 分支/PR。
- 报告分支为 `codex/permission-compliance-audit`，经 `@codex review`、CI、squash merge 后验证 main 双绿。
- 追加反向 MEC-3 核查：从 API seeded/canonical menu、Web filter/first href、会话缓存、角色模板与 bundle、模块启用链枚举“有权限无菜单”的全部必要条件与断点。
- 将新增问题续编 PAM-004+；首轮 review 若推翻 PAM-001/002/003，报告必须保留核销证据、撤销错误分级与修复建议，再形成最终决策门、依赖/并行队列和合并 UAT；不新开修复 Issue。

## Acceptance Criteria

- [ ] MEC 清单覆盖 module/page/action/data/field/file、模板与 bundle 演进、菜单/路由/API 一致性、多租户/园区、审批与高风险写、跨模块共享委托，并含出处与判据。
- [ ] 三模块 × MEC 符合性矩阵完整，关键结论有当前 HEAD 的 `file:line` 证据。
- [ ] 权限码三视角静态矩阵完成，异常项进入问题清单或被明确解释。
- [ ] 问题清单含编号、MEC、级别、证据、复现推理及静态/UAT 标签。
- [ ] 每个问题有方案比较和推荐；整体队列包含优先级、依赖、并行组及 UAT 回归清单。
- [ ] 仅报告与 Trellis 工件发生变化，Markdown/链接/报告自检通过。
- [ ] PR 完成一轮 `@codex review`，CI 绿色，squash merge；main 分支 CI 与 Deploy 均绿色。
- [ ] 终报包含 MEC 摘要、矩阵结论、问题分级统计、推荐方案摘要、PR 与 commit。
- [ ] 条件矩阵覆盖 page/action、tenant/park role link、module assignment、asset dependency、permission metadata、seeded/canonical 双重表示、Web fallback/first href 与会话刷新。
- [ ] 最终问题清单含 PAM-004/005、PAM-001/002/003 review 核销记录，并将 PAM-006 明确为授权即时性的产品决策门/建议 UAT，而非已确认缺陷。

## Notes

- 已知历史风险线索：#410 模板 page 与 bundle action 漂移；#413 深链 surface 来源白名单脱节；000262/000263 逐租户与 replay-safe 契约先例。最终结论仍须以当前代码核验。
- 当前检出分支名称虽为 `codex/post-housing-archive-20260827-143620`，但 HEAD 已静态确认等于用户指定的 `origin/main@2526b577`。
- 2026-08-27 补充任务开始时 #431 仍为 OPEN，故在同一报告与任务追加，不创建姊妹报告。
- 首轮 `@codex review` 指出有效模块查询已经闭合 hard dependency、write field policy 是显式边界；这些 findings 经源码点验成立，必须以核销结论取代原 P0/P2 候选。
- 复核指出现有 MEC 与产品文档未承诺授权变更即时推送；PAM-006 只能作为决策门与 UAT 项，不能在契约未定前计为 P2。
