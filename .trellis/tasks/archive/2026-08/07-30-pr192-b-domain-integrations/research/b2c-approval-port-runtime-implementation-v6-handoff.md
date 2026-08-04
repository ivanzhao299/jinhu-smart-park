# B-2c Approval Port Runtime Implementation v6 Handoff

Date: 2026-08-02  
Status: RETURNED / AUDIT ONLY / SUPERSEDED BY v7  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Shared v3 authority: GO / `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## External PostgreSQL lifecycle contract

The v6 gate gives the external orchestrator separately spawned, observable phases:

1. `compile`
2. `connect-probe`
3. `fixture-setup`
4. `named-tests`
5. `fixture-cleanup`

The probe, setup and cleanup phases are implemented by a dedicated CLI. They require
both `PROPERTY_APPROVAL_PORT_PG_URL` and a valid 32-character lowercase-hex
`PROPERTY_APPROVAL_PORT_PG_RUN_ID`, fail closed when either authority is absent and emit
one machine-readable JSON result with phase, run ID, status and details. The
orchestrator also emits a JSON result for every spawned phase.

Setup performs zero-data preflight, owns only run-scoped objects/data and self-cleans
partial setup while preserving the primary error. Cleanup is an independent invocation:
it deletes run data in FK-safe order, drops run-owned DDL with existence-safe operations,
closes its connection, then uses a fresh auditor connection to prove zero object, data
and session residue.

The exact seven-test PG entry supports
`PROPERTY_APPROVAL_PORT_PG_EXTERNAL_FIXTURE=yes`. In that mode it proves the external
fixture exists, never creates or deletes it, closes all test pools in its after hook and
emits run-scoped lifecycle JSON. The external orchestrator always attempts cleanup after
setup was attempted and preserves named-test/phase failure as the primary status.

Named tests run through direct Node entry, so the orchestrator receives the internal TAP
plan and summary. It rejects anything other than exactly `plan=7`, `tests=7`, `pass=7`,
`fail=0`; it does not accept a file-wrapper `1/1` result. The parser is exercised using
actual spawned output from the fixture unit entry and proves its internal `5/5` summary
without any PostgreSQL connection.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.spec.ts	e4c58fe106e7a9b6c29ce43ea2fac34f9a04a287baaa1c1eb7de8af7bd20393c
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts	809b5c05d41a7c231c56d6afd413b452c98ad9847c30f1b2250d821fb39f70b1
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts	334918dd8014696183243477b5700c3f50f055317ed84f41d569bf11210e1192
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts	b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	b873a19d1b983f540d8e4467667ab796cd7fb58392eb979feeb55ed516cdc81e
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs	b9ae17ac88e4f690baf655022553eb4e8c7caad73ee3abb464fc46047f310bdf
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	51291c31a7cea271e31a6f7059840409f38360cae91a06d165ed679d69fe1aed
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v6`, followed by the ordered
`file\t<path>\t<raw-sha256>` rows above.

`B2c approval port runtime implementation v6 SHA`:

```text
4d6809ec0762cb9d80c3eefba7664fcedac6b6f46ad472d9e3d401d181fa8873
```

## Validation and boundary

- API typecheck, lint and build: PASS.
- Approval runtime recursive Node suite: PASS, 160/160 tests; all PG suites skipped.
- Phase CLI/spawn-output integration: PASS, 4/4 tests, including actual internal TAP
  parser proof at 5/5.
- Direct fixture unit entry: PASS, internal TAP 5/5.
- Dedicated runner without PostgreSQL URL: expected exit 2 and machine JSON explicitly
  reports `postgresGateRan=false`.
- Owned-scope whitespace/diff check: PASS.

No real PostgreSQL test was run and no old A/B environment was used. This candidate
remains schema-blocked/PG-not-run. It changes no migration, migration executor, shared
contract, domain, AppModule, task runtime or roadmap. v5 is superseded and retained only
as code history.
