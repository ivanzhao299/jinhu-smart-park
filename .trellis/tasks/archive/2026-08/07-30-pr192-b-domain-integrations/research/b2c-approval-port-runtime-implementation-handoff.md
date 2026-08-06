# B-2c Approval Port Runtime Implementation Handoff

Date: 2026-08-02  
Status: RETURNED / SUPERSEDED CANDIDATE (AUDIT HISTORY ONLY)  
Contract input SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`
Shared implementation input SHA:
`b9856434c19c95588e5258b0e2e1e19e46898d5cb5b398c0621e9fa717d3e5a7`

## Scope

- Legacy `createDraft(...)` and `submit(...)` remain source-compatible and open their
  existing outer transaction exactly once.
- Manager-aware `createDraftWithManager(...)` and `submitWithManager(...)` own the one
  approval state machine used by the new command port.
- `createPendingRequest(...)` unwraps only an active TypeORM caller transaction, uses
  the manager as-is, creates no query runner and opens/commits/rolls back no transaction.
- The port uses the frozen savepoint, request/receipt unqualified
  `ON CONFLICT DO NOTHING RETURNING id`, ordered conflict resolution and stable errors.
- Request creation, stages, exclusions, manifests, three ordered audits and completed
  legacy-v1 submit receipt are atomic.
- Receipt replay validates the frozen actor/identity/nullability/result-ref plus exact
  canonical request and result hashes independently.
- Recursive canonical serialization sorts all object keys by unsigned UTF-8 bytes and
  never whole-object/array stringifies.
- Projection methods use the supplied manager, exact scope predicates and deterministic
  source ordering. Active cardinality greater than one fails closed.
- Nest binds both shared tokens to the existing service with `useExisting` and exports
  the shared singleton symbols.

Owned runtime files:

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	46dc5857f55171a64b786b85f9c9b97d35f523e252501d3545f751c70a665d04
apps/api/src/modules/property-approvals/property-approval.repository.ts	68b1d5daec66dc7e05a258a35d171bb5a810322df2e3830332d5bea057260c14
apps/api/src/modules/property-approvals/property-approval.service.ts	0d18800b2ab9e49f88e52c48c7cd741fe0b631309144a81ee0f4cd14130bfaf0
```

Manifest byte grammar is UTF-8/LF-only/final-LF:

```text
b2c-approval-port-runtime-v1
file\t<path>\t<raw-sha256>
```

Rows are in the exact order shown above. Candidate
`B2c approval port runtime implementation SHA`:

```text
31c7c8c4192d426b6809165d4c3878a81ce5e8e14e6a57f2d7ea8d1dd3d1d81d
```

## Validation

- `pnpm --filter @jinhu/api typecheck`: PASS.
- `pnpm --filter @jinhu/api build`: PASS.
- `pnpm --filter @jinhu/api lint`: PASS.
- All approval-runtime targeted specs: PASS, 24/24 files.
- Port targeted cases cover signed canonical hashes, inactive/fake manager rejection,
  atomic created path, exact replay, corrupt result-hash conflict, same-manager
  projections, savepoint recovery, actor separation and closed JSON/money negatives.
- `git diff --check`: PASS.

## Skipped evidence and release boundary

This v1 candidate was returned by independent Gate. Its SHA remains recorded only as
audit history and must not be treated as current or pending promotion. Returned findings
included the financial decimal grammar, exact active/terminal predicate, receipt
`clientKey` identity, full golden matrix and PostgreSQL evidence gaps. The corrected
runtime is tracked separately and is schema-blocked by the delivered `000186` partial
unique predicate.

No new PostgreSQL fixture/container was started in this lane. Existing PostgreSQL-tagged
approval specs were included in the 24-file targeted run, but an independent dedicated
concurrency/rollback Gate remains required before this candidate becomes current.

No migration, domain module, AppModule, task runtime or production flag was modified.
`open_P0_P1=[]` is not self-declared; the candidate waits for independent Gate review.
