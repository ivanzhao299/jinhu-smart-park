# 000191/000192 Selected Authority Promotion Handoff v2

Status: **CURRENT PROMOTION GO / OPEN P0=0 / OPEN P1=0**

Date: 2026-08-03

Scope: the 000191/000192 contract change-control authority only. This handoff promotes
the selected authority amendment; it is not itself a migration reservation and does
not authorize SQL creation before the separate fresh atomic reservation.

## Immutable inputs

| Input | SHA-256 |
| --- | --- |
| Selected authority amendment v2 candidate | `a0e3c6c7e21fef7886ebaab82a9e1f44c57c4c7f6146160e706168769f996e55` |
| Candidate DB/QA review | `737794dda867534cf28818a6e85cfe412bd585f2bc456444ab846b27c3ff756a` |
| Contract change-control v2 technical sign-off | `d1fcae68a1d25aa9068fb1194700024077504604c7970bc0d17d527a7df7dc86` |
| Trusted signer directory | `1def01678363119d76ff7dbbb643a2a90629a0776e8e803ab714851995836074` |
| Complete decision record | `ca2501a03f548e01f7df68cbf46e4e3df10e404d00f92337f90f61beff776016` |
| External decision receipt | `1c8e670111523222dcbc2a7f6897cfa87b88d125deadd54b6df1cf88e034a152` |
| Decision-record validator | `5ec7a786d1249ab970daa54de8cfddc10561182bd1047b73f083a654c7d2cf56` |
| Validator regression spec | `4188e880eb6bc44295a7dca946d6c06fe50ba829a8e08d8d4f11a9ffdad0d69f` |

The decision validator returned `PASS` with proposal SHA
`85c081a87aebc25ba70931ebf55571bb1d76af705f75d6bd27fb8216c84feb0b`
and trusted-directory SHA
`1def01678363119d76ff7dbbb643a2a90629a0776e8e803ab714851995836074`.

## Review and authority closure

- Database/architecture review: GO, P0=0, P1=0.
- QA/security review: GO, P0=0, P1=0.
- Product, finance, data, homestay-domain, housing-domain, and audit/security role
  coverage: complete through the trusted directory and decision record above.
- Finance/data decisions are exactly DEC-02 A, DEC-03 A, DEC-04 A, and DEC-05 A;
  the CNY attestation matches the frozen required sentence.
- DEC-06 A is exact: `rejected`, `void`, and `refunded` are terminal, and a refunded
  purchase cannot later be voided.

The offline originals, issuer details, and evidence are retained by the project
governance owner. This repository stores the trusted electronic index and hashes, not
copies or invented identifiers for the offline originals.

## Promoted authority

The byte-frozen selected authority amendment with SHA
`a0e3c6c7e21fef7886ebaab82a9e1f44c57c4c7f6146160e706168769f996e55`
is current for 000191/000192 change control. It normatively incorporates the complete
frozen v2 proposal and replaces only the exact parent authority subjects enumerated in
its “Exact authority replacements” section. Every other parent authority rule remains
unchanged.

Canonical filenames are:

- `000191_property_b_homestay_effect_schema.sql`
- `000192_property_b_housing_effect_schema.sql`

## Boundary and next gate

This handoff authorizes the unique schema-migration owner to perform a new immediate
repository/worktree and dual-history scan and, only if every collision count is zero
and both history stores agree, atomically reserve the two exact filenames in a new
immutable reservation artifact. It does not pre-assert that the scan will pass.

SQL authoring, backfill, database migration execution, adapters, and UAT remain
prohibited until that reservation succeeds and their later implementation/review
gates are satisfied. Existing successful 000197 bytes and all retained failed/success
evidence remain immutable and must not be rerun or repurposed.
