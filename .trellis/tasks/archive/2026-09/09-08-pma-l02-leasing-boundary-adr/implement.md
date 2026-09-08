# Implementation Plan: PMA L-02 长租边界 ADR

## 1. Decision record

- [x] 新增 D-04 ADR，记录双上下文职责、共享基础设施、集成边界与禁止事项。
- [x] 写明未来合并的全部必要触发条件与独立批准要求。

## 2. Documentation integration

- [x] 更新 canonical blueprint、current-state index 与 docs index 的权威链接。

## 3. Verification and delivery

- [x] 文档相对链接目标、`git diff --check`、canonical blueprint gate 与 workspace lint passed；变更仅 docs/Trellis。
- [x] 3 轮 review：第 1/2 轮核实 findings 已修或按用户裁定保留，第 3 轮 clean。
- [x] Work commit `25ac6ce2`；PR #711 `Closes #709`；GitHub review clean；squash merge `a2bc64d3b282712eca0d7b74aeb444d15a4393a1`；Issue closed。
- [x] PR CI https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34235032149：scope detect success，`Lint, Typecheck, Build` success，docs-only Release Smoke skipped。
- [x] Exact-SHA CI https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34236456502：非代码失败；因更高优先级 main run 被 concurrency cancelled，不作为门禁通过证据。Exact-SHA Deploy https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34236456507 success。
- [x] Containing-main `8abcbe4d` 已验证包含 merge SHA；CI https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34236661461 全绿（Release Smoke 按 scope skipped）；Deploy https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34236661819 success，含实际 Deploy 与 protected-account verification。本项无需 HR smoke 豁免；常设豁免裁定仍保留供后续项使用。
- [ ] Trellis archive、RBAC ff、删分支、prune、journal。

## Cost Summary template

Task: PMA L-02 长租边界 ADR
Status: merged and gates passed; archive cleanup pending
Files changed: task artifacts and architecture docs only
Tests run: markdown link targets; git diff --check; canonical blueprint contract+mutation; workspace lint
Retries: 0
Approx model rounds: planning/implementation 1, review 3
Repeated scans avoided: reused L-01 architecture map; two focused one-round scouts
Blocked issues: none; exact-SHA CI concurrency cancellation replaced by verified containing-main green run
Next step: archive cleanup and continue L-03
