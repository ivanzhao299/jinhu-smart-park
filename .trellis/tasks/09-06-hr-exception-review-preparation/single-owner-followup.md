# Explicit single accountable owner follow-up

## Authority and current facts

On 2026-09-06 the user explicitly confirmed that they are the single accountable owner and instructed Codex to operate. This follows the explicit proposal to replace three independent approval subjects while retaining encryption, backups, rollback, no overwrite and per-domain reconciliation. This new instruction supersedes earlier task requirements for three independent production approvers; it does not authorize invented people, cryptographic signatures attributed to the owner, unverified business acceptance or immediate unprepared database writes.

Direct confirmation text: `确认我是单一责任人，你去操作`. This is conversation authorization provenance, not a fabricated owner key or personal signature. No further confirmation of this same responsibility decision is required. Actual operator keys can be prepared under the delegated operation after the implementation is verified; generating them must not be described as establishing the owner's identity.

Base C is a3fac83f169ea7f165ecd2078f61a8a5efcd3c4d. PR646, main CI and automatic deployment succeeded. Read-only runtime image observation independently matched API and Web to that C. Current T0-T3 inventory has the same verified target/scope, 16 tables and 19 existing metadata records. No historical production import has occurred. The existing 47 nonempty quarantine projections are retained under their original candidate C, not relabelled.

## Required end-to-end change

- Support an explicit, evidence-bound single accountable owner policy through the actual preparation -> review/freeze -> bridge -> sealed plan -> execution validation chain. One real owner decision must not be represented as three independent people or three fabricated signatures.
- Preserve legacy three-party validation for historical/default inputs; no implicit downgrade, catch-all fallback, environment flag, empty approvals or unchecked owner label. Use a small shared policy validator where consumers overlap. Explicit single-owner inputs need one exact owner subject/decision and an explicit confirmation evidence reference, bound to the operation, C/S/M, target/scope and relevant artifact hashes/window. Treat the user confirmation as authorization provenance, not a cryptographic signature or completed business UAT.
- Provide or extend a real bounded private-file preparation route for this policy, not an unused helper or only a test fixture. Distinguish owner authorization from delegated operator attestation. A real operator key/signature provides integrity under delegated authority; it must never claim the owner personally signed or that key generation proves organizational identity. Reuse existing normalization, encryption, signature verification, freeze and sealed-plan machinery.
- Keep original source and quarantined reasons/fields/dependencies intact. No guesses, skip/merge conversion, overwrite, global ignore or blanket acceptance of unsigned material. Preserve before-image/record-map correctness, exact runtime/target binding, expiry, one-time authorization consumption and separate rollback intent.
- Ordinary deploy/seed/lab must remain unable to invoke the writer. Do not activate production, alter target allowlists, generate real private keys, access private source data, run A/B or start real database work in this implementation. Activation is a separate exact-target readiness decision after the real operator materials are prepared.

## Acceptance and ownership

Use synthetic nonempty records for a real single-owner preparation roundtrip through existing consumers, plus negatives for missing confirmation, missing/extra/duplicate owners, fabricated three-person substitution, wrong owner/operation/C/S/M/target/artifact hashes, stale windows, signature/GCM drift and replay. Historical three-party positive and shared-subject negative cases remain intact. Run affected preflight, freeze, bridge, generator, crypto and CLI contracts. Wire new tests into the existing CI path. Attempt repository lint/typecheck once; do not borrow dependencies from other worktrees.

One implement worker owns the shared policy and tightly affected producer/validator/CLI/tests plus matching operator docs/spec. Root owns this task note, independent consumer review, real consent provenance, private operational artifacts, Git and release. Do not commit, push, merge, change workflows, modify migrations or touch other worktrees. Do not spawn recursive workers. Ask root with a concrete contract incompatibility rather than widening scope silently.

## Independent baseline observations

- The v2 database control function stores the approval-set digest and does not enforce three approval subjects; this change does not require a production table migration.
- Before implementation, the actual CLI, exception preparation and preflight contract suites passed 49 tests, with one opt-in 65 MiB synthetic whitespace probe skipped. No database connection or production write was used. This is a regression baseline, not proof of the new policy.
- Legacy three-role checks exist separately in preflight, sealed-plan runtime validation and JSON schema. The writer records the approval-set digest. All affected validation surfaces must remain consistent, including the entrypoint dependency allowlist for any shared module.

## Necessary integration fix discovered during implementation

The nonempty preparation-to-sealed-plan test reproduced an existing root-organization dependency mismatch: the payload generator selected record_graph from the table's optional foreign-key declaration even when the actual root organization had no parent reference. The target model marks parent_org optional, and the unchanged execution contract explicitly allows scope and record_graph for sys_org. Root approved the minimal producer fix: scope only when actual references are empty and all table foreign keys are optional; parent-bearing records remain graph-bound and missing required references still fail. Do not weaken the sealed validator or rewrite production migrations. Cover the real generator-to-sealed path so isolated fixture tests cannot conceal this mismatch again.

The user's direct confirmation was captured in an owner-only 875-byte private source artifact. It is authorization provenance only, not a personal signature, independent identity verification, business UAT or proof of import. Do not commit the private file or replace historical receipts.

## Implemented and independently checked

- Explicit single-owner approval is wired into preflight, sealed-plan validation and schema. Delegated private preparation reuses actual Ed25519/GCM/freeze validation; the authorization producer checks actual provenance and prepared/reviewed/bridge file bytes, with phase payload hashes independently compared by the sealed consumer.
- Legacy three-subject approvals, conflict-ledger roles, no overwrite, one-time consumption, exact target/runtime, before-images, record maps, rollback and default execution HOLD remain intact. No production migration, activation allowlist or workflow was changed.
- Root ran the combined preflight, exception, v2, entrypoint, crypto, candidate-freeze and private-freeze contract suites: **149 passed, 0 failed, 1 skipped**, 150 total. The skipped case is the optional 65 MiB synthetic whitespace read probe. Separate existing payload-generator and real-artifact-bridge package entries also passed.
- The implementer attempted `pnpm lint` and `pnpm typecheck` once each; this worktree has no node_modules, so eslint/tsc were unavailable. No dependencies were borrowed. Full CI remains required, and these local checks are not reported as passing.
- `git diff --check` passed. Fetch before publication still showed HEAD and origin/main at the same base, with ahead/behind 0/0. Private source data, real keys, database access and historical production writes were not used for these tests.
