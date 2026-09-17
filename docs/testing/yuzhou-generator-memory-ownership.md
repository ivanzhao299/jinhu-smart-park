# Generator allocation and ownership contract

The synchronous payload generator validates read-only staging, inventory and
decision indexes without cloning each input row. Normalization and plan record
construction still create output-owned values; caller input is never mutated.

`includeArtifactText` defaults to `true`, preserving the public serialized bundle
output. The real-artifact bridge explicitly selects `false`: it only consumes
generation counts and hashes, so retaining serialized bundle text is unnecessary.
The omitted text's SHA-256 is computed using the existing streaming canonical
hash implementation, including the same final newline. Payload bundle hashes,
validation, dependency ordering and production HOLD behavior are unchanged.

Run `node scripts/e2e/yuzhou-production-import-generator-ownership-contract.mjs`
for pre-change output hash parity, compact/full parity, deeply frozen inputs,
bidirectional mutation isolation and invalid option rejection. Run the existing
payload generator, real-artifact bridge, candidate freeze and exception preparation
contracts as integration checks.

This change removes known allocations; it does not establish a full-size private
freeze pass or production readiness. Full-size validation remains separately
resource-bounded and must not be retried unchanged after an allocation failure.

## Bounded synthetic observation (2026-09-17)

Two independent Node processes with a 256 MiB heap generated 10,016 synthetic
records using the same input and this implementation. Full-text mode observed
188,944 KiB maximum RSS; compact mode observed 154,992 KiB (about 18% lower).
Generation times were 432 ms and 462 ms respectively. After omitting artifact text,
both complete result hashes were
`2d227cf675a3e646eeb6caf35fdb009302f9e2ae23c25e653dba96e2aa7c434a`.
These observations compare output modes, not historical code versions, and are
not a guarantee for the full-size freeze or an assertion of production readiness.
