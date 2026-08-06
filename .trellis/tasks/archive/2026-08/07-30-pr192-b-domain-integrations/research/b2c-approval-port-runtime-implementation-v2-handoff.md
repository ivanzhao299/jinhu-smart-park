# B-2c Approval Port Runtime Implementation v2 Handoff

Date: 2026-08-02  
Status: RETURNED / SUPERSEDED CANDIDATE (AUDIT HISTORY ONLY)  
Contract input SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`  
Shared v2 candidate SHA: `cc33749211c46c4ebb8617b7357bcdd50a4ca452f2b4beaae1cf902918dcd1b2`

## Corrections from returned v1

- Financial effect amounts use exactly `^(0|[1-9]\d*)\.\d{2}$`, require positive
  integer cents and never convert money through JavaScript `Number`.
- Active and terminal repository queries use the exact complementary frozen predicates.
- Receipt replay requires `receipt.clientKey === request.clientIdempotencyKey`; every
  other frozen receipt field/hash/nullability remains independently verified.
- Identity replay priority is checked before terminal monotonicity. For a new identity,
  latest terminal source version is queried on the supplied caller manager, after the
  owning caller has locked its source and before INSERT. Same/lower versions fail with
  `approval-source-changed`; the post-conflict lookup remains for race classification.
- The caller transaction is never created, committed, rolled back or released by the
  port. The fixed savepoint restores every tested create/submit write boundary.
- A dedicated PostgreSQL spec and fail-loud runner were added for index authority,
  transaction visibility, caller commit/rollback, three uniqueness races, same-manager
  sentinel usability and caller-source-lock terminal monotonicity.

## Golden coverage

The shared and runtime suites contain grouped goldens covering all contract section 10
categories: exact ABI/key cardinality; transaction identity/no nesting; atomic row set
and all write-boundary rollback; client/intent replay and drift; nine legal and every
illegal terminal pair; full receipt-field corruption; active corruption; ordered scoped
projections; policy/exclusion/maker-checker failures; strict money/BigInt cents; version,
closed-JSON, UTF-8/hash and byte-length boundaries; conflict priority; and the dedicated
PostgreSQL race/savepoint/commit/rollback/visibility cases. PostgreSQL-authored cases are
not claimed as executed evidence below.

## Owned runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	e77d88859b0c89018e071b8567285b87f757af2279ec492136671d081efb24ed
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	00c29578210c80003260a9704fc23a24481c1b664473961b40ddd3f580ddef63
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	529e565b30ec99860eaaea1475beb79263a455e97285b9c10fc359125fdcfdaa
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982
```

Manifest byte grammar is UTF-8/LF-only/final-LF:

```text
b2c-approval-port-runtime-v2
file	<path>	<raw-sha256>
```

Rows are in the exact order shown above. Corrected candidate
`B2c approval port runtime implementation SHA`:

```text
5db37d55da8ec1e93e993df2aaa75c7df056f0608edd2db5cd77f2ae5f8b7eff
```

## Validation

- `pnpm --filter @jinhu/api typecheck`: PASS.
- `pnpm --filter @jinhu/api lint`: PASS.
- `pnpm --filter @jinhu/api build`: PASS.
- Approval runtime recursive wrapper: PASS, 26/26 TypeScript file entries.
- Dedicated port unit file: PASS, 16/16 grouped tests.
- `pnpm --filter @jinhu/shared test`: PASS, 5/5 file entries.
- Owned-file `git diff --check`: PASS.

`PROPERTY_APPROVAL_PORT_PG_URL` was absent. The dedicated runner exited 2 with
`no PostgreSQL gate was run`. The 26-file wrapper loading PG-tagged files is only an
entry/compile result; `describe.skip` suites are not PostgreSQL PASS evidence.

## Blocking schema and release boundary

Migration `000186` remains immutable and was not edited. Its active partial unique
predicate still includes all `approved` rows, disagreeing with the corrected runtime.
The authoritative forward plan is
`b2c-approval-active-source-index-forward-fix-plan-20260802.md`; it owns reservation,
forward DDL, migration Gate and rollout sequence. B2C-ASI-01 has candidate code/unit/PG
golden coverage here, but requires independent execution and acceptance.

Consequently this SHA is **schema-blocked**, is not current, must not update the
current-authority locator and must not enable approval request creation. The returned v1
SHA remains audit history only.
