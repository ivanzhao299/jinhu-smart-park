# B-2c Approval Port Runtime Implementation v3 Handoff

Date: 2026-08-02  
Status: RETURNED / SUPERSEDED CANDIDATE (AUDIT HISTORY ONLY)  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Approved change request SHA: `f91ad906733bab1808c8e48f044edb4e5dab6b44485f3e2f3536d08039ab1f35`  
Shared v3 candidate SHA: `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## Final returned-P1 closure

- Strict command-port legacy-draft completion now always acquires and validates the
  submit receipt with the authoritative request's persisted `clientIdempotencyKey`.
  Alternate business-intent lookup keys never rewrite or reserve request/receipt
  identity. Legacy HTTP/non-strict submit semantics are unchanged and have a regression
  golden.
- Mandatory goldens prove first alternate completion creates one persisted-key receipt
  with both exact hashes; third-key business-intent replay creates nothing; original-key
  replay wins; both requested conflict cases are stable; and independent request hash,
  result hash and either-alternate receipt-key corruption fails closed.
- Database conflict classification now exports and exactly matches all ten delivered
  dependent stage/exclusion/manifest unique constraints. Substring lookalikes and all
  other `23505` constraints fail closed as `property-runtime-unavailable`; unknown DB
  errors are recovered to the savepoint before the same stable failure.
- Multi-condition priority is client key, business intent, active source, terminal
  monotonicity, receipt proof, then unknown constraint. Active is checked before the
  pre-insert terminal check as well as after an insert race.
- Every client/business replay, classified dependent failure, unknown unique and unknown
  DB failure has an independent same-manager sentinel `SELECT` plus `INSERT` golden
  after savepoint success/recovery.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	e77d88859b0c89018e071b8567285b87f757af2279ec492136671d081efb24ed
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	cdfad388e3d7eaa59378eb5fb7b38c451e74851fdefd06f5a729426e6add9ac0
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v3`, followed by the ordered
`file\t<path>\t<raw-sha256>` rows above.

`B2c approval port runtime implementation SHA`:

```text
581f23b04054bbdd7dab6bc41b12ed156d30378c726afd095dafaf4bb0d823a5
```

## Validation and remaining block

- API typecheck, lint and build: PASS.
- Shared build/tests: PASS, 5/5 file entries.
- Dedicated command-port unit file: PASS, 23/23 grouped tests.
- Approval runtime recursive wrapper: PASS, 26/26 TypeScript file entries.
- Owned-scope `git diff --check`: PASS.

`PROPERTY_APPROVAL_PORT_PG_URL` remains absent. The PG-tagged wrapper entries are only
compile/entry evidence; skipped suites are not PostgreSQL PASS evidence. Migration
`000186` was not modified. Promotion remains blocked on the approved forward active
index migration and independent PostgreSQL Gate; this SHA is not current and does not
enable approval request creation.
