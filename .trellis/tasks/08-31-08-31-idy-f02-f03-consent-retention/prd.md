# IDY-F02/F03 同意证据链与留存主体权利基础

## Goal

Issue #511；consent fact、历史来源未知待补证、分层 retention、主体删除/限制处理、legal hold 占位；forward-only/逐租户语义；住宿业专项排除。

## Requirements

- Replace direct mutation of `consent_status` with append-only consent facts carrying notice-text version, purpose, lawful basis, status, effective/revoked time, channel, operator and evidence provenance.
- Preserve `biz_party.consent_status` only as a compatibility projection. Existing values become `legacy_unknown` / `pending_evidence`; no timestamp, actor, channel, notice version or consent event may be invented.
- Separate `consent` from `legal_obligation`. Only an evidenced, current, unrevoked consent fact for the accommodation check-in purpose satisfies the existing check-in `granted` gate.
- Add tenant/park-scoped retention policy for submission, immutable snapshot, identity photo and protected audit categories. Defaults are configurable placeholders and must be labelled as requiring legal approval.
- Add retention assignments/state and an idempotent due-action command. Active legal hold blocks destructive action. Immutable or referenced evidence must transition to processing restriction instead of being deleted.
- Add a tenant/park-scoped data-subject request entry for erasure and restriction, with request/decision/completion facts, reason, actor, idempotency and required audit. Unsupported physical deletion must complete as `processing_restricted`, never as fabricated deletion.
- Keep identity snapshot/decision/audit immutability, tenant isolation, protected-file authorization, and homestay check-in atomic rollback semantics.
- Exclude accommodation-special P0-02/03/04 fields and flows. Do not add the housing move-in gate in this PR.
- Use a forward-only migration and document per-tenant legacy/backfill semantics.

## Acceptance Criteria

- [ ] Existing Party rows receive exactly one `legacy_unknown` fact reflecting only the observed enum; no fabricated provenance fields are populated.
- [ ] New grant/withdraw actions require purpose, lawful basis, channel, operator and idempotency; consent-based grant also requires notice version and effective time.
- [ ] Party generic create/update can no longer assert `granted` without a fact action; responses expose safe current-fact metadata but no protected plaintext.
- [ ] Homestay check-in rejects legacy-unknown, withdrawn, wrong-purpose or stale consent facts and still rolls back the whole check-in.
- [ ] Four retention categories have configurable placeholder defaults, per-tenant policy and explicit expiry actions; docs state legal sign-off is required.
- [ ] Due action is scoped, locked/idempotent, legal-hold aware and audited; immutable/referenced data becomes restricted rather than being physically removed.
- [ ] Data-subject erasure/restriction requests have fail-closed permissions, state transitions, required audit and replay/conflict semantics.
- [ ] Migration apply/replay, unit, schema, permission, homestay regression, lint, typecheck and build gates pass.
- [ ] No HR files, accommodation-special fields, housing move-in gate, secrets or production direct operations are included.

## Notes

- Operational placeholder defaults: submission 730 days, snapshot 1825 days, identity photo 730 days, protected audit 1825 days. They are configuration defaults, not legal conclusions.
- Issue: #511. Parent queue: #509.
