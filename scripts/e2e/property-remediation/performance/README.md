# Track C performance gate

`profile.v1.json` is the checked, fixed resource and workload contract. A formal
executor must produce one `property-track-c-performance-evidence-v1` JSON document
covering both scenarios, concurrency 1/10/30 and five runs per concurrency. Run 1
is cold and requires a hashed restart/cache-reset proof; runs 2–5 are warm.

The gate deliberately does not synthesize results or shorten the 2-minute warmup,
10-minute formal interval or 10,000-request minimum:

```bash
pnpm exec node scripts/e2e/property-remediation/performance/formal-evidence-gate.mjs \
  --evidence /absolute/path/to/formal-evidence.json
```

Missing resource observations, image digests, PostgreSQL parameters, seed/business
clock provenance, latency/throughput/error/CPU/memory/GC/DB-wait metrics, cold-start
proof, any matrix cell, or cleanup proof with `residualCount=0` is a hard failure.

## Executor

`formal-executor.mjs` is the fail-closed producer for that evidence. It runs the
HTTP load generator inside the fixed `browserWorker` container (the bearer token
is sent over stdin, never as a Docker argument) while the host process samples
all four containers. It writes run data only below the ignored directory
`artifacts/property-remediation/runs/<timestamp>-<commit>/`.

The formal matrix takes at least six hours: 2 scenarios × 3 concurrency levels ×
5 runs × (2-minute warmup + 10-minute formal interval). Do not use shortened
durations as formal evidence.

Required environment:

```bash
export PROPERTY_PERF_BASE_URL=http://localhost:3101
export PROPERTY_PERF_USERNAME='<performance account with both dashboard read permissions>'
export PROPERTY_PERF_PASSWORD='<read from a local secret source>'
export PROPERTY_PERF_CONTAINERS_JSON='{"web":"perf-web","api":"perf-api","postgres":"perf-postgres","browserWorker":"perf-browser"}'
export PROPERTY_PERF_DATASET_MANIFEST=/absolute/path/to/dataset-manifest.json
export PROPERTY_PERF_SEED_MANIFEST=/absolute/path/to/seed-manifest.sql
export PROPERTY_PERF_BUSINESS_CLOCK=2026-08-04T00:00:00Z
export PROPERTY_PERF_RESTART_COMMAND=/absolute/path/to/cold-restart-and-readiness.sh
export PROPERTY_PERF_CLEANUP_COMMAND=/absolute/path/to/cleanup-and-inventory.sh
export PROPERTY_PERF_GC_COMMAND=/absolute/path/to/observe-gc-pause-ms.sh
export PROPERTY_PERF_DB_WAIT_COMMAND=/absolute/path/to/observe-db-wait-ms.sh
export PROPERTY_PERF_POSTGRES_PARAMETERS_COMMAND=/absolute/path/to/print-pg-parameters-json.sh
export PROPERTY_PERF_REVIEWER='<named independent reviewer>'
```

Command contracts:

- The restart command must reset caches/restart the cold services and wait until
  login is ready. It must not contain credentials in its command string.
- The cleanup command must remove run-created state and print only JSON shaped as
  `{"residualCount":0,"manifest":[]}`. A nonzero residual fails the gate.
- The GC and DB-wait commands each print one non-negative millisecond observation.
  They are sampled throughout every cell; unavailable telemetry fails the run.
- The PostgreSQL command prints one non-empty JSON object of fixed parameters.
- All four named containers must already be running with the exact CPU/memory
  limits from `profile.v1.json`, immutable `sha256:` image IDs, and the browser
  worker must contain Node.js and be able to reach `PROPERTY_PERF_BASE_URL`.
- The host needs Docker CLI/socket access. The dataset and seed manifest files
  are hashed byte-for-byte and must describe the actually loaded dataset.

Validate configuration without login, Docker mutation, or load generation:

```bash
node scripts/e2e/property-remediation/performance/formal-executor.mjs --check-config
```

Run the formal matrix only with the explicit safety opt-in:

```bash
PROPERTY_PERF_FORMAL_RUN=yes \
  node scripts/e2e/property-remediation/performance/formal-executor.mjs --formal
```

The executor invokes `formal-evidence-gate.mjs` before reporting PASS. On a run
failure it still attempts cleanup, writes a redacted hashed failure record and
leaves partial evidence in the run directory for review.

## Self-tests

These tests use local fixtures and zero-duration worker phases; they do not start
the formal matrix:

```bash
node --test \
  scripts/e2e/property-remediation/performance/formal-evidence-gate.spec.mjs \
  scripts/e2e/property-remediation/performance/formal-executor.spec.mjs \
  scripts/e2e/property-remediation/performance/load-worker.spec.mjs
```
