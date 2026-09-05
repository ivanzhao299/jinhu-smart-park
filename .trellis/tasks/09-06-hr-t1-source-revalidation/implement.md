# Plan

1. One implementer owns T1 materializer, a focused new source verifier if needed, core state policy export and existing T2 T0-validator export. Root owns synthetic tests/docs/package entry. Do not modify others' work.
2. Add explicit revalidation/full-inventory paths, immutable provenance, independent state/type policy and actual usage. Preserve default API/output envelope. Fix bounded reads on touched path.
3. Root tests positive revalidation, stale defaults, altered state/type policy despite fresh hashes, actual usage drift, source/target/code/T0 mismatch, exact target reuse/conflict/duplicate/zero, original bytes, safety and CLI. Re-run T0/T1/T2 downstream suite and independent check.
4. Verify current real source with only count/hash output, then normal commit/PR/CI. Keep previous PR638 and ongoing deployment untouched; incorporate main without rewriting commits before PR.
5. Final production candidates require actual merged/runtime/current-target identity; no re-extraction or fake approvals. Full end goal remains active.
