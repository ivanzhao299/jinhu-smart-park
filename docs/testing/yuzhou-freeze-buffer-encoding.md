# Candidate freeze buffer encoding

The candidate freeze bridge previously canonicalized each complete wrapper into
a cloned object and a whole-document string before hash validation and parsing.
`encodeFrozenArtifactBytes` now reuses the payload generator's canonical token
writer in two synchronous passes: measure UTF-8 length, then fill one Buffer.
It preserves numeric object-key ordering, UTF-8 escaping, trailing newline and
the existing invalid-value rejection behavior. No source, decision, signature,
target-scope or bridge validation is removed.

Focused checks:

```sh
node --test scripts/e2e/yuzhou-production-import-buffer-encoding-contract.mjs scripts/e2e/yuzhou-production-import-candidate-freeze-contract.mjs scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs
node scripts/e2e/yuzhou-production-import-generator-ownership-contract.mjs
```

These contracts establish byte/hash parity and existing freeze/exception behavior.
They do not establish that the full retained dataset fits within the memory limit.
That claim still requires a bounded real-size preparation run with a new process
receipt after candidate code binding is established. Production import remains HOLD.

## Retained-data diagnostic, 2026-09-17

A diagnostic-only call to the pure delegated finalizer used the retained T0–T3
inputs (260,828 candidate records; 1,608 reviewed quarantines), without emitting
execution/authorization artifacts or changing their old code bindings.
At a 768 MiB V8 heap limit and 2 GiB RSS guard it terminated with SIGABRT / heap
exhaustion after 13.2 seconds. Sampled peak RSS was 1,583,856 KiB; the RSS guard
did not trigger. This is a failed memory validation, not a production receipt.

The buffer optimization alone is insufficient. The next bounded root-cause
analysis must address retained candidate/staging graphs and the bridge's second
parse before another full-size attempt. Do not publish this change as a complete
memory fix or rerun the unchanged workload as a retry strategy.

The second bounded diagnostic added `evidenceMode: "non_insert"` for exception
finalization only. All candidates still undergo validation; default freeze callers
retain full evidence. Temporary row/reference indexes and staging rows are released
after validation and wrapper hash construction. The focused suite now has 32 passing
tests, including equivalent bridge/wrapper output and corrupted-input rejection.
Nevertheless the real-size diagnostic still exhausted the 768 MiB heap after 22.7
seconds (sampled peak RSS 1,800,032 KiB). Neither optimization proves completion.
Two attempted fixes have now failed the real-size criterion: stop speculative edits
and collect content-free stage/memory measurements before the next implementation.

## Stage diagnosis and completed diagnostic

Content-free stage counters located failure after bridge parsing and generator
indexing, at payload generation entry (about 673 MiB live heap). Exception-only
finalization now also opts out of retaining wrapper records after their encoded
bytes exist. Default callers still receive wrappers and full evidence; all source,
relationship, crypto and generator checks run in both modes. Tests compare bridge
output equality and reject invalid mode values and corrupt inputs.

The 768 MiB heap / 2 GiB RSS limit was a diagnostic budget, not a production
requirement. After checking the 16 GiB host and 59% system-reported free-memory
percentage, one diagnostic used a 1,536 MiB heap / 3 GiB RSS cap. The complete pure
delegated finalizer passed on retained inputs in 25.0 seconds, with sampled peak
RSS 2,861,024 KiB, no heap exhaustion and no guard trigger. No execution artifacts,
authorization artifacts or production writes were emitted. This proves the local
diagnostic path at that budget, not a new-code production authorization or a formal
current-commit materialization receipt. The latter remains required before import.
