# Validation evidence

## Actual source, development-only

The main agent ran the pure candidate assembler with authenticated existing T2 stage files, existing source/target evidence and revalidated dictionaries. This was not a materializer HEAD override, a new production candidate artifact, an approval or a database write.

- Published baseline ee7a730c: 1163 total, 4 insert, 1159 quarantine.
- Initial derivation fix: semantic-field failure disappeared; all 802 contracts then reached the incompatible legacy flag check.
- Exact bounded source encoding audit: each of the three agreement flags uses Chinese no on all 802 contracts.
- Final semantic/flag recovery development audit: 1163 total, 1155 insert, 8 quarantine (T2_CONTRACT_MISSING only).
- 802 contracts and 349 parent-linked renewal changes no longer falsely quarantined. Four contract types remain insert candidates.
- Source file hashes verified and input records unchanged before/after assembly; 5169411 bytes read.
- No full extraction, T3 recomputation, A/B, SQL write, source mutation or output candidate overwrite performed by this fix.

## Implementation checks

- T2 artifact entry: phase contract passes; 60 passed, 1 optional PostgreSQL test skipped.
- Existing transformer semantic contract, T2 source contract, full-domain contract (14 negatives), and core driver contract (7 tests) pass.
- Node syntax and git diff whitespace checks pass.
- Workspace lint/typecheck attempted but unavailable without this worktree's dependencies; no dependency symlinks or install performed. Standalone ESLint baseline comparison has zero added findings and is not CI-equivalent evidence.
- Independent full-diff review found no remaining code defects and made no fixes. It independently reran the T2 phase/suite (60 pass / 1 optional PG skip), semantic CLI and full-domain contracts (14 negatives), eight MJS syntax checks and standalone ESLint baseline delta (zero added findings). Formal workspace CI remains required after submission.

## Limits

Production remains HOLD. Existing ee7 source/target artifacts retain their original identities and are not relabeled as the new code. Actual database write/readback, production authorization binding, API/UI parity and full HR acceptance are not proved by this development audit. The historical isolated SQL loader has different boolean/signature semantics; it remains outside this production projection task and must not substitute for the production payload writer.
