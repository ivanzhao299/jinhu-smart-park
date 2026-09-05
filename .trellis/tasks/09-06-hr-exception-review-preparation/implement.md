# Execution
1. Inspect existing crypto context, fixture signing binding, freeze validator, private IO helpers and exact execution envelope consumer.
2. Add preparation/finalization library and private CLI, extracting only genuinely reusable validation/IO helpers where necessary.
3. Add focused synthetic roundtrip and negative/private-IO tests; wire into the existing freeze test command.
4. Document operator config and seven-section backend spec, including external authority limits.
5. Run focused and affected freeze/bridge/generator/crypto/entrypoint tests, syntax and diff checks. Attempt lint/typecheck once without unrelated dependency installation.
6. Independent review before one coherent PR. Do not rerun real candidates, full A/B or production operations in this implementation task.

Ownership: implement worker owns new scripts/hr-cutover/production-import-exception-preparation.mjs, materialize-production-import-exception-preparation.mjs, focused tests, related docs/spec and minimal shared validation extraction if necessary. Root owns task artifacts, review, integration and publication. No other worktrees touched.
