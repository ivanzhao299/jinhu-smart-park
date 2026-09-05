# Ownership and verification

- Implement agent: new private materializer, focused synthetic IO contracts, package test wiring and materializer spec/docs. Do not edit pure assembler or chunk helper; root owns helper+its parity tests and assembler one-line hash integration. Not alone: preserve root/reviewer changes. No commits or private-data reads by agents.
- Root: canonical chunk parity and bounded-buffer behavior, real-source aggregate checks only when needed, remote CI/merge state. Do not run large actual output against stale target evidence. Existing source scans are sufficient unless changed behavior requires a new check.
- Sequential review after implementation; run T2/T3 regression, direct CLI privacy test and syntax/lint. Keep full output prepared/readback separate from later approved-decision freezing and production writes. No A/B repetition.
