# 修复 000200 runtime-control 合同链冲突

## Goal

修复生产部署在 `000200_property_b_migration_compatibility_control.sql` 上出现的
`property-runtime-control-definition-drift`，使已经执行 000194/000195 的生产形态数据库能够安全继续迁移，且不回退、覆盖或伪造已审计的 runtime-control 合同状态。

## Requirements

- 保持迁移 forward-only 语义；不得修改已经在生产成功的 000001–000199 历史迁移。
- 处理 000200 与 000195 最终合同状态之间的顺序冲突，同时兼容仓库已有的受控直跑回归顺序。
- 对任何已成功记录旧 000200 checksum 的长期数据库采用显式、窄范围、可审计且 fail-closed 的兼容策略，禁止静默重跑有副作用的 SQL。
- 在具有有效 tenant/park/asset assignment 的生产形态 fixture 上执行完整迁移尾链，而不是只验证单个迁移。
- 增加部署前只读诊断/门禁，使同类迁移合同漂移在构建、服务切换和 release marker 之前失败。
- 同步相关 CI、部署/发布/测试文档与 Trellis 可执行规范。
- PR 最新 head 的 Verify、Release Smoke、目标回归和 Codex review 均无可操作问题后，按用户授权自动合并；随后监控 Deploy 并继续闭环修复，直至部署成功。

## Acceptance Criteria

- [x] 生产失败形态（000194/000195 已成功、12 条控制为 v3）可通过 000200，既有控制定义和审计记录保持不变。
- [x] 000200 在其历史直跑顺序中仍能建立受控 expand 状态，且混合、缺失或漂移状态继续 fail closed。
- [x] 已成功记录旧 000200 checksum 的环境仅跳过、不重跑；未知成功 checksum 拒绝继续。
- [x] 生产形态 fixture 从 000193 之前跑过 000194→000195→000200→当前尾部迁移及 production seed，并验证双 history、控制定义和审计收敛。
- [x] 部署前只读检查能在 000200 定义漂移时阻止部署，并且不输出敏感信息或写生产数据。
- [x] 独立空库按真实 migration→production seed 顺序执行并重跑 seed 后，late-created asset scope 收敛为 exact v3 与双 correction audit。
- [x] 相关 shell/Node 静态检查、迁移合同测试、PostgreSQL 集成回放、Verify/Release Smoke 全部通过。
- [x] PR 无未解决可操作 review thread，Codex 对最新 head 无新增问题，PR 已自动合并。
- [x] 合并后的生产 Deploy 成功，API liveness/readiness、Web login、Docker cleanup 均通过。
- [x] 发布工作流显式传入的 `RUN_PRODUCTION_SEED=yes|no` 不会再被 `.env.production` 默认值覆盖；双向优先级、无覆盖回退和非法值均有回归。
- [x] seed 控制面修复通过 Verify/Release Smoke、最新 Codex review 并自动合并，合并后的生产 Deploy 再次成功。
- [x] 通过受审计的 seed 文件重放触发自动发布，生产日志明确显示 `RUN_PRODUCTION_SEED=yes`，并暴露真实 production seed 阻断而未误报成功。
- [ ] Track B permission seed 接受同一已验证 scope 下多个有效 biz park，完整 seed 重跑回归通过。
- [ ] 修复通过 Verify/Release Smoke、最新 Codex review 并自动合并；最终生产日志显示执行 `000006`、`000008`、健康、UAT 与 Docker cleanup 全部成功。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
