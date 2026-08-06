# B-2c Approval Port Runtime Implementation v7 Handoff

Date: 2026-08-02  
Status: RETURNED / AUDIT ONLY / SUPERSEDED BY v8  
Contract input SHA: `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`  
Shared v3 authority: GO / `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`

## v7 corrections

- The TAP parser now requires one top-level plan and exact `tests`/`pass` counts,
  with `fail`, `cancelled`, `skipped` and `todo` all zero. It also requires the exact
  ordered seven test names. Executable negative cases cover every counter, the plan
  and required-name drift.
- The PG entry registers seven top-level tests instead of one outer suite, so its
  direct TAP authority is `1..7`/`tests 7`, never a file or suite wrapper `1..1`.
- Real child-process integration runs without a recursive `node --test` wrapper,
  asserts the absence of spawn errors and rejects empty stdout. The command explicitly
  selects the TAP reporter because Node 24 defaults direct `node:test` output to the
  spec reporter while Node 22 defaults to TAP.
- External-fixture after cleanup first attempts every open query runner, closes main
  and observer pools in `finally`, and only then asserts zero runner residue. An
  assertion can no longer bypass connection cleanup.
- Cleanup preserves an existing primary failure when auditor connect, query or close
  also fails. Structured postcheck errors retain separate object, eight-table data and
  session residue details. Executable unit cases cover cleanup failure plus auditor
  connect failure and all three residue categories.
- The runner imports `node:process` explicitly and passes targeted ESLint.

The five external phases remain separately spawned: `compile`, `connect-probe`,
`fixture-setup`, `named-tests`, and `fixture-cleanup`. Run-scoped DDL, eight-table
FK-safe data cleanup and application-name session checks remain unchanged.

## Runtime manifest

```text
apps/api/src/modules/property-approvals/property-approval.module.spec.ts	fd3dc1a3daeb458d5b4fd770f88c7090cc43395a1ec29d24347161d3996bd252
apps/api/src/modules/property-approvals/property-approval.module.ts	495064a3df410cdb19c3f27cf7f54a40f866bd87e60ecd937862b3a22ff26646
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.spec.ts	637e7cf03c72165419840720408ead22e3996dc2b791898bc938028a19a9c1b0
apps/api/src/modules/property-approvals/property-approval.port.pg-cli.ts	e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.spec.ts	d3064610524fa871b8dd47c20260a99940d60f288ee8696128c212401e0f6612
apps/api/src/modules/property-approvals/property-approval.port.pg-fixture.ts	b629c3c811c72084ae7ea0e7f47799db7dafc8613baeb9d13f5f550e7d969cb4
apps/api/src/modules/property-approvals/property-approval.port.pg.spec.ts	2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613
apps/api/src/modules/property-approvals/property-approval.port.spec.ts	a4cb80cbdef351bc072e67e9eb973949aac89648ef841cc726ad18418c0b9b2f
apps/api/src/modules/property-approvals/property-approval.repository.spec.ts	e1967eed9e59865fa068e1964a48b9d1cbfb987cef2612b367fe73c4c1f1476f
apps/api/src/modules/property-approvals/property-approval.repository.ts	be882ce7eb7d1bfba78af3b6920c7473b4cf60fbf13cad6bbbf09adb4d2f5199
apps/api/src/modules/property-approvals/property-approval.request.spec.ts	d2b39f8192382c508542a8b52bef222edc507a481c00ade9a9220644eea7be4e
apps/api/src/modules/property-approvals/property-approval.service.ts	1d6dc2dc150745ca6168402a93592b310b3e85eb820cdd622b4167958ec4a93c
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs	463ec3299011dd2ef48b1ce40a95f92416d1bde1de9112345ffc7300a991b674
scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs	74423d888683cc433efd4a45b0d4dd944117651e2ab4797d484e4f0d6a6a07d4
```

Manifest grammar: UTF-8/LF/final-LF, header
`b2c-approval-port-runtime-v7`, followed by ordered
`file\t<path>\t<raw-sha256>` rows.

`B2c approval port runtime implementation v7 SHA`:

```text
cb7cd6d4bdc59ad98deec718b4cd311c9a939ff7635182a3acd7ddd9086d4fbf
```

## Reproducible validation

```bash
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api build
pnpm exec eslint scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate.mjs scripts/e2e/property-remediation/track-b2c-approval-port-pg-gate-lib.cjs
cd apps/api && node --test-reporter=tap --require ts-node/register src/modules/property-approvals/property-approval.port.pg-cli.spec.ts
cd apps/api && node --test --require ts-node/register "src/modules/property-approvals/**/*.spec.ts"
```

Results:

- Typecheck, API lint, API build and targeted runner lint: PASS.
- Formal real-spawn integration on Node 22.23.2: 4/4 PASS.
- The identical formal real-spawn integration on Node 24.18.1: 4/4 PASS.
- Complete approval suite: 167 total, 160 passed, seven PG tests skipped, zero failed.
- Missing-URL orchestrator check: expected exit 2 with machine JSON and
  `postgresGateRan=false`.
- Owned-scope diff/whitespace check: PASS.

No real PostgreSQL test was run and no C/D lane was run. This candidate remains
schema-blocked/PG-not-run. It changes no migration, migration executor, shared contract,
domain, AppModule, task runtime or central roadmap. v6 is RETURNED/audit-only.
