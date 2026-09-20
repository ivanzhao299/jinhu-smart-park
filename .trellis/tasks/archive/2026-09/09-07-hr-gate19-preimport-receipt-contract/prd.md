# 修复 Gate-19 生产回执与导入前快照契约漂移

## Goal

补齐 Gate-19 顶层 HOLD 标记并增加生产者消费者一致性合同测试，不触发生产导入。

## Requirements

- Gate-19 的机器可读 JSON 回执必须在顶层明确标注 `productionImport: "HOLD"`，与受控迁移和消费端的失败关闭合同一致。
- 导入前快照只能在 Gate-19 回执同时满足 PASS、临时恢复库写入、无破坏性卷操作、已保留且哈希验证的备份回执以及顶层 HOLD 标记时清除预备份阻断原因。
- 合同测试必须直接核对 Gate-19 生产者输出与导入前快照消费者的字段要求，避免手写 fixture 再次漂移。
- 保持生产导入、正式发薪、照片和附件写入为 HOLD；本任务不得运行生产导入、部署或历史数据抽取。
- 不输出或提交员工资料、工资明细、凭据、附件内容或私有生产路径。

## Acceptance Criteria

- [x] `scripts/production-backup-restore-gate19.sh` 的 PASS JSON 顶层包含 `"productionImport": "HOLD"`。
- [x] Gate-19 合同测试断言该字段存在且不可被误改。
- [x] pre-import 快照合同使用真实生产者字段形状验证兼容性，并继续拒绝缺少顶层 HOLD 标记的回执。
- [x] 相关 shell 语法、Gate-19 合同和 pre-import 快照合同全部通过。
- [x] 变更仅限任务记录、Gate-19 回执和对应定向测试；不产生生产或数据写入。

## Confirmed Facts

- PR #688 已进入 `origin/main`，但 2026-09-07 11:43 UTC 的 pre-import 快照早于 11:48/11:51 UTC 的两次保留型 Gate-19 回执。
- 两次最新 Gate-19 回执均为 PASS、仅写临时恢复库、无破坏性卷操作，且 retained backup 为 `RETAINED_HASH_VERIFIED`；其顶层 `productionImport` 缺失。
- pre-import 消费端要求顶层 `productionImport === "HOLD"`，因此现有真实回执即使已保留也会被拒绝。
- 当前候选与 `origin/main` 为同一 SHA；只读 runtime 诊断返回 `PRODUCTION_RUNTIME_REVISION_MISMATCH`，后续部署/快照重跑仍需独立三端同步门禁。

## Out of Scope

- 生产部署、生产导入、allowlist 变更、一次性写授权或回滚授权。
- 重新执行全量 A/B、工资抽取、照片/附件物化或读取任何原始 HR 数据。
- 将 runtime SHA 漂移解释为已解决，或用 CI/部署历史替代当前运行身份。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
