# PR192 H0 UAT Environment Handoff Template

Status: unfilled template  
Passwords/tokens/secrets allowed in this file: no

## 1. Authority

- `handoff_id`: `<fill>`
- `created_at`: `<fill>`
- `uat_coordinator`: `<fill-human-owner>`
- `technical_handoff_ref`: `../handoff/2026-08-14-technical-closure-to-human-gate.md`
- `technical_candidate_sha`: `97669ed2df810c9bc1da0e1abeb271187a7b70a4`
- `kit_authoring_commit`: `<fill-with-final-merge-commit-containing-this-kit>`
- `kit_content_manifest_ref`: `<fill-with-hash-manifest-for-human-uat-kit-files>`
- `kit_content_manifest_hash`: `<sha256-of-kit-content-manifest>`
- `threshold_version`: `<fill>`
- `threshold_hash`: `<fill>`
- `task_card_version`: `<fill>`
- `task_card_hash`: `<fill>`
- `task_ui_reachability_matrix_ref`: `<fill>`
- `task_ui_reachability_matrix_hash`: `<fill>`
- `defect_tracker_snapshot_ref`: `<fill-before-H1>`
- `defect_tracker_snapshot_hash`: `<sha256-of-authoritative-defect-ledger-before-H1>`
- `open_p0_before_h1`: `must_be_0`
- `open_p1_before_h1`: `must_be_0`
- `high_risk_flag_h1_freeze_ref`: `<fill-with-machine-read-flag-state-before-H1>`
- `high_risk_flag_h1_freeze_hash`: `<sha256-of-H1-flag-state>`
- `all_high_risk_production_enforce_flags_off_before_h1`: `must_be_true`

## 2. Environment

- `environment_id`: `<fill>`
- `environment_url`: `<non-production-url-required>`
- `api_base`: `<non-production-api-base-required>`
- `build_sha`: `<40-char-git-sha>`
- `profile_checksum`: `<fill>`
- `business_clock`: `<fill>`
- `production_data_present`: `must_be_false`
- `production_data_isolation_evidence_ref`: `<fill-with-machine-scan-evidence>`
- `production_data_isolation_evidence_hash`: `<sha256-of-machine-scan-evidence>`
- `real_secrets_present`: `must_be_false`
- `real_secret_isolation_evidence_ref`: `<fill-with-config/secret-scope-scan-evidence>`
- `real_secret_isolation_evidence_hash`: `<sha256-of-config/secret-scope-scan-evidence>`
- `production_identity_present`: `must_be_false`
- `production_identity_isolation_evidence_ref`: `<fill-with-identity/account-scope-scan-evidence>`
- `production_identity_isolation_evidence_hash`: `<sha256-of-identity/account-scope-scan-evidence>`
- `uat_environment_isolation_verified`: `must_be_true`

## 3. Role Accounts

Do not store passwords, tokens, recovery codes, private phone numbers, or identity documents here.

The exact account aliases and scopes must live in a secret-safe account manifest. This H0 handoff stores only manifest references and checksums, not passwords or tokens. A naming pattern alone is not acceptable H0 evidence.

| Role | Exact account manifest ref | Account manifest sha256 | Tenant/park scope manifest ref | Permission bundle manifest ref | Credential channel ref | Recovery owner | Superuser/wildcard? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Park admin | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay front desk | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay cleaner | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay inspector | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Homestay finance | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing leasing specialist | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing approver | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing handover staff | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Housing billing staff | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Cashier | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Finance approver | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Purchase requester | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Purchase approver | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Payment staff | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Repair staff | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |
| Auditor | `<fill>` | `<fill>` | `<fill>` | `<fill>` | `<external-secret-channel-ref>` | `<fill>` | must be no |

## 4. Data And Cleanup

- `synthetic_data_prefix`: `<fill>`
- `seed_manifest_ref`: `<fill>`
- `reset_script_ref`: `<fill>`
- `cleanup_script_ref`: `<fill>`
- `reset_execution_ref`: `<fill-with-candidate/profile-bound-preflight-execution-evidence>`
- `reset_execution_hash`: `<sha256-of-reset-execution-evidence>`
- `reset_execution_successful`: `must_be_true`
- `cleanup_preflight_execution_ref`: `<fill-with-candidate/profile-bound-preflight-execution-evidence>`
- `cleanup_preflight_execution_hash`: `<sha256-of-cleanup-preflight-execution-evidence>`
- `cleanup_preflight_execution_successful`: `must_be_true`
- `residual_scan_ref`: `<fill>`
- `file_storage_scope`: `<fill>`
- `cleanup_residual_required`: `0`

## 5. Evidence And Privacy

- `consent_form_ref`: `<fill>`
- `observation_ledger_ref`: `observation-ledger.csv`
- `defect_tracker_ref`: `<fill>`
- `evidence_redaction_checklist_ref`: `<fill>`
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
- [ ] Machine evidence proves no production data, production identity, or real secrets are present; all three evidence hashes are recorded.
- [ ] Kit authoring commit or kit content manifest hash points to artifacts containing this exact H0 template and the referenced human-uat-kit files.
- [ ] Role accounts are exact, no superuser/wildcard.
- [ ] Exact account manifest, tenant/park scope manifest, permission bundle manifest, and their checksums are recorded.
- [ ] Credential distribution channel is external and secret-safe.
- [ ] Threshold freeze approved by human product/operations owner.
- [ ] Threshold freeze approved by required role owners.
- [ ] Task-card version frozen.
- [ ] Every frozen task card has UI reachability evidence from a discoverable role entry on desktop and required 390px-class mobile paths.
- [ ] Task reachability evidence covers every frozen task ID, including failure states, attachment states, and mobile-only/phone-designated paths where required.
- [ ] Authoritative defect tracker snapshot is attached, hashed, and shows `open_p0_before_h1=0` and `open_p1_before_h1=0`.
- [ ] Observation, consent, defect, signoff, reset, cleanup, and residual scan paths ready.
- [ ] Reset and cleanup preflight scripts have executed successfully against the exact UAT candidate/profile before H1.
- [ ] Machine-read high-risk flag evidence proves production-enforcement flags are off for the H1 environment and tenant/park scope.
- [ ] High-risk production enforce remains off until final readiness.

Until all boxes are checked by the external coordinator, H1 must not begin.
