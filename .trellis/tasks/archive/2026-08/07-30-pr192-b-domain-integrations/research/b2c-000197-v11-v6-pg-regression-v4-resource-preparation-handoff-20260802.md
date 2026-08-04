# B2c 000197 v11-v6 PG regression v4 resource preparation handoff

Status: `BLOCKED-AWAITING-ROOT-CREATED-BASELINE-AND-DEDICATED-PG16-IDENTITY`.

This document prepares the resource-authority package only. It does not authorize or
perform Docker, PostgreSQL, runner, cleanup, or evidence-root operations. Existing v4
candidate, reviews, runner, spec, and static evidence remain immutable.

## Frozen v4 inputs

- Runner: `scripts/e2e/property-remediation/track-b2c-000197-v11-v6-isolated-pg-regression-v4.mjs`,
  bytes `19845`, mode `0444`, SHA-256
  `a15fd1c2c6df7276ae0bf3c7f0e5a31a91a22eb6153138e9ffd13bc487b9b2c1`.
- Runner spec: `scripts/e2e/property-remediation/tests/b2c-000197-v11-v6-isolated-pg-regression-v4.spec.mjs`,
  bytes `14518`, mode `0444`, SHA-256
  `269a267ce490598f4eb1e306388ce97b5b324216cb7b69902712f7ba1a0fcc58`.
- Candidate authority SHA-256:
  `34d5a90e0457a39895acb18bda8811fb85a6c437353838d8fed6c00dd04834d3`.
- Candidate manifest SHA-256:
  `e94075d6178ec21f6f4f8a104bf4ab07263cb409ef9883b7ea11f7cfbb47813f`.
- Independent database GO SHA-256:
  `5534bfbc6bb79d5e4d9a1744718aa9bf7a70adedb381fd21ba71a3bc3a1a96f9`.
- Independent QA GO SHA-256:
  `ca38e0873418d5e242ed0565ffa7330cf1a0bee938182481e1df9c37d0dbcf63`.
- Migration `000197` SHA-256:
  `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`.

The fixed future resource-authority path is:

`/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-v6-pg-regression-v4-resource-authority-20260802.grammar`

That path must remain absent until every dynamic field below is known. A placeholder at
the fixed path would fail closed and must not be created.

## Canonical old-baseline SQL

No immutable old-baseline `.sql` currently exists in the repository or retained B-2c
research artifacts. The v4 runner reads one absolute, regular, non-symlink, mode-`0444`
file and sends its exact bytes once to `psql` stdin. A JavaScript loader candidate is not
a valid baseline path.

The baseline must be materialized as one self-contained SQL file from the already frozen
composition in
`.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-v11-gh-loader-candidate-v1-20260802g.mjs`
(SHA-256 `a5233310bc939e192feb4477abd56aa926da9b813e43ac2fe7606c24bb150d27`):

1. All `database/migrations/*.sql` whose six-digit number is at most `000182`, sorted by
   filename, excluding `000175`.
2. `database/seeds/000001_s1_production_core.sql`.
3. `000183_property_business_granular_rbac.sql` and
   `000184_property_workbench_read_permissions.sql`.
4. The exact two-tenant/two-park/module/permission fixture transaction from the frozen
   G/H loader candidate.
5. The exact `sys_schema_migration_history` and `schema_migrations` bootstrap from that
   candidate.
6. Exact migration bytes for `000185` through `000190`, then `000193` through `000195`.
   After each file, include the candidate's matching primary/mirror succeeded-history
   record using the file's current raw SHA-256.

The resulting old state must have exactly nine succeeded rows in both histories for
`000185`–`000190` and `000193`–`000195`; `000191`, `000192`, and `000197` must be absent;
`biz_property_approval_request` must be empty; the old active-source index and predicate
must hash respectively to
`89d630118eeeab3655fffe97cde034d82567c1e253c543f9a33a7a8420768584` and
`d47740fefda3dc305edc9f845c359dfae15d6d9fa1c28a096870870129563a37`;
`uq_biz_property_approval_request_active_source_v4_build` must be absent.

Root must choose a new absolute research path containing the unique run ID, materialize
the bytes without executing them, set mode `0444`, and record exact bytes plus SHA-256.
The baseline path and SHA cannot be inferred or prefilled before this step.

