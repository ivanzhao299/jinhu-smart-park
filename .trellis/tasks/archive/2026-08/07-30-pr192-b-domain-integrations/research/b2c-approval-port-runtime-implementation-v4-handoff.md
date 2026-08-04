# B-2c Approval Port Runtime Implementation v4 Handoff

Date: 2026-08-02  
Status: SUPERSEDED / CODE HISTORY ONLY  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Shared v3 authority: GO / `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## v4 returned-P1 closure

The dedicated PostgreSQL suite now injects real database errors at the actual request,
stage, exclusion and manifest INSERT boundaries using Gate-owned triggers:

- all ten exact dependent `23505` constraints execute the production savepoint recovery
  and classify as `approval-reconcile-partial`;
- an unknown `23505` and an unknown SQLSTATE execute the same recovery and fail closed
  as `property-runtime-unavailable`;
- after every injected failure the same caller manager performs a real sentinel `SELECT`
  and a real sentinel-table `INSERT`;
- every error class runs once with caller commit and once with caller rollback, with an
  independent observer proving the sentinel row is respectively visible or absent;
- setup artifacts are Gate-only and are dropped by the suite. The suite assumes a
  dedicated database migrated through the approved active-index forward fix (`000197`).

Unit goldens now independently prove same-manager `SELECT + INSERT` usability after
client-key mismatch, business-intent mismatch, legacy original-key plus changed intent,
legacy unreserved-active conflict, and each request-hash/result-hash/alternate-receipt-
key corruption branch. Existing replay, known/unknown DB and priority sentinels remain.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	3af6121741e019afc80b251b6bff1a03b11dfb09123fe6c6e43532ca585db488
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v4`, followed by the ordered
`file\t<path>\t<raw-sha256>` rows above.

`B2c approval port runtime implementation SHA`:

```text
4c8ea26dcb13379f4c83731dc2acf8d1a5331336f401301f855418c5f5c4d5ae
```

## Validation and release status

- API typecheck, lint and build: PASS.
- Dedicated command-port unit file: PASS, 24/24 grouped tests.
- Approval runtime recursive wrapper: PASS, 26/26 TypeScript file entries.
- PG suite TypeScript/entry loading: PASS only; its `describe.skip` is not DB evidence.
- Owned-scope `git diff --check`: PASS.

`PROPERTY_APPROVAL_PORT_PG_URL` was absent and the dedicated runner exited 2 with
`no PostgreSQL gate was run`. Therefore the real PostgreSQL cases above are authored but
not executed. This candidate remains schema-blocked/PG-not-run, does not update current
authority and changes no shared contract, migration, domain, AppModule or task runtime.
