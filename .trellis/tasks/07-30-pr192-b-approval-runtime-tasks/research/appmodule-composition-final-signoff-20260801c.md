# AppModule 单文件装配正式门禁签署 20260801c

- schemaVersion: `property-appmodule-composition-final-signoff-v1`
- status: `SIGNED`
- decision: `PASS / GO`
- signature: `APPMODULE_PROPERTY_TASK_COMPOSITION=SIGNED`
- signedAt: `2026-08-01`
- productionEnablement: `false`
- nextGate: `combined C4 / B-2a final signoff`

## 唯一正式 authority

- runId: `b_appmodule_composition_20260801c`
- runId SHA-256: `8a9207cce005a3e32ea48b1f74eb04624e2ad436440980a02fc1fca3bc81de96`
- artifact: `appmodule-composition-b_appmodule_composition_20260801c.json`
- artifact bytes: `1535968`
- artifact SHA-256: `06556e17eaad9f18abff6f8e88ae691d9516734e1c0c5dc84fd945633a808be2`
- detached manifest: `appmodule-composition-b_appmodule_composition_20260801c.manifest.txt`
- detached manifest SHA-256: `f237fbc229d1459304a4c8385571818bb96d22e541555ef3d9ce1ee14a6b234a`
- reservation: `appmodule-composition-runid-8a9207cce005a3e32ea48b1f74eb04624e2ad436440980a02fc1fca3bc81de96.reservation.json`
- reservation SHA-256: `2aafcbc1c173dbffd4b2fba909f3ffe505479158c6d7092935cb009b2eb81556`
- AppModule SHA-256: `e7a075192fcb17e6e9ab50639fdd75b3482eb0c09fdaab58101f7c78cbd970c7`
- PostgreSQL spec SHA-256: `f07e6fed49d2a8ffeeac014aef308f953153790aaa627840308a4266269f9b56`
- runner SHA-256: `64ce1f1603fb7a4b888c1df6c082ccd2e73e6b82dfc6f52983bcb602a64639bb`
- static spec SHA-256: `66618a1c550dae01fc9ebccb94b20470b937c8c53200503441342524e378d70b`
- four-stage input freeze SHA-256: `2a34ee77494a7045530d63b7166a8e2afd6677e5a7ef1184b90617dd95c759f3`

## 正式结果

- candidate admissible: `true`
- open P0/P1: `[] / []`
- local static gate: `12/12 PASS, 0 failed, 0 skipped`
- PostgreSQL composition gate: `4/4 PASS, 0 failed, 0 skipped`
- signed inputs: `947`
- API TypeScript execution closure: `934`
- execution helpers: `2`
- input freeze stages: `before-execution / after-local / after-test / after-cleanup`
- all four input freezes identical: `true`
- exact cleanup: `passed`
- container absent: `true`
- anonymous volume absent: `true`
- cleanup errors: `[]`

签名输入完整覆盖 AppModule 装配 authority、完整 `apps/api/src/**/*.ts` 执行闭包、工作区配置以及实际执行的 PostgreSQL bootstrap 与 lifecycle cleanup helper。所有最终输入在每个阶段统一通过 `lstat` 拒绝 symlink 和非普通文件；静态门禁使用真实 symlink 与特殊文件完成负向证明。

## 独立终审

- reviewer `c3_port_pg_gate`: `P0=0, P1=0, P2=0, FINAL PASS`
- reviewer `c4_01b_final_reviewer`: `P0=0, P1=0, P2=0, FINAL PASS`

旧 run `b_appmodule_composition_20260801b` 保持其 review-rejected 历史证据和独立 SHA，不被本签署覆盖；更早失败运行也不得被描述为正式通过。

本签署仅关闭 `appmodule-single-file-property-task-composition` 正式门禁。它不单独等同于 combined C4/B-2a 总签署，不释放 B-3、Track B 总体验收、外部 UAT 或生产启用。
