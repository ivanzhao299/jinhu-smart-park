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
