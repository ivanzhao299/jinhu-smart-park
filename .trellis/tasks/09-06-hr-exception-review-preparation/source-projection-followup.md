# Source-backed quarantine payload follow-up

The user-authorized active goal continues after PR644. Its prepare/finalize command accepts explicit partial fields but does not derive them. Current 3a649c93 candidates contain 47 quarantines: one T1 state, eight T2 missing contracts, and 38 T3 records. The original sources remain retained. Do not regenerate all candidates during this implementation.

## Reviewed implementation scope

Add a source-owner API for the 38 T3 cases, not a second production planner. Missing year/month causes five insurance parents and thirty children to lose all projected target fields; three unknown attendance rules also lose their known symbol. Preserve nonempty representable facts without guessing the missing period, inventing a symbol meaning, changing disposition/reason, or claiming complete archival. Keep default projector and candidate output byte semantics unchanged.

Reuse the existing exact decimal, integer, text, provenance and partial target-model normalizers. Shared fact-building code should serve full and quarantine projections. Narrow support to proven missing-calendar and unknown-symbol cases; reject other semantic problems rather than silently dropping fields. Preserve original provenance and dependency refs. Include explicit omitted-field/reason metadata separate from targetFields; no approval, DB, file IO, key handling or signing in the pure API.

## Acceptance and review plan

- Synthetic missing-year, missing-month and both-missing cases retain five exact monetary fields and nullable/zero/negative-base facts on children, with no fabricated period values.
- Unknown symbols retain exact normalized source symbol, never an inferred normalized kind or enabled state.
- Default projector output remains identical; supported quarantine output is detached and immutable with respect to input, normalizes through existing partial-field consumer, and retains exact original identity/reason/dependencies.
- Unsupported numeric/calendar/type/precision errors, corrupted identity, duplicate children and contradictory negative bases fail closed.
- Test all new APIs and affected existing T3 projection/candidate/recovery suites. Keep optional DB tests optional; do not install or borrow workspace dependencies.
- Root independently reviews the implementation, then integrates the remaining T1/T2 choice paths and bounded real-source materialization separately. No new production release or complete-source run solely for this helper.

Ownership: existing implement worker owns production-t3-field-projection.mjs, its focused contract tests and projection docs/spec only. Root owns this follow-up, integration, private inputs and all Git/publication actions. Prior code and private preparations remain preserved.

## Root verification completed

- The current main CI for 3a649c93 completed successfully; this is baseline evidence, not CI for this follow-up.
- Independent T3 package test: phase-artifact contract passed; 64 node tests passed, 1 optional PostgreSQL literal-cast test skipped. Existing exception prepare/finalize integration: 14/14 passed. Syntax and diff checks passed.
- `pnpm lint` and `pnpm typecheck` were attempted; this worktree lacks eslint/tsc/node_modules. No dependencies were installed or borrowed. Candidate-wide CI is still required.
- Exact-source read-only audit authenticated the source manifest, T3 stage and file hashes: five insurance parents have both year and month literally null, with thirty children; no empty-string calendar cases.
- New helper bytes SHA256: 12b39c1f3c5ce5004515e226b499a7b3e68827be754de580d6131e59b8e2434b. Against authenticated existing 3a T3 candidate bytes, the development probe produced exactly 38 nonempty partial projections, matching all identities, row hashes, reasons and dependency refs. It retained 283 target fields including 150 decimal fields. Read 327071353 bytes; peak RSS1469644800 bytes; zero file or business writes. This is explicitly development evidence, not production execution or external approval.
- Existing T2 projector produced eight nonempty source-field fragments (8228 bytes) with missing contract reason and no invented parent; existing T1 timestamp/partial normalizer produced one nonempty fragment (1469 bytes), preserving the non-effective source state without asserting effective status. Private artifacts are not complete signed choice sets or raw-source archives.
- No source extraction, full candidate regeneration, A/B, database connection, production key lookup, encryption, signing or activation occurred in this follow-up. Source-backed fragments must still be composed with exact final C/S/M and reviewed through the existing preparation chain. Full HR parity and production import remain incomplete.
