# Reviewed unpublished payroll comparison sources

- Freeze only one explicitly chosen legacy batch, book and month; require successful T4 operation/control receipts in the same scope and current database, exact ownership, counts and content hash.
- `staged` is appendable. Never accept it directly for simulation or publish it to make a test pass. Use `hr_payroll_reconciliation_source` and preserve original batch visibility.
- The source function uses READ COMMITTED plus table SHARE locks and receipt row locks. Set bounded statement/lock timeouts in the caller before invoking it; snapshot/item count limits apply before JSON aggregation.
- Metadata preview requires review permission and calls the same private locked reader as freezing; compute hashes and distinct employee counts in PostgreSQL without returning salary payloads. Audit only metadata with the same transaction manager.
- Creation requires `HR_PAYROLL_RECONCILIATION_REVIEW`, an explicit review reason, HTTP idempotency and body-free audit. Persist required metadata audit with the same transaction manager; never log private input or monetary rows.
- Freeze evidence is append-only, payload/hash/count/scope constrained, and exact-source retries reuse the source UUID. PUBLIC has no table/function access.
- Simulations still require calculate permission, closed effective attendance and approved formulas/net mappings/compensation/insurance. Explicit frozen sources must match scope, legacy batch and month; recheck succeeded receipts and reject mismatches without fallback.
- Read frozen JSONB as SQL text, then project `numeric(20,4)` in PostgreSQL. Never parse salary JSON numeric values into JavaScript `number`.
- Insurance calculation evidence freezes the scoped active period plus item IDs, kinds, versions, exact PostgreSQL numeric strings, source NULLs and the legacy-negative-base flag under `insurance-facts-v1`. A period marked `needs_review` rejects simulation before a run is created. Lock parent periods FOR UPDATE and their selected items FOR SHARE in deterministic order; parent FK locks must prevent a concurrent child append from committing during the snapshot. Do not extract account/source payloads or infer missing amounts. Existing run evidence stays immutable; empty recorded items do not establish a zero insurance obligation or complete policy calculation.
- Bind the source UUID by composite FK to the run's scope and legacy batch; include its hash in frozen calculation evidence. Preserve historical published-path behavior.
- No source creation or simulation may change legacy publication, create formal payroll/payslips or enable payments. A code test does not accept an actual business period or legacy amount equivalence.
- Verify DTO bounds, role denial, exact decimal evaluation, audit failure, source mismatch and unchanged published-path contracts. Real PostgreSQL must cover append/rollback races, immutability, source/run binding and cleanup. Fresh/upgrade migration evidence and actual business acceptance remain distinct.

- The Web preparation panel starts with no chosen month, displays records and employees separately, requires reason and confirmation, and clears stale previews on source/month changes or authoritative validation/permission/conflict rejection. Transient write failures preserve review fields and the payload-bound idempotency key for retry; committed responses disable repeats before catalog refresh. Scoped frozen-source selection must match attendance month; clearing/reloading setup also clears the local selection. Use shared DS surfaces with layout-only spacing and desktop/390px checks.
- `hr-payroll-reconciliation-source.pg.spec.ts` is opt-in for an empty, fully migrated disposable PostgreSQL database on localhost. It verifies actual service SQL, source audit rollback, incomplete-input transaction rollback, numeric precision, binding and absence of formal payroll publication. Ordinary unit-test skips do not prove this integration gate.

References: `000319_hr_payroll_reconciliation_source.sql`, `000320_hr_payroll_reconciliation_source_binding.sql`, `hr-payroll-history.service.ts`, `scripts/verify-hr-reconciliation-source-pg.mjs`.

## Reviewed insurance monetary dependencies

- Legacy payroll/compensation/attendance expressions retain `jinhu-payroll-dsl-v1`. Explicit insurance monetary references use `jinhu-payroll-dsl-v2`, remain manual-review inputs, and must match the stored approval parser version, AST and dependencies. Do not auto-approve or reinterpret an existing v1 approval.
- Six kinds expose separate policy-total, employer, employee and supplement amounts. Five-insurance aggregates require all five exact facts and exclude fund; housing fund is an explicit separate reference. Policy total is independent and must not be derived from the three other columns.
- Resolve only dependencies of the employee's reviewed book formulas from locked, frozen insurance facts. Reject missing/NULL requested components, duplicate required kinds, invalid numeric strings and decimal overflow; preserve unused source NULLs and existing v1 behavior. Project exact decimal strings using BigInt, never JavaScript Number.
- Freeze the effective parser version and original insurance facts in each simulation; amount changes must affect the result and input hash while earlier runs remain unchanged. This alone does not complete explicit modern-revision DTO/UI selection or accept a real business period.

