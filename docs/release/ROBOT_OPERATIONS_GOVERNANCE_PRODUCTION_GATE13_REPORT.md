# Robot Operations Governance Production Gate-13 Report

Date: 2026-06-25

## Executive Summary

Gate-13 passed in production.

The gate verified a governed local cleaning robot operations path:

1. Local cleaning robot registration.
2. Robot list and detail read surfaces.
3. Platform config read surface.
4. Read-only command dry-run.
5. Real-control command dry-run with proposal-required governance.
6. Region-clean command dry-run with proposal-required governance.
7. Command log persistence.
8. No external vendor call.
9. No robot credential storage.
10. Operation audit logs.

## Workflow Evidence

- GitHub Actions run: `28158218785`
- Workflow: `production-robot-operations-governance-gate.yml`
- Script: `scripts/production-robot-operations-governance-gate13.sh`
- Run ID: `gate13-robot-operations-governance-20260625T084649Z`
- Production API base: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`
- Selected unit: `A1-F01-U01` / `A1 1F`

## Production Runtime Evidence

- Robot ID: `53928635-6f8a-4cb4-8a62-b686d70691ff`
- Robot code: `G13ROBOT0625084649`
- Protocol: `local_robot_dry_run`
- Query task decision: `ALLOW_DRY_RUN_READ_ONLY`
- Clean control decision: `DRY_RUN_ONLY_PROPOSAL_REQUIRED_FOR_REAL_CONTROL`
- Region clean decision: `DRY_RUN_ONLY_PROPOSAL_REQUIRED_FOR_REAL_CLEANING`

## Checks Passed

- Production API health reachable.
- Local cleaning robot registration returned success.
- Cleaning robot list and detail returned success.
- Robot platform config list returned success.
- `query_task` dry-run returned success with no external execution.
- `clean_control` dry-run returned success and marked real control as approval-required.
- `start_region_clean` dry-run returned success and marked real cleaning as approval-required.
- Robot command log list returned success.

## Database Evidence

- Robot rows: `1`
- Command logs: `4`
- Dry-run no-external command logs: `3`
- Approval-required dry-run logs: `2`
- Operation audit logs: `4`
- Device secret: empty

## Governance Notes

- Read-only robot commands are allowed as dry-run.
- Real robot control commands remain proposal/approval governed.
- Region cleaning commands remain proposal/approval governed.
- The production gate did not call EZVIZ or any external robot vendor API.
- The production gate did not store a robot device secret or secret hash.

## Final Verdict

PASS.

Cleaning robot operations now have a production-reachable local governance path for robot registration, read surfaces, dry-run command planning, command logs, no-external-call evidence, no-credential evidence, and approval-required control semantics.
