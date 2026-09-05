# T3 historical policy recovery

## 1. Scope / Trigger

Use only when receipt-bound old T3 policy staging contains six kinds with two six-key variants per kind. Historical variant2 values are original suffix_2 fixed addends, not a second percentage schedule. This is a pure source-recovery layer; it is not an approval, writer or automatic rewrite of old phase receipts.

## 2. Signatures

`recoverProductionT3LegacyPolicy(record) -> {normalizedRecord, lineage, proof}`.
The normalized record remains private source data. Lineage links two old `hr_insurance_policy_item` source projections to one current variant1 projection per kind. Proof contains only format/status, source identity/row SHA, reconstructed-field/item counts, normalized-content SHA and `productionImport: HOLD`.

## 3. Contracts

Validate exact source wrapper and identity, then exactly six known kinds x variants1/2. All four rate-labelled values must be strings or null, never omitted, coerced from numbers or replaced with zero. Current ten-key layout is rejected to prevent double normalization; partial/mixed layouts, duplicate or absent children are errors.

Reconstruct original id/des/rightscope and all48 amount fields without changing raw values. Match the canonical 51-field object's SHA to the original `sourceRowSha256` before normalization. This domain-specific full reconstruction is possible here and must not be generalized to reduced records missing raw fields.

Use the existing reviewed `buildLegacyInsurancePolicyItems` semantics: percentage-point variant1 values are divided by100 exactly; variant2 values become separate fixed addends. Null and zero remain distinct, signed fixed values survive recovery; unsupported target values remain the projector's explicit review responsibility. No rounding or floating-point arithmetic.

The inherited parent source identity and row SHA remain unchanged. Shared phase helpers define child identities and hashes. Lineage covers each of12 old children exactly once and exactly6 current children, independent of input order. Output must be detached from caller-owned data.

## 4. Validation & Error Matrix

Malformed wrapper/shape/key, unknown/missing/duplicate kind or variant, non-string money, blank values, wrong reconstructed raw SHA or normalization failure reject with a stable `T3_POLICY_RECOVERY_*` code, never a raw field value or file path. Raw hash integrity is not an external source signature; the private owner still verifies stage bytes and current C/S/M.

## 5. Good / Base / Bad Cases

Good: twelve fully captured old items reproduce the exact raw row SHA and become six current items. Base: null or zero addends are retained as such. Bad: missing fixed fields are filled with null, variant2 is divided by100, or a new source SHA is generated to legitimize a mismatch.

## 6. Tests Required

Test all51 reconstructed fields, independent four-rate/four-addend mapping, null/zero/signed fixed semantics, negative rate rejection, raw metadata and value drift, exact input shape and current-layout rejection, order invariance, immutable inputs,12-to6 lineage and direct composition with the T3 field projector. Public proof must contain no original values.

The test is included in `pnpm test:e2e:yuzhou-production-import-t3-artifact`. Actual private verification reads only the bound small policy stage and emits counts/hashes, never raw records. Full A/B and production execution are not claimed by this check.

## 7. Wrong vs Correct

Wrong: `item.variant === 2 ? Number(item.baseRate) / 100 : item.baseRate` misclassifies an addend as a rate.
Correct: reconstruct `raw[kind + "2"]`, verify its contribution to the original row SHA, then use the reviewed normalization function and record both old child identities in the resulting lineage.

## Downstream boundary

Final phase and candidate assembly must select the same normalized source representation under current evidence. An old144-item phase artifact does not match a new72-item policy projection and must not be relabeled. Do not fabricate `skip_approved` or archive dispositions for consumed old aliases; lineage is a transformation relationship, not permission to omit business data or touch an existing target.
