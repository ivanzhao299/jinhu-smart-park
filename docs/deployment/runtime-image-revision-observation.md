# Read-only running image revision observation

`Deploy Production` now supports `diagnose-production-runtime-revision`. This is an observation-only workflow mode: it runs the checked-out collector through SSH stdin, reads the production host's local Docker socket, and retains `production-runtime-image-observation` for seven days. It does not transfer deployment source, write a host release marker, create/restart containers, run migrations/seeds, perform cleanup or activate imports. Existing `deploy-production` serialization remains in effect.

Select the reviewed commit/ref whose API **and** Web images you expect to observe. The workflow passes its immutable `GITHUB_SHA` as the explicit expected commit; it does not read a runtime-reported version or `.release.json` to choose that value. A standalone authorized read-only invocation is:

```sh
node scripts/diagnose-production-runtime-revision.mjs --expected-commit <40-lowercase-hex-commit>
```

The collector discovers the fixed API/Web container names, then uses complete container IDs and immutable `sha256:` image IDs. It reads revision and component labels from the **image**, not overrideable container labels or mutable image tags. It rechecks discovery and ID-bound container state, image ID, start time and restart count; stopped, paused, restarting, replaced or mixed-version services fail closed. Only mount destinations are requested: `/`, `/app`, and descendants mounted over the application tree are rejected. The normal `/var/lib/jinhu/files` data volume is allowed. Host mount source paths and container environment are never requested or printed.

## Build binding and release modes

API/Web runtime Dockerfiles accept `RELEASE_COMMIT`, validate nonempty values as 40 lowercase hex characters, and write `org.opencontainers.image.revision` plus `cn.jinhu.runtime.component` to the final immutable image. The argument and validation occur after runtime copies so a revision-only change does not invalidate the dependency-copy cache chain.

The workflow supplies its commit explicitly to `prod-deploy.sh`. That script freezes the one-shot input **before** loading `.env.production` and passes it explicitly to each actual Compose build; a persistent environment-file value cannot silently replace it. This is build metadata, not application configuration: do not persist `RELEASE_COMMIT` in `.env` files. Builds without an explicit release argument remain usable for development, but their empty revision cannot pass the observer. The build pipeline remains the trust boundary for associating supplied commit with transferred source; labels are not cryptographic build attestations.

| Deployment path | Revision behavior |
| --- | --- |
| Full | Both newly built images carry the supplied commit |
| API-only / Web-only | Only the rebuilt image changes; unchanged component retains its old revision, so a mixed pair cannot pass as one new full commit |
| Database-only | No API/Web build; old image labels remain unchanged |
| Fast CSS | No image rebuild or relabeling; image observation is not evidence of the copied writable-layer CSS |
| Source rollback rebuild | Explicit empty `RELEASE_COMMIT`; never infer the previous build revision from a possibly mixed host marker. Restored services may operate normally but are revision-unverifiable until a reviewed rebuild |

The rollback health and cleanup steps are unchanged. This avoids stamping the failed release commit, or an unsupported previous host-marker claim, onto a restored image.

## Evidence and limitations

Success writes a JSON artifact with `formatVersion:1`, `artifactKind:"jinhu_production_runtime_image_observation"`, `status:"PASS"`, `expectedCommit`, `observedAt`, and two `observations` containing `service`, `containerId`, `imageId`, `startedAt`, `restartCount`, `revision`. It states `evidenceScope:"running_container_image_revisions"`, `productionImport:"HOLD"`, and `authorizationGranted:false`.

This proves a bounded observation of the running containers' immutable image identities and build labels, with no application mount overrides. It does **not** prove all writable-layer bytes, absence of `docker cp` changes, startup-command/env equivalence, HTTP/browser behavior, database identity, a verified merge, build signer authority, or future runtime stability. Fast-CSS delivery and business acceptance require separate evidence. A Docker-privileged host can forge images; this mechanism is not a defense against a compromised host/build pipeline.

The existing HR import runtime receipt is unchanged: `{formatVersion,artifactKind,currentCodeSha,mergedCodeSha,runtimeCodeSha,targetIdentitySha256,targetScopeSha256,observedAt,expiresAt}`. This observation can support its runtime-code fact **alongside** independently verified current/merged revision, target identity/scope and authorization-window evidence. It is not directly that receipt; do not invent expiry or copy target hashes from unrelated runs. No importer gate, role requirement or activation is loosened.

Errors contain stable `PRODUCTION_RUNTIME_*` codes only; malformed/oversized output and command timeouts fail closed. Each Docker command is bounded to ten seconds and 64 KiB. The workflow captures remote stderr without printing it: only an exact complete code from its finite collector-error allowlist passes through. Unknown SSH/Node diagnostics or mixed code-plus-text produce only `PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED`; no successful observation is uploaded on failure. Rerun only after independently resolving the missing/stale/mixed/mounted target; never fill a missing revision from the host release marker.

## Synthetic checks

`node --test scripts/e2e/production-runtime-revision.contract.mjs`

Tests use command fakes and disposable fixtures, not real Docker builds or production credentials. They cover immutable image lookup, mixed/missing/malformed labels, state/replacement races, mount overlays, stable error suppression, actual file/SSH-stdin CLI behavior, one-shot build argument precedence, development empty revisions, narrow/database behavior, rollback wiring and diagnose-only exclusions. Existing deployment route/transfer/scope/verified-scope/seed/path/backup contracts remain applicable. A synthetic pass is not an actual observed production image revision.
