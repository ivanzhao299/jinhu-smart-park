# Yuzhou T5 unowned dynamic history archive

## Goal

Preserve `dbo.his` dynamic-history rows as unowned compatibility archive
records instead of dropping them into quarantine, while retaining the strict
prohibition on treating them as employee experience without source ownership
evidence.

## Requirements

- The source-proven 375 `dbo.his` rows remain linked only to `histitle`; they
  have no employee owner column or foreign key and must retain `employee_id`
  as null.
- Store only through the existing immutable `hr_legacy_t5_record` path with
  source identity/row hashes and `mapping_status=not_applicable`.
- Do not create or update `hr_employee`, employee experience/profile, files,
  compensation, payroll, payslips, performance, or messages.
- Remove only the classifier branch that forces `dbo.his` into
  `HISTORY_OWNER_UNRESOLVED`; retain all other employee ambiguity and missing
  mapping quarantines.
- Document the semantic boundary and cover it with a contract plus isolated
  database behavior test. Production import remains HOLD.

## Acceptance Criteria

- [ ] A `dbo.his` source row is loaded only as unowned `experience` archive
      evidence with no employee projection or side effects.
- [ ] A normal employee-owned row still requires exact T0 mapping, and all
      existing ambiguity/missing-owner quarantines remain fail-closed.
- [ ] Rollback removes the unowned archive record and its active mapping.
- [ ] No source values, credentials, or production data are printed or used.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
