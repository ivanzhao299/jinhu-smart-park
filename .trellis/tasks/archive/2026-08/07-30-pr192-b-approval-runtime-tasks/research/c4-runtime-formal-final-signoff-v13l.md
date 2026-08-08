# C4 runtime 正式门禁最终签署 v13l

- schemaVersion: `property-remediation-b2a-c4-runtime-final-signoff-v1`
- status: `SIGNED`
- decision: `PASS / GO`
- signedAt: `2026-08-01`
- signature: `C4_RUNTIME_FORMAL_GATE=SIGNED`
- productionEnablement: `false`
- nextGate: `AppModule single-file composition and combined C4 signoff`

## 唯一正式 authority

- runId: `b2ac4_runtime_formal_v13_20260801l`
- artifact: `c4-runtime-formal-candidate-v13-20260801l.json`
- artifact bytes: `256348`
- artifact SHA-256: `68de0a4fc23543b376dec0434faca476e451ec606e7577e850701596f6fdda0d`
- detached manifest: `c4-runtime-formal-candidate-v13-20260801l.manifest.txt`
- detached manifest SHA-256: `508da2d5fd79c440f225e16f938d8704a4a9546bd78ff71fbb9b2efd9e86e652`
- reservation: `c4-runtime-runid-7e28769f0abcaef3a4369d7c675906bb8716bb76aef4eab1cc21c22fcf911d34.reservation.json`
- reservation SHA-256: `9fea4ecb8f16ee4b4aa3a37ccbdb8621f95d653c47e329d5efe4176b4abcf899`
- PG spec SHA-256: `c5b47e80e51d9eaeb40075c2fc98bae039997b12265c6350ccd688303d94c077`
- input freeze before/after: `05988ce0951e741d3e0eb5ef07669a2c9b39c3c8110bf8a12cf597f553dd5412`

## 正式结果

- candidate admissible: `true`
- PostgreSQL: `16.14`
- tests: `93/93 PASS, 0 failed, 0 skipped`
- cross-operation matrix: `73/73 complete and passed`
- true lock schedules: `43`
- ordered post-commit schedules: `30`
- independent proofs: `10/10`
- projection/head indexes: `8/5`
- replace function count: `1`
- budget and row-limit bindings: `true`
- EXPLAIN sequential scan count: `0`
- exact cleanup: `passed`
- container absent: `true`
- anonymous volume absent: `true`
- cleanup errors: `[]`
- open P0/P1/P2: `[] / [] / []`

双 preflight `b2ac4_pg_preflight_20260801c` 与 `b2ac4_pg_preflight_20260801d` 均在相同输入冻结上完成 93/93、数据库证据和精确清理，且未创建 reservation 或门禁 research artifact。`a` 在容器创建前因临时 pnpm 命令缺失失败，`b` 以 92/93 暴露并纠正只读 `FOR UPDATE` 的测试正则假阳性；二者永久废弃且不得复用。

历史正式失败 `20260801i`、`20260801j`、`20260801k` 保持独立、不可覆盖且不具有本次 authority。本签署不得把任一失败或 preflight 描述为正式通过。

## 独立终审

- reviewer `c3_port_pg_gate`: `P0=0, P1=0, P2=0, C4 FINAL PASS`
- reviewer `c4_01b_final_reviewer`: `P0=0, P1=0, P2=0, C4_RUNTIME_FORMAL_GATE=SIGNED / PASS / GO`

本签署仅关闭 C4 runtime 正式 PostgreSQL 门禁。AppModule 单文件装配、组合验证、路线图同步和三方 combined signoff 仍未完成；因此 B-2a 尚未整体释放，B-2b 与生产启用继续阻断。
