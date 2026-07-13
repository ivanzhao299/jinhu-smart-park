# Engineering Terminal Form UAT

Date: 2026-07-13

Scope: mobile engineering terminal form-level production readiness and role-separated engineering closed loop.

This UAT verifies that the mobile engineering terminal can create and advance real records through the page UI, not only navigate between pages.

## Verified Flow

1. Login as `admin` through the API and create a dedicated UAT engineering project.
2. Login as field engineer `zheng_ziyong` in a 390 x 844 mobile browser.
3. Use the `快速日报` drawer to save a construction daily report.
4. Open `/engineering/inspections/new?projectId=<projectId>`, confirm project binding and save an inspection.
5. Create an inspection issue and generate a rectification through the real API boundary.
6. Let the field engineer start rectification and submit feedback through the mobile terminal.
7. Let `admin` start recheck, pass and close the rectification through the same mobile terminal.
8. Let the field engineer create a stage acceptance through the quick acceptance drawer.

This split is intentional: field execution users cannot perform management recheck or close actions, and the UAT proves that the backend state machine and RBAC boundary remain effective.

No password or secret value is written to the report.

## Command

```bash
pnpm go-live:uat-engineering-terminal-form -- \
  --web-base http://127.0.0.1:4320 \
  --api-base http://127.0.0.1:4330/api/v1 \
  --screenshots-dir /tmp/jinhu-engineering-terminal-form-uat
```

## Output

Machine-readable local report:

- `database/import-reports/engineering-terminal-form-uat-report.local.json`

Screenshot evidence:

- `/tmp/jinhu-engineering-terminal-form-uat/quick-daily-report-success.png`
- `/tmp/jinhu-engineering-terminal-form-uat/inspection-create-success.png`
- `/tmp/jinhu-engineering-terminal-form-uat/rectification-feedback-success.png`
- `/tmp/jinhu-engineering-terminal-form-uat/rectification-closed-success.png`
- `/tmp/jinhu-engineering-terminal-form-uat/acceptance-create-success.png`

## Acceptance Criteria

- Quick daily report drawer opens on mobile.
- Daily report save returns a visible success message.
- Inspection create form opens with project binding preserved.
- Inspection save redirects to the created inspection detail page.
- Rectification progresses through `PENDING -> IN_PROGRESS -> SUBMITTED -> RECHECKING -> PASSED -> CLOSED` with two actors.
- Field users cannot bypass the recheck permission boundary.
- Acceptance creation returns a visible success result and a persisted acceptance code.
- The script exits with `PASS`.

## Side Effects

The script creates one UAT engineering project, one construction daily report, one inspection, one issue, one rectification and one acceptance in the target environment. The rectification is closed during the same run.

## Latest Result

Local production-container replay on 2026-07-13:

- Status: `PASS`
- Project: `GC20260713009`
- Daily report: `GCRB20260713005`
- Rectification: closed after role-separated feedback and recheck
- Acceptance: `GCYS20260713004`
- Warnings: `0`
- Failures: `0`

The remaining release activity is deployment-domain replay, not additional mobile feature development.
