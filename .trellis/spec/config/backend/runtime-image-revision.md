# Build-bound runtime image revision observation

## 1. Scope / Trigger

Use when changing production Docker build metadata, runtime revision evidence or diagnose workflow wiring. Keep this read-only image observation separate from host source markers, database/authorization receipts and product acceptance.

## 2. Signatures

- Runtime Dockerfiles: optional build-only `ARG RELEASE_COMMIT=`; nonempty values must match `^[0-9a-f]{40}$`. Final image labels `org.opencontainers.image.revision` and `cn.jinhu.runtime.component` identify revision and `api|web`.
- `observeProductionRuntimeRevision(expectedCommit, {runDocker,now}?)`: standalone builtin-only module; test-only command/clock injection. Production command uses `docker --host unix:///var/run/docker.sock`, never ambient `DOCKER_HOST`/context.
- `node scripts/diagnose-production-runtime-revision.mjs --expected-commit <sha>` or equivalent `node --input-type=module - --expected-commit <sha>` with collector stdin.
- Existing `Deploy Production` dispatch adds `diagnose-production-runtime-revision`, classified ops-only and explicitly excluded from every deployment mutation branch.

## 3. Contracts

- Workflow supplies its explicit commit. Freeze the build argument before sourcing `.env.production`; pass the saved value on each Compose build. Missing argument stays empty, not HEAD/host marker/current runtime. Keep build metadata out of persistent environment examples.
- Place revision validation/labels after runtime source copies to preserve cache use. Full rebuild tags both components; narrow rebuild only the rebuilt component. Database/CSS paths do not relabel existing images. Rollback source rebuild passes explicitly empty revision rather than guessing a previously mixed source identity.
- Names discover fixed API/Web services only. Inspect the full container ID, its immutable image ID, and IMAGE labels (never container labels). Require valid exact image/component/revision, running and neither paused nor restarting; reread discovery/state and reject changed IDs, image, start time or restart count.
- Request only mount destinations and reject root/application-tree overrides. Permit normal outside-application data volumes. Never request image/container Env or host mount Source values. Output only technical identities, times, stable statuses/codes.
- Success exact artifact: `{formatVersion:1,artifactKind:"jinhu_production_runtime_image_observation",status:"PASS",expectedCommit,observedAt,observations,evidenceScope:"running_container_image_revisions",productionImport:"HOLD",authorizationGranted:false}`. Each observation has service/containerId/imageId/startedAt/restartCount/revision.
- Builtin subprocess commands use finite 10-second/64KiB bounds. CLI outputs no partial success on failure and sanitizes subprocess/parser errors. Workflow captures SSH stderr and passes only an exact complete code from its finite collector-error allowlist; unknown or multiline raw diagnostics become the generic workflow code. Preserve deployment concurrency and every existing diagnose branch.
- This does not attest writable-layer contents, runtime startup configuration, browser health, trusted merge, database identity or production authorization. Existing HR runtime receipt schema and independent expiry/target/approval evidence remain unchanged.

## 4. Validation & Error Matrix

| Condition | Stable result |
| --- | --- |
| Invalid expected commit | `PRODUCTION_RUNTIME_EXPECTED_COMMIT_INVALID` |
| Missing/empty/malformed image revision | `PRODUCTION_RUNTIME_REVISION_UNAVAILABLE` |
| Stale or mixed image revisions | `PRODUCTION_RUNTIME_REVISION_MISMATCH` |
| Stopped/paused/restarting service | `PRODUCTION_RUNTIME_CONTAINER_NOT_RUNNING` |
| Container/image/start/restart identity changes | `PRODUCTION_RUNTIME_CONTAINER_CHANGED` |
| Invalid image ID/component metadata | `PRODUCTION_RUNTIME_IMAGE_METADATA_INVALID` |
| Application bind/volume overlay | `PRODUCTION_RUNTIME_APPLICATION_MOUNT_OVERRIDE` |
| Malformed metadata/mount data, oversized response | `PRODUCTION_RUNTIME_METADATA_INVALID` / `PRODUCTION_RUNTIME_MOUNT_METADATA_INVALID` |
| Docker command fails/times out | `PRODUCTION_RUNTIME_COMMAND_FAILED`, no raw stderr |
| Remote execution fails | exact known collector code preserved; otherwise `PRODUCTION_RUNTIME_REMOTE_OBSERVATION_FAILED`, no successful artifact upload |

## 5. Good / Base / Bad Cases

Good: both live service IDs consistently reference different immutable images whose image labels bind the same expected commit, with no application mount overrides.

Base: empty development labels build successfully but cannot satisfy the collector. API-only deployment retains old Web identity and honestly fails a full-pair new-revision claim.

Bad: read container labels or host `.release.json`, treat a tag as immutable identity, infer the rollback revision, or copy this observation directly into an authorized import receipt.

## 6. Tests Required

Run `production-runtime-revision.contract.mjs`: success; missing/stale/mixed/malformed revisions; stopped/paused/restarting/replaced containers and changed image IDs; mount destination overlays; missing/failed commands and sensitive stderr suppression; real standalone/stdin CLI using fake Docker; full/narrow/no-build argument behavior and persistent-env override resistance; Docker marker order/validation and actual diagnose-only workflow mutation exclusions.

Run affected route, transfer, scope, verified-scope, path, seed-precedence and backup-restore deployment contracts. Use synthetic fakes, not actual image builds, production hosts or DBs. Shell syntax and diff checks are required; unavailable dependency checks must be reported without borrowing/installing dependencies for this slice.

## 7. Wrong vs Correct

Wrong: `runtimeCodeSha = hostRelease.commit` or `docker inspect container.Config.Labels[revision]`.

Correct: discover a full live container ID, inspect its immutable image's revision label, reject application mounts, and recheck that discovery/container/image/start state stayed unchanged. Keep the result supporting image evidence only, with HOLD and independent authorization still external.
