# Full-scope check review — normalized formal profile continuity

## Scope reviewed

- Candidate baseline: `8ffc3cff81a60865ec8006136890d260a6ec6012`.
- Reviewed every implementation-owned API, shared-contract, descriptor, test and
  task artifact listed in `implementation-report.md`, plus the original-profile
  regression path affected by the common profile validator.
- The unrelated parent-owned
  `.trellis/tasks/10-20-hr-linked-job-change-continuation-20261020/checkpoint.json`
  was observed but not read or changed by this review.

## Findings fixed

1. **Historical alias error contract was accidentally shadowed.**
   The new generic profile text validator ran before the established
   `nativePlace`/`degree` alias check. A malformed alias packet therefore
   returned `YUZHOU_PROFILE_TEXT_FIELD_INVALID` instead of the frozen
   `PROFILE_ALIAS_FIELD_INVALID` result. The validator now checks the alias
   contract first, then applies the generic profile validation. This preserves
   the old fail-closed result without broadening either accepted input set.

2. **The 33-field regression was not asserting all persisted columns.**
   The PostgreSQL scenario supplied all formal fields but originally verified a
   representative subset. It now checks the remaining persisted columns,
   checks fixed-two-decimal numeric storage, source replay, normal formal edit,
   independent source update, modern same-field conflict, and an explicit
   `idType`/`idNumber` clear. The clear assertion proves encrypted, masked and
   fingerprint representations are cleared together while an unrelated modern
   field remains intact.

3. **The isolated PostgreSQL tests assumed a shared fixed port.**
   Both affected tests now require a supplied non-privileged loopback port
   instead of assuming a port that is already used by another HR fixture. They
   retain loopback-only and explicit-port requirements, so CI may keep its
   existing port wiring while independent reviewers can use a new owned
   container without touching another task's resources.

## Contract and data-flow result

- The shared normalized contract contains exactly 33 business fields and the
  API admits all 33 only for generic normalized profile sources.
- `dbo.person.core_residue` remains limited to the historical compatibility
  fields. New raw fields fail with `YUZHOU_PROFILE_RAW_FIELD_PENDING`; no raw
  mapping, original proof, alias first acceptance or immutable T5 baseline was
  broadened.
- Source input is validated before normalization; numeric values are finite JSON
  numbers within bounds and at most two decimal places, and current database
  numeric values are canonicalized to the same fixed-two-decimal comparison
  form. Dates, lengths, e-mail and `idType` constraints are checked at the API
  boundary.
- An incoming identity is normalized to encrypted/masked/fingerprint fields;
  comparison uses the fingerprint and an explicit clear clears all three. The
  normal profile service remains the normal, permissioned editor.
- Existing ledger rows without a baseline for a newly introduced field conflict
  rather than derive a baseline from current modern data. Three-way comparison
  and target-version CAS remain the writer protection.
- The generated interface describes normalized support separately from the raw
  coverage matrix and regenerates without drift. The prepared-reader allowlist
  remains explicit, retaining all old recipe hashes plus the reviewed normalized
  contract hash.

## Verification

All commands were run from the candidate worktree.

```sh
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/shared lint
pnpm --filter @jinhu/shared typecheck
```

Result: PASS.

```sh
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/hr/hr-employee-basic-profile.service.spec.ts \
  src/modules/hr/hr-employee-profile-version.spec.ts \
  src/modules/hr/hr-prepared-profile-batch.repository.spec.ts \
  src/modules/hr/hr-employee-basic-profile-parity.contract.spec.ts \
  src/modules/hr/hr-access-policy.spec.ts \
  src/modules/hr/hr-employee-profile-scope.spec.ts
```

Result: PASS, 46 tests. This includes field projection/masking, HR/manager/self
scope boundaries, normal profile editing and all frozen prepared recipe hashes.

