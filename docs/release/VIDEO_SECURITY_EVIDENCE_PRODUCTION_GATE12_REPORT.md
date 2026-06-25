# Video Security Evidence Production Gate-12 Report

Date: 2026-06-25

## Executive Summary

Gate-12 passed in production.

The gate verified the video security evidence chain:

1. Camera registry.
2. Stream URL access without secret storage.
3. Preview, snapshot, playback, and local status-check endpoints.
4. Snapshot evidence capture.
5. Camera issue to safety hazard.
6. Video alert to linked safety hazard.
7. Hazard video evidence attachment.
8. Alert assignment, acknowledgement, resolution, closure, and process logs.
9. Video dashboard read endpoints.
10. Operation audit logs.

## Workflow Evidence

- GitHub Actions run: `28157685594`
- Workflow: `production-video-security-evidence-gate.yml`
- Script: `scripts/production-video-security-evidence-gate12.sh`
- Run ID: `gate12-video-security-evidence-20260625T083717Z`
- Production API base: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`
- Selected unit: `A1-F01-U01` / `A1 1F`

## Production Runtime Evidence

- Camera ID: `239e0c4b-cfb0-4faa-968d-ad6fe7007d7d`
- Camera code: `G12CAM0625083717`
- Snapshot evidence ID: `5c5752a5-ab4d-45fb-a69a-966605e3675b`
- Hazard evidence ID: `df677b8d-d063-46b1-91e4-e32769952021`
- Alert ID: `04204d25-18bf-409b-af09-e8f745569fbb`
- Alert code: `VA-{YYYYMM}000001`
- Camera issue hazard ID: `8cd3daed-a4e0-4838-9973-ff40dfca3701`
- Alert linked hazard ID: `eed7eba8-67d4-49c0-bbda-c4537b70a8d4`

## Checks Passed

- Production API health reachable.
- Video camera create/detail/list/map/by-location endpoints returned success.
- Preview URL, snapshot URL, playback URL, and local status-check returned success.
- Snapshot evidence was captured through the camera endpoint.
- Camera issue generated a safety hazard.
- Video alert was created, assigned, acknowledged, resolved, and closed.
- Video alert generated a linked safety hazard.
- Hazard video evidence attachment succeeded.
- Hazard evidence list succeeded.
- Video evidence list succeeded.
- Dashboard overview, alert trends, device status, park map, and realtime alerts succeeded.

## Database Evidence

- Video camera rows: `1`
- Video evidence rows: `2`
- Manual snapshot evidence rows: `1`
- Hazard linked evidence rows: `1`
- Closed video alert rows: `1`
- Alert process logs: `7`
- Safety hazard rows: `2`
- Safety action logs: `3`
- Operation audit logs: `10`
- Camera password reference: empty

## Security Notes

- No real camera credential was stored.
- No real external video platform was called.
- The gate used controlled placeholder URLs under `video.example.invalid`.
- The camera password reference remained empty in the production database.
- Operation audit logs were created through the normal audit pipeline.

## Final Verdict

PASS.

Video Security can support production-reachable camera registry, evidence capture, alert processing, safety hazard linkage, dashboard read surfaces, and audit evidence under a controlled no-secret runtime.
