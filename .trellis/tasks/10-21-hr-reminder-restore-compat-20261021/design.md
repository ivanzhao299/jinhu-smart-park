# Narrow schema normalization

Reuse normalizeRestoreSchema and its frozen-source schema hashing. Keep the original four mandatory reviewed checks. Add exact named optional mappings for reminder kind, policy, status, action and recipient array constraints; optional means absent in pre382 schemas, never malformed or duplicated when present. Canonicalize only the observed PostgreSQL16 forms; no general parenthesis, casts, operators or whitespace stripping.

The independent content verifier, recovery catalog, source/target physical binding, locks, role flags, immutable function ACL manifest and atomic marker replacement remain unchanged. Preserve schema-only raw files and diff in private artifacts. No database migration is needed. This operations-only fix does not require rebuilding production business services; publication/release scope follows existing workflow.
