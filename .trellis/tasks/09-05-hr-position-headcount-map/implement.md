# Sequence

1. Preserve field with explicit int4/null validation and quarantine.
2. Update staffing gap verifier only for this newly implemented candidate field; retain all runtime/report gaps.
3. Refresh reviewed stale references and downstream contract hashes; run affected tests and independent review.
4. Commit locally; do not retry blocked publishing without workflow authorization evidence.
