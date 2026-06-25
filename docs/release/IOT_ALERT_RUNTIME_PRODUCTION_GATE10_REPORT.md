# IoT Alert Runtime Production Gate-10 Report

Date: 2026-06-25

## Verdict

PASS: IoT device registry, metric dictionary, device point, heartbeat, metric reporting, latest read model, alert lifecycle, alert-to-work-order linkage, dashboards, and audit logs are production reachable.

## Run Evidence

- Workflow: `Production IoT Alert Runtime Gate`
- GitHub Actions run: `28156421652`
- Production gate run ID: `gate10-iot-alert-runtime-20260625T081353Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Tenant: `10000001`
- Park: `20000001`
- Effective contract: `CT-20260625000001`
- Tenant company: `Gate-6B 生产验证租户 0625073509`
- Unit: `G6BU0625073509` / `Gate-6B 租赁闭环验证房源`

## Runtime Objects

- Device ID: `6681e844-ce92-445f-afac-7f970724645b`
- Device code: `G10DEV0625081353`
- Device online status: `online`
- Metric ID: `6e4c90ca-2917-486e-bc58-d0bd44ec0f4f`
- Metric code: `G10TEMP0625081353`
- Point ID: `73f56e3d-89e4-45fd-91e5-240059db0059`
- Heartbeat rows: `1`
- Metric data rows: `1`
- Latest data rows: `1`

## Alert And Work Order Evidence

- Alert ID: `c5e2bcf9-00e0-43ec-a51c-d8a2e3fa0597`
- Alert code: `ALERT-202606-000003`
- Alert final status: `closed`
- Alert lifecycle logs: `6`
- Work order ID: `0bd73508-d113-4fae-9d2a-b08999eda93d`
- Work order code: `WO-20260625000005`
- Work order source type: `iot_alert`
- Operation audit logs: `11`

## Verified Production Flow

1. Created an IoT device bound to the effective tenant and unit.
2. Created a metric dictionary entry and a device point.
3. Recorded a device heartbeat and verified the device moved online.
4. Reported metric data and verified history, trend, and latest read model.
5. Created an IoT alert from the device metric.
6. Acknowledged and processed the alert.
7. Converted the alert into a work order.
8. Resolved and closed the alert.
9. Read alert detail, alert logs, IoT dashboards, and work order detail.
10. Verified database persistence and operation audit logs.

## Safety Notes

- No device secret was printed or read.
- The gate used a controlled production JWT with `GATE10_IOT_ALERT_RUNTIME` role metadata.
- The workflow only wrote traceable Gate-10 validation records and uploaded markdown/json evidence.
- No destructive operation was performed.

## Artifacts

- Remote markdown report: `/opt/jinhu-smart-park/tmp/production-gates/gate10-iot-alert-runtime-20260625T081353Z.md`
- Remote JSON report: `/opt/jinhu-smart-park/tmp/production-gates/gate10-iot-alert-runtime-20260625T081353Z.json`
- Artifact: `production-iot-alert-runtime-gate-reports`
