# PR192 Human UAT Ledger Hash Contract

Status: template contract only  
Applies to: `observation-ledger.csv`, `signoff-ledger.csv`

This contract defines one reproducible digest algorithm for append-only ledger rows. Coordinators and readiness evaluators must use this exact contract; guessing a different CSV or hash rule invalidates the ledger.

## Canonical row payload

For each CSV row:

1. Parse as RFC 4180 CSV using UTF-8.
2. Preserve the header order exactly as committed in the matching ledger template.
3. Build `row_payload` as canonical JSON with:
   - keys in header order;
   - string values exactly as parsed after CSV unescaping;
   - no extra whitespace;
   - `row_hash`, `ledger_hash`, `external_checkpoint_hash`, and signature-envelope fields excluded;
   - `previous_row_hash` included;
   - `append_only_ledger_ref`, `external_checkpoint_ref`, and `external_checkpoint_signed_at` included.
4. `row_hash = sha256(row_payload)`.

## Chain payload

For row `n`:

- row `1` must use `previous_row_hash = "GENESIS"`;
- row `n > 1` must set `previous_row_hash` equal to row `n-1.row_hash`;
- `row_sequence` must be contiguous starting at `1`;
- `ledger_hash = sha256(canonical JSON array of row_hash values in row_sequence order)`.

## External checkpoint

The final checkpoint payload must include:

- ledger file name;
- schema version;
- final row count;
- final row sequence;
- final row hash;
- final `ledger_hash`;
- candidate SHA;
- H0 handoff hash;
- cohort hash set;
- timestamp and signer/authority reference.

The readiness evaluator must reject any ledger where the final checkpoint does not match the complete row chain.
