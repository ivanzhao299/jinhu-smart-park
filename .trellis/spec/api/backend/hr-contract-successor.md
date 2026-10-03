# Historical contract to modern successor

Historical contract status is retained source evidence. Do not expire, cancel, delete or mutate a historical row to unblock online work.

Every modern create/edit/activation and non-termination change creation/application locks the scoped employee through the transaction manager. Check all other nondeleted draft/active contracts for that employee in the same scope. Modern draft/active always blocks. A historical active contract can precede modern work only when its valid explicit end date is strictly before both the database-derived Shanghai business date and the requested new start date. Unknown, open, malformed, overlapping, same-day and unended terms remain blocked. All predecessor rows must qualify.

Keep predecessor IDs in the modern source snapshot and append-only action snapshots. Public projections continue excluding source snapshots. Recheck when changing employee, activating a saved draft or applying a saved change. Cancellation and termination retain the existing state transitions. Do not infer cumulative term or signature history from this boundary.

Regress the exact service path in isolated PostgreSQL: create/edit/activate/renew/apply, conflicting dates and scope, concurrent drafts with one winner, failed action rollback, unchanged historical rows and salary permissions. Record ephemeral schema cleanup. Entity-synchronized fixtures do not prove migration/trigger replay or actual business-role UAT.

## Existing agreement flags

Map confidentialityAgreement/nonCompeteAgreement/trainingServiceAgreement to the existing boolean columns from 000238. DTOs accept only explicit booleans or omission; reject null and coercion. On updates omit missing flags from persistence values; false is an explicit modern change. Include returned facts in scoped contract detail and append-only action snapshots. Historical rows remain immutable; self projections omit these fields. These are agreement marks, not signature or attachment evidence. Test actual service readback, unrelated-edit preservation, explicit false, historical protection and UI omission independently of business-role acceptance.

## Original historical years

Source catalogue declares compact.compacttime/totalcompacttime/continueyears as initial/total/renewal years. Project only their retained T2 snapshot scalar values as originalTermYears for historical rows with relevant source keys. Accept nonnegative int4 numbers or digit strings; distinguish missing from unconfirmed and preserve zero. Do not convert into modern months, return the raw snapshot, modify history, widen self projections or change scope/audit. Verify source schema hash, actual service PostgreSQL read/scope/immutability, self omission and responsive detail. Original units do not prove the legacy cumulative algorithm or signature semantics.

## Explicit modern change facts

Change drafts accept optional strict integer months 0..1200 and canonical valid signature date. Persist only versioned narrow modernContractFacts; historical/self projections omit them. Never reinterpret old signed_at or operation time as signature evidence. Renewal applies explicit segment facts, clears missing new segment facts and unknown cumulative term, including same-date open-ended renewals. Changed amendment/correction dates without explicit months clear stale term; unchanged dates retain it. Amendment signature belongs to the change, not the original master. Append action snapshots retain before/after facts and actual occurred_at. Test service state, historical immutability, scoped reads, action rollback and actual contract migrations/audit triggers in an ephemeral loopback lab. Do not claim full migration replay, complete legacy cumulative semantics or real-role acceptance from that gate.

## Reminder invalidation after lifecycle changes

Automatic stale-reminder cancellation includes open, read and acknowledged because acknowledged is still unclosed in inbox statistics. Preserve acknowledgement attribution and timestamps, terminal reminder state and delivered outboxes; cancel only pending outboxes. Keep tenant/park/contract scope and the surrounding contract-action transaction so audit failure rolls back both contract and reminder state. Manual reminder action transitions remain independent; this change does not enable bulk notifications or retroactive historical changes. Regress actual renewal and stale-service paths under the real reminder migration constraints.

## Reminder business-date cutoff

The generator compares source_date minus window_days with timezone('Asia/Shanghai',now())::date, matching contract continuity's database-derived business day. Session current_date is not the business cutoff. Regress the actual generator with yesterday/today/tomorrow windows under UTC and both extreme session timezones, unchanged deduplication and scoped outbox counts. Use the real contract/reminder migrations and pgcrypto dependency in the owned disposable schema; rollback each generated fixture and remove owned schema/extension state. Assert the original pgcrypto OID, namespace and version after cleanup; keep existing public extensions untouched. Exercise the exact run permission, missing-permission denial and foreign-scope no-op. This does not schedule delivery, run production policies or establish legacy rule equivalence.
