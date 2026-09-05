# Production T0 source-semantic revalidation

## Goal and scope

Continue the existing enterprise HR migration goal by making current production T0 candidates consume unchanged, verified source-state semantics without repeating a full lab run merely to change a code SHA. This is candidate preparation, never an import authorization.

## Acceptance

- Preserve the original v2 machine decision bytes, its original C/M, and its byte-hash reference in the current T0 candidate.
- Default CLI behavior remains strict current C/S/M. An explicit source-manifest input enables semantic revalidation, not unconditional stale-artifact acceptance.
- Verify the current source manifest, current C/S/M inventory binding, exact T0 manifest/domain hashes, all three dictionary files, complete source state counts, and every source decision row hash.
- Independently re-evaluate the current deterministic state policy and reject any differing original decision, changed source bytes/counts, unknown values, different source snapshot, or malformed evidence. Never infer semantics only from a state code.
- No old production target, lab scope, checkpoint, approval or authorization is transferred. Current target scope/inventory checks and HOLD remain unchanged.
- Preserve T0 candidate envelope compatibility for T1/T2 consumers and reject drift before producing output. Add positive and negative synthetic tests plus real controlled-source hash-only verification.

## Implementation plan

1. Add an optional source-manifest CLI input and a source-semantic revalidation helper; reuse the existing state policy and job-state/source-manifest validators.
2. Retain the current strict path when the option is absent. In the explicit path, old code/mapping references remain historical provenance; current policy and source bytes must independently agree.
3. Extend the existing T0 regression entry so CI runs all new cases. Verify no writer, source database, or production mutation is reachable.
4. Record real-source aggregate evidence, run focused tests, then use the normal minimal PR/CI path. Do not rerun full extraction or A/B.
