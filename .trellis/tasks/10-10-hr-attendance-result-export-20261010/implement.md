# Implementation and validation

Daily full-filter and selected monthly summary CSV use existing ScopedLedgerExport and server HR/team/self scope. No new API, permission, schema, source import, attendance mutation or payroll mutation. Export columns use explicit allowlists, Beijing punch timestamps, valid calendar dates, zeros/null/fractional days, escaped CSV formulas and pinned monthly version. Full identity/filter/period changes cancel export.

Validation: 233 HR contracts; full 96-file/717 interaction suite before adding two targeted scope/period-cancellation tests; final attendance interaction suite14 tests passed. Web typecheck and affected ESLint passed; diff check clean. Actual component browser desktop1275px no horizontal overflow;390px iframe shows stacked filters/shared44px button and101-row success feedback. Daily101 and monthly1 synthetic records exported through actual browser UI. Fixture server stopped and tabs closed. Synthetic browser proof does not establish production role/business acceptance.

Pending: integrate after #915 merge, focused checks on combined baseline, CI, ordered deployment, Docker cleanup and runtime SHA evidence. Live paged export is not an atomic snapshot or source-system report equivalence.

Integrated presentation correction: actual HR/team/self read scope owns daily heading; shared Chinese statuses cover all seven backend values in page/filter/CSV. Internal calculation UUID removed from ordinary record, corrected business flag retained. Source enums verified against migration000246; no backend or permission changes. Final actual browser desktop/390iframe confirms员工日考勤 and101-record success.

Latest baseline integration: rebased onto faf64d80a (#915); sole conflict was parent task children, resolved retaining both position and attendance tasks. Position route-contract changes retained. Combined HR233 and interaction97files/727 passed; typecheck and affected lint recorded separately. Existing browser evidence retained: affected attendance/global design/shared export code and dependency inputs unchanged by position-only baseline; no redundant browser fixture rerun. Own CI/deploy/runtime/role evidence remains pending.
