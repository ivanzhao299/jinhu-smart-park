# C4 existing-only failed 状态证据补充合同 v2 签署

- schemaVersion: `property-remediation-b2a-c4-existing-only-failed-proof-signoff-v2`
- status: `SIGNED`
- decision: `PASS / GO`
- signedAt: `2026-08-01`
- signature: `C4_EXISTING_ONLY_FAILED_STATE_PROOF_V2=SIGNED`

## 不可变输入

- v2 addendum SHA-256: `0609ee349506b71d62c4f14a865859bb386c847c7a2caf123f79a21c7b6d8213`
- corrected PG spec SHA-256: `c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077`
- inherited v1 addendum SHA-256: `eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51`
- inherited v1 signoff SHA-256: `c9fd87b6bef48cbdb96df44851296fa890777b31850293ba56b97d24e8f8abe3`
- migration 000195 SHA-256: `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4`
- receipt adapter SHA-256: `330a1296130ce23d713e23c66fa40c7830cf3c15e65dd6ce09ab3bee2bf326f6`
- orchestrator SHA-256: `ce984b41d5c7a378182ac1718b98aad75263ffc48d8f3ffa2fd20965955e6ab0`

## 唯一修正裁定

失败 preflight `b2ac4_pg_preflight_20260801b` 的唯一失败是测试断言把合法 `SELECT ... FOR UPDATE` 误判为写入。只允许将零写入正则收紧为 SQL 语句首部 DML 匹配；机械还原该断言后 PG spec SHA 必须恢复 v1 签署值 `d015c01529752d5efcdebae01da06cf4d94bc7984a16a7e800d5f7aee070d248`。

业务代码、schema、fixture、错误合同、73 项并发矩阵、10 项独立证明与 93 项测试组成均不得变化。失败 runId 永不复用；其 reservation、gate artifact 和 manifest 均不存在，专属容器与匿名卷的失败输出均确认精确清理。

## 独立复审

- reviewer `c3_port_pg_gate`: `P0=0, P1=0, P2=0, PASS / GO`
- reviewer `c4_01b_final_reviewer`: `P0=0, P1=0, P2=0, PASS / GO`
- openP0: `[]`
- openP1: `[]`
- openP2: `[]`

下一次 preflight 之前，runner 必须同时保留 v1 证据链并精确绑定本 v2 addendum、v2 signoff 与修正后 PG spec SHA；runner 静态门禁和独立复审必须重新通过。
