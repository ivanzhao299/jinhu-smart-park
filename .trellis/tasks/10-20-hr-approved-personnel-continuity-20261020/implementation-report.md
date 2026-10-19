# Complete approved personnel business chain

Implemented an explicit owned dual-runtime scenario using four normal narrow identities: employee, actual department leader, HR fulfiller and independent reviewer/applier. Preparation uses normal administration and employee lifecycle APIs only; business requests never use the provisioner. Exact fixture credentials and identifiers remain in a private local configuration, outside Git.

Actual page verification exposed a product defect: raw PostgreSQL date values became timestamp responses, breaking the modern client's exact write receipt check and the future-effective-date guard. Job-change list/detail/locked reads now preserve SQL calendar dates; apply compares against the database Shanghai business day before mutation. The lifecycle statistics default uses the existing Web business-date utility and presents continuous employment totals without old/new-source KPI separation.

## Verification

- Actual dual-runtime normal-role HTTP: eight stages, zero skipped. Includes return/revision/resubmit, approved profile patch and explicit clear, unchanged field preservation, original-key replay/new-key duplicate refusal, linked job-change review/apply, exact target/self readback, unique event/action history, same-day success and future refusal with no mutation.
- Existing focused PostgreSQL/contract tests: 9/9, including maker/checker and assignment/status drift rollback. Explicit newly owned integrated database; no use of default15432 or other tasks' resources.
- Web interactions: 34/34. Lifecycle/business-date contracts: 6/6. API and Web lint/typecheck passed; API build passed. Independent full-scope review is recorded in `check-review.md` with current source hashes.
- Actual CUA modern pages: desktop and390px. HR saved a formal profile field; employee created/submitted an application, saw formal assignment and had no profile-maintenance form; original manager no longer saw the transferred employee. Exact job link/history and approved source receipt links were exercised. Phone document and scroll widths were both390px.
- Full logs, failed attempts and screenshot hashes: private artifact directory `/Users/mac/.codex/artifacts/hr-approved-personnel-continuity-20261020/owned-026ddb4641`. Local synthetic UI/HTTP acceptance does not replace production real-role or source parity acceptance.

## Retained boundaries

No production business data, roles, catalog, schema or historical source was changed during these checks. Full HR completion, actual July payroll trial/signoff, source Windows/GroupWeb parity and production real-role acceptance remain open. Release/runtime evidence is tracked separately in the task checkpoint.
