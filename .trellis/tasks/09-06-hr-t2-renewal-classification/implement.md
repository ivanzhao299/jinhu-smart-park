# Implementation

1. One trellis-implement agent owns the new producer; root owns tests and documentation. Agent does not delegate. Base is PR637 candidate890e386c; do not merge until PR637 is merged and candidate incorporates main safely.
2. Add source-evidenced pure classifier and exact bounded config CLI; confirm interface. Do not change existing schemas or source files.
3. Synthetic tests: matched renewal, missing/ambiguous/ownership review, zero, duplicate source keys, bad row/hash, stale binding, changed evidence, deterministic ordering and immutability; file safety and no overwrite. Integrate into existing T2 test entry.
4. Re-run T2 contracts. Real-source invocation emits counts only and verifies 357 conserved; compare to prior audit349matched/8missing, never hard-code counts as acceptance. Review implementation and preserve HOLD.
5. Commit only this task's files and use normal PR/CI after PR637; no production writes and no fake signature.