```sh
HR_YUZHOU_INCREMENTAL_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 \
POSTGRES_PORT=55497 POSTGRES_USER=postgres POSTGRES_PASSWORD=<synthetic> \
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/hr/hr-yuzhou-incremental-import.pg.spec.ts

HR_YUZHOU_PROFILE_BASELINE_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 \
POSTGRES_PORT=55497 POSTGRES_USER=postgres POSTGRES_PASSWORD=<synthetic> \
pnpm --filter @jinhu/api exec node --test --require ts-node/register \
  src/modules/hr/hr-yuzhou-profile-baseline.pg.spec.ts
```

Result: PASS, 1/1 and 2/2 respectively. A fresh label-owned PostgreSQL 16
container on `127.0.0.1:55497` and random disposable databases were used; each
test asserted database identity and zero database residual. The exact container
was removed afterward and label query returned zero residual containers.

```sh
node scripts/e2e/yuzhou-import-interface.contract.mjs
node scripts/hr-cutover/describe-yuzhou-import-interface.mjs \
  --check docs/hr/yuzhou-import-interface.v1.json
git diff --check
```

Result: PASS; descriptor contract 2/2 and no whitespace errors.

The implementation-owned actual Nest HTTP proof was unchanged by this review's
source fix other than the shared validator ordering. Its fresh owned receipt
records `profile-continuity` with both required stages and `skipped: 0`:

- normalized import → normal edit → independent source update → modern
  same-field conflict;
- narrow read role may read operation status but receives 403 on preview.

The receipt remains private at
`/Users/mac/.codex/artifacts/hr-profile-continuity-http-20261020/d4987025-ff0f-4e93-aebe-ea9763c03390/results-profile-continuity.json`.

## Current implementation fingerprints

The original implementation report remains accurate except for the two
review-improved PostgreSQL tests and the validator ordering below. Current
SHA-256 fingerprints are:

| SHA-256 | file |
| --- | --- |
| `1a4401f91c694ef2bb3e7b101a4e0b789fe0254443fa72d0618c4e117c4d1084` | `apps/api/src/modules/hr/hr-yuzhou-incremental-import.service.ts` |
| `d101ed220ed640f969e971390052436833c72ca1269ae4c3bcde7541e4082975` | `apps/api/src/modules/hr/hr-yuzhou-incremental-import.pg.spec.ts` |
| `4dc756b93bced73d76132db18507197cbb38a64d983f85bed9bd72e73a4cf23f` | `apps/api/src/modules/hr/hr-yuzhou-profile-baseline.pg.spec.ts` |
| `9955f0ab703cf468b45d606b8a28ceefe4d2fb09391cb5f9a8bdd1839155ee4f` | `packages/shared/src/hr-yuzhou-incremental.ts` |
| `063169fe2e85b228bf4644c73ff5480ea14a0f194058c8327f18ca824e8fcf7b` | `apps/api/src/modules/hr/hr-prepared-profile-batch.repository.ts` |
| `06837860994d8406f3627adf1508bbe92f926bbc2878c62c9b3a0a0012cc8006` | `scripts/e2e/hr-enterprise-runtime.mjs` |
| `03740d349a749c6ec3552a18dd9e0e86a14e2351e8e7d4d744b01cf73b08a105` | `scripts/e2e/hr-enterprise/field-flows.mjs` |
| `c3992fc98f1ec53fe4f54af6b8d78157d08a10758df68142df90ac2ffabda4e3` | `docs/hr/yuzhou-import-interface.v1.json` |

## Findings not fixed

None in the implementation scope.

## Acceptance boundaries retained

- The HTTP roles are owned synthetic roles. They prove real controller,
  ValidationPipe and RBAC behavior but are not production HR, department-lead
  or employee-self UAT.
- Normalized 33-field support does not establish 33 historical raw mappings or
  populate any historical source data. Original alias batches remain unapplied.
- No production data, payroll calculation, authentication behavior, production
  role or deployment setting was changed. Production import and real role
  acceptance remain separate gates.
