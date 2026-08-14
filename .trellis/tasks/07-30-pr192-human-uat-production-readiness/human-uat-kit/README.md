# PR192 Human UAT Kit

Status: template package only  
Bound technical handoff: `../handoff/2026-08-14-technical-closure-to-human-gate.md`  
Bound technical candidate: `97669ed2df810c9bc1da0e1abeb271187a7b70a4`
Kit provenance: fill with the final merge commit that contains this exact kit before H0 approval.
Human readiness status: `awaiting_human_gate`  
Production readiness status: `awaiting_human_gate`

This kit prepares the external PR192 human UAT lane. It does not contain real participant data, credentials, named approvals, or production go/no-go decisions.

## Files

| File | Purpose |
| --- | --- |
| `task-cards.md` | Human-facing task-card templates. Cards describe business goals and start points, but intentionally do not provide step-by-step answers. |
| `observation-ledger.csv` | Append-only observation ledger header for real participant runs. |
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
