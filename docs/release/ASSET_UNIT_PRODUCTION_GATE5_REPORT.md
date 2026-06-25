# Asset And Unit Production Gate-5 Report

Date: 2026-06-25

## Executive Summary

Gate-5 verified the production asset master-data lifecycle for a controlled building, floor, and unit. The gate used real production API calls and database verification.

- Workflow: `Production Asset Unit Gate`
- Workflow run: `28153024982`
- Run ID: `gate5-asset-unit-20260625T070532Z`
- Result: PASS
- API base on production host: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`

## Controlled Production Records

- Building: `G5B0625070532`
- Building ID: `36c2414a-16a6-4ad3-a949-d6c8ee6a1c9f`
- Floor: `G5F0625070532`
- Floor ID: `97d7c2f4-1193-48e2-9f62-de7a89879df6`
- Unit: `G5U0625070532`
- Unit ID: `1ef7492c-e5fc-4f92-ad8d-169f2035fd76`

## API Evidence

- `POST /buildings`: PASS
- `POST /floors`: PASS
- `POST /park-units`: PASS
- `GET /buildings`: PASS
- `GET /floors`: PASS
- `GET /park-units`: PASS
- `GET /park-units/:id`: PASS
- `GET /park-units/statistics`: PASS
- `PUT /park-units/:id`: PASS
- `POST /park-units/:id/change-status`: PASS
- `GET /park-units/:id/status-logs`: PASS

## Database Evidence

- Controlled building persisted: 1
- Controlled floor persisted: 1
- Controlled unit persisted: 1
- Controlled unit rental status: 20
- Unit status logs: 1
- Unit audit logs: 2

## Readiness Impact

This gate proves that production can support:

- Controlled asset master-data creation.
- Building -> floor -> unit hierarchy.
- Unit detail and list lookup.
- Unit statistics.
- Unit update.
- Unit rental status transition.
- Unit status log and audit log traceability.

## Production Safety

- All writes used `G5*` controlled identifiers.
- No existing building, floor, or unit records were modified.
- No destructive operation was executed.
- No credentials were printed.

## Final Verdict

PASS: asset building, floor, unit, update, status transition, statistics, status logs, and audit trail are production reachable.

