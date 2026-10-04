# Original family baseline continuity

## 1. Scope / Trigger

Internal proof for the upcoming reusable `dbo.family` incremental adapter. These functions neither expose an import route nor write business data, original operations, sources or receipts. Original T5 data is formal editable data. Modification and soft deletion must not force original replay or invalidate other source rows.

## 2. Signatures

`originalFamily(manager, scope, identitySha256, sensitive): Promise<OriginalFamily|null>` resolves authenticated original receipt/source/employee ownership inside an active transaction.

`certifyOriginalFamilies(manager, original, scope, sensitive): Promise<Map<targetId, originalSnapshot>>` authenticates all operation receipts and recovers the whole original family set. Call once per operation per transaction; no cross-request certificate cache.

`originalFamilySourceFacts(original, certifiedSet, sensitive)` returns `{fields, pendingFields}` from the pinned executed mapper. The lower-level `recoverCertifiedOriginalFamilySet` accepts only service-authenticated immutable receipt IDs and owned-state certificates, never client claims.

Shared `YuzhouFamilySourceFacts`, `YuzhouFamilyBaselineWitness`, `normalizeYuzhouFamilyFields(value)` and `planYuzhouFamilyFields(incoming, sourceBaseline, current, targetBaseline, archived)` prepare the existing-target field protocol. This does not add `family` to public `YUZHOU_INCREMENTAL_DOMAINS` before the API executor and staging adapter are ready.

Forward migration `000337_hr_incremental_family_baseline.sql` prepares the ledger's family domain and durable private provenance. It has not been deployed as an operational import feature.

## 3. Contracts

Resolver validates the succeeded, non-rolled-back T5 operation and canonical binding SHA, exact mapper execution/mapping SHAs, succeeded original T0 operation/phase/batch, T4 parent, employee ownership map and T5 target/source receipts. Wrong scope fails; no candidate returns null, allowing a future new-row path, not automatic admission.

Authenticated source must match row SHA (including reviewed T5 transport decoding), `sha256(dbo.family + NUL + integer id)` and `sha256(dbo.person + NUL + trimmed person)` owner identity. Sensitive parsing failures use fixed errors.

Receipt aggregation uses the original SQL algorithm: hash every `to_jsonb(row)::text`, sort hashes, concatenate and hash again. Original target IDs come solely from those receipts. Unmodified version-1 rows are used directly; modified/archived rows require the earliest version-2 journal's encrypted `before`. Ownership and source metadata must match. PostgreSQL record normalization in Asia/Shanghai preserves original types/timestamps in one set-based query. Missing/gapped initial journals and changed commitments fail.

The seven fixed mappings are `rela → relationship`, `member → fullName`, `tel → contact`, `birthday → birthDate`, `jobunit → workUnit`, `jobname → jobTitle`, `political → politicalStatus`. Values use original trim/null rules. Name/contact plaintext, masks and fingerprints must match the certified original target. Birthday preserves the original valid date-prefix convention; malformed original birthday with null target returns `pendingFields:["birthDate"]`, never a fabricated baseline. Identity number and emergency-contact flag have no reviewed source mapping and are absent from imported facts.

Lock order is original operation, family target, family journal, immutable source/receipts. Current mutable snapshots are not original facts. A future planner must reread current targets under its write/CAS locks and preserve archives/modern edits; the proof itself does not decide writes.

### Existing-target field comparison

Incoming fields use normal family limits (relationship32, fullName100, contact64, workUnit200, jobTitle160, politicalStatus64), trim/null semantics, strict real YYYY-MM-DD dates, and reject NUL/surrogate characters and unreviewed fields. Missing fields preserve current values. Name/relationship cannot clear.

Unchanged source fields do not overwrite or conflict with unrelated current edits. Changed source with unchanged current target is writable. If source and current independently converge, accept the source baseline without rewriting the target/ciphertext/journal. Divergent changes produce a row conflict with no partial business write. Unknown initial fields, even explicit null, require evidence. Archived rows with unchanged source remain unchanged; changed source conflicts with FAMILY_ARCHIVED and never resurrects a record. These pure helpers do not authorize or persist writes; the API must bind source/employee, lock, CAS and journal atomically.

### Durable storage preparation

For `domain=family`, the ledger requires fixed source/table/key, non-null family target, positive versions, empty plaintext field/target JSONB baselines, and ciphertext envelopes in both source facts and `baseline_encrypted`. It permits revision bookkeeping and encrypted baseline updates while source identity/target binding cannot be rebound, deleted or have its revision counter decreased.

`hr_incremental_family_baseline` binds item, incremental operation, scope, employee/family, original source and original family receipt. An INSERT guard checks succeeded original operation, binding SHA, exact whole-family/receipt certificate SHAs, matching mapped source/target/source receipts, and the current incremental item/operation scope and identity. Original provenance cannot UPDATE/DELETE and has an encrypted payload. SQL verifies bindings/envelope shape; API proof still must authenticate ciphertext and actually recompute original certificates before acceptance.

## 4. Validation & Error Matrix

| Condition | Error/result |
| --- | --- |
| Incoming field/type/length/calendar/Unicode invalid | YUZHOU_FAMILY_FIELD_INVALID |
| Changed source against an archived target | conflict FAMILY_ARCHIVED; no writable fields |
| Unknown initial family field | conflict INITIAL_FIELD_BASELINE_UNKNOWN and field name |
| Family ledger identity rebind/delete/revision decrease | FAMILY_INCREMENTAL_SOURCE_IMMUTABLE |
| New provenance scope/source/target/operation/certificate mismatch | FAMILY_BASELINE_BINDING_INVALID |
| Plain/missing ledger baseline or provenance | SQL check violation |
| Original provenance UPDATE/DELETE | INITIAL_BASELINE_PROVENANCE_IMMUTABLE |
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

`hr-yuzhou-family-plan.spec.ts`: unchanged source/modern edits, omitted fields, partial updates, atomic divergent conflicts, independent convergence without writes, archived-source behavior, unknown null baseline, strict calendar/field limits and unreviewed fields. Shared build/lint/tests plus both API/Web typechecks remain required.

The real original fixture also applies 000337 and proves encrypted ledger/provenance insertion, plaintext/null rejection (including nullable target-table SQL CHECK semantics), scope/owner/row/certificate/binding mismatch rejection, ledger source/target/domain/delete/counter immutability, allowed encrypted metadata advancement, immutable original provenance and untouched business target. Public family domain/API/CLI/CAS/journal integration and production release remain subsequent acceptance requirements.

## 7. Wrong vs Correct

Wrong: rerun T5, rebase old receipts to current values, or report this internal proof as a completed import endpoint.

Correct: reuse immutable original source/receipts and pinned seven-field mapping, compare source/original/current per field in the upcoming ordinary scoped incremental planner, preserve modern modifications and archives, and keep unsupported fields explicit.
