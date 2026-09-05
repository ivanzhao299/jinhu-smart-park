# Design

Extract the pure contract semantic derivation from scripts/transform-yuzhou-t2-contracts.mjs into one shared MJS owner. Preserve transform CLI behavior. The production projector first authenticates the untouched staged row, then resolves a local semantic view. If all five derived fields are absent, derive them from existing raw date/count fields using the shared owner. If any are present, require the complete coherent derived set and preserve modern meaning; do not mutate or rehash the source row. Target provenance retains the original sourceRowSha256. Stable errors never include source values.

Existing source-only semantic/evidence hashes referencing the transformer must be located and updated only with reviewed byte/behavior evidence; no blanket rebinding. Candidate dependency, target inventory and approval contracts stay unchanged.
