# Approved Employee Rehire

Use the existing onboarding aggregate for an employment cycle after departure.
`entryType` defaults to `initial`; `rehire` is an explicit choice. Do not widen
`resume` to accept departed employees or create a duplicate employee.

- Rehire requires an existing, scoped, non-deleted `departed` employee, a positive
  `expectedEmployeeVersion`, enabled target organization/position in the same
  scope and a target manager UUID or explicit null. A selected manager must be a
  scoped current employee and cannot be the subject employee. Recruitment
  candidate conversion is not part of rehire.
- The existing controller permissions remain in place. In addition, rehire
  create/update/submit/cancel/confirm require employee management and employment
  transition authority. Review still requires a separate actor from the maker.
- Dates are real YYYY-MM-DD calendar dates. Planned hire cannot precede the
  application, must follow a known previous departure, and cannot take effect
  before that date in Asia/Shanghai. Missing historical departure dates do not
  invent a date or exclude the employee.
- Draft edits/returned refreshes capture a minimal original employment snapshot
  and the expected employee version. Submitted assignment/version/snapshot and
  aggregate entry type cannot be rewritten. Revalidate version, status and target
  references on approval and confirmation. Cancel a stale approved rehire and
  create a refreshed request; cancelled/confirmed records remain immutable.
- Confirmation locks the application and employee; update the employee with scope,
  deletion and version predicates. Unwrap TypeORM RETURNING, require one row with
  the incremented version, and append employment event/application action and
  advance application status in the same transaction. Any later failure rolls
  everything back. Existing HTTP idempotency stays on all write routes.
- Current hire date becomes the new cycle start; current departure date is cleared.
  Historical hire/departure/organization/position/manager facts remain in immutable
  before snapshots. Apply the explicitly chosen current assignment and manager.
  The employee ID/code, user binding, contracts, payroll and roles are not recreated
  or automatically changed.
- Existing initial onboarding still accepts its original request shape and
  preboarding-only confirmation. Finished applications no longer reserve the
  unique active employee/card slot. The employee card uniqueness remains in force.

The manage-only `GET /hr/onboarding-applications/rehire-options` also enforces
employee management/transition authority. Employee/manager choices are scoped,
searchable and paginated with bounded page size. Return only identity labels,
version and employment-date/assignment references; no contact, credentials or
full employee profile. Application lists expose scoped current assignment labels
and maker identity, and accept exact employee and entry-type filters.

Required tests: DTO conditional requirements; real PostgreSQL applying 000269 and
000345; concurrent confirmation; repeated employment cycles; maker/checker;
permission/scope/date/assignment validation; stale approval cancellation; returned
refresh; initial onboarding regression; append/effect failure atomic rollback.

The former client entry `client.employment_change.004` has pending behavioral
observation. This modern workflow is not evidence of complete historical rule
parity. UI and production role acceptance must be separately recorded.

## Application receipt version

The existing application list selects the persisted `a.version`; the shared
mutation projection returns that same stored value from `RETURNING`. Do not
derive an application version from the employee version or invent a client
increment. Public create/update/action/review/confirm tests must exercise the
projection through their transaction entry points, including the existing
application-action audit and employment event on confirmation. This read
projection adds no schema, backfill or state-machine rule.
