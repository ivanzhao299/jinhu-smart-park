# Formal position maintenance

## Scope and API

All positions, regardless of origin, use HR_POSITION_MANAGE and ordinary organization data scope. GET /hr/positions/:id/maintenance returns 15 business fields, version, scoped organization and parent choices; source IDs and employee account choices are omitted. PATCH /hr/positions/:id requires expectedVersion and a non-empty reason; omissions preserve fields and explicit null clears only nullable fields. Role and tenant/park checks precede target reads. Missing or hidden targets return404.

## Transaction and concurrency

Updates take lockOrgHierarchy and FOR UPDATE, validate current dependencies, CAS version, and record required before/after audit in the same transaction. No metadata update changes employee assignments. Referenced positions cannot change organization; a position with non-departed assignments cannot be disabled. Child hierarchy guards remain enabled. Return409 for stale versions, duplicate codes and assignment continuity conflicts.

Migration000352 adds guards without rewriting or validating pre-existing rows. New/changed employee assignments take a position FOR SHARE lock, require same tenant/park, and for non-departed employees require an enabled position in their primary organization. Departed history can retain disabled positions; rehire validates the current relationship. Unchanged historical relationships do not block unrelated metadata maintenance. Position structural edits use READ COMMITTED; fixed-snapshot structural edits raise40001 rather than overlooking assignments committed during a lock wait. No permission/role seed, source binding change, replay or implicit personnel transfer is introduced.

## Evidence and remaining acceptance

The owned loopback15483 PostgreSQL fixture applies actual000230/000295/000352 migrations, preserves an inconsistent historical row, exercises both independent-connection race orders for organization moves and disabling, fixed-snapshot refusal, version CAS, transaction-bound audit failure rollback, nullable/display projection, and departed/rehire behavior. It drops its random database. This fixture does not replace the complete fresh-schema Release Smoke, full modern page/mobile checks or real-role business acceptance. API contracts, typecheck and lint are required. Source/import evidence and independent HR product acceptance remain separate requirements.

The same controller owns existing GET/POST /hr/positions, with unchanged exact READ/MANAGE permissions; the former HrController routes are removed to avoid duplicates. Lists and creation now enforce ordinary organization data scope. Creation uses the same hierarchy transaction, active scoped organization/parent validation,15 fields, source-free IDs, unique-code409 and mandatory transaction-bound audit. GET maintenance-options contains only scoped organizations and positions. Ordinary create DTO now enforces matching numeric bounds and non-empty code/name.
