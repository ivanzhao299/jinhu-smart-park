# Implementation Plan: PMA L-02 长租边界 ADR

## 1. Decision record

- [x] 新增 D-04 ADR，记录双上下文职责、共享基础设施、集成边界与禁止事项。
- [x] 写明未来合并的全部必要触发条件与独立批准要求。

## 2. Documentation integration

- [x] 更新 canonical blueprint、current-state index 与 docs index 的权威链接。

## 3. Verification and delivery

- [x] 文档相对链接目标、`git diff --check`、canonical blueprint gate 与 workspace lint passed；变更仅 docs/Trellis。
- [x] 3 轮 review：第 1/2 轮核实 findings 已修或按用户裁定保留，第 3 轮 clean。
- [ ] commit、PR、CI、merge、containing-main Deploy/CI 豁免证据、归档、RBAC ff、删分支、prune、journal。

## Cost Summary template

Task: PMA L-02 长租边界 ADR
Status: implementation and local verification complete; delivery pending
Files changed: task artifacts and architecture docs only
Tests run: markdown link targets; git diff --check; canonical blueprint contract+mutation; workspace lint
Retries: 0
Approx model rounds: planning/implementation 1, review 3
Repeated scans avoided: reused L-01 architecture map; two focused one-round scouts
Blocked issues: none
Next step: commit and PR/CI/merge closure
