# Bounded development entry

Before edits read exact current affected code. Manifests avoid oversized injected indexes, but the implementer must explicitly read full relevant pre-development checklists/indexes using bounded chunks and the referenced relevant guidelines: .trellis/spec/api/backend/index.md, .trellis/spec/web/frontend/index.md, .trellis/spec/shared/backend/index.md, .trellis/spec/guides/index.md. Read task prd/design/implement in full. Do not treat automatic truncation as compliance.

Known patterns: apps/api/src/modules/hr/hr-goal-report.service.ts and hr-goal-report.controller.ts, HrService approval transaction/audit and myEmployee binding, shared/hr.ts permissions and Web existing HR approvals. Read actual code before choosing reuse. No forced parallelism or new agents. Single implementer owns feature repository files after dispatch; root will only handle private checkpoints and later review/browser/release.

Source121/123/122/124 names/routes are observed. Modern minimal flow is explicitly designed here, not inferred old rule parity. No source raw business rows required.
