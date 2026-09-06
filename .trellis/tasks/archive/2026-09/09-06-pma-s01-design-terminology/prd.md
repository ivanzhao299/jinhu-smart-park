# PMA S-01 当前态设计索引与术语收敛

## Goal

为共享房产控制面、民宿管理、housing 长租与传统 leasing 建立单一当前态设计入口，消除 PMA-001~PMA-007 指出的权威漂移和运行时术语混用，同时保留历史记录的原始语义。

关联：GitHub Issue #647；审查报告 `docs/reviews/property-modules-modernization-audit-2026-09-04.md` §5.1 S-01。

## Confirmed Decisions

- D-04：housing 与传统 leasing 维持双 bounded context，只统一术语、导航与基础设施。
- 历史 PRD、design、UAT 和任务标题不重写；只在仍可能被当作当前规范的历史材料中追加现名/历史状态注记。
- 当前稳定模型由 architecture 汇总；可执行 controller/service/事务/幂等细节以 `.trellis/spec` 为准。
- `long_rent` 的现行根显示名是“长租经营”；住宅/办公差异由用途和业务段表达，code 不变。
- Party consent authority 是 append-only consent facts；`biz_party.consent_status` 仅为兼容投影。

## Requirements

- 新增单一权威当前态设计索引，链接 mode×usage 矩阵、`rental_status` 投影、租约状态机、identity purpose、consent facts、occupancy owner workflow、双长租域边界和对应 UAT。
- 修订共享房产总架构，使其只陈述稳定模型，并明确链接到可执行 spec；补充办公长租、`rental_status`、identity/consent 和状态机的当前口径。
- 收敛共享运行时显示字典、权限 bundle 与角色模板中的旧根称谓；不得改变权限 code、角色 signature 或领域行为。
- 为仍被索引为当前证据、但含旧称或旧状态的历史材料追加醒目注记；不得改写历史结论。
- 更新文档入口，使维护者能从一个位置找到当前权威和历史证据。
- 全过程不修改 HR 系列 #565~#646，不涉及数据库迁移、生产操作或浏览器验收。

## Acceptance Criteria

- [ ] 单一当前态设计索引覆盖 PMA-001~PMA-007，每项都有当前权威链接与历史/兼容说明。
- [ ] `long_rent=[70,10]`、`short_stay=[70]`、`rental_status` 为生命周期投影等关键口径与当前 shared/API 合同一致。
- [ ] canonical 租约状态表以当前 shared enum/API/DB 为依据，未验证状态明确标为派生、兼容或非首发证明，而非臆测。
- [ ] 运行时共享显示名统一为“长租经营”，不改变 code、权限、角色签名或接口。
- [ ] 历史文件只有新增注记，没有重写原始事实。
- [ ] 所有新增/修改的 Markdown 本地相对链接可解析。
- [ ] shared 定向契约测试、typecheck/build 通过；无无关文件变更。
- [ ] PR review 不超过三轮，CI 通过，合并后 main CI 与 Deploy 均为绿色，Trellis 任务归档。

## Out of Scope

- PMA-008 及以后端点、scope、UUID、删除保护、并发或 UI 行为实现。
- 合并 housing 与传统 leasing 数据模型或迁移历史数据。
- 重新执行 HCD 浏览器 UAT；该工作移交 L-04。
- 修改历史提交、force push、生产直操作。

## Open Questions

无。用户已批准本组范围及 D-04。
