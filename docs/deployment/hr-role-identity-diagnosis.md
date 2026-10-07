# HR role identity diagnosis

When seed `000033` fails its exact-one identity assertion, do not repeat an
unchanged deployment or grant the role to every matching alias. Obtain counts:

```sh
gh workflow run deploy-production.yml --ref <reviewed-branch-or-main> \
  -f deploy_mode=diagnose-production-runtime-revision -F diagnose_hr_role=true
```

This opt-in probe uses the existing production environment and serial deployment
queue. It executes a fixed, time-bounded read-only transaction and prints only
matching/enabled user counts, eligible role counts and already-bound user counts.
It never prints account rows, secrets or SQL errors and never grants permissions.
The following runtime-image diagnostic can still fail independently (for example,
missing revision labels); inspect the count-only step separately. A successful
probe is not a deployment or production-import approval.

Validation: `node --test scripts/e2e/hr-role-identity.contract.mjs`.
Use the observed classification to build a production-shaped isolated fixture
before changing the seed. Counts alone never authorize choosing an arbitrary
survivor or broadening identity scope.

## Canonical responsibility identity

The maintained `scripts/generate_jinhu_2026_user_import.py` declares `wuenguo`
as the HR/administration department manager. Seed `000033` selects that exact
scoped, non-deleted identity; only when it is absent does it support the legacy
`wu_enguo` alias used by the historical responsibility migration and apartment
seed. A disabled canonical identity does not redirect grants to the legacy alias.
Migration `000175` deliberately precreates disabled accounts without initialized
credentials. The role seed may prepare role metadata for them but never enables
accounts, initializes credentials or bypasses authentication. Duplicate selected identities,
missing/disabled/super roles and cross-scope binding remain rejected. Both aliases
may coexist without granting the new role to both. No account is deleted or merged.

Regression: `node scripts/e2e/wu-enguo-hr-manager-postgres.mjs` covers both enabled
aliases (the observed production shape), exact canonical selection, legacy-only
fallback, duplicate canonical rejection, disabled-account preservation (including
the fresh-schema legacy-only shape), repeat,
concurrency and scope isolation.

## Profile import access check

The count-only probe also follows seed000033's canonical `wuenguo` selection, falling back to `wu_enguo` only when the canonical identity is absent. `selectedClassification` distinguishes a disabled or duplicated selected identity, missing HR_MANAGER binding and incomplete effective profile capabilities. The old alias-wide `classification` remains descriptive and is not a blocker merely because both valid aliases coexist.

The five checked capabilities are `hr`, `hr:employees`, `hr:employee:read`, `hr:employee_profile:read`, and `hr:employee_profile:manage`. `rolePermissions` describes the existing HR_MANAGER catalog, while `effectivePermissions` describes the selected enabled user's scoped, enabled role/permission links. Neither proves tenant module activation, field/data-scope policies, authenticated request success or permission-change authorization. After correcting the identified configuration through the existing administration path, refresh login and verify the actual page and preview. The probe never performs the correction.

A reviewed ops branch can run this same read-only workflow with explicit expected API/Web runtime937 pins; no application redeploy or re-preparation of the already sealed source batch is required for diagnostic changes.

The effective count mirrors `UsersService.getActiveRoleLinks` and `getActivePermissionLinks`: role and permission `status` must both be `enabled`, and the role must be tenant-scoped or belong to the current park. Catalog presence and `is_enabled` alone are insufficient. Regression fixtures cover disabled status independently of the boolean flag and a tenant role assigned through a current-park link. A ready count still requires authenticated page verification.
