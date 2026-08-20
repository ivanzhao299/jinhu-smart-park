# PR192 Human UAT Kit

Status: template package only  
Bound technical handoff: `../handoff/2026-08-14-technical-closure-to-human-gate.md`  
Bound deployed candidate: `619b8d20e891c74f69abcc9c908666034c37c648` (PR #331 merge on `main`; CI `32340203702` and Deploy Production `32340203683` succeeded).
Kit provenance: PR #290 merge commit `1f0dcafb95fbde57a1a8c7f6349393ca0b880691`.
H0 still requires an external coordinator to accept and freeze the same `619b8d20e891c74f69abcc9c908666034c37c648` candidate before human observations start.
Human readiness status: `awaiting_human_gate`  
Production readiness status: `awaiting_human_gate`

This kit prepares the external PR192 human UAT lane. It does not contain real participant data, credentials, named approvals, or production go/no-go decisions.

## Files

| File | Purpose |
| --- | --- |
| `task-cards.md` | Human-facing task-card templates. Cards describe business goals and start points, but intentionally do not provide step-by-step answers. |
| `observation-ledger.csv` | Append-only observation ledger header for real participant runs. |
| `ledger-hash-contract.md` | Canonical row-hash and chain algorithm for observation/signoff ledgers. |
| `scope-coverage-matrix.md` | PR192-to-current homestay/housing scope coverage matrix. Every covered row must bind to technical evidence, UAT task cards, readiness gates, or a named follow-up/out-of-scope decision before production readiness can be claimed. |
| `content-manifest.sha256` | SHA-256 manifest for this template package, excluding the manifest file itself. The task metadata records the manifest file hash. |
| `threshold-freeze.template.json` | Product/operations threshold freeze template. Must be approved before human observations can be evaluated. |
| `signoff-ledger.csv` | Append-only named signoff ledger header for H4. |
| `uat-environment-handoff.template.md` | H0 environment/account/privacy/reset handoff template. Must not store passwords or tokens. |
| `readiness-evaluator-input.template.json` | Final AND-gate input template. Missing human evidence keeps `production_ready=false`. |

## Ground Rules

- Use only isolated UAT data and role-scoped UAT accounts.
- Do not store passwords, tokens, real identity numbers, private contact details, or raw production secrets in this directory.
- Each role needs at least five real representatives, and each representative must complete four standard tasks.
- The task-card catalog freezes four distinct task IDs for every required role; missing task IDs make the cohort insufficient.
- Every task must start from a discoverable role entry in the product navigation, dashboard, queue, or list. Coordinator-provided hidden deep links are not valid starts.
- Record first-time and repeat-use attempts separately.
- Account evidence must reference a secret-safe exact account manifest with tenant, park, permission-bundle, and data-scope checksums; naming patterns alone are not H0 evidence.
- Thresholds, task cards, cohorts, signoffs, and final readiness inputs must be bound by immutable hashes or signatures.
- Observation and signoff ledgers must be append-only, with row hashes or an equivalent immutable ledger reference.
- Browser automation, CI, Codex Review, and production smoke are not human UAT samples.
- Missing, expired, or conditional signoff is not approval.
- P0/P1 stopship cannot be waived by deleting samples or lowering thresholds after execution.

## Current Next Step

An external UAT coordinator must copy these templates into a controlled evidence location, fill H0 environment details, freeze thresholds with product/operations and required role owners, publish the secret-safe exact account manifest, verify task UI reachability from discoverable role entries, distribute role-scoped credentials through the approved secret channel, and only then start real participant observations.
