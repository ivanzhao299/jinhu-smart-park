# B-2c Approval Port Runtime Implementation v5 Handoff

Date: 2026-08-02  
Status: SUPERSEDED BY v6 / CODE HISTORY ONLY  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Shared v3 authority: GO / `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## PG fixture correction

The exact seven-test PostgreSQL suite now uses a strongly validated 32-character
lowercase-hex run ID. Every Gate-owned table, function, trigger, application name,
fault setting, tenant and park identity is derived from that run ID and every SQL
identifier is revalidated before quoting.

Fixture lifecycle guarantees:

- before setup, both run-owned DDL objects and tenant/park rows across all eight approval
  runtime entity tables must have zero residue;
- every setup and cleanup step is recorded in an ordered audit;
- partial table/function/trigger setup is cleaned with existence-safe, idempotent DDL;
- run data is deleted in FK-safe order before object cleanup;
- setup failures preserve the primary error and attach cleanup failures instead of
  replacing it; after-hook cleanup failures are reported separately from test failures;
- every explicit query runner is registered and released through nested `finally`
  blocks, while TypeORM transaction callbacks own their normal connections;
- main and observer pools close before a new independent auditor verifies final object
  residue, eight-table data residue and zero sessions under both run application names;
- the independent auditor itself closes in `finally`.

Static/unit tests cover unique safe names, invalid run IDs, partial setup at multiple
steps, idempotent cleanup, FK-ordered eight-table cleanup, primary-error preservation,
the exact seven named PG tests, guarded `try/finally`, final independent zero-residue
checks and session-leak checks.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts	7ce34bb689f30a044535244f4cd04ad5ea78341c717b3bba14a4604855986eb0
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts	8bbdccbec7658da6173ebd8372a423df027441f1e5cdf67e8da065fef02e4cd1
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	f8865fa948f1f4cac693a3ee2420bfc398b1feca487a2c6563c3afa8d388f4df
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	8db393791a05f47537276113041fb714970377ae96c7980835c03256b550d982
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v5`, followed by the ordered
`file\t<path>\t<raw-sha256>` rows above.

`B2c approval port runtime implementation SHA`:

```text
e30ffc9dd618d4b95c7974ab43d4ab6a54daa783876a5e37cb03a212aa69d9f3
```

## Validation and boundary

- API typecheck, lint and build: PASS.
- Fixture static/unit plus PG entry: PASS, 2/2 file entries; the PG suite was skipped.
- Approval runtime recursive wrapper: PASS, 27/27 TypeScript file entries.
- Owned-scope `git diff --check`: PASS.
- Dedicated runner without `PROPERTY_APPROVAL_PORT_PG_URL`: expected exit 2,
  explicitly reporting that no PostgreSQL Gate ran.

No real PostgreSQL test was run and no old A/B environment was used. This candidate
remains schema-blocked/PG-not-run and is not current. It changes no migration, executor,
shared contract, domain, AppModule, task runtime or roadmap.
