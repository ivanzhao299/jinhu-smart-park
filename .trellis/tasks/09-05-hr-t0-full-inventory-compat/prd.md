# Consume the current production inventory in T0 mapping preparation

The current read-only production diagnostic emits a C/S/M-bound 16-table T0-T3 inventory.
The T0 decision-candidate tool only accepts the historical three-table format. Accept the full
format without stripping its provenance or bypassing validation, preserving old three-table callers.

Acceptance: exact schema/counts/record identities for all 16 tables, exact expected C/S/M,
valid source-manifest hash, T0-only projected lookup, original full artifact hash retained;
reject tampered non-T0 rows/counts and stale source/code/mapping. No production write, row extraction,
scope inference, collision auto-approval, or new compatibility credit.
