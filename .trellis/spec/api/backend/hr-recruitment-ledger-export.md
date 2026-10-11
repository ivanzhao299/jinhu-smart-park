# Recruitment complete ledger exports

GET /hr/recruitment/requisitions/export accepts keyword/status and requires HR_REQUISITION_READ or HR_REQUISITION_TEAM_READ. GET /hr/recruitment/candidates/export accepts keyword/stage and requires HR_CANDIDATE_READ. Runtime DTO validation rejects pagination, unknown fields/enums and keywords longer than100. Static export routes precede dynamic ID routes.

Service checks principal tenantId/parkId against scope before any query. Reuse list SQL builders, public/masked SELECT projection and create_time DESC,id ASC ordering; keep existing ILIKE wildcard semantics and manager org-tree predicate. Dates are calendar text. Count and rows share joins to avoid foreign reference mismatches. Candidate export never uses sensitive detail or decrypts contact/identity.

One REPEATABLE READ transaction obtains canonical UTC millisecond snapshotAt and LIMIT5001 rows. <=5000 returns items,total=items.length,snapshotAt; >5000 rejects explicitly. Required sensitive-read audit completes before response; failure returns no snapshot. No business writes or DB migrations.

Disposable isolated PostgreSQL test must actually run opt-in HR_RECRUITMENT_LEDGER_EXPORT_PG_REQUIRED=1 before release: verify21 rows versus paginated20, empty, scope/permissions/team tree, masked allowlist/date, stable order, independent writer commit after snapshot establishment, exact5000 and5001 rejection, audit failure, and owned-container cleanup. Minimal fixture proves query mechanisms, not full production schema restore or real role acceptance.
