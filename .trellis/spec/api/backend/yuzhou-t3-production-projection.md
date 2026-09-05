# Yuzhou T3 production field projection

## 1. Scope / Trigger

Root-script preparation only; no API, filesystem, SQL or writer entry point.

## 2. Signatures

`projectProductionT3Fields(record, {attendanceFileSha256}?)` expands one verified source parent.
`buildProductionT3AttendanceSupport(attendanceRows, attendanceFileSha256)` creates the small batch/rule set.
`verifyProductionT3StagedRecord(record)` checks exact recognized shape and source identity.
Every projection carries existing phase provenance, complete `targetFields` or null, `dependencyRefs`, and null or stable `reasonCode`.
The private caller must authenticate source bytes/manifest, C/S/M, target inventory, T0 references and decisions before freezing; these functions do not grant approval.

Explicit source-owner follow-up APIs (never called implicitly by the default projector):

- `projectProductionT3InsuranceQuarantineFields(record)` accepts only `dbo.person_insure` with literal null year and/or month and returns that parent plus all children, in default projection order.
- `buildProductionT3AttendanceQuarantineSupport(attendanceRows, attendanceFileSha256)` returns only unresolved symbol rules in deterministic identity order; empty or fully known symbols return `[]`.

Both return projection objects with nonempty partial `targetFields`, unchanged provenance/reason/dependencies, and separate `omittedFields: {field,reasonCode}[]`. They do not return candidates, approvals, envelopes or executable decisions. Outputs are detached from inputs, not frozen objects; caller mutation cannot alter retained source input.

The pure [normalized phase and candidate assembler](./yuzhou-t3-decision-candidates.md) resolves these
projections through the target model and validated T0 candidates, preserving review failures and policy lineage.

## 3. Contracts

- Support all eight existing T3 model tables. Reuse the phase producer's exact parent, child, batch and symbol identities.
- `sourceRowSha256` is the raw pre-transform row hash. Reduced staging cannot reproduce it; preserve the manifest-bound reference rather than inventing a recomputation.
- Accept exact source and child fields, sourceKey equal to String(source.id), unique child discriminators and correct table/key SHA. Unknown fields fail closed.
- Rates in the current ten-field policy layout are already fractional: exact numeric(18,6), no second division. Fixed amounts use numeric(18,3), contributions numeric(18,2). Decimal strings only; no floating point or nonzero rounding. Negative values unsupported by the current generic payload remain explicit review reasons, not zeroes.
- The attested older policy layout contains exactly kind, variant and four rates. All four fixed fields must be absent together. Keep its identities and emit `T3_POLICY_FIXED_AMOUNTS_UNATTESTED` before interpreting rates. Do not claim missing fixed amounts are null or that current transformer semantics prove older rate units.
- Calendar validation uses real month/leap-day bounds and target year/month limits. Keep all projected identities when parent semantics fail; propagate the parent reason to children. Child-only errors do not remove siblings.
- Preserve blank days. Only the reviewed standard/night symbols become mapped rules. Unknown day symbols retain their value and `needs_review`; their rule projection remains `T3_ATTENDANCE_SYMBOL_UNRESOLVED`. The batch is imported, never verified before verification.
- Preserve raw nullable legacy flags and negative-base markers in the period snapshot. Non-null zero/false flags remain unresolved facts, not inferred eligibility. A negative-base marker with a non-null base is contradictory.
- Dependencies reference stable source identities only. The later assembler resolves employee ownership and target conflicts; the projector does not guess policy-to-person links.
- Opt-in missing-calendar extraction treats only literal null as absent, never blank text, invalid numbers or out-of-range values. Preserve any valid known year/month component, omit missing components (required target year/month cannot be fabricated as null), and preserve `T3_INT4_INVALID` on parent and all children. Validate every remaining child kind/amount/negative-base relationship even though the default projector stops at the parent reason. Unsupported additional semantics throw, rather than becoming partial success.
- Full and partial insurance projections share the exact five monetary-field converters, legacy item snapshot and integer builder. Partial parents preserve legacy ID, known year/month, historical/needs-review facts and snapshot; omit status with explicit `T3_QUARANTINE_STATUS_NOT_SELECTED` metadata. This omission does not change the original candidate's reason or disposition. Missing year/month metadata uses the original `T3_INT4_INVALID` reason. Children keep original parent dependency refs even when the parent remains quarantined; executable reference selection belongs to external review.
- Opt-in unknown symbol support shares observed-symbol trimming/deduplication and fact-building with default support. Preserve `legacy_symbol` and existing rule-version/historical metadata, omit `normalized_kind` and `status` with `T3_ATTENDANCE_SYMBOL_UNRESOLVED`. Never infer an enabled rule. Reject oversized/nonstring symbols, corrupted identities and duplicate attendance parents/children through existing validators.
- Every partial result passes `normalizeProductionImportTargetFields(..., {partial:true})`; omission metadata exactly identifies missing whitelist fields and remains outside targetFields. Raw source preservation is still separate: source-row hashes reference authenticated pre-transform evidence, not a reconstruction from partial payloads. No default output semantics or JSON bytes change.

