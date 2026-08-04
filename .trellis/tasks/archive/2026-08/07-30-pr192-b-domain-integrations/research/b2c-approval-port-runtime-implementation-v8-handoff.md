# B-2c Approval Port Runtime Implementation v8 Handoff

Date: 2026-08-02  
Status: CANDIDATE / SCHEMA-BLOCKED / POSTGRESQL GATE NOT RUN  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Shared v3 authority: GO / `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## v8 correction

The strict TAP parser now rejects any nonzero suite count in addition to requiring
the exact top-level plan, tests/pass counts, zero fail/cancelled/skipped/todo and the
exact ordered seven names. The executable negative matrix includes an otherwise valid
seven-test stream changed only from `# suites 0` to `# suites 1`; it is rejected.

All v7 lifecycle guarantees remain: five separately spawned phases, direct top-level
seven-test TAP, explicit TAP reporter on Node 22/24, real non-recursive spawn capture,
external runner/pool cleanup in `finally`, primary-error-preserving independent cleanup,
and structured object/data/session residue diagnostics.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.spec.ts	58b7e8c011cb2ebc4acca91d813fc86931000574b434ffdb15b8579d0f79e42b
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts	e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts	d3064610524fa871b8dd47c20260a99940d60f288ee8696128c212401e0f6612
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts	b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs	4f988c6879449df92c5d83ad1525447835a0e02d4fbc45db48fde56fb3dba639
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	74423d888683cc433efd4a45b0d4dd944117651e2ab4797d484e4f0d6a6a07d4
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v8`, followed by ordered
`file\t<path>\t<raw-sha256>` rows.

`B2c approval port runtime implementation v8 SHA`:

```text
022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118
```

## Validation

- API typecheck, lint and build: PASS.
- Targeted runner/parser ESLint: PASS.
- Formal real-spawn integration on Node 22.23.2: 4/4 PASS.
- Identical formal real-spawn integration on Node 24.18.1: 4/4 PASS.
- Complete approval suite: 167 total, 160 passed, seven PG tests skipped, zero failed.
- Owned-scope diff/whitespace check: PASS.

No real PostgreSQL test and no C/D lane was run. No migration, executor, shared,
domain, AppModule, task runtime or central roadmap file was modified. v7 is
RETURNED/audit-only.
