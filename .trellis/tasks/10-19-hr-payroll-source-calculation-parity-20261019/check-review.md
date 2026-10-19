# Independent check review

Workspace: `/Users/mac/.codex/worktrees/hr-team-approval-entry-20261018/jinhu-smart-park`.
Branch: `codex/hr-payroll-source-calculation-parity-20261019`.
Reviewed base: `9a3e739c065d733c906112274b3281a8af738a35` (HEAD and origin/main, ahead/behind 0/0 at review entry; root owns fresh remote/release gates).
Application source/tests were handed off exclusively to this reviewer; root retained task/spec/private diagnostic/browser/release ownership. No other writer's files were reverted.

## Findings (fixed)

1. File: `apps/web/app/hr/payroll/PayrollRuleSourcePreparation.tsx`.
   Issue: the new unconditional `setError("")` on a choice edit also erased failed/denied/drifting source-read errors, enabling stale source application after an unrelated local edit.
   Fix: separate local `bindingError` from authoritative source errors. Manual/CSV choice changes clear only binding errors; successful source reload resets both through the existing load path. Failed binding still preserves selections and the parent draft and permits correction/retry. The source-preparation regression now edits a role after a failed reread and proves error, disabled confirmation and disabled apply remain.
2. File: `apps/web/app/hr/payroll/payroll-source-formula-binding.ts`.
   Issue: trimming catalog aliases allowed a reference to bind to a different literal source identity, contrary to the exact code/legacyName/displayName contract.
   Fix: preserve catalog alias bytes and trim only bracket reference whitespace, matching the parser. Pure tests cover exact code/name/display aliases, whitespace, case/partial-name rejection, unselected names, disabled/nondecimal versions, duplicate codes and cross-alias ambiguity, source immutability and explicit HR-reference preservation without inventing an alias.
3. Files: `apps/api/src/modules/hr/hr-payroll-formal-calculation.spec.ts`, `apps/web/test/interaction/payroll-source-formula-binding.test.tsx`, `apps/web/test/interaction/hr-payroll-run-operations.test.tsx`, `apps/web/test/interaction/hr-payroll-source-preparation.test.tsx`.
   Issue: required acceptance edges were not all protected by executable regression tests: zero-valued v2, signed per-line rounding, overflow, unchanged serialized v1 evidence/result, pure binder behavior and optional signed result presentation.
   Fix: added focused regressions. V1 SHA-256 expectations were captured by executing the unchanged pre-task kernel from base commit `9a3e739c065d733c906112274b3281a8af738a35`, not inferred from the new implementation. Pure binder tests use `.test.tsx` so the existing Vitest/CI include discovers them. Run UI tests cover zero and negative reductions separately from deductions and absence of the new field/label for v1.

## Findings (not fixed)

No remaining blocking source finding in this task's implementation. Production release and business acceptance remain separate root-owned gates. Web build warnings in unrelated existing CSS/canteen files are recorded below; no unrelated formatting or dependency change was made.

## Cross-layer review

- Shared role reaches nested DTO validation, formal definition validation, input coverage, evidence generation and effective-rule recomputation. The existing service checks interpretation with `isDeepStrictEqual` before authoritative use; no global v1-to-v2 reinterpretation is introduced.
- Kernel uses signed exact units and existing half-up monetary-line rounding. Gross equals earnings less pre-gross reductions; gross equals post-gross deductions plus tax plus net. Missing input stays missing; explicit zero selects v2 when the definition contains the role. Direct replacements for computed projects, invalid dependency/order and overflow remain rejected.
- `hr_payslip_item.item_type` is unconstrained varchar(32), and signed `amount` is numeric(18,2). The separate compensation-plan item enum is not used by formal-run item insertion. No migration is needed or changed. Original 000243 balance checks and 000349 evidence/item freeze guards remain intact.
- Run totals add only post-gross deductions and personal tax to legacy `deduction_total`. Signed `grossReductionAmount` is frozen independently and projected through create/detail/shared contracts only for v2. Review/confirm retain independent actor/version checks, immutable action/evidence guards and same-transaction required audits.
- Source reference API scopes the book and returns complete versions; parent checks rule/book/token/context. Binder consumes only explicitly selected enabled decimal versions, preserves original reference/formula data and operation order, and never selects another book/version or guesses HR aliases. Direct/rewrite choices retain their existing behavior; the one-shot guard is set after successful full definition construction.
- All formal-role rendering sites (source choices, editor, CSV and governed run details) include 应发扣减. `PayrollStatementActions` consumes only historical snapshot rows/items without a formal-role enum; legacy run/self payslip projections expose aggregate gross/deduction/tax/net without role rows. Those unchanged projections already receive the correct persisted amounts and do not mislabel a new role or double-subtract it. No invented statement consumer or broader payroll UI rewrite was added.
- Root clarified the old formal-rules spec's gross equation as v1 and recorded the exact-alias/source-error invariants in its owned gross-reduction spec.

## Verification

All commands ran in the reviewed worktree. API and Web `node_modules/@jinhu/shared` realpaths resolve to this worktree's `packages/shared`.

