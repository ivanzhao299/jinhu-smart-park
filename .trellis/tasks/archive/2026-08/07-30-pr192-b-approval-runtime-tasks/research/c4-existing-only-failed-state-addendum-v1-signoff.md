# C4 existing-only failed 状态证据补充合同 v1 签署

- schemaVersion: `property-remediation-b2a-c4-existing-only-failed-proof-signoff-v1`
- status: `SIGNED`
- decision: `PASS / GO`
- signedAt: `2026-08-01`
- signature: `C4_EXISTING_ONLY_FAILED_STATE_PROOF=SIGNED`

## 不可变输入

- addendum: `c4-existing-only-failed-state-addendum-v1.md`
- addendumRawSha256: `eccc6433b7341a47b86fc5998a2e7e414b9dbd06ad6ca943f20ed43dd6ae0e51`
- pgSpec: `apps/api/src/modules/property-tasks/property-task.runtime.pg.spec.ts`
- pgSpecRawSha256: `d015c01529752d5efcdebae01da06cf4d94bc7984a16a7e800d5f7aee070d248`
- migration000195RawSha256: `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4`
- receiptAdapterRawSha256: `330a1296130ce23d713e23c66fa40c7830cf3c15e65dd6ce09ab3bee2bf326f6`
- orchestratorRawSha256: `ce984b41d5c7a378182ac1718b98aad75263ffc48d8f3ffa2fd20965955e6ab0`

## 签署结论

- `port-v2 terminal failed`: `UNREACHABLE`
- direct failed insert SQLSTATE: `23514`
- started-to-failed update SQLSTATE: `23514`
- failed rows after proof: `0`
- started rows after proof: `0`
- receipt/business/projection/audit snapshot unchanged: `true`
- schema bypass used: `false`
- forward migration required: `false`
- production schema widening allowed: `false`

可信边界仅用于 schema 不可达状态的分类证明。它由真实 orchestrator 调用真实 receipt adapter 与真实 `classifyReplay`，只允许一次 `SELECT ... FOR UPDATE`，写入次数为零，并应 fail closed 为 `property-runtime-unavailable`。该证据不等同于真实 failed-row PostgreSQL 集成覆盖。

命令 requestHash 使用测试本地、独立实现的 canonical JSON + SHA-256 oracle，覆盖 `claim/start/block/unblock/release` 完整 envelope 的正证与缺少 envelope 的反证；`block` 覆盖 `reason/blockedUntil`，`release` 覆盖 `reason`。

## 独立复审

- reviewer `c3_port_pg_gate`: `P0=0, P1=0, P2=0, PASS / GO`
- reviewer `c4_01b_final_reviewer`: `P0=0, P1=0, P2=0, PASS / GO`
- openP0: `[]`
- openP1: `[]`
- openP2: `[]`

## 下一门禁

签署只允许将上述精确 SHA 纳入 C4 runner 的不可变输入和静态合同。正式生产启用仍被阻断，直到同一冻结输入先通过两次独立临时 PostgreSQL preflight，再通过唯一 runId 的正式 C4 PostgreSQL 门禁、精确清理和最终签署。