## 4. Validation & Error Matrix

Structural shape/key/identity drift and duplicate children reject the source record. Semantic integer/date/decimal/length/kind problems return all affected projections with stable reasons and null fields. Those records must be explicitly accounted for by the later review/quarantine layer; do not silently filter them away.

The opt-in APIs deliberately have a stricter failure result: unsupported source family or no missing calendar -> `T3_QUARANTINE_CASE_UNSUPPORTED`; invalid non-null integer/year/month, source employee, child kind/precision/type/overflow or contradictory negative base -> existing stable `T3_*` exception; partial target-model failure -> `T3_TARGET_FIELDS_UNREPRESENTABLE`. An unknown symbol longer than 64 code points fails `T3_TEXT_LENGTH_INVALID`, not a truncated partial rule. No catch-all converts these failures into usable partial fields.

## 5. Good / Base / Bad Cases

Good: current complete policy items preserve fractional rates and exact fixed amounts. Base: empty attendance still produces its deterministic batch. Bad: older six-key policy items acquire fabricated fixed nulls or inferred rate units; partial layouts are accepted as the recognized legacy layout.

Opt-in good: a literal-null insurance period retains six children's exact monetary facts and source markers without fabricating a period. Base: valid known symbols produce no quarantine rules. Bad: a missing year hides an invalid child amount, or an unknown symbol gains `normalized_kind`/`status: enabled` merely to satisfy required fields.

## 6. Tests Required

Test complete target fields/FK roles, input immutability and output detachment, provenance parity against the existing phase producer, empty support, unknown symbols, null/zero/flags, date and precision failure conservation, and both exact policy layouts. The optional local PostgreSQL check performs fixed literal casts in a read-only transaction; it proves storage representation, not writer or production success.

For partial extraction, test missing-year, missing-month and both-null; all five exact amount fields, zero/null/negative-base markers and raw flags; unchanged identity/reason/dependency refs and metadata-field coverage; unknown symbol trim/dedup with no inferred kind/status; mutation detachment; blank/invalid/out-of-range calendars, corrupted identities, duplicate children, unsupported kinds, numeric/precision/overflow and contradictory negative bases. Pin pre-change default JSON byte hashes for full insurance, missing-calendar insurance and attendance support. Run projection, decision-candidate and policy-recovery contracts together.

Run `pnpm test:e2e:yuzhou-production-import-t3-artifact`. Set `YUZHOU_T3_PROJECTION_PG_CONTAINER` only for the named local Unix Docker endpoint. No business tables are read or written by that optional check.

## 7. Wrong vs Correct

Wrong: `item.baseFixedAmount ?? "0"` fabricates an amount when the old artifact never captured the field.
Correct: recognize the exact older shape and keep its identity with `targetFields: null` and `T3_POLICY_FIXED_AMOUNTS_UNATTESTED`; resolve it from separately authenticated source evidence.

Wrong: `catch { return { targetFields: knownFields, reasonCode: null }; }` promotes unsupported errors and loses the quarantine reason.
Correct: use the explicit missing-calendar/symbol API, preserve its reason and refs, and let other conversion errors reject. An authenticated private owner must separately bind those facts to the exact candidates and reviewed choices; never auto-activate a candidate because a partial payload is nonempty.

For the complete reversible six-kind dual-variant layout, [T3 Policy Recovery](./yuzhou-t3-policy-recovery.md) authenticates all51 reconstructed raw fields and returns explicit12-to6 lineage. The private owner may project its normalized record only after source-byte binding; default behavior and old phase receipts remain unchanged.

## Source and product acceptance boundary

Real staging can be streamed per parent. Do not aggregate every expanded insurance row just to produce a count, and do not re-extract the complete source to solve a small policy evidence gap. Matching source file hashes and projection counts prove preparation coverage, not full business semantics, employee dependency resolution, API/UI parity or production execution. Keep these acceptance dimensions separate.
