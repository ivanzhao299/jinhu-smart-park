# B2c 000197 preliminary executor v2 review handoff

Status: frozen candidate awaiting two new independent v2 reviews. No live
execution or database write is authorized by this document.

## Exact candidate chain

- Formal run ID: `b2c197_prelim_20260802a`
- Migration SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1 v2: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Reviewed preflight runner: `ffc2c21e91959848dacea5dd7eb873e966fc7304a69b78d2742c3a18e444379c`
- Reviewed history/catalog spec: `400bb607632724f128fe3e4016111eaffc8a8702b40d3a49e772052f6b918170`
- Preliminary executor, 30729 bytes: `e3c1c61be721ddfee07b4d441bc5b44778e62c376836b136f50f6cd3fc05cfcd`
- Preliminary executor spec, 9818 bytes: `0707c14df57a094c5befb2310ebb16e66a4b96dabbfde0cb1a68e29976bf378e`
- Preliminary v2 input manifest, 2765 bytes: `a7506a3886c56a43333ab4a879fef0382f9a33caeb6d97b0bd6afd20f7a34bda`
- Approval-port PostgreSQL spec: `3af6121741e019afc80b251b6bff1a03b11dfb09123fe6c6e43532ca585db488`

## RETURNED audit artifacts

The following immutable files are audit-only and must not be supplied as v2 GO
reviews:

- Database review: `c2602ba2467c29991896661327733520ec4132a1ea4f3275aa81abf15869d858`
- QA/security review: `8a946a6c076358786301318354717cf619130492808a821d7d08119576215b1f`

Both decisions are `RETURNED`. The new executor accepts only schema
`b2c-000197-preliminary-executor-independent-review-v2` through the new
`B2C_000197_EXECUTOR_V2_REVIEW_A_*` and
`B2C_000197_EXECUTOR_V2_REVIEW_B_*` variables. Each new review must bind this
handoff's raw SHA in addition to the executor, spec and manifest hashes.

## Corrective evidence for fresh review

- The approval-port gate parses the Node TAP summary and exact seven required
  subtest names. It requires `tests=7`, `pass=7`, `fail=0`, `skipped=0`,
  `cancelled=0`, `todo=0`, and at least one suite. The immutable result records
  all counts. Exit status zero alone cannot pass.
- The four failure injection points have distinct boundary names and statement
  hashes. `after-drop` records its post-drop marker; `before-rename` executes a
  separate catalog assertion that proves the old index is absent and the build
  index is present immediately before its unique fault marker. Every point
  independently compares the complete before/after snapshot and verifies no
  build residue.
- The executor spec executes rejection cases for empty/compile-only TAP,
  skipped tests and missing required subtests, and executes uniqueness checks
  across all four failure statements.

## Static results before freeze

- ESLint for executor and executor spec: passed.
- Executor syntax check: passed.
- Executor spec: 9/9 passed, zero skipped.
- Reviewed history/catalog spec: 8/8 passed, zero skipped.

## Remaining authority before live execution

Two new independent v2 GO artifacts and the separate old-writer drain GO are
mandatory. The old-writer proof must state intake stopped, in-flight approval
create transactions equal zero, and active writer build `approval-port-v4`.

Any hash drift returns the candidate to review. Dedicated containers A and B
remain retained. This candidate covers only the absent-path preliminary scope;
final fresh, present-exact, later 000191/000192 application, remaining final
dynamic cases and final/current authority remain deferred.
