# HOU-UAT-04：经营模式审批执行 SQL 参数类型修复

## Goal

修复 Issue #406 中 `property.mode-transition.request` 在 approval enforce 模式下因 PostgreSQL 参数类型推导失败而卡在 `executing` 的问题，使批准后的房源经营模式真实执行并可审计收敛。

## Confirmed facts

- 隔离 UAT 中 approved request 被 worker 领取后反复报 `inconsistent types deduced for parameter $1`，operation config 保持 `none/enabled`。
- 执行链进入 `PropertyOperationsService.executeApprovedModeTransition()`，在更新配置前调用 `buildTransitionSnapshot()`。
- 单条与批量 snapshot SQL 跨多表复用 tenant/park/unit/mode 参数，缺少一致的显式类型锚定。
- 现有 worker 单测为 mock，现有 property foundation PG spec 未真实覆盖该 executor SQL。

## Requirements

- 为单条与批量 transition snapshot SQL 的 scope/unit/mode 参数建立与 schema 一致的显式类型，避免 PostgreSQL 跨上下文推导歧义。
- 不改变 production-safe runtime 默认、不放宽 maker-checker、不绕过 effect proof 或执行审计。
- 增加真实 PostgreSQL回归，证明 snapshot/approved mode transition execute path 不再触发参数类型错误并把房源切到目标模式。
- 保持 tenant+park+unit scope fail-closed，并覆盖错误 owner scope 不更新。
- 若执行失败状态不能收敛是独立根因，单独记录，不在缺乏证据时扩张本修复。

## Acceptance criteria

- [ ] Issue #406 的 SQL 参数类型错误具有先红后绿的自动化证据。
- [ ] 单条和批量 snapshot 查询使用明确一致的参数 cast。
- [ ] 真实 PostgreSQL spec 0 skip PASS，批准执行后 operation config mode/version 正确变化。
- [ ] 现有 property operations / approvals 单测通过。
- [ ] lint、typecheck、build 与 PR CI 通过；merge 后 main CI+Deploy 双绿。
- [ ] 修复上线后真实 Chrome 重放 C03-D PASS。

## Out of scope

- approval UAT 启用入口（#405）。
- housing task RBAC、deep-link 与 dialog feedback（#402-#404）。
- 生产数据库直操作或改变 production-safe seed 默认。

## Open questions

- 无；用户已批准按最小安全修复进入实现。
