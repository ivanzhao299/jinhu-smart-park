# B2c 000197 preliminary executor v6 review handoff

Status: frozen candidate awaiting new reviews and drain. No live authority.

The logical run ID remains `b2c197_prelim_20260802c`; physical C/D identities
remain the approved `02b` resources. Approval runtime v8 remains bound at
`022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`.

v6 fixes terminal secret discovery, preserves benign argv while redacting only
secret-bearing elements, and passes `B2C_000197_V6_STATIC_MODE=frozen` through
an explicit nonsecret evidence allowlist. Frozen-mode static verification
requires `manifest_frozen=true` and `frozen-awaiting-independent-reviews`.

Node 22 and Node 24 each passed evidence 8/8, orchestrator 4/4, contract 8/8
and approval lifecycle 4/4. Closure tests passed 3/3. The C/D read-only
preflight passed with artifact
`19229d2b750df99d48081ecf2e1d4e0b0cf45f6e58e9768c3bda5a570310be7a`
and manifest
`738dc4094217dc8ee1b0300fdec85813695f77a696c2a76fcbf70f528ab4b895`.

The RETURNED drain SHA
`93fb2c36e3d44bfa32cb88e1a2c36489ae216371fa3335c3d18b0c702b58fa1a`
is mentioned only for audit. It is not a manifest file row and v6 code does
not read, stat, hash, require or accept it as formal input.

No review or drain artifact is created here. C/D were not written.
