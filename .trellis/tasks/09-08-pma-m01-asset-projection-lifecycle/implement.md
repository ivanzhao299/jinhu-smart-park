# Implement — M-01 资产投影生命周期对称化

## 执行清单

- [x] 建立 Issue #696、分支和 Trellis 任务。
- [x] 核验 PMA-009、S-02、mapping schema 与 blocker 现状。
- [x] 补 assets restore controller/service 契约与 data-scope/锁语义。
- [x] 收紧 property operation 显式停用/解绑：版本、状态、blocker、原子性。
- [x] 让 delete/restore 与 mapping service 使用同一 asset-space lock，并验证 disabled/history 关联。
- [x] 补 controller/service/DTO 契约测试及 active/history/soft-delete fixtures。
- [x] 补隔离 run-id HTTP API E2E 与清理。
- [x] 运行定向 unit/PG/API E2E、API lint/typecheck/build、diff check。
- [x] `trellis-check` review，最多三轮；同根因自动修复最多两次。
- [ ] commit/push/PR，等待 PR CI，squash merge。
- [ ] 核验 main CI + Deploy 双绿，关闭 Issue，归档任务。

## 验证命令（按实际脚本校准）

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register <M-01 specs>`
- `DATABASE_URL=... pnpm --filter @jinhu/api exec node --test --require ts-node/register <M-01 pg spec>`
- `node scripts/e2e/<M-01 suite>.mjs`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/api build`
- `git diff --check`

## 风险与回滚点

- blocker SQL 必须复用当前 owner workflow 定义，避免第二套状态口径。
- 锁顺序固定为 property unit scope → biz unit/config → asset mapping key；不得与 mapping service 相反。
- 不编辑成功迁移；默认以既有约束和事务测试证明无需新迁移。
- 金融、合同、occupancy、mapping audit 仅查询或追加，不软删/重写。

## 续跑点

PR #697 第 1 轮 review 提出 1 个 P1（E2E 幂等键，已与首次 Release Smoke 失败同根因修复）及 5 个 P2；已批量补齐 restore 冲突/父链、统一锁顺序、work-order blocker producer 锁和结构化 blockers。首次 Release Smoke 仅在新 suite 首个缺 key 的 POST 失败，其余迁移/seed/基线均通过；下一步推送修复并等待第 2 次 CI/Release Smoke。

## Cost Summary

Task: M-01 implementation
Status: ready for PR
Files changed: assets/property operations services/controllers/tests, property E2E gate/suite/docs/CI scope, Trellis artifacts/spec
Tests run: 30 focused API tests; property API gate contract; API lint/typecheck/build; JS syntax; diff check
Retries: 1 local test-fixture compatibility repair; 1 Release Smoke E2E-key repair; 1 review batch
Approx model rounds: COST_GUARD active after threshold
Repeated scans avoided: two scoped read-only scouts and targeted ranges
Blocked issues: none
Next step: commit/push/PR and wait for CI + Release Smoke
