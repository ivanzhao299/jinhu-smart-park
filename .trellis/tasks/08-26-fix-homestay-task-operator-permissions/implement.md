# Implementation Plan

1. 读取 shared bundle/template、最新 migration、production seed 与契约测试。
2. 在 shared bundle 追加 `homestay:task:read`，用仓库现有 hash 生成/校验方式更新 revision 与 template definition hash。
3. 原位修正生产仅 failed 且已事务回滚的 `000262`：按已应用目标 bundle 的 tenant 逐租户校验 permission 精确基数，保持 bundle member/revision/signature 幂等更新。
4. 同步 production seed 的 expected revision/signature/template hash，不引入任何用户或账号写入。
5. 扩展 shared、migration/seed、API contract 测试，冻结 GAP-RBAC-03 权限链。
6. 跑 targeted tests、shared build、API lint/typecheck、seed contract；review 最多三轮。
7. commit/push、PR Closes #395、CI/merge/main CI+Deploy、分支清理。
