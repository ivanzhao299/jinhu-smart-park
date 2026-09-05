# Implementation

1. Review current transformer, T2 projector and all consumers/tests; identify evidence hashes pinned to changed files.
2. Extract shared pure derivation; add authenticated legacy semantic view and strict complete/partial handling without rewriting source.
3. Add synthetic legacy/materializer regressions, malformed metadata and source-hash negatives; run existing T2 field, semantic, candidate, materializer and phase contracts.
4. Independent review. Root separately runs bounded read-only actual-source projection on the existing 802 rows and reports counts/reasons only; do not forge current production approval.
5. Document compatibility contract and actual validation; commit scoped changes and use one PR/CI path. No new target inventory until a required release is truly current.
