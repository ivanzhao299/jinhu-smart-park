# Engineering Terminal Form UAT

Date: 2026-07-13

Scope: mobile engineering terminal form-level production readiness.

This UAT verifies that the mobile engineering terminal can create real records through the page UI, not only navigate between pages.

## Verified Flow

1. Login as `admin` through the API and create a dedicated UAT engineering project.
2. Login as `zheng_ziyong` through the API and seed the browser session.
3. Open the mobile engineering terminal at `/engineering/terminal`.
4. Use the `快速日报` drawer to submit a construction daily report.
5. Open `/engineering/inspections/new?projectId=<projectId>`.
6. Confirm the project selector is bound to the created project.
7. Submit a new engineering inspection record.

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

## Acceptance Criteria

- Quick daily report drawer opens on mobile.
- Daily report save returns a visible success message.
- Inspection create form opens with project binding preserved.
- Inspection save redirects to the created inspection detail page.
- The script exits with `PASS`.

## Side Effects

The script creates one UAT engineering project, one construction daily report, and one engineering inspection record in the target environment.

## Next Recommended UAT

1. Mobile rectification feedback and recheck form UAT.
2. Mobile acceptance create and review form UAT.
3. Production-domain replay after deployment.
