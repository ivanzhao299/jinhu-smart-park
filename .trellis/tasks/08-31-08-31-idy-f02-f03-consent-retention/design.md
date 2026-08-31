# Design: IDY-F02/F03

## Data model

- `biz_party_consent_fact`: append-only scoped facts. `status` is `pending_evidence|granted|withdrawn|not_applicable`; `lawful_basis` is `consent|legal_obligation`; provenance is `operator_recorded|legacy_unknown`. Legacy backfill stores only observed status and provenance.
- `biz_party.current_consent_fact_id` remains the authoritative pointer; `consent_status` is an atomic compatibility projection maintained by service/DB guards.
- `biz_party_identity_retention_policy`: one current policy per tenant/park with four day/action pairs and `legal_review_status`.
- `biz_party_identity_retention_assignment`: category/object identity, due time, action, state and source. Historical rows start `pending_classification` rather than receiving invented due times.
- `biz_party_identity_legal_hold`: scoped hold placeholder with category/object, reason, start/release facts and actor.
- `biz_party_data_subject_request`: scoped request state machine for `erasure|restrict_processing`; outcome distinguishes `deleted|processing_restricted|rejected`.
- `biz_party.processing_restricted_at/reason/request_id` is the consumption gate. Restriction never mutates immutable snapshots, decisions or audit facts.

## Commands and read model

- Add Party consent action endpoints `POST /parties/:id/consent-facts` and `POST /parties/:id/consent-facts/:factId/withdraw`, exact permission, idempotency and required audit.
- Add identity governance endpoints for policy read/update, subject request create/detail/decide/complete, legal hold create/release and due-action execution. MVP UI may be embedded in Party detail/identity workbench; API and shared contracts are canonical.
- Check-in verifier joins `current_consent_fact_id` and requires operator-recorded, consent-basis, granted, unrevoked, matching purpose and unrestricted Party.
- Due action uses tenant/park advisory lock and request receipt. Active legal hold skips the assignment. `restrict_processing` is always supported; destructive actions fall back to restriction for immutable/referenced objects and record the actual outcome.

## Migration semantics

- Forward-only `000287_*`; no edit to prior migrations.
- Per Party, insert one legacy fact with `provenance='legacy_unknown'`, `status='pending_evidence'`, and `observed_legacy_status=consent_status`; all asserted provenance columns stay null.
- Existing identity objects get retention assignments with `source='legacy_unknown'`, `state='pending_classification'`, and null `retention_until`. A signed/configured tenant policy is required before classification.
- Constraints and triggers enforce scoped pointer consistency and append-only fact/history tables. New writes receive classified assignments through the service transaction.

## Security and exclusions

- Required audit contains IDs/status/category/counts only; no identity plaintext, ciphertext, hashes, reasons containing sensitive narrative, or keys.
- Retention/rights permissions do not imply sensitive reveal or file download.
- No HR schema/code; no accommodation-special statutory fields; no housing handover gate.
