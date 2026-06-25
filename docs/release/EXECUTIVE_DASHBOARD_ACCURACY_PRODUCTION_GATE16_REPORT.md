# Executive Dashboard Accuracy Production Gate-16 Report

Date: 2026-06-25

## Verdict

PASS

Gate-16 verified that the executive dashboard is reachable in production, that its frontend metrics use live production API sources, and that the KPI API values match production database counts for the core operational surfaces.

## Run Evidence

- GitHub Actions run: `28160033420`
- Job: `83397950195`
- Commit under test: `60167cbf2f89163a65da4a5af24b08cdf3f575d7`
- Gate run ID: `gate16-executive-dashboard-accuracy-20260625T091923Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Production DB write: `false`

## Web Runtime Evidence

- `/dashboard` returned HTTP 200.
- Dashboard HTML rendered `24809` bytes.
- Production API health and web login routes were reachable before dashboard checks.

## Frontend Data Source Evidence

`apps/web/app/(dashboard)/dashboard/DashboardMetrics.tsx` references the live dashboard data APIs:

- `/assets/statistics`
- `/work-orders/stats`
- `/safety/statistics`
- `/iot/dashboard`
- `/energy/dashboard/overview`

The gate also verifies `/video-security/dashboard/overview` as a production dashboard API surface.

## DB / API Cross-check Evidence

| Area | DB/API Field | Value | Result |
| --- | --- | ---: | --- |
| Assets | `summary.total_units` | 80 | PASS |
| Assets | `summary.rented_units` | 30 | PASS |
| Assets | `summary.expiring_units` | 0 | PASS |
| Work orders | `summary.total_count` | 5 | PASS |
| Work orders | `summary.pending_count` | 3 | PASS |
| Work orders | `summary.in_progress_count` | 0 | PASS |
| Work orders | `summary.overdue_count` | 0 | PASS |
| Safety | `summary.hazard_total` | 4 | PASS |
| Safety | `summary.hazard_open_count` | 3 | PASS |
| Safety | `summary.hazard_closed_count` | 1 | PASS |
| Safety | `summary.major_hazard_count` | 0 | PASS |
| IoT | `summary.total_devices` | 4 | PASS |
| IoT | `summary.online_devices` | 2 | PASS |
| IoT | `summary.offline_devices` | 2 | PASS |
| Energy | `summary.meter_count` | 3 | PASS |
| Energy | `summary.electric_meter_count` | 3 | PASS |
| Energy | `summary.water_meter_count` | 0 | PASS |
| Energy | `summary.gas_meter_count` | 0 | PASS |
| Video | `camera_total` | 1 | PASS |
| Video | `online_count` | 1 | PASS |
| Video | `offline_count` | 0 | PASS |

## Scope Notes

- This gate was read-only.
- No migration was executed.
- No production business data was inserted, updated, moved, or deleted.
- No deployment was required for this documentation-only gate run.
- The gate improves confidence that the production executive dashboard is backed by real operational data instead of static display values.

## Final Verdict

PASS: Executive dashboard routes, frontend data sources, production API responses, and production DB counts are aligned.
