# Historical contract to modern successor

Historical contract status is retained source evidence. Do not expire, cancel, delete or mutate a historical row to unblock online work.

Every modern create/edit/activation and non-termination change creation/application locks the scoped employee through the transaction manager. Check all other nondeleted draft/active contracts for that employee in the same scope. Modern draft/active always blocks. A historical active contract can precede modern work only when its valid explicit end date is strictly before both the database-derived Shanghai business date and the requested new start date. Unknown, open, malformed, overlapping, same-day and unended terms remain blocked. All predecessor rows must qualify.

Keep predecessor IDs in the modern source snapshot and append-only action snapshots. Public projections continue excluding source snapshots. Recheck when changing employee, activating a saved draft or applying a saved change. Cancellation and termination retain the existing state transitions. Do not infer cumulative term or signature history from this boundary.

Regress the exact service path in isolated PostgreSQL: create/edit/activate/renew/apply, conflicting dates and scope, concurrent drafts with one winner, failed action rollback, unchanged historical rows and salary permissions. Record ephemeral schema cleanup. Entity-synchronized fixtures do not prove migration/trigger replay or actual business-role UAT.

## Existing agreement flags

Map confidentialityAgreement/nonCompeteAgreement/trainingServiceAgreement to the existing boolean columns from 000238. DTOs accept only explicit booleans or omission; reject null and coercion. On updates omit missing flags from persistence values; false is an explicit modern change. Include returned facts in scoped contract detail and append-only action snapshots. Historical rows remain immutable; self projections omit these fields. These are agreement marks, not signature or attachment evidence. Test actual service readback, unrelated-edit preservation, explicit false, historical protection and UI omission independently of business-role acceptance.

## Original historical years

Source catalogue declares compact.compacttime/totalcompacttime/continueyears as initial/total/renewal years. Project only their retained T2 snapshot scalar values as originalTermYears for historical rows with relevant source keys. Accept nonnegative int4 numbers or digit strings; distinguish missing from unconfirmed and preserve zero. Do not convert into modern months, return the raw snapshot, modify history, widen self projections or change scope/audit. Verify source schema hash, actual service PostgreSQL read/scope/immutability, self omission and responsive detail. Original units do not prove the legacy cumulative algorithm or signature semantics.
