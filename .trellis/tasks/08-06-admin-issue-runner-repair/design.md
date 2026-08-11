# Technical design

## Boundaries

```text
Smart Park Web
  -> Smart Park Admin Issue API (authoritative issue/evidence record)
  -> Studio managed-project adapter
  -> existing Goal / Planner / Task Graph / Scheduler / Worker / Runtime
  -> Smart Park CI/CD
  -> Smart Park Admin Issue API result projection
```

Smart Park owns issue intake, tenancy, approval intent and user-visible progress. Studio owns execution. No second task queue is created inside Smart Park; the Runner endpoint is a lease-protected projection of approved issues for the existing Studio adapter.

## Data model

`admin_issue_reports` extends the repository's auditable tenant/park entity. It stores issue identity, reporter, route/client evidence, approval, execution projection, lease fencing token/version and release evidence. Status and Runner status are constrained by database checks.

## API contract

- `POST /admin-issues`: authenticated issue creation, replay-safe.
- `GET /admin-issues/mine`: current reporter's scoped records.
- `GET /admin-issues`: management projection.
- `PATCH /admin-issues/:issueNo/triage`: admin classification and approval.
- `GET /admin-issues/runner/ready`: service-account projection of approved work.
- `POST /admin-issues/:issueNo/runner/claim`: atomic claim with fencing token.
- `POST /admin-issues/:issueNo/runner/result`: evidence-gated result writeback.

## Security and rollout

Every authenticated user can create and read their own reports; permissions separate scope-wide read/manage/runner operations. Tenant and park scope are mandatory. Client context is bounded and credentials are never persisted. The UI entry and Runner adapter can be disabled independently without deleting issue evidence.
