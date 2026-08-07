# Phase 5 formal performance plan audit — 2026-08-07

## Bound plan

- Reviewed source SHA: `5f46e7dc8ae75bca14ccc91e479001157123a917`
- Project: `jinhu-track-c-perf-20260807-5f46-r1`
- Database: `jinhu_perf_20260807_5f46_r1`
- Published API/Web ports: `33101` / `33100`
- Dataset SHA-256: `ec3c096d731cc10e426d290ef199b94ee706a47fcf15171a2466e26ad93e2e31`
- Formal environment `--check` and `--plan`: PASS, non-mutating

## Independent review result

The independent read-only reviewer rejected provisioning with one P1:

- `formal-environment.mjs` caught a failed `docker compose down`, then calculated
  `residualCount` only from enumerated resources. If teardown failed while the
  post-error inventory happened to be empty, the formal evidence gate could pass.

The review also found an evidence-semantics gap: `PROPERTY_PERF_BUSINESS_CLOCK`
was recorded in provenance but had no runtime binding. It therefore could not be
described as a frozen wall clock.

A second independent code review found that merely hashing the generated seed
manifest did not prove its embedded clock matched the executor configuration. A
stale manifest could therefore retain a valid hash while carrying the wrong clock.

## Remediation decision

1. A teardown error contributes one residual independently of resource counts.
   The cleanup artifact retains the scoped inventory and teardown error, so both
   the executor and standalone evidence gate fail closed.
2. The business clock is explicitly defined as the dataset cutoff/reference
   clock, not an operating-system time override. Provisioning binds the value to
   the seed manifest and all four measured containers. Before load generation,
   the executor parses the seed manifest, inspects every container, and rejects
   missing, stale, invalid-date, or mismatched values. The standalone gate also
   requires the manifest and all container bindings to equal the declared clock.
3. The change invalidates final-SHA evidence. CI and rollback evidence on
   `5f46e7dc` remain useful ancestor records only; all final gates must be rerun on
   the new commit.

## Targeted verification

```text
node --test formal-environment.spec.mjs formal-evidence-gate.spec.mjs
  formal-executor.spec.mjs load-worker.spec.mjs
PASS: 18/18

git diff --check
PASS

pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
PASS; API 1036 total / 1023 pass / 13 intentional skip, Web 64 pass,
Next.js production build 158 static pages
```

Third independent code review: APPROVE, `open P0/P1/P2=[]`.

Provisioning remains blocked until commit, push, and new-SHA CI/rollback complete.
