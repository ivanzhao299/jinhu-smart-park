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