- Optional explicit `insuranceSources` covers exactly the payroll employee set (one source per employee), with no fallback for supplied choices. A historical choice must match the locked period ID/version; a modern choice requires insurance/amount/employee reads before probes and the scoped current confirmed revision ID/no/preview hash. Lock modern families with the identical SQL jsonb advisory key used by 000323 before reading revision/preview. Freeze `insurance-modern-v1` with source hash/version, use the separate modern result FK and matching item-difference metadata. The old omitted-choice historical path remains for compatibility; the modern preparation UI must use explicit choices.

- Insurance-source option reads require calculate plus employee/insurance/amount reads before any probe. Validate the selected published batch or receipt-bound frozen source against an effective closed attendance month. Return bounded paged employee identities and current source ID/version/hash choices only, with required same-manager metadata audit under a consistent read snapshot. No implicit choice on the Web; preserve choices across employee pages, clear on source/scope changes and refresh, and require full coverage before simulation.

- Difference detail exposes only the frozen insurance source identity/version/hash bound to its result FK. Never substitute the current latest revision or return the full frozen insurance JSON/amount inputs. Missing or inconsistent old evidence is explicitly unavailable; existing detail authority and required audit remain in force. Verify an old run still reports revision one after correction creates revision two.

## Preparation cohort before calculation inputs exist

- `GET /hr/payroll/reconciliations/preparation-cohort` requires explicit UUID batch and strict first-of-month, page 1–5000 and page_size 1–100. All seven park-read permissions (reconciliation review, employee read, attendance read, attendance payroll-input read, insurance read, insurance amount read, payroll rule read) and actor/current tenant-park equality are checked before probes. Team/self grants do not authorize this all-person view.
- Accept published batches or unpublished staged batches bound to succeeded T4 receipt target scope/source hash and succeeded current-database migration control. Reject foreign/unqualified sources and months without records. Do not require a frozen source, attendance close or approved formula to browse preparation.
- Census all selected-month book records, independently count items and source multiplicity, and retain unmapped/duplicate/quarantined/unavailable counters. Distinct live mapped employees form the page; cross-book records remain separate in per-person book counts. Duplicate mapped records within one book are explicitly counted. Former employees remain eligible if not deleted.
- Attendance availability requires actual scoped nondeleted input-item membership in an effective batch and closed same-month period. Historical insurance availability requires exactly one active same-month period with no review flag. Modern availability uses the latest same-month revision with scoped preview, without requiring modern close. Preserve missing/review/ambiguity rather than selecting a source. Current-schema uniqueness may make ambiguity impossible; test rejection under intact constraints, never disable them to fabricate duplicate sources.
- Return only business employee identity, record/source counts and approved-formula/current-net-policy identity/version/status metadata. No amounts (including tolerance), raw payloads, contact/bank/identity-document data. Candidates do not prove amount completeness or calculation readiness.
- Use one repeatable-read transaction, 15s statement/2s lock limits, 5000 source-record/200000 active-item bounds and required metadata audit with the same manager. Stable employee-code/UUID pages retain totals when empty. Each request is a live snapshot; separate CSV page requests are not frozen payroll evidence.
- New cohort unit/owned full-schema PostgreSQL tests cover preprobe permissions/DTOs, cross-book people, multiple pages, missing/review/latest insurance, actual attendance membership, source/scope failures, constraints and audit rollback. Existing simulation prerequisites and writes remain unchanged.


## Typed monthly payroll ingress (candidate, not released)

The separate v1 package requires explicit `targetScope:{tenantId,parkId}` carried from the hash-bound employee mapping artifact. Shared/offline validation requires nonblank scope identifiers within the existing 64-character scope limit. Preview and commit compare this target scope with CurrentScope before source writes. Source person ownership still requires exact scoped employee code/UUID validation; scope binding alone does not prove mapping.

`GET /hr/imports/yuzhou/payroll/head?sourceInstance=...&month=YYYY-MM` precedes the UUID status route and requires the same three import permissions. Return only source instance/month, server version/hash and operation UUID; missing head is version0/null/null. Required metadata audit uses the same transaction and failure rejects the read. Existing status includes the operation generation/hash and a separate currentHead, so replay never claims an old operation is current.

The offline CLI accepts `--expected-head-version` and `--expected-head-hash` from this API. Exact package replay returns its original operation. A different manifest/evidence/extraction timestamp with exactly identical normalized scope/source/month/books reuses the current operation, returns `outcome=unchanged`, and records the submitted package hash in required audit. It creates no new source generation, batch, snapshots, catalogs or staging operation. This comparison includes every book/roster/catalog/formula/value/source hash and target mapping; it does not compare amounts alone. New-package preview requires the current head expectation; commit repeats the authoritative CAS. Preview does not acquire an operation row lock after its month advisory lock, avoiding the reverse order of commit.

