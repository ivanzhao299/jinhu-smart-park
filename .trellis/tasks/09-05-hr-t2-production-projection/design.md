# Design

One pure module consumes a staged source record with verified row identity/hash plus explicit resolved dictionary values. It emits model-normalized fields, not a write plan or authorization. Reuse production-import-target-model and production-import-payload-generator normalization; leave the isolated SQL loader unchanged.

Contract start/end/signature dates come from named source fields. Date-derived term and renewal count consume the existing transform's named semantic decisions. Ambiguous compacttime, totalcompacttime and continueyears stay in source_snapshot. First/last signatures and cumulative term stay null until separate history evidence exists. Nullable flags are unresolved, not silently false. Change datetime precision stays in source_snapshot when projected to date columns. Evidence uses the same projection identity formula as the existing T2 phase materializer, with no binary/locator values.

No I/O or credentials. The upstream caller still owns C/S/M, artifact bytes, approved dictionaries, target identity and dependency/collision decisions. Stable errors contain no values. Tests use invented records only.
