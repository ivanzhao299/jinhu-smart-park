# B2c 000197 v11-v6 PostgreSQL fault-regression v3 review handoff

Status: sealed static candidate; execution and formal GO are false. No resource authority exists, and no Docker or database command was run.

The authority order is now satisfiable and one-way: this candidate is frozen first; an independent database reviewer may approve only the candidate while explicitly denying container creation and execution; independent QA/security then binds that database review SHA under the same restrictions; only afterward may a separate operator create the fixed-path resource authority for a new unique runId, binding this candidate authority and both review SHAs. The runner enables one attempt only after exact intake of all three authorities.

Candidate reviews contain no future runId, baseline, resource path, or resource SHA. The resource path and schema are fixed by the candidate. The resource document carries the later target and baseline fields and binds the candidate authority, database review, and QA review hashes.

The runner specification is a runtime input with exact SHA-256, byte length, and mode. Original Node 22 TAP, Node 24 TAP, and ESLint output are preserved with per-child intent/result files, exit codes, byte lengths, raw hashes, terminal, and an all-child immutable manifest.

For PostgreSQL children, output excerpts are never persisted; only byte lengths and raw hashes remain. General redaction covers SQL quoted credentials, JSON key/value credentials, PGPASSWORD and key/value environment forms, authorization values, space-separated credential options, and PostgreSQL URLs. Benign command arguments needed for audit remain visible.

Candidate manifest SHA-256: `69500584d2e337baa2cefcc66997c3f55bd8e25352f64e68b05218962922d77b`.

Static test record SHA-256: `f0ff4ef66e1be28bce6fd328ea85836c33403d0f073bf120719ab383d7dcf863`.

Static evidence manifest SHA-256: `aa79c70b79deedb346bda44905770e3d61883fc2e061f1ce5c84141ec098f193`.

Requested next gate: independent database review of this sealed candidate only. Do not create a resource authority before database GO and the subsequent QA/security GO.