A revised typed month must retain all predecessor book/person natural keys. Missing books or people fail `SOURCE_ROSTER_REMOVAL_REQUIRES_PROOF` in preview and again in commit; no deletion or zero substitution occurs. A dedicated withdrawal/correction proof protocol is not implemented. Typed source commit responses use actual status, without a fabricated production HOLD state; committing source data does not approve rules or confirm/pay wages.

These candidate contracts do not prove real93 normal HTTP/UI trial, production deployment, complete legacy-field reproduction or business acceptance. Keep those checks explicit.


### Original T4 reference baseline and current-source catalogs

Migration379 allows one original archive batch to be referenced by several month generations and enforces one current Yuzhou source instance per tenant/park/month. A changed source-instance label fails rather than creating a parallel current roster. Import commits acquire fact-table SHARE ROW EXCLUSIVE locks before the month/head locks; this serializes import writers and avoids lock-upgrade cycles when original T4 validation takes SHARE locks. Freeze readers retain their original SHARE-first order.

First-contact T4 discovery includes every original batch having selected-month facts, including unqualified ones. Zero candidates uses the typed source writer; multiple candidates fail. One candidate must pass original succeeded receipt/current-database control checks. PostgreSQL compares complete populated book set, close evidence, employee mapping/source identity, every summary/value/NULL/raw text, original item versions and formulas (including condition/order) in both directions. Original map ownership and hashes are required for batch/books/periods/definitions/versions/formulas/facts. Then the unchanged original319 builder rechecks each book. Only the new source operation/generation/head is written; original rows/maps/receipts and v1 frozen hashes stay byte-identical.

If the incoming first-contact month differs from T4, fail `T4_BASELINE_SOURCE_DIFFERS_REVIEW_REQUIRED` before inserting duplicate facts. Establish the exact retained original baseline first, then submit the revised complete month using the returned head. Automatic reconstruction of an absent original baseline from a changed incoming export is not implemented. Required audit failure rolls back the entire reference anchor. A later typed revision retains the T4 anchor and frozen evidence while preventing new preview/freeze/calculation from using the superseded month; other months in the original archive remain available.

Migration380 supplies `hr_payroll_source_is_current` and `hr_payroll_frozen_source_is_current`. They are metadata qualification only, not full content/ownership acceptance. Setup, source-month discovery, trial selection and count-only readiness/coverage use them. Calculation continues to lock and rebuild complete evidence. Setup reads a repeatable snapshot with same-manager required audit. Source-batch counts include only its currently usable months; frozen-source lists omit superseded choices.

Coverage retains all original facts and separately accounts `supersededSourceCount`; eligible+superseded+unqualified+unavailable counts conserve the census. Old versions do not create duplicate-current-employee exceptions or enter the eligible insurance cohort. Readiness aggregates only current staged month sources (retaining its separate historical published path). Counts never approve calculation or payment.

The prepared adapter follows original T4 UPPER(itemname) target codes, preserves raw legacy column names, reads formula conditions from `source.cit` (empty becomes null) and derives value hashes as SHA256(sourceRowSha256+legacyColumn), without an added separator. Nonempty-condition fixture coverage is required. All 16 declared original item attributes now travel with prepared packages and are compared/stored by exact version. An omitted metadata object can reuse a source-hash-identical existing version; a newly created unknown version is disabled with review required. Typed source revisions never rewrite prior rich versions. Original T4 reference anchors compare provided metadata and preserve existing rich rows.


### HTTP acceptance and original orphan formulas

The normal production parser middleware now scopes the raised JSON limit to both incremental and payroll preview paths. Payroll body limit is 8MiB plus the fixed 12-byte package envelope; ordinary/sibling/wrong-prefix/non-POST routes retain the original parser. Full Nest tests cover 450KB, exact boundary, chunked overflow and sanitized 400/413/415 behavior. This is required for real July packages, which exceed the default100KB limit.

Prepared formulas can reference an original item absent from the source catalog. Preserve the original T4 LEFT JOIN semantics: store null item_version_id with manual_review, keep raw condition/expression/order and retain the original target code in the encrypted monthly package. Never synthesize an item, approve the orphan, drop the formula or block the entire historical month. T4 baseline comparison uses the same resolved/null target interpretation.

`scripts/e2e/hr-payroll-july-source-journey.mjs --config /absolute/private/config.json` is opt-in and restricted to an explicitly owned loopback API/container and synthetic identities. It provisions narrow users through ordinary admin APIs, logs in with passwords, imports64 diagnostic employee identities through the existing incremental API, generates a source-bound July package, imports93 actual source records, freezes both books, creates candidate rules, independently reviews, reads complete54/39 source-value rosters, saves/confirms full inputs and calls all-book trial. Idempotency keys are bound to the actual method/path/body, preserving retries without reusing keys after payload corrections. Full private request/results stay0700/0600, public receipts only counts/hashes.

