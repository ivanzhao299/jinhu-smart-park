# B2c 000197 preliminary v3 evidence change request

Status: implementation candidate, not frozen, not execution authority.

Candidate run ID: `b2c197_prelim_20260802b`.

## Failure boundary

The underlying approval PostgreSQL child failure in run
`b2c197_prelim_20260802a` remains **UNKNOWN**. The proven executor defect is the
evidence-loss mechanism: the v2 executor threw on a nonzero child result using
stderr only and did not persist the exact exit, signal, spawn error, stdout,
stderr or TAP bytes before throwing.

The accepted FAILED disposition and the two failure reviews remain audit-only:

- FAILED artifact: `452507c796060409a3e251100c35985f9a5d356a53e431db47df456f83a3244b`.
- FAILED manifest: `f40fe8f3e1322c385c3e05df1a91180d1763495c2d81de2c1fba8528504c8891`.
- Database failure review: `47fcc26b59d03133d7f69f8dee251ffdc63518eb5fa87b4a8c41ddc3d956be50`.
- QA/security failure review: `0a0afea12d32782febcdb67d0fe43b9e4bf64876539aecb7b1f160b9e1e67136`.

Old A/B are not eligible for another absent-path run and remain untouched.

## v3 subprocess evidence contract

Every subprocess owned by the next executor, including static checks, direct
Docker/psql probes, fixture compile/connect/before/test/after phases and the
approval child, must use one recorder:

1. Create a fresh run-scoped evidence directory; an existing directory fails
   closed.
2. Before spawn, write a `wx`/`0444` intent containing sequence, stage,
   redacted command/argv, cwd, explicit environment allowlist and stdin
   bytes/SHA intent.
3. Execute with only allowlisted environment keys.
4. Before validation or throw, write a separate `wx`/`0444` result containing
   exact exit code, signal, serialized spawn error, original stdout/stderr
   byte counts and SHA values, and redacted UTF-8 content.
5. Before TAP parsing can throw, persist raw TAP bytes/SHA and redacted raw TAP;
   persist either exact parsed counts or the parse error in a third immutable
   record.
6. On every top-level error, create immutable failure artifact and manifest
   before rethrow. On success, create independently reproducible success
   artifact and manifest.
7. Any intent, result, TAP, terminal artifact or manifest write failure fails
   closed. A child is never spawned if its intent cannot be persisted.

Redaction policy `b2c-000197-child-evidence-v3` forbids database URLs,
passwords, tokens, credentials and unallowlisted environment values. Original
secret-bearing bytes are represented only by byte count and SHA; persisted raw
text is the redacted form. Command records must never include the connection
URL or password.

## Approval fixture dependency

The approval owner independently owns the new run-scoped PostgreSQL fixture.
Before the executor can be integrated or frozen, its handoff must provide an
exact new PG spec SHA and prove:

- run-scoped table/function/trigger names;
- zero-owned-residue preflight;
- setup and tests protected by failure-tolerant `try/finally` cleanup;
- idempotent owned-object cleanup;
- post-cleanup zero residue, zero owned rows, zero open sessions/transactions;
- independently executable compile, connect, before, named-test and after
  phases whose command evidence can be captured separately.

No final v3 manifest may be created before that SHA is stable. New dedicated
container/volume identities and new independent reviews are also required.

## Current executable evidence tests

The provisional v3 recorder and spec cover 11 cases:

- intent exists with mode `0444` before spawn;
- compile/connect/before/test/after ordered envelopes;
- nonzero exit, signal and thrown spawn error;
- intent-write and result-write failures;
- URL/password/token/environment redaction;
- raw TAP bytes/SHA and parsed exact counts;
- TAP parse failure plus failure artifact/manifest before surfacing error;
- immutable reproducible success artifact/manifest.

Current result: 11/11 passed, zero skipped; ESLint and Node syntax passed.

These results validate only the generic evidence contract. They do not approve
live execution, database access, the future approval fixture, resource identity
or final v3 orchestration.
