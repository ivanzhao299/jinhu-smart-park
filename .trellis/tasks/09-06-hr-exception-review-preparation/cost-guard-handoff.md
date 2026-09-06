# Current memory blocker and cost guard

Status: COST_GUARD / full delegated freeze incomplete. Single accountable owner
confirmation remains accepted. No production historical data write occurred.

## Verified state

- Memory repair PR #660 merged at fb9f6afc56fb254964e76e5f1db91c8db601ace1;
  main CI 34017477973 and deployment 34017477966 succeeded, cleanup confirmed.
- Later main 9a00c856 changed documentation only and skipped application deployment.
  Diagnostic 34021020096 correctly failed revision matching; that document SHA must
  not be used as the application runtime SHA or trigger needless data regeneration.
- Fixed merged application ref: codex/hr-memory-verification-v1. Read-only runtime
  observation 34021111134 matched both API/Web to fb9f6afc. Target inventory
  34021119798 matched that C, the same target/scope and 16 tables/19 metadata rows.
- Current candidates: 260,828 = 260,781 inserts + 47 quarantine; zero skip/collision.
  T3 candidate preparation sampled peak RSS 633,110,528 bytes. Source/semantics and
  prior 47 nonempty projections were verified and reused, not re-extracted.

## Attempts and actual failures

1. Initial prepare (old-space 1,536 MiB) exceeded the 2 GiB guard at 2,185,199,616
   bytes. Lowering old-space to 768 MiB completed prepare, but full delegate exited.
2. PR #660 removed redundant private bridge graph/byte copies; focused tests passed
   (102 tests plus bridge/generator commands), but this did not prove real-data RSS.
   On the merged application version, prepare completed for 47 rows at sampled
   RSS 2,117,484,544 bytes. Delegate with old-space 1,024 MiB hit the unchanged 2 GiB
   guard at 2,153,889,792 bytes and received SIGTERM. No completion/signature/one-time
   authorization receipt was produced. Private receipt records the failed attempt.

Do not repeat the same run, increase the resource limit, regenerate keys, re-extract
sources, rerun A/B, discard failed evidence or claim this repair solved the blocker.

## Focused root-cause audit / next path

Static evidence: the private materializer retains full phase/candidate byte buffers;
freeze retains parsed candidates/staging/evidence while serializing complete decision
wrappers for the bridge. The generator still clones staging/decision rows and builds
both complete payload and plan-record arrays. Bridge clone removal therefore did not
remove simultaneous whole-dataset residency. This is the leading allocation cause,
not a demonstrated production DB, credentials or disk failure. No precise failing
allocation stage has yet been measured.

The bounded synthetic bridge/generator profile is now complete: 50,016 records,
READY, maxRSS 740,688 KiB. Its largest sampled adjacent RSS increase was about
119.7 MiB during large-bundle serialization and hashing. See
`research/allocation-profile-result.md` for measurements, fixture repair and limits.
This is not a real full-data or outer materializer/freeze memory acceptance result.

Record-wise sealed bundle hashing is implemented with independent old-byte/hash
equivalence tests. Same synthetic profile passed: maxRSS 625,776 KiB (15.5% below
the baseline), not full-data acceptance. Generator/bridge contracts and 136 related
tests passed; one opt-in large test skipped. Local ESLint unavailable, no reinstall.

Next: normal PR CI for this focused correction, then bounded synthetic measurement
of the outer materializer/freeze retention before another real full-data attempt.
Do not keep retrying the real 260k-row chain on the strength of a smaller bridge-only
fixture. Keep the full product goal open; sole-owner authority remains accepted.