Source NULL becomes zero only in explicitly named unapproved diagnostic inputs; source facts remain unchanged. Explicit settlement windows avoid invented hire dates. Normal author/reviewer identities are synthetic; the full JWT/API journey is not production-role UAT or Wu signoff. A successful transient trial creates no formal run and grants no payment authority.

### Strict v1 payload and prepared-source proof

- Shared validation is authoritative for API and offline build: reject unknown fields, invalid enums/formulas/summary shapes, duplicate source hashes and books without records; recompute book-set, roster and catalog SHA using canonical codepoint order. Run the shared build before standalone offline commands.
- Prepared rows must be candidate disposition with sourceMultiplicity exactly one. Authenticate complete prepared files against the retained manifest; callers cannot pass a preparedRows bypass to avoid file authentication. Match formulas by exact normalized itemCode, never legacy-column aliases; orphan targets retain manual review as in the original T4 import.
- Preview, commit, status and head share the same three existing import permissions. A valid package hash or client evidence declaration alone does not establish first-month completeness. Candidate extraction registration must bind scope, instance, month, original file and extractor hashes, counts and canonical full book content, without approving rules or calculating wages. Migration381, real93 controlled registration, source/baseline PostgreSQL and fresh-key rejection tests have passed in the owned isolated lab; production release remains separately unverified.
- Actual normal-JWT diagnostic July verification covers93 records/64 people/two books, with93 gross and93 net matches and no differing comparison lines. This is isolated technical evidence, not Wu business approval or production-role acceptance. Source NULL/reference-only lines remain retained; the page must not imply every such line requires historical repair.

## Scenario: verified complete monthly extraction

### 1. Scope / Trigger
A new or revised typed month must prove its complete populated-book source set independently of client-declared hashes. Existing T4 facts, frozen hashes and modern payroll inputs remain immutable.

### 2. Signatures
`register-yuzhou-payroll-source-extraction.mjs --config /absolute/private.json` writes only `hr_yuzhou_payroll_source_extraction` (migration381). Existing `POST hr/imports/yuzhou/payroll/preview`, `POST :id/commit`, `GET head` and `GET :id` retain their payload signatures.

### 3. Contracts
The controlled config requires allowExtractionRegistration, targetScope, exact database name/OID, preparedRoot, manifestPath, mappingPath, sourceInstance, month, prior expectedManifestSha256 and reviewed expectedExtractorSha256. Default transport accepts loopback; explicit docker_service accepts one fixed service label. No public registration endpoint or fallback target exists. API preview/commit match registered scope/source/month/evidence, canonical books SHA, three set SHA and counts before accepting or replaying a package. Status uses generation/currentHead and does not expose recordCount.

### 4. Validation & Error Matrix
- Unknown/malformed package or mismatched declared SHA: sanitized `YUZHOU_PAYROLL_SOURCE_PACKAGE_INVALID`.
- No registered exact complete contents, including a validly rehashed truncated/changed package:409 `PAYROLL_SOURCE_VERIFIED_EXTRACTION_REQUIRED`.
- Changed prior manifest: `PAYROLL_SOURCE_EXTRACTION_MANIFEST_DRIFT`; changed extractor or database identity rejects before registration.
- Registry UPDATE/DELETE: existing append-only trigger rejects.

### 5. Good / Base / Bad Cases
Good: authenticate the retained complete files, register the exact month and then preview/commit with ordinary permissions. Base: replay the identical committed package without new source facts; frozen/input/trial consumption remains valid. Bad: delete a book, record, value or formula, or alter an amount, recompute client SHA and claim completeness.

### 6. Tests Required
Source/baseline PG specs assert exact registrations, rejection without proof, forged rehashed contents, immutability, original T4 compatibility, freeze and transaction rollback. Offline contracts assert manifest/extractor/transport/privacy failures. Normal JWT fresh-key real-source verification must bind the running compiled API, source package and current validation revision; a cached idempotent response is not a new calculation. Browser verification covers actual1440/390 widths and amount-free summary evidence.

### 7. Wrong vs Correct
Wrong: accept evidenceSha256 as client proof, or read record.gross (absent from PayrollTrialRecord), or treat every source_null/source_only as historical remediation. Correct: match controlled full-content extraction; compute gross comparison from the unique gross-role result line; retain unused/null source facts and distinguish real operational gaps.

### Existing reconciliation mock compatibility

When changing source SQL/helper calls, run `hr-payroll-reconciliation-source.spec.ts` alongside the real PG source/baseline checks. Its strict fixtures must model both frozen reads, SHARE locks, scoped current receipts and the current-content hash. Update exact expected branches/parameters and assert refusal of superseded/hash-drift inputs before formulas or writes; never replace these fixtures with a blanket successful query response.
