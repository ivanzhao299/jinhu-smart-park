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
