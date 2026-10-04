# Original family baseline continuity

## 1. Scope / Trigger

Internal proof for the upcoming reusable `dbo.family` incremental adapter. These functions neither expose an import route nor write business data, original operations, sources or receipts. Original T5 data is formal editable data. Modification and soft deletion must not force original replay or invalidate other source rows.

## 2. Signatures

`originalFamily(manager, scope, identitySha256, sensitive): Promise<OriginalFamily|null>` resolves authenticated original receipt/source/employee ownership inside an active transaction.

`certifyOriginalFamilies(manager, original, scope, sensitive): Promise<Map<targetId, originalSnapshot>>` authenticates all operation receipts and recovers the whole original family set. Call once per operation per transaction; no cross-request certificate cache.

`originalFamilySourceFacts(original, certifiedSet, sensitive)` returns `{fields, pendingFields}` from the pinned executed mapper. The lower-level `recoverCertifiedOriginalFamilySet` accepts only service-authenticated immutable receipt IDs and owned-state certificates, never client claims.

## 3. Contracts

Resolver validates the succeeded, non-rolled-back T5 operation and canonical binding SHA, exact mapper execution/mapping SHAs, succeeded original T0 operation/phase/batch, T4 parent, employee ownership map and T5 target/source receipts. Wrong scope fails; no candidate returns null, allowing a future new-row path, not automatic admission.

Authenticated source must match row SHA (including reviewed T5 transport decoding), `sha256(dbo.family + NUL + integer id)` and `sha256(dbo.person + NUL + trimmed person)` owner identity. Sensitive parsing failures use fixed errors.

Receipt aggregation uses the original SQL algorithm: hash every `to_jsonb(row)::text`, sort hashes, concatenate and hash again. Original target IDs come solely from those receipts. Unmodified version-1 rows are used directly; modified/archived rows require the earliest version-2 journal's encrypted `before`. Ownership and source metadata must match. PostgreSQL record normalization in Asia/Shanghai preserves original types/timestamps in one set-based query. Missing/gapped initial journals and changed commitments fail.

The seven fixed mappings are `rela → relationship`, `member → fullName`, `tel → contact`, `birthday → birthDate`, `jobunit → workUnit`, `jobname → jobTitle`, `political → politicalStatus`. Values use original trim/null rules. Name/contact plaintext, masks and fingerprints must match the certified original target. Birthday preserves the original valid date-prefix convention; malformed original birthday with null target returns `pendingFields:["birthDate"]`, never a fabricated baseline. Identity number and emergency-contact flag have no reviewed source mapping and are absent from imported facts.

Lock order is original operation, family target, family journal, immutable source/receipts. Current mutable snapshots are not original facts. A future planner must reread current targets under its write/CAS locks and preserve archives/modern edits; the proof itself does not decide writes.

## 4. Validation & Error Matrix

| Condition | Error/result |
| --- | --- |
| No original candidate | null; new-row admission still required |
| Scope, operation, source, employee/map or duplicate mismatch | FAMILY_ORIGINAL_EVIDENCE_INVALID |
| Executed mapper mismatch | FAMILY_ORIGINAL_MAPPER_UNSUPPORTED |
| Whole receipt certificate drift | FAMILY_ORIGINAL_RECEIPTS_CHANGED |
| Target count/hash/ownership/source identity, first journal or normalization invalid | FAMILY_ORIGINAL_SET_INVALID |
| Missing/non-string original mapped column | FAMILY_ORIGINAL_FIELD_INVALID |
| Original mapped facts disagree with certified target | FAMILY_ORIGINAL_FIELD_INCOMPATIBLE |

## 5. Good/Base/Bad Cases

Good: modern update/archive changes current values while the immutable first before-snapshot proves original source facts. Base: untouched original version-1 rows still match the SQL certificate. Bad: using today's modified values as source baseline, restoring deleted rows, or trusting a supplied hash without original receipt authentication.

## 6. Tests Required

`hr-family-record.pg.spec.ts`: original SQL certificate, active transaction/scope/unique IDs, modern update, null clears, archive, original source metadata tampering and readonly recovery.

`hr-yuzhou-profile-baseline.pg.spec.ts`: real 000317/000336 schema and original T0 ownership chain reused with a separate tiny declared T5 family fixture; multirow set, seven-field mapping, invalid historical birthday pending, current update/archive, wrong scope, rolled-back original operation, sibling receipt tampering, source tampering, inactive employee map, missing/malformed first journal, and unchanged current archived row after proof. Dedicated random DBs and owned containers only. CI port55491 remains supported; owned isolated continuation tests may use loopback55496. These synthetic checks do not prove a new real batch, production import endpoint or full HR acceptance.

## 7. Wrong vs Correct

Wrong: rerun T5, rebase old receipts to current values, or report this internal proof as a completed import endpoint.

Correct: reuse immutable original source/receipts and pinned seven-field mapping, compare source/original/current per field in the upcoming ordinary scoped incremental planner, preserve modern modifications and archives, and keep unsupported fields explicit.
