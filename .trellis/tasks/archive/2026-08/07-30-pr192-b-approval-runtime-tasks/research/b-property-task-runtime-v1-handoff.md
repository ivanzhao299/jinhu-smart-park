# B-property-task-runtime v1 handoff

状态：`CANDIDATE / INDEPENDENT SIGNOFF PENDING`

## 独立 runtime identity

- grammar: `b-property-task-runtime-v1.grammar`
- regular file count: `26`
- grammar bytes: `3583`
- `B-property-task-runtime SHA`: `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`
- owned path: `apps/api/src/modules/property-tasks/**`
- AppModule included in runtime SHA: `false`

## Projection callsite identity

- grammar: `b-property-task-projection-callsite-v1.grammar`
- exact call count: `8`
- grammar bytes: `1208`
- `B-property-task-projection-callsite SHA`: `066dc38facdcf660d092ff85ec51557b81463081f52e4edc951a31f71f30cb15`
- manual rebuild callers: `1`
- authority-sync command callers: `5`
- authority-sync source-terminal callers: `2`
- replace function SQL callsite count: `1`
- direct projection/head DML in task production files: `0`
- second projection writer/function: `0`

## Consumed immutable inputs

- `B-approval-runtime v2 sidecar SHA`: `30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589`
- `B-property-foundation-contract-v2-attestation SHA`: `8ee9ae99efbb14dd346ff10b78ed5af759c893b5f83d3d30188549f85e28807e`
- `B-property-error-filter SHA`: `ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0`
- error-filter handoff raw SHA: `9ca15ef645574a8c86a3f0cd5c3cdd238aa55ac0dddab99fae9be140275b16c2`
- projection schema grammar SHA: `8d36af019b125e5e6fac5fd99a632c00154d2126c228c7bb4ba50f5091ff7868`
- projection function sidecar SHA: `efec512c186d64d025be6760aeeec730c11d8b176dd70ad9dc7a2c4146af043a`
- C4 formal artifact SHA: `68de0a4fc23543b376dec0434faca476e451ec606e7577e850701596f6fdda0d`
- C4 detached manifest SHA: `508da2d5fd79c440f225e16f938d8704a4a9546bd78ff71fbb9b2efd9e86e652`
- C4 reservation SHA: `9fea4ecb8f16ee4b4aa3a37ccbdb8621f95d653c47e329d5efe4176b4abcf899`
- C4 runtime final signoff SHA: `42ceac995d29f87dc4fdbabaca188ef602136d55d937a37699b39eabf15814db`

## Validation evidence

- C4 formal PostgreSQL gate: `93/93 PASS`, `73/73 matrix complete`, `10/10 independent proofs`.
- C4 formal exact cleanup: container and anonymous volume absent, errors `[]`.
- Ownership contract after approved serialization-helper exception correction: `3/3 PASS`.
- API typecheck/build and targeted module tests: `PASS`.
- production source registry: `exact-empty`.
- `test_fixture_*` production registration: `0`.
- receipt persistence ownership: approval port only; task receipt DML: `0`.

## Handoff boundary

- `B3_web_consumer_status=pending`.
- Desktop/390px/focus/44px browser checks: `required/pending`.
- Ordinary UI rebuild discovery: `forbidden`; browser proof pending B-3.
- AppModule single-file composition: `in_progress`, not part of this runtime SHA.
- production enablement: `false`.
- known failures: failed/diagnostic runs `a`, `b`, `20260801i`, `20260801j`, `20260801k` remain non-authoritative and immutable.
- open P0/P1: `[]` for the runtime candidate; independent handoff signoff still required.
