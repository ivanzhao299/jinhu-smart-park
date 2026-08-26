# Implementation Plan

1. 读取 shared bundle/template、最新 migration、production seed 与契约测试。
2. 在 shared bundle 追加 `homestay:task:read`，用仓库现有 hash 生成/校验方式更新 revision 与 template definition hash。
3. 原位修正生产仅 failed 且已事务回滚的 `000262`：按已应用目标 bundle 的 tenant 逐租户校验 permission 精确基数，保持 bundle member/revision/signature 幂等更新。
4. 同步 production seed 的 expected revision/signature/template hash，不引入任何用户或账号写入。
5. 扩展 shared、migration/seed、API contract 测试，冻结 GAP-RBAC-03 权限链。
6. 跑 targeted tests、shared build、API lint/typecheck、seed contract；review 最多三轮。
7. commit/push、PR Closes #395、CI/merge/main CI+Deploy、分支清理。

## Actual Result

- PR #398 squash merged 为 `cfc8975c`；Issue #395 已关闭。
- Deploy Production run `32920129118` 成功：failed-only checksum retry、`APPLY/SUCCESS 000262`、API liveness、Docker cleanup 均通过。
- 生产零直接数据操作；迁移只修正未成功且事务回滚的 000262 preflight，逐受影响 tenant 严格断言 `total=1 AND active_api=1`。
- 上线后 RUN_ID `20260826-1015` 真实 UI 证明模板实例化与任务经办用户落点 `/homestay/tasks`，审批决定写入口 403；证据报告见 `docs/uat/homestay-fix-retest-uat-20260826-1015.md`。
