# Synthetic allocation profile — 2026-09-06

Status: diagnostic PASS; real delegated freeze remains incomplete. No production
write, source extraction, key regeneration, deployment or full A/B run occurred.

## Reproduction and scope

Run `node .trellis/tasks/09-06-hr-exception-review-preparation/research/allocation-profile.mjs`
from this worktree root. The harness reuses the existing synthetic bridge fixture,
adds 50,000 synthetic contract types (50,016 total records), and instruments transient
module copies. It does not modify production modules or read private data artifacts.

Generator source SHA-256:
`38bc60c25c1b3f079cb273214401af1ccfa8f2741f6c4fe45419a656ba915b7f`.

Node child: 768 MiB old-space, 120-second timeout, 1 MiB output limit. RSS guard is
sampled at stage boundaries at 1.5 GiB, not a continuous hard OS memory limit.
The fixture itself remains in memory, so these numbers are not pure generator costs.

## Observed successful run

| Boundary | RSS bytes | Heap used bytes |
| --- | ---: | ---: |
| Synthetic fixture ready | 348995584 | 90299480 |
| Bridge parsed documents | 407486464 | 135674856 |
| Bridge envelopes ready | 479772672 | 164067768 |
| Generator validated documents | 492945408 | 195940856 |
| Generator indexed sources | 473268224 | 167648472 |
| Generated rows | 550273024 | 254638592 |
| Large T2 bundle object | 556580864 | 246398800 |
| Large T2 bundle serialized and hashed | 682065920 | 243699952 |
| Result retained | 682491904 | 296127912 |

Child resourceUsage maxRSS: 740688 KiB (approximately 723.3 MiB). This exceeds the
stage samples, showing that samples miss transient peaks. GC and allocator residency
affect deltas; a lower heap sample does not mean no allocation occurred.

Largest observed adjacent RSS increase was 125485056 bytes (about 119.7 MiB),
between the large bundle object and completion of its serialization/hash sequence.
That interval includes canonical JSON creation, payload-bundle hashing and artifact
hashing; this profile does not attribute the entire increase to one function.

The first probe failed before generator validation because the extended fixture
hashed staging records in append order instead of the bridge's phase order. One
fixture-only correction rebuilt that binding in T0/T1/T2/T3 order; the second run
passed READY with exactly 50016 generated records. No production invariant relaxed.

## Record-wise hash correction and comparison

The sealed hash now consumes canonical records individually. It does not reuse
the artifact hash: numeric object keys demonstrate that these canonicalizers can
produce different bytes. Independent old-algorithm tests cover nested numeric keys,
Unicode/escapes, empty records, sparse arrays, caller non-mutation and all generated
phase bundles. No authorization, target mapping, writer or limit was changed.

Sealed-plan source after correction:
`5e5d4ec8ffa54074fc63b061027571416c3e92116e0f631e828829f66ef1e7a9`.
Baseline sealed-plan source:
`1a46843db6d2ff0cc891c6b9a3764b3fc623c3310264063f41c423aaca37c46b`.

One post-change run of the same 50016-row fixture passed READY. MaxRSS was 625776
KiB (611.1 MiB), versus 740688 KiB (723.3 MiB): down 114912 KiB, about 15.5%.
Retained-result RSS was 640794624 bytes versus 682491904 bytes; the large T2
serialization/hash interval increased RSS from 536313856 to 640352256 bytes.
These are single-run observations, not a statistical or full-data guarantee.

Validation: generator and bridge direct contracts passed; six related Node test
suites completed 136 passed, 0 failed, 1 opt-in 65 MiB case skipped. Syntax and
diff checks passed. Local ESLint was attempted once but unavailable (`eslint` not
found); no dependencies were installed. No TypeScript files/configuration changed,
so application typechecking is deferred to normal PR CI, not claimed locally.

## Next single repair path

Publish the focused correction through normal PR CI. Before another full real run,
check the outer materializer/freeze retention with a bounded synthetic producer-shaped
fixture: this profile covered only bridge/generator, not the full failing delegate
route. Do not raise limits or re-extract real candidates to compensate for allocation.

This does not profile the outer materializer/freeze retention or reproduce the real
row-shape distribution. Full-data RSS, finalized authorization and production import
remain unverified. Sole-owner confirmation remains accepted.
