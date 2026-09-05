# Yuzhou T3 production field projection

## 1. Scope / Trigger

Root-script preparation only; no API, filesystem, SQL or writer entry point.

## 2. Signatures

`projectProductionT3Fields(record, {attendanceFileSha256}?)` expands one verified source parent.
`buildProductionT3AttendanceSupport(attendanceRows, attendanceFileSha256)` creates the small batch/rule set.
`verifyProductionT3StagedRecord(record)` checks exact recognized shape and source identity.
Every projection carries existing phase provenance, complete `targetFields` or null, `dependencyRefs`, and null or stable `reasonCode`.
The private caller must authenticate source bytes/manifest, C/S/M, target inventory, T0 references and decisions before freezing; these functions do not grant approval.

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

## 4. Validation & Error Matrix

Structural shape/key/identity drift and duplicate children reject the source record. Semantic integer/date/decimal/length/kind problems return all affected projections with stable reasons and null fields. Those records must be explicitly accounted for by the later review/quarantine layer; do not silently filter them away.

## 5. Good / Base / Bad Cases

Good: current complete policy items preserve fractional rates and exact fixed amounts. Base: empty attendance still produces its deterministic batch. Bad: older six-key policy items acquire fabricated fixed nulls or inferred rate units; partial layouts are accepted as the recognized legacy layout.

## 6. Tests Required

Test complete target fields/FK roles, input immutability and output detachment, provenance parity against the existing phase producer, empty support, unknown symbols, null/zero/flags, date and precision failure conservation, and both exact policy layouts. The optional local PostgreSQL check performs fixed literal casts in a read-only transaction; it proves storage representation, not writer or production success.

Run `pnpm test:e2e:yuzhou-production-import-t3-artifact`. Set `YUZHOU_T3_PROJECTION_PG_CONTAINER` only for the named local Unix Docker endpoint. No business tables are read or written by that optional check.

## 7. Wrong vs Correct

Wrong: `item.baseFixedAmount ?? "0"` fabricates an amount when the old artifact never captured the field.
Correct: recognize the exact older shape and keep its identity with `targetFields: null` and `T3_POLICY_FIXED_AMOUNTS_UNATTESTED`; resolve it from separately authenticated source evidence.

For the complete reversible six-kind dual-variant layout, [T3 Policy Recovery](./yuzhou-t3-policy-recovery.md) authenticates all51 reconstructed raw fields and returns explicit12-to6 lineage. The private owner may project its normalized record only after source-byte binding; default behavior and old phase receipts remain unchanged.

## Source and product acceptance boundary

Real staging can be streamed per parent. Do not aggregate every expanded insurance row just to produce a count, and do not re-extract the complete source to solve a small policy evidence gap. Matching source file hashes and projection counts prove preparation coverage, not full business semantics, employee dependency resolution, API/UI parity or production execution. Keep these acceptance dimensions separate.
