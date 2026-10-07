# Contract salary incremental continuity

Carry verified probation/base salary decimal strings from the existing T2 projection into the same formal contracts. Do not replay historical imports or expand auth. Salary-bearing packages require existing contract and compensation management permissions at preview and commit, including explicit null. Preserve omissions, modern edits, immutable witnesses, replay/CAS and draft-only updates. Public summaries/actions omit amounts; salary reads retain existing permission.

Acceptance: actual builder and prepared-profile old/current recipe compatibility; strict canonical numeric(18,2) values; actual PostgreSQL create/update/replay/conflict/permission revocation/rollback; Web permission gating and desktop/mobile inspection; scoped checks, CI, latest-base merge, deployment/runtime/cleanup proof. No production business batch or payroll writes in this slice.
