# Source mapping provenance check

Read-only metadata check during adapter implementation, baseline 29d40d9213d1297f6a58806612dec643faef7997. No source rows, DB access, extraction, output rewrite or approval creation.

- Existing source manifest original-byte SHA: f73e1caa87068b49c3679f2ce80f152046e524a3f7059e89c5cfda48f6f81b03; verified with owned bounded private reader, 2678 bytes.
- Existing source manifest canonical SHA: 1baa3924da826226decf105fdc27342c3eee08d8a7e7d54724a6c5556b9a3239; portable verifier passes.
- Historical source manifest mapping SHA: aa253b06f01d481073165f94321510cc8e52b96a0dd0f473966160368a989788.
- Current full-domain mapping SHA from computeMappingContractHash: 56c899800bf56b4aa6c60f26657808a18eae70288226b3f142ae56f67e04f990.
- Current core-driver mapping SHA from computeCoreT0T3MappingContractHash: 3c0b5c277263614f1f747fbbd17bab6dc8156df033fc615a74f8751adadc8419.

Full-domain and core hashes use different component sets and must not be compared as interchangeable identities. The historical source mapping is not either current hash. Existing source manifest/phase bytes remain immutable. Current code semantic revalidation can justify reuse for candidate development but cannot relabel old source artifacts or independently confer current production execution authority.

The adapter enforces caller-pinned triple and all descriptor bindings; this is integrity, not independent provenance/signature certification. Before actual execution, establish authentic current mapping/source lineage and release evidence through existing reviewed producers. Do not change M in place, manufacture signatures or restart full extraction merely to update labels.

Capacity checked normal: host Data and Docker free space above configured thresholds. No DB/volume growth or cleanup in this check.