## Dedicated resource creation requirements

Resource creation requires separate user/root authorization. The create operation must:

- use a new unique run ID matching
  `^b2c197_v11v6_isolated_[a-z0-9_]{8,40}$`;
- use a new container matching
  `^jinhu-b2c197-v11v6-isolated-[a-z0-9-]{8,40}$`;
- use a new database matching
  `^jinhu_b2c197_v11v6_isolated_[a-z0-9_]{4,30}$`;
- use PostgreSQL 16 only, one new anonymous volume at
  `/var/lib/postgresql/data`, and no `--publish`, `-p`, or `-P` host-port option;
- omit named/shared volumes and compose projects; never reuse production, shared, A–H,
  or any retained formal-failure resource;
- keep the password outside argv, logs, committed files, resource authority, and
  evidence; use only a runtime-scoped secret channel;
- use absolute `/usr/bin/docker`, a pinned locally verified PostgreSQL 16 image identity,
  explicit arguments, and no `shell: true`;
- stop on create/readiness/inspect failure, preserve any created resource for audit, and
  perform no retry or cleanup unless separately authorized.

After creation, root must obtain one exact read-only inspection proving: full 64-hex
container ID, running state, no host port bindings, exactly one anonymous read-write
volume, full 64-hex volume name, correct mount destination, exact database name, and
PostgreSQL major `16`. These observed values, not planned placeholders, populate the
resource authority.

## Exact resource-authority grammar

Only after the baseline and resource identities exist may root create the fixed authority
path with exactly this schema and field set:

```text
b2c-000197-v11-v6-pg-regression-v4-resource-authority-v1
run_id	<unique validated run ID>
container	<unique validated container name>
container_id	<observed full 64-hex container ID>
database	<unique validated database name>
volume	<observed full 64-hex anonymous volume name>
postgres_major	16
baseline_path	<absolute canonical 0444 baseline SQL path>
baseline_raw_sha256	<exact baseline SHA-256>
dedicated	true
anonymous_volume	true
host_port_bindings	0
status	READY-AFTER-INDEPENDENT-GO
candidate_authority_raw_sha256	34d5a90e0457a39895acb18bda8811fb85a6c437353838d8fed6c00dd04834d3
database_review_raw_sha256	5534bfbc6bb79d5e4d9a1744718aa9bf7a70adedb381fd21ba71a3bc3a1a96f9
qa_review_raw_sha256	ca38e0873418d5e242ed0565ffa7330cf1a0bee938182481e1df9c37d0dbcf63
```

The completed file must be an absolute regular non-symlink path, mode `0444`, with exact
bytes and SHA recorded before intake. Do not alter the candidate or either GO review to
insert later resource fields.

## Future intake and evidence handoff

The unchanged v4 runner accepts exactly five environment keys:

- `B2C_000197_V11_V6_PG_V4_EXECUTE=1`
- `B2C_000197_V11_V6_PG_V4_RUN_ID=<resource run_id>`
- `B2C_000197_V11_V6_PG_V4_RESOURCE_SHA=<completed resource authority SHA>`
- `B2C_000197_V11_V6_PG_V4_DATABASE_REVIEW_SHA=5534bfbc6bb79d5e4d9a1744718aa9bf7a70adedb381fd21ba71a3bc3a1a96f9`
- `B2C_000197_V11_V6_PG_V4_QA_REVIEW_SHA=ca38e0873418d5e242ed0565ffa7330cf1a0bee938182481e1df9c37d0dbcf63`

The runner derives its exclusive evidence destination as
`b2c-000197-v11-v6-pg-regression-v4-evidence-<run_id>` under the B-2c research directory.
That path must be absent before the single invocation. The runner itself writes immutable
child intent/result files, a non-reusable terminal, and a terminal manifest. It performs
no retry and no cleanup, and the dedicated resource remains retained after success or
failure.

Before future execution, the handoff must record exact SHA/mode/bytes for the baseline,
resource authority, runner, spec, candidate authority/manifest/test record/handoff,
database GO, QA GO, index contract, failure cases, and `000197`; it must also state that
resource creation and runner execution are separately authorized events. No success or
formal GO may be claimed from this preparation document.
