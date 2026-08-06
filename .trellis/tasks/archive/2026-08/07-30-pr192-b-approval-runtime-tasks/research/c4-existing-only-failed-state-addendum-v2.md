# C4 existing-only failed 状态证据补充合同 v2

状态：冻结候选

本合同完整继承 `c4-existing-only-failed-state-addendum-v1.md`。v1 语义、schema 不可达结论、独立 requestHash oracle、真实 adapter/orchestrator 可信边界以及禁止数据库旁路的约束均不变。

## v1 PostgreSQL preflight 发现与唯一修正

临时 PostgreSQL preflight `b2ac4_pg_preflight_20260801b` 执行 93 项测试，结果为 92 PASS / 1 FAIL。唯一失败发生在测试专用可信边界的“零写入”文本断言：原正则 `/INSERT|UPDATE|DELETE/iu` 将合法只读语句尾部的 `FOR UPDATE` 错判为 `UPDATE` 写入。

该 runId 已废弃且不得复用；失败路径未创建 reservation、未发布 research artifact，专属容器与匿名卷均已精确清理。

唯一允许的修正是将断言收紧为 SQL 语句首部匹配：`/^\s*(?:INSERT|UPDATE|DELETE)\b/iu`。它继续禁止 wrapper 发出 INSERT、UPDATE 或 DELETE 语句，同时允许已签署的唯一 `SELECT ... FOR UPDATE`。不得借此改动业务代码、schema、fixture、期望错误、93 项测试组成、矩阵或其他证据。

## 冻结输入

- v1 addendum SHA-256: `eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51`
- v1 signoff SHA-256: `c9fd87b6bef48cbdb96df44851296fa890777b31850293ba56b97d24e8f8abe3`
- 修正后 PG spec SHA-256: `c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077`
- migration 000195 SHA-256: `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4`
- receipt adapter SHA-256: `330a1296130ce23d713e23c66fa40c7830cf3c15e65dd6ce09ab3bee2bf326f6`
- orchestrator SHA-256: `ce984b41d5c7a378182ac1718b98aad75263ffc48d8f3ffa2fd20965955e6ab0`

open-p0-p1：`[]`
