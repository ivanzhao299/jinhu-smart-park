# Execution

1. Verify producer envelopes and existing bridge/target validators; implement pure adapter with focused integration and negative tests.
2. Add private-file CLI and synthetic IO tests, safe failure and no mutation/DB access.
3. Wire tests into existing relevant package command; add focused docs/spec.
4. Run new tests, existing bridge/generator tests, node syntax and git diff checks; attempt lint/typecheck once without installing dependencies.
5. Independent full-scope review then one coherent commit/PR; protect current release and all source artifacts.

Implementation ownership: new scripts/hr-cutover/production-import-candidate-freeze.mjs, materialize-production-import-frozen-decisions.mjs, corresponding scripts/e2e tests, package test command, focused docs/spec. No writer/activation/workflow changes.
