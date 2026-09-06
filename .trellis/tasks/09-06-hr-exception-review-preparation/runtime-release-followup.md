# Runtime release observation follow-up

## Verified gap and scope

PR645 merged as beda9cbff06d52058454b9a010ba4d0d7498ad05. Its automatic deployment and main CI remain live; preserve both. The existing production import entrypoint requires an independently observed runtime release receipt. The current workflow writes a host .release.json, but neither runtime Dockerfile retains a commit marker or OCI revision label. Existing Yuzhou diagnose modes do not observe running API/Web image revisions. A host marker alone must not be promoted to runtime proof.

Add the minimum usable build-to-running-container revision observation path. This is an operational prerequisite for the existing migration chain, not another importer, signature authority, database gate, or business acceptance claim. Do not materialize new real candidates or modify previous source/choice artifacts during implementation.

## Implementation requirements

- Bind API and Web runtime images to the workflow-provided release commit at build time. Preserve development builds when no release marker exists, but mark them unverifiable rather than assign HEAD or a guessed production revision.
- Prefer a narrowly supplied validated build argument plus immutable image revision labels, or a build-owned embedded marker with a demonstrable unchanged image origin. Never accept container names, mutable image tags, an environment variable, or the host release file alone as proof.
- A read-only collector observes the exact running API/Web containers, immutable image IDs and their build-bound revisions, rejects stopped/replaced/missing/mixed-revision targets and malformed/missing revisions, and compares to an explicit expected commit. Capture only technical identities, hashes, times and stable error codes. Never print docker inspect environment, raw command errors, secrets, business rows or private paths.
- Provide an actual invocation through the existing diagnose-only production workflow. It must not deploy, run migrations/seeds, create containers, restart, clean up, or write a release marker. Preserve deploy-production serialization and all existing diagnose branches.
- Observation is not final authorization or target-scope proof. Preserve the existing runtime receipt schema and import activation/HOLD. Document how observed image facts can support that existing receipt alongside independently verified target/merged evidence.
- Account for full/narrow builds and rollback. A mixed-version narrow release cannot claim both API and Web are the new full revision. Do not change ordinary authentication, data, seed, health or cleanup behavior.

## Validation and ownership

Use synthetic command fakes and source contracts, not new real Docker builds. Exercise expected success, stale/mixed labels, stopped or replaced containers, missing labels, malformed metadata, command failure and sensitive stderr suppression. Verify the actual diagnose workflow branch and its non-mutating gates. Run existing affected deployment routing/transfer/verified-scope contracts and shell syntax. Attempt lint/typecheck once if dependencies remain unavailable; no dependency borrowing or installation solely for this slice.

Root owns this follow-up, all Git/publication operations, production observations, private artifacts and ongoing workflow monitors. Existing implement worker owns only the runtime marker/collector, tightly related Docker/deploy/workflow wiring, focused tests and matching operational docs/spec. No other worktrees, unrelated tests or migrations may be changed. One bounded implementer, no recursive delegation. Preserve other contributors' changes. Root must independently review before a single PR; do not commit, push, merge or trigger a workflow from the worker.

## Implemented and independently checked

- The one-shot build argument is frozen before environment-file loading and becomes revision/component labels on the final API/Web images. Missing development/rollback revisions remain unverifiable; no host-marker inference is used.
- The collector observes full container/image IDs and image labels, rejects application mount overrides, and rechecks running identity. It is supporting image evidence only, not an authorization, target receipt, writable-layer integrity proof or browser acceptance.
- The actual diagnose-only workflow executes through SSH stdin. Independent review found and corrected loss of specific failure reasons: only a complete finite-allowlist collector code now passes through; all unknown/multiline raw diagnostics stay suppressed. The added regression executes the extracted workflow shell with synthetic SSH responses.
- Root independently ran all 23 runtime revision tests, deployment route/transfer/verified-scope/scope contracts, JS and shell syntax, workflow YAML parsing and diff checks successfully. The implementer also passed path, seed-precedence and backup-restore contracts. Lint/typecheck were attempted once by the implementer but eslint/tsc are absent in this worktree; no dependency installation/borrowing occurred. Candidate CI remains required.
- No real Docker image build, production observation, source extraction, candidate regeneration, database operation, encryption/signing or activation was performed for this implementation. PR645 automatic release remains separate and must not be represented as deploying these uncommitted follow-up files.
