# Implementation report — normalized formal profile continuity

## Scope and source identity

- Candidate branch: `codex/hr-profile-continuous-update-20261020`
- Starting source revision: `8ffc3cff81a60865ec8006136890d260a6ec6012`
- This implementation does not write production data, access a real `.env`, reuse 15432/32882/32883, commit, push, or deploy.

## Delivered behavior

1. The generic normalized `profile` incremental boundary now has the same 33 formal business fields as `UpdateHrEmployeeProfileDto`. Omitted fields are absent from the source comparison/write; explicit nullable `null` remains a clear.
2. Validation, normal source representation, readback and column writes cover the full formal profile. `heightCm` and `weightKg` accept a finite JSON number within existing bounds and no more than two decimals; they are compared as fixed-two-decimal strings because the columns are `numeric(5,2)` and `numeric(6,2)`. Ordinary profile `PUT` keeps its existing DTO behavior and is not silently narrowed by this incremental-packet rule.
3. `dbo.person.core_residue` remains an honest historical raw boundary: eight reviewed raw mappings remain the only advertised mappings. Historic marker-free `englishName` packets still replay, but newly admitted formal fields through this raw table reject with `YUZHOU_PROFILE_RAW_FIELD_PENDING`. A generic normalized source such as `dbo.profile` can carry the 33 fields.
4. The profile ledger does not infer a missing historical baseline from current values. A pre-existing generic nine-field profile ledger with a modern `heightCm` receives a later first `heightCm` source field as a conflict and preserves the modern value.
5. The exact reusable recipe hash is now `68eaaf18c72530cf88e8b05ec0e9cfaa48ed24e9c917a2c3a9e3b2a5edf7f0bb`, explicitly allowlisted alongside the pre-existing `5ba25c32`, `161530bd`, and `31f6aa4b` frozen hashes. This is a normalized formal-contract expansion only; it does not broaden raw mapping/provenance.
6. The independent enterprise runtime has a low-cost `--phase=profile-continuity` actual HTTP chain: preview → commit → normal `PUT /hr/employees/:id/profile` → later source update → modern same-field conflict, followed by a narrow read role that can read an operation status but cannot preview/commit.

## Validation evidence

### Contract, type and focused PostgreSQL

The following commands completed successfully from the repository root:

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/shared lint
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
node scripts/e2e/yuzhou-import-interface.contract.mjs
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/hr/hr-employee-basic-profile.service.spec.ts \
  src/modules/hr/hr-employee-profile-version.spec.ts \
  src/modules/hr/hr-prepared-profile-batch.repository.spec.ts
```

The prepared-profile repository test passed the current hash and all three historical frozen recipe hashes. The descriptor regeneration check also passed:

```sh
node scripts/hr-cutover/describe-yuzhou-import-interface.mjs \
  --check docs/hr/yuzhou-import-interface.v1.json
