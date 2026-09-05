# Execution

1. Verify producer envelopes and existing bridge/target validators; implement pure adapter with focused integration and negative tests.
2. Add private-file CLI and synthetic IO tests, safe failure and no mutation/DB access.
3. Wire tests into existing relevant package command; add focused docs/spec.
4. Run new tests, existing bridge/generator tests, node syntax and git diff checks; attempt lint/typecheck once without installing dependencies.
5. Independent full-scope review then one coherent commit/PR; protect current release and all source artifacts.

Actual-input follow-up: validate/preserve optional T2 resolutionEvidence emitted by the private materializer, with an actual synthetic materializer-to-adapter regression. Do not broaden all envelope keys or claim the prior pure-assembler tests established this path.

Also accept the existing raw two-field target scope through canonical normalization while retaining raw byte provenance. Remove the unnecessary whole-input binary copy, reject shared backing memory, and retain strict UTF-8/hash validation. Same immutable real-input HOLD interface now passes under the unchanged 2 GiB supervisor; final metrics and remaining production limits are recorded in validation.md.

Implementation ownership: new scripts/hr-cutover/production-import-candidate-freeze.mjs, materialize-production-import-frozen-decisions.mjs, corresponding scripts/e2e tests, package test command, focused docs/spec. No writer/activation/workflow changes.
