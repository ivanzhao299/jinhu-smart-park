# Implementation Plan: PMA L-01 canonical 领域蓝图

## 1. Canonical blueprint

- [x] 新建三模块 blueprint：模型、状态机、owner workflow、事件/投影、身份/审批、共享边界。
- [x] 更新当前态索引入口与权威说明。

## 2. Executable comparison gate

- [x] 新建 status/endpoint/schema/owner-projection contract script。
- [x] 实际执行 shared endpoint/access validators，避免复制权限真相。
- [x] 接入根 package script与 `.github/workflows/ci.yml` verify step。

## 3. Verification

- [x] canonical blueprint contract：11 owner endpoints、34 schema tables；既有 property gate contract passed。
- [x] 状态、endpoint、schema 三类 mutation 负向抽查均预期失败；已自动化纳入 package gate，临时目录 `finally` 清理；真实 controller/migration 无残留 diff。
- [x] shared build passed；workspace lint passed；shared tests 42/42；API build passed，Web production compile passed。workspace typecheck/Web build 最终类型阶段仅因当前 stale/root-owned `node_modules` 缺少 M-05 新增 Testing Library/Vitest 包失败；不改业务，clean PR CI 为权威门禁。
- [x] `trellis-check` 全面核验；3 轮 review（第 1/2 轮 findings 已修，第 3 轮 clean）。

## 4. Delivery and closure

- [x] commit `78021b36`；PR #707 `Closes #706`；3 轮 review；squash merge `16204c01915ea600b9dc22c5ce94f764a419c01c`；Issue closed。
- [x] PR CI run https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34229396594：非 HR `Lint, Typecheck, Build` success；唯一失败为既有 HR cutover `PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED`，按方案 2 豁免。
- [x] containing-main CI run https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34230911187：非 HR job success，唯一失败同一 HR CAS fixture；containing-main Deploy https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34230911024 success。按常设豁免满足归档门禁。
- [ ] Trellis archive；RBAC main ff；删分支；prune；journal。

## Risk files and rollback points

- `docs/architecture/*`：避免覆盖 L-02 的未来决策。
- `scripts/e2e/*contract.mjs`：只读、确定性、不得依赖生产或网络。
- `package.json` / `.github/workflows/ci.yml`：只增加一个 contract gate，保持现有 release smoke 语义。

## Cost Summary template

Task: PMA L-01 canonical 领域蓝图
Status: implementation and local review complete; awaiting commit/PR CI
Files changed: canonical blueprint/index, contract+mutation scripts, package/CI gate, task artifacts
Tests run: blueprint contract+mutation passed; property API gate contract passed; shared build; shared 42/42; workspace lint; API build/Web compile
Retries: contract source-map root cause reached two attempts then one focused audit; review findings fixed in two batches
Approx model rounds: planning 1, implementation/check 2
Repeated scans avoided: two independent one-round repository maps; foundational docs read once
Blocked issues: local stale/root-owned node_modules lacks M-05 test deps for authoritative Web typecheck/build; clean PR CI required
Next step: commit/push, PR review/CI/merge and containing-main closure
