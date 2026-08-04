# 000197 absent-path preliminary executor review handoff

## Decision requested

Review the exact frozen executor chain below for formal run
`b2c197_prelim_20260802a`. This handoff does not authorize execution and does not
claim a final/current migration gate.

## Frozen inputs

- Migration SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1 v2: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Reviewed preflight runner: `ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c`
- Reviewed history/catalog static spec: `400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170`
- Preliminary executor (26407 bytes): `b9a174566abfccd44366c9556287df5e0c48c7fe792f865274b9486ce2b122e0`
- Preliminary executor spec (6502 bytes): `93c970779822ef0c1634e0f314fc10e66fbe566bec4d4b58fe64204df1ac632b`
- Preliminary input manifest (2221 bytes): `bd6594c5c7eac69b6dd50212eb97533f66d220af162f51483ce75a8bfdde6f45`
- Approval PostgreSQL spec: `3af6121741e019afc80b251b6bff1a03b11dfb09123fe6c6e43532ca585db488`

## Static verification

- Executor syntax check: passed.
- Executor candidate spec: 9/9 passed.
- Reviewed history/catalog spec: 8/8 passed.
- Default executor invocation returned `execution_authorized=false`; it did not
  inspect or write PostgreSQL.

Before any database operation, the live branch revalidates the exact candidate
manifest, reruns both signed static specs, reruns the reviewed full resource and
dual-history preflight, and requires all immutable authority artifacts below.

## Required immutable authority artifacts

1. `independent-database-reviewer` GO using schema
   `b2c-000197-preliminary-executor-independent-review-v1`.
2. `independent-qa-security-reviewer` GO using the same schema but a distinct
   reviewer authority.
3. Old-writer drain GO using schema `b2c-000197-old-writer-drain-v1`, proving
   intake stopped, in-flight approval-create transactions equal zero, and the
   active writer build equals `approval-port-v4`.

Each artifact must bind the formal run ID and all exact hashes required by the
executor. Until all three raw SHA/path pairs exist, live execution remains
blocked.

## Authorized preliminary scope and exclusions

The future live run is limited to existing dedicated containers A and B and
retains both containers and anonymous volumes. It may establish only the
absent-path preliminary evidence. It does not establish final fresh execution,
present-exact history, later 000191/000192 application, remaining final dynamic
cases, or final/current authority.

At handoff time, 000197 has not been written to either database and no Docker
resource was created, removed, stopped, or cleaned by the executor.
