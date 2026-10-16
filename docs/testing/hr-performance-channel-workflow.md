# Five-channel workflow validation

Local implementation uses forward migration000372 after committed371. It preserves source/core migrations and exposes complete modern workflow operations. These checks do not establish production migration/runtime, actual employee authority, source qualification, actual July trial or approved payroll.

Run from the verified worktree after building its own shared package:

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api exec env HR_PERFORMANCE_CHANNEL_WORKFLOW_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-performance-channel-workflow.pg.spec.ts src/modules/hr/hr-performance-channel-workflow.spec.ts
pnpm --filter @jinhu/api exec env HR_PERFORMANCE_CHANNEL_DEFINITION_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-performance-channel-definition.pg.spec.ts
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api build
```

TRANSPILE_ONLY is the repository's node-test loader setting, separate from mandatory final TypeScript checking. The required PG flag turns missing Docker/startup/migration into failure. The fixture creates a unique labelled PostgreSQL16 tmpfs container with a random loopback port, checks name+label on cleanup and uses nested finally cleanup even if app/connection closing fails. It never connects to shared/production databases.

The HTTP harness supplies synthetic authenticated principals, while database users, roles, role bindings, permissions, immutable guards, ValidationPipe, PermissionGuard, IdempotencyInterceptor and audit persistence are real. It exercises full self→manager→calibration→ack/appeal→confirmed, selected correction, partial finalization, original-request replay, concurrent CAS, explicit NULL, precision and live role/permission revocation. It also runs an original published dimension version through the full lifecycle after372. It compares immutable source rows, source/core function definitions+ACL and the pre-upgrade published version; these bounded comparisons do not rerun legacy source equivalence/import suites.

Sensitive cases include salaryReference999999999999999.9999 roundtrip; complete omission from unauthorized current/history; no amount in action/result/review or persisted audit payloads; employee early preview:null and forbidden independent preview. Full grade descriptions500/code64 and101details/41candidate adaptation/ambiguity are checked without truncation. Source S/M/T/X/C roles come from explicit configuration only.

The eleven actor FK replacements are: definition_revision.created_by; workflow_revision.created_by; input_revision.created_by; review_submission.actor_user_id; calibration_batch.created_by/completed_by; calibration_participant.participant_user_id; calibration_entry.actor_user_id; appeal.submitted_by/resolved_by; review_action.actor_user_id. Each now references sys_user(id); the unified guard enforces same tenant and new author selected-park context. The guard also covers template.create_by/update_by, template_version.create_by, cycle.create_by/update_by and evidence_reference.create_by, which had no relevant prior user FK. Business version/cycle/review/input/employee composite FKs remain intact. Historical inactive authors remain valid on unrelated updates. No auth tables, indexes, roles or grants are changed. Runtime role EXECUTE is checked using current_user, with no assumed identity or broadened ACL.

Raw logs, terminal handles, hashes and provenance are private under `/Users/mac/.codex/artifacts/hr-performance-channel-workflow-20261016` (directory0700/files0600); final handoff records terminal results. Final UI/component acceptance is delivered by the disjoint Web child, native desktop/390px and release are root-owned. Keep actual July trial NOT_EXECUTED until independently authorized and completed.

The original definition PG/HTTP suite remains required with current258/259/371/372 and actual database role/permission rows. It preserves strict full-config,101/41, CAS/idempotency, one-statement history and source/frozen-version checks, and covers the first paired workflow save on an existing definition-only draft. Synthetic authentication does not replace database authorization.

Direct SQL regression rejects an initial confirmed cycle/review and injected initial self/final scores, final revision, grade evidence or completion timestamps. Normal publication initializes blank reviews then appends their input baseline in the same transaction; historical dimension lifecycle remains covered.