```

The required incremental PostgreSQL test was run against a newly created, loopback-only `postgres:16-alpine` tmpfs container on `127.0.0.1:55491`, with a random database and `jinhu.hr-profile-continuity=20261020` label:

```sh
HR_YUZHOU_INCREMENTAL_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 \
POSTGRES_PORT=55491 POSTGRES_USER=postgres POSTGRES_PASSWORD=<synthetic> \
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/hr/hr-yuzhou-incremental-import.pg.spec.ts
```

Result: `PASS`; the test reported `Dedicated database identity asserted; disposable database residual=0`. The labeled fixture container was removed; a later label query returned no containers.

### Actual Nest HTTP evidence

An initial fresh synthetic run used new loopback-only PostgreSQL containers on `55492`/`55493`, an API on `55601`, empty database initialization via `scripts/hr-enterprise/init-db.mjs`, and synthetic bootstrap. It ran:

```sh
HR_ENTERPRISE_E2E_CONFIG=<private-0600-config> \
node scripts/e2e/hr-enterprise-runtime.mjs --phase=enterprise
```

Result: `PASS`, 62 assertions. The report’s direct two stages were present:

- `incrementalProfileHttpImportNormalEditAndModernConflict`
- `incrementalProfileNarrowReadWithoutManageDeniedWrite`

After adding the focused phase, the direct independent proof used a *second* fresh resource with new loopback-only PostgreSQL ports `55494`/`55495` and API port `55602`:

```sh
HR_ENTERPRISE_E2E_CONFIG=/Users/mac/.codex/artifacts/hr-profile-continuity-http-20261020/d4987025-ff0f-4e93-aebe-ea9763c03390/owned-e2e-config.json \
node scripts/e2e/hr-enterprise-runtime.mjs --phase=profile-continuity
```

Output:

```text
PASS incrementalProfileHttpImportNormalEditAndModernConflict
PASS incrementalProfileNarrowReadWithoutManageDeniedWrite
Required owned runtime matrix PASS; phase=profile-continuity; assertions=2; skipped=0
```

Private receipts and API/init logs are under `0600/0700` artifact directories:

- `/Users/mac/.codex/artifacts/hr-profile-continuity-http-20261020/65a23a1d-ea5b-407a-80fe-a516981ac095`
- `/Users/mac/.codex/artifacts/hr-profile-continuity-http-20261020/d4987025-ff0f-4e93-aebe-ea9763c03390`

For both runs, the exact API PID was stopped and only the two exact label-matched containers created by the run were removed. The second private summary reports the two required stages and cleanup; its owned-container check is empty. Pre-existing `32882`/`32883` containers were not touched.

## Changed files and SHA-256

| SHA-256 | File |
| --- | --- |
| `6aabf8e6b931bd8e4371eee0b9a6a6dba9ecf4e72f46a7b0721accef5065c0a0` | `.trellis/spec/api/backend/hr-yuzhou-profile-continuity.md` |
| `795b1aacce6935702a6cf0917a93f2fa49706fee943e0364175c4cc3f94902a0` | `apps/api/src/modules/hr/hr-prepared-profile-batch.repository.spec.ts` |
| `063169fe2e85b228bf4644c73ff5480ea14a0f194058c8327f18ca824e8fcf7b` | `apps/api/src/modules/hr/hr-prepared-profile-batch.repository.ts` |
| `903ca01b2634cbfa11d7edbe59bf900d1cdf19af66f7a7ec5b0df358906e52a1` | `apps/api/src/modules/hr/hr-yuzhou-incremental-import.pg.spec.ts` |
| `158a0e796bce9226d902a1403faf05add76e14b56bba9a6195db6f7d1cb66edb` | `apps/api/src/modules/hr/hr-yuzhou-incremental-import.service.ts` |
| `c3992fc98f1ec53fe4f54af6b8d78157d08a10758df68142df90ac2ffabda4e3` | `docs/hr/yuzhou-import-interface.v1.json` |
| `3015f800d48deed568e62b38c5e469028993adf3aa741846d6db53b3d6663381` | `docs/hr/yuzhou-incremental-import.md` |
| `60345c16254ddfde36129795d5448db2ae03144abaa29ebf776bc5c071b75871` | `docs/testing/hr-enterprise-runtime.md` |
| `9955f0ab703cf468b45d606b8a28ceefe4d2fb09391cb5f9a8bdd1839155ee4f` | `packages/shared/src/hr-yuzhou-incremental.ts` |
| `06837860994d8406f3627adf1508bbe92f926bbc2878c62c9b3a0a0012cc8006` | `scripts/e2e/hr-enterprise-runtime.mjs` |
| `03740d349a749c6ec3552a18dd9e0e86a14e2351e8e7d4d744b01cf73b08a105` | `scripts/e2e/hr-enterprise/field-flows.mjs` |
| `3582dc34c59c444623df456cdcd4d43f4d08c60afd98888055b9065e43fc44bb` | `scripts/e2e/yuzhou-import-interface.contract.mjs` |
| `61d4de44607fe3253a2a145ff8d93e83e4335454709c972f4c01fc3551804041` | `scripts/hr-cutover/describe-yuzhou-import-interface.mjs` |

The unrelated parent-owned `.trellis/tasks/10-20-hr-linked-job-change-continuation-20261020/checkpoint.json` modification was observed but not changed by this implementation.

## Coverage boundaries and follow-up

- The HTTP roles are freshly generated synthetic enterprise roles. They prove controller/ValidationPipe/RBAC behavior but are not production HR, department-lead, or employee-self UAT.
- The 33-field contract proves normalized source support; it does not claim that 33 historical Yuzhou raw fields are mapped or populated. `nativePlace` and `degree` historical fills remain separately unapplied, and all other pending raw mappings/dictionary semantics remain pending.
- Existing original T5 witness/certificate state and first-alias acceptance are deliberately protected. No current value is used as historical evidence, and this work does not authorize a historical batch, payroll calculation, or production import.
- Independent checker/release owner still needs to review the full source diff, then make the merge/deployment decision. No full production, actual-user, or production-data action was performed here.
