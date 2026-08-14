# PR192 H0 UAT Environment Handoff Template

Status: unfilled template  
Passwords/tokens/secrets allowed in this file: no

## 1. Authority

- `handoff_id`: `<fill>`
- `created_at`: `<fill>`
- `uat_coordinator`: `<fill-human-owner>`
- `technical_handoff_ref`: `../handoff/2026-08-14-technical-closure-to-human-gate.md`
- `technical_candidate_sha`: `5987b14526443ee638aa27134485b12b681ef5b8`
- `threshold_version`: `<fill>`
- `task_card_version`: `<fill>`

## 2. Environment

- `environment_id`: `<fill>`
- `environment_url`: `<non-production-url-required>`
- `api_base`: `<non-production-api-base-required>`
- `build_sha`: `<40-char-git-sha>`
- `profile_checksum`: `<fill>`
- `business_clock`: `<fill>`
- `production_data_present`: `must_be_false`
- `real_secrets_present`: `must_be_false`
- `production_identity_present`: `must_be_false`

## 3. Role Accounts

Do not store passwords, tokens, recovery codes, private phone numbers, or identity documents here.

| Role | Account alias pattern | Credential channel ref | Recovery owner | Superuser/wildcard? |
| --- | --- | --- | --- | --- |
| Park admin | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay front desk | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay cleaner | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay inspector | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay finance | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing leasing specialist | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing approver | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing handover staff | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing billing staff | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Cashier | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Finance approver | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Purchase requester | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Purchase approver | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Payment staff | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Repair staff | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Auditor | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |

## 4. Data And Cleanup

- `synthetic_data_prefix`: `<fill>`
- `seed_manifest_ref`: `<fill>`
- `reset_script_ref`: `<fill>`
- `cleanup_script_ref`: `<fill>`
- `residual_scan_ref`: `<fill>`
- `file_storage_scope`: `<fill>`
- `cleanup_residual_required`: `0`

## 5. Evidence And Privacy

- `consent_form_ref`: `<fill>`
- `observation_ledger_ref`: `observation-ledger.csv`
- `defect_tracker_ref`: `<fill>`
- `screenshot_policy`: consent required, redact sensitive fields
- `recording_policy`: consent required, redact sensitive fields
- `retention_policy_ref`: `<fill>`

## 6. Incident Contacts

| Severity | Contact role | Response rule |
| --- | --- | --- |
| P0 | `<fill>` | stop affected cohort immediately |
| P1 | `<fill>` | stop affected workflow/cohort until triage |
| P2/P3 | `<fill>` | record and continue unless owner escalates |

## 7. H0 Checklist

- [ ] Technical handoff SHA and PR evidence verified.
- [ ] Non-production UAT environment verified.
- [ ] No production data, production identity, or real secrets present.
- [ ] Role accounts are exact, no superuser/wildcard.
- [ ] Credential distribution channel is external and secret-safe.
- [ ] Threshold freeze approved by human product/operations owner.
- [ ] Task-card version frozen.
- [ ] Observation, consent, defect, signoff, reset, cleanup, and residual scan paths ready.
- [ ] High-risk production enforce remains off until final readiness.

Until all boxes are checked by the external coordinator, H1 must not begin.
