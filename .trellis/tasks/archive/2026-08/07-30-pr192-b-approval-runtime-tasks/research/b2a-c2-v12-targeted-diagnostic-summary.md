# B2a/C2 v12 targeted diagnostic summary

> Date: 2026-08-01
>
> Classification: `TARGETED DIAGNOSTIC / NOT CANDIDATE / NOT C2 SIGNOFF`

## Scope boundary

The targeted sequence validated the migration chain, catalog/contract checks exercised by targeted mode, corrected multi-scope fixture, receipt concurrency gate, and exact cleanup behavior. Targeted mode intentionally skipped signed action measurements, the two-million-row performance gate, and watchdog injection. It could not write a candidate artifact and did not materialize raw candidate sidecars, watchdog evidence, or a detached manifest.

There is therefore no targeted raw artifact SHA, raw artifact byte length, or candidate evidence path to report. None is inferred or fabricated in this summary.

## Run sequence

| Run ID | Result | First failure or disposition |
|---|---|---|
| `b2ac2_v12_targeted_20260801a` | failed | `000189`, SQLSTATE `23514`, `property-permission-parent-preflight-failed`; exposed the missing second-tenant permission baseline. |
| `b2ac2_v12_targeted_20260801b` | failed | `000189`, SQLSTATE `23514`, `property-bundle-permission-resolution-failed`; proved the fixture needed the complete permission subtree rather than one copied root. |
| `b2ac2_v12_targeted_20260801c` | failed | receipt-acquire outcome timeout with retained polls at zero; root cause was detached workers nesting a data-modifying CTE instead of executing it at statement top level. |
| `b2ac2_v12_targeted_20260801d` | passed | Exit code 0 against PostgreSQL 16.14; migration chain, history, reservation, targeted gates, and cleanup completed with `candidate_findings=[]`. |

The first three runs are diagnostic failures, not discarded candidate attempts. Their corrections are documented in the adjacent parent-preflight and receipt-race root-cause notes.

## Passing targeted identity

- Run ID: `b2ac2_v12_targeted_20260801d`
- PostgreSQL: `16.14`
- `000194` raw SHA-256: `93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0`
- Runner raw SHA-256 used by the passing run: `e872858f9724d6be3655697e986e652d3594c67ca820e737b42b685b6ea29ce6`
- Static contract SHA-256 used before the passing run: `24be1fb54f80795165b73974e11f2bfe617a3ee63f0e809d1066837c86a8e1ed`
- Candidate findings reported by targeted stdout: none
- Cleanup: exact container absent, anonymous volume absent, temporary targets absent

The later history-reservation negative-gate update changes the prepared full-run runner/static hashes to those listed in the v12 candidate template. It has passed syntax/static validation only and was not part of targeted run `d`.

## Explicitly skipped in targeted mode

- Eight signed action families and their 160 measured attempts
- Two-million-row performance fixture and thresholds
- Outer watchdog injection and watchdog artifact
- Five full-run sidecars
- Detached full-run manifest and hash-chain materialization
- Independent architecture/database, test/security, and product/RBAC review

## Disposition

Targeted `d` is sufficient to close the diagnostic loop but insufficient to claim candidate PASS or C2 acceptance. The next authorized operation is a new full v12 run using the absent, exclusive artifact path recorded in the v12 candidate template. Review remains pending after that run until independent reviewers sign the actual raw evidence.
