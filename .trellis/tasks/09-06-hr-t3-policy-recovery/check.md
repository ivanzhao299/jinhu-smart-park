# Verification

- Root recovery contract9/9 passed; combined T3 command20/20 including actual local PostgreSQL readonly literal casts passed.
- Existing phase artifact contract and16 policy-field/frozen-manifest tests passed.
- Private policy-only audit matched12/12 original raw row hashes,51fields each,144unique source child identities ->72unique normalized child identities;84/84 projected parent/child records representable.
- Independent reviewer found no defect; exact-shape, raw-hash-before-normalization, safe-errors, lineage and immutable-output checks passed. Focused ESLint on the new module/test:0errors/0warnings using installed tooling read-only, not workspace CI.
- No TypeScript/API/Web/schema changes; no local full build or page traversal. Dependency PR640 remains a separate CI gate. No production write, re-extraction or full A/B.
- Default projector/phase bytes unchanged in this slice. Final phase/candidate integration remains unfinished and must select normalized records explicitly; do not relabel old counts or manufacture skip approvals for aliases.
