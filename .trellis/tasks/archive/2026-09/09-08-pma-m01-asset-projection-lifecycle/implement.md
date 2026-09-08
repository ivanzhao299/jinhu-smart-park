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
- [x] commit/push/PR，等待 PR CI，squash merge。
- [x] 核验 main CI + Deploy 双绿，关闭 Issue，归档任务。

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

PR #697 第 3（最终）轮 review 的 1 个 P2 已由 `56987acb` 修复：通用 units update 在锁内采用最新 `asset_unit_id`，避免并发 audited unlink 后写回旧映射。替换 PR CI `34180956408` 全绿后已 squash merge，main merge SHA 为 `062515eff98d461779f7eeaf65d95a012c0834c2`。同 SHA 的 main CI `34182912206`（含 Release Smoke/property API E2E）与 Deploy Production `34182912123` 均成功；Issue #696 已关闭。未发起第 4 轮 review，满足最多三轮约束。

## Cost Summary

Task: M-01 implementation
Status: complete; PR #697 merged, main CI and Deploy green, Issue #696 closed
Files changed: assets/property operations/units services/controllers/tests, property E2E gate/suite/docs/CI scope, Trellis artifacts/spec
Tests run: 30 focused API tests plus 17-test final review contract; property API gate contract; API lint/typecheck/build; JS syntax; diff check
Retries: 1 local test-fixture compatibility repair; 1 Release Smoke E2E-key repair; 1 Release Smoke SQL-parameter repair; 3 review rounds
Approx model rounds: COST_GUARD active after threshold
Repeated scans avoided: two scoped read-only scouts and targeted ranges
Blocked issues: none
Next step: archive M-01, then start M-03 strictly serially