- Lint: PASS — `pnpm --filter @jinhu/shared lint`, `pnpm --filter @jinhu/api lint`, `pnpm --filter @jinhu/web lint`.
- Changed Web test lint: PASS — `pnpm --filter @jinhu/web exec eslint test/interaction/payroll-source-formula-binding.test.tsx test/interaction/hr-payroll-source-preparation.test.tsx test/interaction/hr-payroll-run-operations.test.tsx`.
- TypeCheck: PASS — `pnpm --filter @jinhu/shared typecheck`, `pnpm --filter @jinhu/api typecheck`, `pnpm --filter @jinhu/web typecheck`.
- Shared build: PASS — `pnpm --filter @jinhu/shared build` (fresh producer before consumer checks).
- API build: PASS — `pnpm --filter @jinhu/api build`.
- Web build: PASS — `pnpm --filter @jinhu/web build`, exec session 36785 completed with exit 0; 210/210 static pages generated. Existing warnings: four unrelated CSS files use `end` rather than `flex-end`, associated webpack warning-cache serialization, Next ESLint plugin detection, and one unused `no-console` disable in `lib/canteen-peripherals.ts`. No build/type/lint error.
- API tests: PASS, 29/29 — `TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --test-concurrency=1 --require ts-node/register src/modules/hr/hr-payroll-formal-calculation.spec.ts src/modules/hr/hr-payroll-formal-rule.spec.ts src/modules/hr/hr-payroll-formal-input.spec.ts src/modules/hr/hr-payroll-formal-run.spec.ts src/modules/hr/hr-payroll-formal-source-calculation.spec.ts`. Includes 11 kernel tests.
- Web interactions: PASS, 54/54 — `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-payroll-source-preparation.test.tsx test/interaction/hr-payroll-rule-choice-workspace.test.tsx test/interaction/payroll-source-formula-binding.test.ts test/interaction/hr-payroll-run-operations.test.tsx --pool=threads --maxWorkers=1` (12 source + 31 CSV workspace + 11 run operations). The initially supplied pure `.test.ts` path did not match the existing Vitest include; it was renamed `.test.tsx` and verified by the next explicit command.
- Pure binder: PASS, 4/4 — `pnpm --filter @jinhu/web exec vitest run test/interaction/payroll-source-formula-binding.test.tsx --pool=threads --maxWorkers=1`.
- HR contracts: PASS, 261/261 — `pnpm --filter @jinhu/web test:unit:hr`, rerun after reviewer changes.
- Transport: PASS, 11/11 — `TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' pnpm --filter @jinhu/web exec node --test --require ts-node/register lib/hr-payroll-formal-api.spec.ts`.
- Whitespace: PASS — `git diff --check`.

Reused evidence and reasons:

- Actual PostgreSQL: PASS, 1/1, from `implementation-report.md`. The reviewed kernel/run service/shared/migrations and final PG test were unchanged by reviewer fixes. Existing actual v2 approved-rule → confirmed-input → create/read → independent review/confirm evidence includes signed +10/-20 aggregate -10, tax-only ledger bridge, frozen-item/evidence rejection and required audit rollback. Repeating unchanged PG adds no distinct acceptance evidence. Implementer reports its owned `--rm` container stopped/removed; reviewer started no PG resources.
- Root private93: after reviewer binder freeze, root reran with the final binder SHA; 93/93 gross and net remained exact under explicitly UNAPPROVED SQL-NULL-zero diagnostic assumptions, with post-run source hashes unchanged. Reviewer did not open source payslips or private financial rows.
- Root CUA: original actual RuleMaintenance → SourcePreparation → parent editor and v2/negative/v1 result checks remain valid except the changed source preparation. Root rebuilt its actual component fixture and retested source reread failure → role edit → retained error and disabled confirmation/apply, plus CSV helper wording. The recorded desktop/390px visual evidence remains local synthetic UI evidence; iframe exact numeric overflow measurements were unavailable. Root owns `browser-evidence.json` under its private task artifacts.

Final source hashes:

- Kernel: `9e4d038228233bda103942c6b181f010f03dacb74fbbbb28008cd0468e55c8a8`.
- Binder: `26c6b1cfb2b40a3530d5be8a66856d3444d62849d7f17e1db18883ed8fd39ec0`.
- Shared contract: `3df647cf5bfce5be6b1adbfd18faf9ba9bc7b86026b52b84bf54ae6e19ca071c`.
- Source preparation: `982a480a07307f43e2cef11f5ce15a64c583e71ea3590645bbb69f15cff0f815`.

## Remaining gates and limits

No commit, push, merge, deployment, production input/rule approval, payroll calculation/payment, migration or historical import was executed by this reviewer. Fresh CI and Release Smoke, full deployment, Docker cleanup and runtime-SHA/July read-only evidence belong to root's release sequence. Once v2 approved rules exist, older runtime rollback must retain a compatible reader and never rewrite frozen records. Actual July roles, SQL NULL input treatment, confirmed inputs, formal trial and Wu Enguo signoff remain pending business work; this review does not approve payroll or complete the full HR goal.
